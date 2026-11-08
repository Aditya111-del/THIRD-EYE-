/**
 * THE CORE AGENT LOOP (Phase 4 & Multi-Agent Architecture)
 * Reused by Orchestrator AND every Worker.
 *
 * runAgent(agentSpec, context):
 * - envelope = buildContextEnvelope(agentSpec, context) // budget-managed
 * - for iteration in 1..MAX_ITERATIONS (default 40):
 *     stream = llm.stream(envelope, tools=registry.forAgent(agentSpec.role))
 *     for delta in stream: emitUiEvent("agent.delta", {agentId, delta})
 *     if tool_call:
 *       emitUiEvent("tool.start", {agentId, name, args, risk})
 *       decision = await permissions.check(tool_call)
 *       if rejected: result = {error: "denied"} → continue loop
 *       checkpoint.ifMutation(tool_call) // BEFORE execution
 *       result = await tools.execute(tool_call) // with per-tool timeout
 *       emitUiEvent("tool.end", {agentId, result, durationMs})
 *       envelope.append(tool_result(result))
 *     if finish: emitUiEvent("agent.done", {summary}) → return
 *   emitUiEvent("agent.stuck", {reason: "iteration cap"}) → escalate
 */

import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { AgentSpec } from '@third-eye/shared';
import { ToolRegistry } from '../tools/registry';
import { ToolExecutionContext } from '../tools/toolTypes';
import { permissionPolicy } from '../tools/permissions';
import { buildContextEnvelope, EnvelopeInputContext } from '../context/envelopeBuilder';
import { SessionLogger } from './sessionLogger';

export interface AgentRunContext extends EnvelopeInputContext {
  userMessage?: string;
  maxIterations?: number;
  apiKey?: string;
  model?: string;
  onEvent?: (event: { type: string; data: any; sessionId: string }) => void;
  onPermissionRequest?: (req: { id: string; toolName: string; args: any; command?: string }) => Promise<'allow_once' | 'allow_session' | 'reject'>;
}

export interface AgentRunResult {
  agentId: string;
  role: string;
  reply: string;
  iterations: number;
  status: 'done' | 'stuck' | 'error';
  toolTraces: Array<{ toolName: string; args: any; success: boolean; error?: string }>;
  modifiedFiles: string[];
}

class LlmConcurrencyLimiter {
  private maxConcurrent = 2;
  private current = 0;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (this.current < this.maxConcurrent) {
      this.current++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.current++;
  }

