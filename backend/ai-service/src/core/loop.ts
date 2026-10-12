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
    const words = text.split(/(\s+)/);
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
    const maxIterations = context.maxIterations || 40;
    const apiKey = context.apiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
    let model = context.model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
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

      // 2. Query model with streaming deltas and rate limit concurrency
      let response: any;
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
      } catch (err: any) {
        if (
          err?.message?.includes('quota') ||
          err?.message?.includes('Quota') ||
          err?.message?.includes('429') ||
          err?.message?.includes('RESOURCE_EXHAUSTED')
        ) {
          console.warn(`[CoreAgentLoop] Rate limit encountered at iteration ${iterations}. Switching model to gemini-3.1-flash-lite-preview...`);
          model = 'gemini-3.1-flash-lite-preview';
          continue;
        }
        throw err;
      }

      // Stream text delta to UI
      if (response.text) {
        fullReply += response.text;
        await this.streamTextDeltas(response.text, agentSpec.id, sessionId, context.onEvent);
      }

      // 3. Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.text || '',
          toolCalls: response.toolCalls,
          rawParts: response.rawParts,
        });

        for (const tc of response.toolCalls) {
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
    const geminiKey = process.env.GEMINI_API_KEY || (params.apiKey && !params.apiKey.startsWith('sk-') ? params.apiKey : '');
    const openAiKey =
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY.startsWith('sk-') &&
      !process.env.OPENAI_API_KEY.includes('your_openai')
        ? process.env.OPENAI_API_KEY
        : '';

    const wantsOpenAI = Boolean(
      openAiKey &&
        (params.model.toLowerCase().includes('gpt') ||
          params.model.toLowerCase().includes('o1') ||
          params.model.toLowerCase().includes('o3') ||
          params.model.toLowerCase().includes('openai'))
    );

    if (wantsOpenAI) {
      return this.queryOpenAI({ ...params, apiKey: openAiKey });
    }

    const effectiveKey = geminiKey || params.apiKey;
    const requestedModel = this.normalizeGeminiModel(params.model);
    const candidateModels = [
      'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      requestedModel,
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx && !m.includes('2.5') && !m.includes('2.0') && !m.includes('1.5'));

    let lastError: any = null;
    for (const currentModel of candidateModels) {
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

          // If daily quota exhausted, high demand (503), or model unavailable (404), switch immediately with zero sleep
          const isImmediateSwitch =
            msg.includes('PerDay') ||
            msg.includes('daily') ||
            msg.includes('Daily') ||
            msg.includes('404') ||
            msg.includes('503') ||
            msg.includes('500') ||
            msg.includes('502') ||
            msg.includes('high demand') ||
            msg.includes('overloaded') ||
            msg.includes('exceeded your current quota') ||
            msg.includes('free_tier_requests') ||
            msg.includes('Please retry in') ||
            msg.includes('no longer available');

          if (isImmediateSwitch) {
            console.warn(`[CoreAgentLoop] Model ${currentModel} returned (${msg.slice(0, 80)}). Switching immediately to next candidate model...`);
            break;
          }

          // If temporary rate limit (RPM), quick 1s pause once
          if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
            if (attempt < 1) {
              console.warn(`[CoreAgentLoop] Transient RPM limit on ${currentModel}. Pausing 1s...`);
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
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
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
    if (!m) return defaultModel;
    const clean = m.toLowerCase().trim().replace(/^models\//, '');
    if (clean.includes('2.5') || clean.includes('2.0') || clean.includes('1.5') || clean === 'gemini-3.8-flash') {
      return 'gemini-3.1-flash-lite-preview';
    }
    if (clean.startsWith('gemini-')) {
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
        contents.push({
          role: 'user',
          parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
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
        contents.push({
          role: 'user',
          parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
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
    const client = new OpenAI({
      apiKey: params.apiKey || process.env.OPENAI_API_KEY || 'dummy-key',
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });

    const openAiMessages: any[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool',
            tool_call_id: m.toolCallId,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          };
        }
        return {
          role: m.role === 'model' ? 'assistant' : m.role,
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

    const response = await client.chat.completions.create({
      model: params.model || 'gpt-4o',
      messages: openAiMessages,
      tools: openAiTools.length > 0 ? openAiTools : undefined,
      temperature: 0.2,
    });

    const choice = response.choices[0];
    const message = choice.message;

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

    return {
      text: message.content || '',
      toolCalls,
    };
  }
}