  release(): void {
    this.current = Math.max(0, this.current - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }
}

const globalLlmLimiter = new LlmConcurrencyLimiter();

export const globalExhaustedModels = new Map<string, number>();

export function markModelExhausted(model: string, durationMs = 2 * 60 * 1000) {
  const clean = model.toLowerCase().trim().replace(/^models\//, '');
  globalExhaustedModels.set(clean, Date.now() + durationMs);
  console.warn(`[QuotaTracker] Model "${clean}" paused for ${Math.round(durationMs / 1000)}s.`);
}

export function isModelExhausted(model: string): boolean {
  const clean = model.toLowerCase().trim().replace(/^models\//, '');
  const expiry = globalExhaustedModels.get(clean);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    globalExhaustedModels.delete(clean);
    return false;
  }
  return true;
}

/**
 * Detect whether a model supports multimodal vision / image inputs.
 * If false, image_url parts should NEVER be passed to the LLM API to prevent 404/400 errors.
 */
export function isVisionCapableModel(model?: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  return (
    m.includes('gemini') ||
    m.includes('gpt-4o') ||
    m.includes('gpt-4-turbo') ||
    m.includes('claude') ||
    m.includes('vision') ||
    m.includes('-vl') ||
    m.includes('omni') ||
    m.includes('pixtral') ||
    m.includes('llava')
  );
}

export class CoreAgentLoop {
  private toolRegistry: ToolRegistry;
  private cancelledSessions: Set<string> = new Set();

  constructor(workspaceRoot: string) {
    this.toolRegistry = new ToolRegistry(workspaceRoot);
  }

  public getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.toolRegistry.setWorkspaceRoot(workspaceRoot);
  }

  public cancel(sessionId: string): void {
    this.cancelledSessions.add(sessionId);
  }

  public resetCancellation(sessionId: string): void {
    this.cancelledSessions.delete(sessionId);
  }

  public isCancelled(sessionId: string): boolean {
    return this.cancelledSessions.has(sessionId);
  }

  public async queryModelDirect(params: {
    apiKey?: string;
    model?: string;
    systemPrompt: string;
    messages: any[];
    tools?: any[];
  }): Promise<{ text?: string; toolCalls?: Array<{ id: string; name: string; args: any }> }> {
    await globalLlmLimiter.acquire();
    try {
      return await this.queryModel({
        apiKey: params.apiKey || process.env.GEMINI_API_KEY || '',
        model: params.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        systemPrompt: params.systemPrompt,
        messages: params.messages,
        tools: params.tools || [],
      });
    } finally {
      globalLlmLimiter.release();
    }
  }

  private async streamTextDeltas(
    text: string,
    agentId: string,
    sessionId: string,
    onEvent?: (event: any) => void
  ): Promise<void> {
    if (!text || !onEvent) return;
    // Strip raw internal thinking channel tokens emitted by models like Gemma/Qwen
    const sanitized = text
      .replace(/<\|channel\|>thought[\s\S]*?<\|channel\|>/gi, '')
      .replace(/<\|channel\|>thought/gi, '')
      .replace(/<\|channel\|>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();

    if (!sanitized) return;

    const words = sanitized.split(/(\s+)/);
    let chunk = '';
    for (let i = 0; i < words.length; i++) {
      chunk += words[i];
      if (chunk.length >= 25 || i === words.length - 1) {
        onEvent({
          type: 'agent.delta',
          sessionId,
          data: { agentId, delta: chunk },
        });
        chunk = '';
        if (words.length > 25) {
          await new Promise((r) => setTimeout(r, 6));
        }
      }
    }
  }

  public async runAgent(
    agentSpec: AgentSpec,
    context: AgentRunContext
  ): Promise<AgentRunResult> {
    const maxIterations = context.maxIterations || 20;
    const apiKey = context.apiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
    let model = context.model || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const workspaceRoot = context.workspaceRoot;
    const sessionId = context.sessionId;
    this.toolRegistry.setWorkspaceRoot(workspaceRoot);
    const logger = new SessionLogger(workspaceRoot, sessionId);

    const toolContext: ToolExecutionContext = {
      workspaceRoot,
      checkpointManager: this.toolRegistry.getCheckpointManager(),
      fileLockRegistry: this.toolRegistry.getFileLockRegistry(),
      sessionId,
      agentId: agentSpec.id,
      agentRole: agentSpec.role,
    };

    // 1. Build budget-managed context envelope
    const envelope = buildContextEnvelope(agentSpec, context);
    const messages = [...envelope.messages];
    if (context.userMessage) {
      messages.push({ role: 'user', content: context.userMessage });
    } else if (agentSpec.taskDescription) {
      messages.push({ role: 'user', content: agentSpec.taskDescription });
    } else {
      messages.push({ role: 'user', content: `Execute assigned task: ${agentSpec.name}` });
    }

    const availableTools = this.toolRegistry.getDeclarations(agentSpec.role);
    const toolTraces: Array<{ toolName: string; args: any; success: boolean; error?: string }> = [];
    const modifiedFilesSet = new Set<string>();

    let iterations = 0;
    let fullReply = '';
    // Stuck-detection: bail out if same tool fails N times in a row
    let consecutiveFailureCount = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;
    let lastFailedTool = '';
    // Detect repeated identical tool calls (infinite loop guard)
    const recentToolCallSignatures: string[] = [];

    while (iterations < maxIterations) {
      if (this.cancelledSessions.has(sessionId)) {
        logger.log({ type: 'cancelled', data: { agentId: agentSpec.id } });
        context.onEvent?.({
          type: 'agent.done',
          sessionId,
          data: { agentId: agentSpec.id, summary: 'Task execution stopped by user.' },
        });
        return {
          agentId: agentSpec.id,
          role: agentSpec.role,
          reply: 'Execution cancelled by user.',
          iterations,
          status: 'done',
          toolTraces,
          modifiedFiles: Array.from(modifiedFilesSet),
        };
      }

      iterations++;
      logger.log({ type: 'iteration.start', data: { agentId: agentSpec.id, iteration: iterations } });

      context.onEvent?.({
        type: 'agent.status',
        sessionId,
        data: {
          agentId: agentSpec.id,
          status: 'thinking',
          message: `${agentSpec.name}: Iteration ${iterations}`,
        },
      });
      context.onEvent?.({
        type: 'agent.thinking',
        sessionId,
        data: {
          agentId: agentSpec.id,
          role: agentSpec.role,
          iteration: iterations,
          message: `${agentSpec.name}: Evaluating context & formulating response`,
        },
      });

      // 2. Query model with streaming deltas and quota resilience
      let response: any;
      let modelSwitches = 0;
      while (modelSwitches < 5) {
        try {
          await globalLlmLimiter.acquire();
          try {
            response = await this.queryModel({
              apiKey,
              model,
              systemPrompt: envelope.systemPrompt,
              messages,
              tools: availableTools,
            });
          } finally {
            globalLlmLimiter.release();
          }
          break; // Succeeded
        } catch (err: any) {
          modelSwitches++;
          const msg = err?.message || '';
          if (
            msg.includes('quota') ||
            msg.includes('Quota') ||
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('503') ||
            msg.includes('high demand')
          ) {
            markModelExhausted(model);
            const healthyCandidates = [
              'gemini-3.5-flash-lite',
              'gemini-3.1-flash-lite',
              'gemini-flash-lite-latest',
              'gemini-3-flash-preview',
            ];
            const nextHealthy = healthyCandidates.find((m) => !isModelExhausted(m)) || 'gemini-3.5-flash-lite';
            console.warn(`[CoreAgentLoop] Quota/RPM hit on "${model}". Seamlessly rotating to healthy model "${nextHealthy}" (Switch ${modelSwitches}/5)...`);
            model = nextHealthy;
            continue; // Retry without consuming task iteration
          }
          throw err;
        }
      }

      if (!response) {
        console.warn(`[CoreAgentLoop] Transient rate limits encountered on iteration ${iterations}. Pausing 2s and retrying...`);
        await new Promise((r) => setTimeout(r, 2000));
        globalExhaustedModels.clear();
        try {
          response = await this.queryModel({
            apiKey,
            model: 'gemini-3.5-flash-lite',
            systemPrompt: envelope.systemPrompt,
            messages,
            tools: availableTools,
          });
        } catch (e: any) {
          throw new Error(`AI service temporarily rate limited (${e.message}). Please retry your request in a moment.`);
        }
      }

      // Stream text delta to UI
      if (response.text) {
        fullReply += response.text;
        await this.streamTextDeltas(response.text, agentSpec.id, sessionId, context.onEvent);
      }

      // 3. Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        // Detect repeated identical tool-call signatures to prevent infinite loops
        const callSig = response.toolCalls.map((tc: any) => `${tc.name}:${JSON.stringify(tc.args)}`).join('|');
        recentToolCallSignatures.push(callSig);
        if (recentToolCallSignatures.length > 4) recentToolCallSignatures.shift();
        const sigOccurrences = recentToolCallSignatures.filter((s) => s === callSig).length;
        if (sigOccurrences >= 3) {
          console.warn(`[CoreAgentLoop] Agent ${agentSpec.id} is repeating identical tool call signature ${sigOccurrences}x. Breaking loop to prevent infinite loop.`);
          context.onEvent?.({
            type: 'agent.status',
            sessionId,
            data: { agentId: agentSpec.id, status: 'stuck', message: 'Agent detected infinite loop: same tool call repeated. Breaking out.' },
          });
          break;
        }

        messages.push({
          role: 'assistant',
          content: response.text || '',
          toolCalls: response.toolCalls,
          rawParts: response.rawParts,
        });

        for (const tc of response.toolCalls) {
          if (this.cancelledSessions.has(sessionId)) {
            break;
          }
          const toolDef = this.toolRegistry.getTool(tc.name);
          const risk = toolDef?.risk || 'read';

          // Emit tool.start & agent.tool_started
          context.onEvent?.({
            type: 'tool.start',
            sessionId,
            data: {
              agentId: agentSpec.id,
              toolCallId: tc.id,
              name: tc.name,
              args: tc.args,
              risk,
            },
          });
          context.onEvent?.({
            type: 'agent.tool_started',
            sessionId,
            data: {
              agentId: agentSpec.id,
              tool: tc.name,
              toolCallId: tc.id,
              args: tc.args,
              risk,
              timestamp: Date.now(),
            },
          });
          logger.log({ type: 'tool.start', data: { agentId: agentSpec.id, tool: tc.name, args: tc.args } });

          // Permission check
          let permitted = true;
          if (toolDef?.needsPermission) {
            const cmd = tc.args?.command || '';
            const check = permissionPolicy.checkTerminalCommand(cmd);
            if (check.needsPrompt && context.onPermissionRequest) {
              context.onEvent?.({
                type: 'agent.status',
                sessionId,
                data: { agentId: agentSpec.id, status: 'awaiting_permission', toolName: tc.name },
              });

              const decision = await context.onPermissionRequest({
                id: `perm_${Date.now()}`,
                toolName: tc.name,
                args: tc.args,
                command: cmd,
              });

              if (decision === 'reject') {
                permitted = false;
              } else if (decision === 'allow_session' && cmd) {
                permissionPolicy.grantSession(cmd);
              }
            }
          }

          let toolResult: any;
          const startMs = Date.now();

          if (!permitted) {
            toolResult = {
              toolName: tc.name,
              success: false,
              error: 'denied: User rejected permission to execute this operation.',
            };
          } else {
            // Checkpoint BEFORE mutation if tool has file mutation effects
            if (risk === 'write') {
              const targetPath = tc.args?.path || tc.args?.sourcePath || '';
              if (targetPath) {
                const absTarget = path.isAbsolute(targetPath) ? targetPath : path.join(workspaceRoot, targetPath);
                await this.toolRegistry.getCheckpointManager().createCheckpoint(
                  [absTarget],
                  `Pre-mutation snapshot: ${tc.name} ${path.basename(targetPath)}`
                );
              }
            }

            // Execute tool with timeout
            toolResult = await this.toolRegistry.executeTool(tc.name, tc.args, toolContext);
          }

          const durationMs = Date.now() - startMs;

          // Track modified files
          if (toolResult.diff && toolResult.diff.path) {
            modifiedFilesSet.add(toolResult.diff.path);
          }
          if (toolResult.data?.modifiedFiles) {
            for (const f of toolResult.data.modifiedFiles) modifiedFilesSet.add(f);
          }

          toolTraces.push({
            toolName: tc.name,
            args: tc.args,
            success: toolResult.success,
            error: toolResult.error,
          });

          // Emit tool.end & agent.tool_output
          context.onEvent?.({
            type: 'tool.end',
            sessionId,
            data: {
              agentId: agentSpec.id,
              toolCallId: tc.id,
              name: tc.name,
              result: toolResult.data || { error: toolResult.error },
              diff: toolResult.diff,
              durationMs,
              success: toolResult.success,
            },
          });
          context.onEvent?.({
            type: 'agent.tool_output',
            sessionId,
            data: {
              agentId: agentSpec.id,
              tool: tc.name,
              toolCallId: tc.id,
              result: toolResult.data || { error: toolResult.error },
              durationMs,
              success: toolResult.success,
            },
          });

          if (toolResult.diff && toolResult.diff.path) {
            context.onEvent?.({
              type: 'agent.file_changed',
              sessionId,
              data: {
                agentId: agentSpec.id,
                filePath: toolResult.diff.path,
                diff: toolResult.diff,
                action: tc.name,
              },
            });
          }

          if (!toolResult.success && toolResult.error) {
            context.onEvent?.({
              type: 'agent.error',
              sessionId,
              data: {
                agentId: agentSpec.id,
                tool: tc.name,
                error: toolResult.error,
              },
            });
            // Track consecutive failures of the same tool
            if (tc.name === lastFailedTool) {
              consecutiveFailureCount++;
            } else {
              consecutiveFailureCount = 1;
              lastFailedTool = tc.name;
            }
            if (consecutiveFailureCount >= MAX_CONSECUTIVE_FAILURES) {
              console.warn(`[CoreAgentLoop] Tool "${tc.name}" failed ${consecutiveFailureCount} consecutive times. Breaking loop to prevent stall.`);
              context.onEvent?.({
                type: 'agent.status',
                sessionId,
                data: { agentId: agentSpec.id, status: 'stuck', message: `Tool "${tc.name}" failed ${consecutiveFailureCount}x consecutively. Escalating.` },
              });
              // Force break by exhausting iterations
              iterations = maxIterations;
            }
          } else {
            // Reset failure counter on success
            consecutiveFailureCount = 0;
            lastFailedTool = '';
          }
          logger.log({ type: 'tool.end', data: { agentId: agentSpec.id, tool: tc.name, success: toolResult.success, durationMs } });

          // Append tool observation verbatim for model self-correction
          let boundedContent: any = toolResult.error
            ? { error: toolResult.error }
            : toolResult.data || { success: true };

          if (boundedContent && typeof boundedContent === 'object') {
            if (typeof boundedContent.content === 'string' && boundedContent.content.length > 4000) {
              boundedContent = {
                ...boundedContent,
                content: boundedContent.content.slice(0, 4000) + '\n... [Remaining content truncated to conserve context tokens]',
              };
            }
            if (typeof boundedContent.output === 'string' && boundedContent.output.length > 3000) {
              boundedContent = {
                ...boundedContent,
                output: boundedContent.output.slice(-3000),
              };
            }
          }

          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: boundedContent,
          });
        }

        if (this.cancelledSessions.has(sessionId)) {
          break;
        }

        // Loop back to next iteration
        continue;
      }

      // 4. Model finished its response without emitting further tool calls
      break;
    }

    // Release any lingering file locks acquired by this agent
    this.toolRegistry.getFileLockRegistry().releaseAllForAgent(agentSpec.id);

    // Iteration cap reached
    if (iterations >= maxIterations) {
      context.onEvent?.({
        type: 'agent.stuck',
        sessionId,
        data: {
          agentId: agentSpec.id,
          reason: `Iteration cap of ${maxIterations} reached. Escalating to supervisor.`,
        },
      });
      return {
        agentId: agentSpec.id,
        role: agentSpec.role,
        reply: fullReply || 'Task reached iteration cap without full resolution.',
        iterations,
        status: 'stuck',
        toolTraces,
        modifiedFiles: Array.from(modifiedFilesSet),
      };
    }

    // Synthesis pass if reply is empty
    if (!fullReply.trim() && toolTraces.length > 0) {
      try {
        messages.push({
          role: 'user',
          content: 'Synthesize your findings and provide a concise summary of all completed work.',
        });
        const finalPass = await this.queryModel({
          apiKey,
          model,
          systemPrompt: envelope.systemPrompt,
          messages,
          tools: [],
        });
        if (finalPass.text) {
          fullReply = finalPass.text;
          await this.streamTextDeltas(finalPass.text, agentSpec.id, sessionId, context.onEvent);
        }
      } catch {}
    }

    // Emit agent.done
    context.onEvent?.({
      type: 'agent.done',
      sessionId,
      data: {
        agentId: agentSpec.id,
        summary: fullReply || 'Task completed successfully.',
      },
    });

    return {
      agentId: agentSpec.id,
      role: agentSpec.role,
      reply: fullReply || 'Task completed successfully.',
      iterations,
      status: 'done',
      toolTraces,
      modifiedFiles: Array.from(modifiedFilesSet),
    };
  }

  /**
   * Model Dispatcher supporting Google Gemini and OpenAI protocols
   */
  private async queryModel(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    messages: any[];
    tools: any[];
  }): Promise<{ text?: string; toolCalls?: Array<{ id: string; name: string; args: any }>; rawParts?: any[] }> {
    const rawGeminiKey = process.env.GEMINI_API_KEY || (params.apiKey && !params.apiKey.startsWith('sk-') ? params.apiKey : '');
    const geminiKey = rawGeminiKey && rawGeminiKey.trim() !== '' && rawGeminiKey !== 'your_gemini_api_key_here' ? rawGeminiKey.trim() : '';
    const hasGeminiKey = Boolean(geminiKey);

    const openAiKey =
      (params.apiKey && params.apiKey.startsWith('sk-') ? params.apiKey : '') ||
      (process.env.OPENAI_API_KEY &&
       process.env.OPENAI_API_KEY.startsWith('sk-') &&
       !process.env.OPENAI_API_KEY.includes('your_openai')
        ? process.env.OPENAI_API_KEY
        : '');

    let openAiBaseUrl = process.env.OPENAI_BASE_URL || '';
    if ((openAiKey && openAiKey.startsWith('sk-or-')) && (!openAiBaseUrl || openAiBaseUrl.includes('localhost') || openAiBaseUrl.includes('127.0.0.1'))) {
      openAiBaseUrl = 'https://openrouter.ai/api/v1';
    }

    const activeProvider = (process.env.AI_PROVIDER || '').toLowerCase();
    const isGeminiModel = Boolean(params.model && params.model.toLowerCase().includes('gemini'));
    const isExplicitOpenAi = Boolean(
      params.model &&
        (params.model.toLowerCase().includes('gpt') ||
          params.model.toLowerCase().includes('o1') ||
          params.model.toLowerCase().includes('o3') ||
          params.model.toLowerCase().includes('llama') ||
          params.model.toLowerCase().includes('nemotron') ||
          params.model.toLowerCase().includes('gemma') ||
          params.model.toLowerCase().includes('qwen') ||
          params.model.toLowerCase().includes('openai') ||
          params.model.toLowerCase().includes('deepseek'))
    );

    // If there is no valid direct Gemini API key, or OpenAI is explicitly requested/active, route to OpenAI/OpenRouter
    const hasOpenAiCreds = Boolean(openAiKey || openAiBaseUrl);
    const isExplicitOpenAiModel = Boolean(isExplicitOpenAi);

    let wantsOpenAI = false;
    if (!hasGeminiKey || !isGeminiModel) {
      if (isExplicitOpenAiModel || !hasGeminiKey || (activeProvider === 'openai' && hasOpenAiCreds)) {
        wantsOpenAI = true;
      }
    }

    if (wantsOpenAI && hasOpenAiCreds) {
      let effectiveOpenAiModel = params.model;
      if (!effectiveOpenAiModel || effectiveOpenAiModel.toLowerCase().includes('gemini')) {
        if (openAiBaseUrl.includes('openrouter')) {
          effectiveOpenAiModel = process.env.OPENAI_MODEL || 'google/gemini-2.0-flash-exp:free';
        } else {
          effectiveOpenAiModel = process.env.OPENAI_MODEL || 'gpt-4o';
        }
      }
      try {
        return await this.queryOpenAI({ ...params, model: effectiveOpenAiModel, apiKey: openAiKey });
      } catch (err: any) {
        if (hasGeminiKey) {
          console.warn(`[CoreAgentLoop] OpenAI/Ollama call failed (${err.message}). Gracefully falling back to Gemini...`);
        } else {
          throw err;
        }
      }
    }

    const effectiveKey = geminiKey || params.apiKey;
    const requestedModel = this.normalizeGeminiModel(params.model);
    const candidateModels = [
      requestedModel,
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-flash-lite-latest',
      'gemini-3-flash-preview',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx && !isModelExhausted(m) && !m.includes('gemma'));

    // If all models in the pool were marked exhausted, allow lite models as a recovery fallback
    const effectiveCandidates = candidateModels.length > 0 ? candidateModels : ['gemini-3.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    let lastError: any = null;
    for (const currentModel of effectiveCandidates) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await this.queryGemini({ ...params, apiKey: effectiveKey, model: currentModel });
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || '';

          // If invalid API key (401 / 403 / API_KEY_INVALID), fail immediately because changing model won't fix bad key
          if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('401') || msg.includes('403')) {
            throw err;
          }

          // Distinguish true daily quota from transient per-minute burst rate limits
          const isPerMinuteLimit =
            msg.includes('PerMinute') ||
            msg.includes('per minute') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('429') ||
            /retry in \d+(\.\d+)?s/i.test(msg);

          const isDailyQuota =
            !isPerMinuteLimit &&
            (msg.includes('PerDay') ||
             msg.includes('per day') ||
             msg.includes('free_tier_requests') ||
             /daily.*quota/i.test(msg));

          const isServerUnavailable =
            msg.includes('404') ||
            msg.includes('503') ||
            msg.includes('500') ||
            msg.includes('502') ||
            msg.includes('high demand') ||
            msg.includes('overloaded');

          if (isDailyQuota) {
            markModelExhausted(currentModel, 15 * 60 * 1000); // 15-minute pause for true daily quota
            console.warn(`[CoreAgentLoop] Model ${currentModel} hit daily quota. Rotating to next healthy model...`);
            break;
          }

          if (isServerUnavailable) {
            markModelExhausted(currentModel, 30 * 1000); // 30-sec pause for server overload
            console.warn(`[CoreAgentLoop] Model ${currentModel} returned server error (${msg.slice(0, 80)}). Rotating to next candidate...`);
            break;
          }

          // If temporary rate limit (RPM), extract retry delay (or 2.5s) and retry
          if (isPerMinuteLimit) {
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
            const waitSeconds = retryMatch ? Math.min(8, Math.ceil(parseFloat(retryMatch[1]))) : 3;
            console.warn(`[CoreAgentLoop] Transient RPM limit on ${currentModel}. Pausing ${waitSeconds}s before retrying...`);
            await new Promise((r) => setTimeout(r, waitSeconds * 1000));
            if (attempt === 0) {
              continue;
            }
            // On second attempt failure, pause model for only 20 seconds
            markModelExhausted(currentModel, 20 * 1000);
            break;
          }

          // For any other unexpected error, fallback to next candidate model
          console.warn(`[CoreAgentLoop] Model ${currentModel} failed: ${msg.slice(0, 100)}. Falling back to next candidate model...`);
          break;
        }
      }
    }
    throw lastError;
  }

  private normalizeGeminiModel(m?: string): string {
    const defaultModel = process.env.GEMINI_MODEL || (isModelExhausted('gemini-3.8-flash') ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash');
    if (!m) return defaultModel;
    const clean = m.toLowerCase().trim().replace(/^models\//, '');
    if (clean.includes('3.8')) {
      return isModelExhausted('gemini-3.8-flash') ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash';
    }
    if (clean.includes('3.6')) {
      return isModelExhausted('gemini-3.6-flash') ? 'gemini-3.5-flash-lite' : 'gemini-3.6-flash';
    }
    if (clean.includes('3.5')) {
      return 'gemini-3.5-flash-lite';
    }
    if (clean.includes('2.5')) {
      return isModelExhausted('gemini-2.5-flash') ? 'gemini-3.5-flash-lite' : 'gemini-2.5-flash';
    }
    if (clean.includes('2.0')) {
      return isModelExhausted('gemini-2.0-flash') ? 'gemini-3.5-flash-lite' : 'gemini-2.0-flash';
    }
    if (clean.includes('1.5')) {
      return isModelExhausted('gemini-1.5-flash') ? 'gemini-3.5-flash-lite' : 'gemini-1.5-flash';
    }
    if (clean.startsWith('gemini-') || clean.startsWith('gemma-')) {
      return clean;
    }
    return defaultModel;
  }

  private async queryGemini(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    messages: any[];
    tools: any[];
    _isRetry?: boolean;
  }): Promise<{ text?: string; toolCalls?: Array<{ id: string; name: string; args: any }>; rawParts?: any[] }> {
    const actualModel = this.normalizeGeminiModel(params.model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${params.apiKey}`;

    const contents: any[] = [];
    let idx = 0;
    while (idx < params.messages.length) {
      const m = params.messages[idx];
      if (m.role === 'user') {
        const parts: any[] = [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }];
        if (m.images && Array.isArray(m.images)) {
          for (const img of m.images) {
            if (typeof img === 'string') {
              const match = img.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inlineData: {
                    mimeType: match[1],
                    data: match[2],
                  },
                });
              }
            } else if (img && (img.data || img.base64)) {
              parts.push({
                inlineData: {
                  mimeType: img.mimeType || 'image/jpeg',
                  data: (img.data || img.base64).replace(/^data:[^;]+;base64,/, ''),
                },
              });
            }
          }
        }
        contents.push({
          role: 'user',
          parts,
        });
        idx++;
      } else if (m.role === 'assistant' || m.role === 'model') {
        if (m.rawParts && Array.isArray(m.rawParts) && m.rawParts.length > 0) {
          contents.push({
            role: 'model',
            parts: m.rawParts,
          });
        } else {
          const parts: any[] = [];
          if (m.content) parts.push({ text: m.content });
          if (m.toolCalls && Array.isArray(m.toolCalls)) {
            for (const tc of m.toolCalls) {
              parts.push({
                functionCall: {
                  name: tc.name,
                  args: tc.args || {},
                },
              });
            }
          }
          contents.push({ role: 'model', parts: parts.length > 0 ? parts : [{ text: 'Thinking...' }] });
        }
        idx++;
      } else if (m.role === 'tool') {
        const responseParts: any[] = [];
        while (idx < params.messages.length && params.messages[idx].role === 'tool') {
          const tm = params.messages[idx];
          let resContent = tm.content;
          if (typeof resContent === 'string') {
            try { resContent = JSON.parse(resContent); } catch {}
          }
          responseParts.push({
            functionResponse: {
              name: tm.name || 'tool',
              response: {
                name: tm.name || 'tool',
                content: resContent,
              },
            },
          });
          idx++;
        }
        contents.push({
          role: 'user',
          parts: responseParts,
        });
      } else {
        idx++;
      }
    }

    // Merge adjacent contents of the same role to strictly follow Gemini API specification
    const normalizedContents: any[] = [];
    for (const item of contents) {
      if (!item.parts || item.parts.length === 0) continue;
      if (normalizedContents.length > 0 && normalizedContents[normalizedContents.length - 1].role === item.role) {
        normalizedContents[normalizedContents.length - 1].parts.push(...item.parts);
      } else {
        normalizedContents.push(item);
      }
    }

    // Safety guard: Gemini API requires at least one content entry and requires it to start with 'user'
    if (normalizedContents.length === 0) {
      normalizedContents.push({
        role: 'user',
        parts: [{ text: params.systemPrompt || 'Please execute the assigned task.' }],
      });
    }
    if (normalizedContents[0].role !== 'user') {
      normalizedContents.unshift({
        role: 'user',
        parts: [{ text: 'Please proceed with the task.' }],
      });
    }

    const payload: any = {
      contents: normalizedContents,
      systemInstruction: params.systemPrompt ? { parts: [{ text: params.systemPrompt }] } : undefined,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    };

    if (params.tools && params.tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: params.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const postData = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 45000,
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 400) {
                if (body.includes('thought_signature') && !params._isRetry) {
                  console.warn('[CoreAgentLoop] Gemini thought_signature mismatch detected. Retrying with sanitized history...');
                  return this.queryGeminiSanitized({ ...params, _isRetry: true })
                    .then(resolve)
                    .catch(reject);
                }
                return reject(new Error(`Gemini API error [${res.statusCode}]: ${body}`));
              }
              const json = JSON.parse(body);
              const candidate = json.candidates?.[0];
              const parts = candidate?.content?.parts || [];

              let text = '';
              const toolCalls: any[] = [];

              for (const p of parts) {
                if (p.text) text += p.text;
                if (p.functionCall) {
                  toolCalls.push({
                    id: `call_${Math.random().toString(36).substring(2, 9)}`,
                    name: p.functionCall.name,
                    args: p.functionCall.args || {},
                  });
                }
              }

              resolve({ text, toolCalls, rawParts: parts });
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      // CRITICAL FIX: Actually abort the request on timeout event (previously the socket timed out but was never destroyed)
      req.on('timeout', () => {
        req.destroy(new Error('Gemini API request timed out after 45s'));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private async queryGeminiSanitized(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    messages: any[];
    tools: any[];
    _isRetry?: boolean;
  }): Promise<{ text?: string; toolCalls?: Array<{ id: string; name: string; args: any }>; rawParts?: any[] }> {
    const actualModel = this.normalizeGeminiModel(params.model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${params.apiKey}`;

    const contents: any[] = [];
    for (const m of params.messages) {
      if (m.role === 'user') {
        const parts: any[] = [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }];
        if (m.images && Array.isArray(m.images)) {
          for (const img of m.images) {
            if (typeof img === 'string') {
              const match = img.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inlineData: {
                    mimeType: match[1],
                    data: match[2],
                  },
                });
              }
            } else if (img && (img.data || img.base64)) {
              parts.push({
                inlineData: {
                  mimeType: img.mimeType || 'image/jpeg',
                  data: (img.data || img.base64).replace(/^data:[^;]+;base64,/, ''),
                },
              });
            }
          }
        }
        contents.push({
          role: 'user',
          parts,
        });
      } else if (m.role === 'assistant' || m.role === 'model') {
        let text = m.content || '';
        if (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
          text += (text ? '\n' : '') + m.toolCalls.map((tc: any) => `[Action: ${tc.name}(${JSON.stringify(tc.args || {})})]`).join('\n');
        }
        contents.push({
          role: 'model',
          parts: [{ text: text || 'Thinking...' }],
        });
      } else if (m.role === 'tool') {
        const obs = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        contents.push({
          role: 'user',
          parts: [{ text: `[Observation for ${m.name || 'tool'}]:\n${obs}` }],
        });
      }
    }

    const normalizedContents: any[] = [];
    for (const item of contents) {
      if (!item.parts || item.parts.length === 0) continue;
      if (normalizedContents.length > 0 && normalizedContents[normalizedContents.length - 1].role === item.role) {
        normalizedContents[normalizedContents.length - 1].parts.push(...item.parts);
      } else {
        normalizedContents.push(item);
      }
    }

    // Safety guard: Gemini API requires at least one content entry and requires it to start with 'user'
    if (normalizedContents.length === 0) {
      normalizedContents.push({
        role: 'user',
        parts: [{ text: params.systemPrompt || 'Please execute the assigned task.' }],
      });
    }
    if (normalizedContents[0].role !== 'user') {
      normalizedContents.unshift({
        role: 'user',
        parts: [{ text: 'Please proceed with the task.' }],
      });
    }

    const payload: any = {
      contents: normalizedContents,
      systemInstruction: params.systemPrompt ? { parts: [{ text: params.systemPrompt }] } : undefined,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    };

    if (params.tools && params.tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: params.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const postData = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 45000,
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 400) {
                return reject(new Error(`Gemini API error [${res.statusCode}]: ${body}`));
              }
              const json = JSON.parse(body);
              const candidate = json.candidates?.[0];
              const parts = candidate?.content?.parts || [];

              let text = '';
              const toolCalls: any[] = [];

              for (const p of parts) {
                if (p.text) text += p.text;
                if (p.functionCall) {
                  toolCalls.push({
                    id: `call_${Math.random().toString(36).substring(2, 9)}`,
                    name: p.functionCall.name,
                    args: p.functionCall.args || {},
                  });
                }
              }

              resolve({ text, toolCalls, rawParts: parts });
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      // CRITICAL FIX: Actually abort the request on timeout event
      req.on('timeout', () => {
        req.destroy(new Error('Gemini API request timed out after 45s'));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private async queryOpenAI(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    messages: any[];
    tools: any[];
  }): Promise<{ text?: string; toolCalls?: Array<{ id: string; name: string; args: any }> }> {
    const OpenAI = require('openai');
    const apiKey = params.apiKey || process.env.OPENAI_API_KEY || 'dummy-key';
    let baseURL = process.env.OPENAI_BASE_URL || undefined;
    if (apiKey.startsWith('sk-or-') && (!baseURL || baseURL.includes('localhost') || baseURL.includes('127.0.0.1'))) {
      baseURL = 'https://openrouter.ai/api/v1';
    }

    const client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: {
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'third-eye-ai-service',
        'HTTP-Referer': 'https://thirdeye.dev',
        'X-Title': 'THIRD EYE IDE',
      },
    });

    const normalizedMessages = params.messages.filter(
      (m, idx) => !(idx === 0 && m.role === 'system' && params.systemPrompt)
    );

    const openAiMessages: any[] = [
      ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
      ...normalizedMessages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool',
            tool_call_id: m.toolCallId || 'call_0',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          };
        }
        if (m.role === 'user' && m.images && Array.isArray(m.images) && m.images.length > 0) {
          const supportsVision = isVisionCapableModel(params.model);
          if (supportsVision) {
            const contentParts: any[] = [];
            if (m.content) {
              contentParts.push({ type: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) });
            }
            for (const img of m.images) {
              const url = typeof img === 'string'
                ? (img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`)
                : (img.url || `data:${img.mimeType || 'image/jpeg'};base64,${img.data || img.base64}`);
              contentParts.push({
                type: 'image_url',
                image_url: { url },
              });
            }
            return {
              role: 'user',
              content: contentParts,
            };
          } else {
            const baseText = typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : '');
            const notice = `\n[Notice: Attached image is omitted for this turn because the selected model (${params.model || 'active'}) is text-only. Proceeding using textual description and codebase inspection.]`;
            return {
              role: 'user',
              content: baseText ? `${baseText}${notice}` : 'Please proceed with the assigned task.',
            };
          }
        }
        if (m.role === 'assistant' || m.role === 'model') {
          const formattedCalls = (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0)
            ? m.toolCalls.map((tc: any) => ({
                id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
                },
              }))
            : undefined;

          return {
            role: 'assistant',
            content: typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : null),
            ...(formattedCalls ? { tool_calls: formattedCalls } : {}),
          };
        }
        return {
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        };
      }),
    ];

    const openAiTools = params.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    let response: any;
    try {
      response = await client.chat.completions.create({
        model: params.model || process.env.OPENAI_MODEL || 'gemma4:12b',
        messages: openAiMessages,
        tools: openAiTools.length > 0 ? openAiTools : undefined,
        temperature: 0.2,
      });
    } catch (err: any) {
      const errStr = (err?.message || '') + ' ' + (typeof err?.error === 'object' ? JSON.stringify(err.error) : (err?.error || ''));
      const isVisionUnsupported =
        /support image|Filter by Image Support|image input|vision capability|modality.*image/i.test(errStr) ||
        (err?.status === 404 && /image/i.test(errStr)) ||
        (err?.status === 400 && /image/i.test(errStr));

      if (isVisionUnsupported) {
        console.warn(`[CoreAgentLoop] Current model (${params.model}) does not support image input. Stripping images and retrying with text fallback...`);
        const textOnlyMessages = openAiMessages.map((m: any) => {
          if (m.role === 'user' && Array.isArray(m.content)) {
            const textParts = m.content
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text);
            const imageCount = m.content.filter((p: any) => p.type === 'image_url').length;
            if (imageCount > 0) {
              textParts.push(`\n[Notice: Attached image could not be processed because the selected model (${params.model || 'active'}) does not support multimodal vision. Proceeding using textual description and codebase inspection.]`);
            }
            return {
              ...m,
              content: textParts.join('\n') || 'Please proceed with the assigned task.',
            };
          }
          return m;
        });

        response = await client.chat.completions.create({
          model: params.model || process.env.OPENAI_MODEL || 'gemma4:12b',
          messages: textOnlyMessages,
          tools: openAiTools.length > 0 ? openAiTools : undefined,
          temperature: 0.2,
        });
      } else {
        throw err;
      }
    }

    const choice = response.choices[0];
    const message = choice.message;
    let textContent = message.content || (message as any).reasoning || '';
    if (textContent) {
      textContent = textContent
        .replace(/<\|channel\|>thought[\s\S]*?<\|channel\|>/gi, '')
        .replace(/<\|channel\|>thought/gi, '')
        .replace(/<\|channel\|>/gi, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
    }

    const toolCalls: any[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments || '{}'),
        });
      }
    }

    // In-text tool parsing for models outputting XML, markdown blocks, or raw JSON
    const parsedInText = this.extractInTextToolCalls(textContent, toolCalls);
    textContent = parsedInText.text;

    return {
      text: textContent,
      toolCalls: parsedInText.toolCalls || toolCalls,
    };
  }

  /**
   * Robust multi-format parser for models outputting XML, markdown, or raw JSON tool calls
   */
  private extractInTextToolCalls(rawText: string, existingToolCalls?: any[]): { text: string; toolCalls?: any[] } {
    let text = rawText || '';
    const toolCalls: any[] = existingToolCalls ? [...existingToolCalls] : [];

    const knownTools = new Set([
      'run_terminal', 'runterminal', 'terminal', 'bash', 'sh', 'command',
      'read_file', 'readfile', 'read', 'cat',
      'write_file', 'writefile', 'write',
      'edit_file', 'editfile', 'edit',
      'find_files', 'findfiles', 'glob',
      'search_code', 'searchcode', 'search', 'grep',
      'list_dir', 'listdir', 'ls',
      'stop_server', 'stopserver',
      'check_port', 'checkport',
      'read_task_output', 'readtaskoutput',
      'analyze_codebase',
    ]);

    const normalizeFnName = (raw: string): string => {
      let fn = raw.trim();
      const lower = fn.toLowerCase();
      if (fn === 'glob' || lower === 'findfiles') return 'find_files';
      if (fn === 'bash' || fn === 'sh' || fn === 'terminal' || fn === 'command' || lower === 'runterminal') return 'run_terminal';
      if (fn === 'read' || fn === 'cat' || lower === 'readfile') return 'read_file';
      if (fn === 'write' || lower === 'writefile') return 'write_file';
      if (fn === 'edit' || lower === 'editfile') return 'edit_file';
      if (fn === 'search' || fn === 'grep' || lower === 'searchcode') return 'search_code';
      if (fn === 'ls' || lower === 'listdir') return 'list_dir';
      if (lower === 'stopserver') return 'stop_server';
      if (lower === 'checkport') return 'check_port';
      if (lower === 'readtaskoutput') return 'read_task_output';
      return fn;
    };

    // 1. Parse XML function calls: <function=name><parameter=k>v</parameter></function>
    if (text.includes('<function=')) {
      const funcRegex = /<function=([a-zA-Z0-9_\-]+)>([\s\S]*?)<\/function>/g;
      let match;
      while ((match = funcRegex.exec(text)) !== null) {
        const fnName = normalizeFnName(match[1]);
        const bodyStr = match[2];
        const args: Record<string, any> = {};

        const paramRegex = /<parameter=([a-zA-Z0-9_\-]+)>\s*([\s\S]*?)\s*<\/parameter>/g;
        let pMatch;
        while ((pMatch = paramRegex.exec(bodyStr)) !== null) {
          const pKey = pMatch[1].trim();
          let pVal = pMatch[2].trim();
          try {
            args[pKey] = JSON.parse(pVal);
          } catch {
            args[pKey] = pVal;
          }
        }

        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: fnName,
          args,
        });
      }
      text = text.replace(/<function=[a-zA-Z0-9_\-]+>[\s\S]*?<\/function>/g, '').trim();
    }

    // 2. Parse <tool_call> JSON format
    if (text.includes('<tool_call>')) {
      const tcRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
      let match;
      while ((match = tcRegex.exec(text)) !== null) {
        try {
          const parsed = JSON.parse(match[1].trim());
          const rawName = parsed.name || parsed.tool || parsed.action;
          if (rawName) {
            toolCalls.push({
              id: parsed.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: normalizeFnName(rawName),
              args: parsed.arguments || parsed.args || parsed.parameters || {},
            });
          }
        } catch {}
      }
      text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
    }

    // 3. Parse in-text raw JSON tool calls: e.g. {"tool": "run_terminal", ...} or ```json { ... } ```
    if (toolCalls.length === 0 && text.includes('{')) {
      let inString = false;
      let escape = false;
      let depth = 0;
      let startIdx = -1;
      const candidates: Array<{ raw: string; start: number; end: number }> = [];

      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (c === '\\') {
          escape = true;
          continue;
        }
        if (c === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (c === '{') {
          if (depth === 0) startIdx = i;
          depth++;
        } else if (c === '}') {
          depth--;
          if (depth === 0 && startIdx !== -1) {
            candidates.push({
              raw: text.slice(startIdx, i + 1),
              start: startIdx,
              end: i + 1,
            });
            startIdx = -1;
          } else if (depth < 0) {
            depth = 0;
            startIdx = -1;
          }
        }
      }

      for (const cand of candidates) {
        try {
          const parsed = JSON.parse(cand.raw);
          const rawTool =
            parsed.tool ||
            parsed.tool_name ||
            parsed.name ||
            parsed.action ||
            parsed.function ||
            parsed.fn;

          if (rawTool && typeof rawTool === 'string' && knownTools.has(rawTool.toLowerCase().trim())) {
            const fnName = normalizeFnName(rawTool);
            let args: Record<string, any> = {};

            if (parsed.arguments && typeof parsed.arguments === 'object') {
              args = parsed.arguments;
            } else if (parsed.args && typeof parsed.args === 'object') {
              args = parsed.args;
            } else if (parsed.parameters && typeof parsed.parameters === 'object') {
              args = parsed.parameters;
            } else if (parsed.action_input && typeof parsed.action_input === 'object') {
              args = parsed.action_input;
            } else {
              const { tool, tool_name, name, action, function: _f, fn: _fn, id, type, ...rest } = parsed;
              args = rest;
            }

            toolCalls.push({
              id: parsed.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: fnName,
              args,
            });

            text = text.replace(cand.raw, '');
          }
        } catch {}
      }

      text = text.replace(/```(?:json)?\s*```/g, '').trim();
    }

    // 4. Reconnaissance conversational stall fallback
    if (toolCalls.length === 0) {
      const lower = text.toLowerCase();
      if (
        lower.includes('start by listing the directory') ||
        lower.includes('list the directory structure') ||
        lower.includes('listing the directory structure') ||
        lower.includes('use `list_dir`') ||
        lower.includes('use list_dir') ||
        lower.includes('comprehensive reconnaissance') ||
        lower.includes('workspace reconnaissance') ||
        lower.includes('inspect the workspace') ||
        lower.includes('inspect the current directory')
      ) {
        toolCalls.push({
          id: `call_recon_${Date.now()}`,
          name: 'list_dir',
          args: { path: '.', depth: 2 },
        });
      } else if (
        lower.includes("read `package.json`") ||
        lower.includes("read the package.json") ||
        lower.includes("analyze `package.json`") ||
        lower.includes("analyze the package.json")
      ) {
        toolCalls.push({
          id: `call_pkg_${Date.now()}`,
          name: 'read_file',
          args: { path: 'package.json' },
        });
      }
    }

    return {
      text: text.trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
