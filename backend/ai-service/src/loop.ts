/**
 * THE AUTONOMOUS AGENT LOOP (Phase 4)
 * Hard Constraint 2: Keep 4-process architecture
 * Hard Constraint 5: Every agent write/edit MUST go through File Model Service
 * Hard Constraint 6: Every terminal command executed by the agent requires a permission decision
 */

import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { ToolRegistry, ToolExecutionContext } from './tools/registry';
import { permissionPolicy } from './tools/permissions';
import { isModelExhausted, markModelExhausted, isVisionCapableModel } from './core/loop';

export interface AgentContextEnvelope {
  systemPrompt: string;
  repoMapSummary?: string;
  openTabs?: Array<{ path: string; selection?: string; isDirty?: boolean }>;
  terminalTail?: string;
  history: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; toolCallId?: string; name?: string; rawParts?: any[]; toolCalls?: any[]; images?: any[] }>;
}

export interface RunAgentOptions {
  userMessage: string;
  workspaceRoot: string;
  sessionId: string;
  envelope: AgentContextEnvelope;
  images?: any[];
  maxIterations?: number;
  apiKey?: string;
  model?: string;
  tools?: any[];
  onDelta?: (delta: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; args: any }) => void;
  onToolResult?: (result: { toolCallId: string; toolName: string; success: boolean; data?: any; error?: string }) => void;
  onPermissionRequest?: (req: { id: string; toolName: string; command?: string }) => Promise<'allow_once' | 'allow_session' | 'reject'>;
  onStatus?: (status: string) => void;
}

export class AgentLoop {
  private toolRegistry: ToolRegistry;
  private cancelledSessions: Set<string> = new Set();

  constructor(workspaceRoot: string) {
    this.toolRegistry = new ToolRegistry(workspaceRoot);
  }

  public cancel(sessionId: string): void {
    this.cancelledSessions.add(sessionId);
  }

  public resetCancellation(sessionId: string): void {
    this.cancelledSessions.delete(sessionId);
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.toolRegistry.setWorkspaceRoot(workspaceRoot);
  }

  private async streamTextDeltas(text: string, onDelta?: (delta: string) => void): Promise<void> {
    if (!text || !onDelta) return;
    const words = text.split(/(\s+)/);
    let chunk = '';
    for (let i = 0; i < words.length; i++) {
      chunk += words[i];
      if (chunk.length >= 25 || i === words.length - 1) {
        onDelta(chunk);
        chunk = '';
        if (words.length > 25) {
          await new Promise((r) => setTimeout(r, 6));
        }
      }
    }
  }

  /**
   * Execute the 5-step autonomous agent loop
   */
  public async run(options: RunAgentOptions): Promise<{ reply: string; iterations: number }> {
    this.resetCancellation(options.sessionId);
    const maxIterations = Math.min(options.maxIterations || 20, 30);
    const isLocalOrOpenAI =
      (process.env.AI_PROVIDER || '').toLowerCase() === 'openai' ||
      Boolean(process.env.OPENAI_BASE_URL) ||
      Boolean(process.env.OPENAI_API_KEY?.startsWith('sk-')) ||
      Boolean(options.apiKey?.startsWith('sk-')) ||
      Boolean(options.model && !options.model.toLowerCase().includes('gemini'));
    const apiKey = options.apiKey || (isLocalOrOpenAI ? (process.env.OPENAI_API_KEY || 'ollama') : (process.env.GEMINI_API_KEY || ''));
    let model = options.model || (isLocalOrOpenAI ? (process.env.OPENAI_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free') : (process.env.GEMINI_MODEL || 'gemini-3.8-flash'));
    const workspaceRoot = options.workspaceRoot;
    this.toolRegistry.setWorkspaceRoot(workspaceRoot);

    const context: ToolExecutionContext = {
      workspaceRoot,
      checkpointManager: this.toolRegistry.getCheckpointManager(),
      sessionId: options.sessionId,
    };

    // 1. Build initial context envelope
    const messages = [...options.envelope.history];
    if (options.userMessage) {
      messages.push({ role: 'user', content: options.userMessage, images: options.images } as any);
    }

    let iterations = 0;
    let fullReply = '';

    while (iterations < maxIterations) {
      if (this.cancelledSessions.has(options.sessionId)) {
        return { reply: fullReply || 'Task execution stopped by user.', iterations };
      }
      iterations++;
      options.onStatus?.(`iteration_${iterations}`);

      // 2a. Query model with tools and conversation history
      let response: any;
      const activeTools = options.tools !== undefined ? options.tools : this.toolRegistry.getDeclarations();
      try {
        response = await this.queryModel({
          apiKey,
          model,
          systemPrompt: options.envelope.systemPrompt,
          messages,
          tools: activeTools,
        });
      } catch (err: any) {
        const isQuota =
          err?.message?.includes('quota') ||
          err?.message?.includes('Quota') ||
          err?.message?.includes('429') ||
          err?.message?.includes('RESOURCE_EXHAUSTED');
        const errMsg = isQuota
          ? '\n\n⚠️ **Google Gemini API Daily Quota Exceeded (HTTP 429)**: The API key has reached its Google Cloud daily free-tier quota (20 requests/day). To continue using the AI Agent, please update your Gemini API key or add an OpenAI key in the IDE Settings (⚙️) or `.env` file.'
          : `\n\n⚠️ **AI Service Error**: ${err?.message || 'Failed to communicate with AI provider.'}`;
        console.warn(`[AgentLoop] API call failed: ${errMsg}`);
        await this.streamTextDeltas(errMsg, options.onDelta);
        fullReply += errMsg;
        break;
      }

      // 2b. Stream / append text delta
      if (response.text) {
        fullReply += response.text;
        await this.streamTextDeltas(response.text, options.onDelta);
      }

      // Check if model emitted tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.text || '',
          rawParts: response.rawParts,
          toolCalls: response.toolCalls,
        });

        for (const tc of response.toolCalls) {
          options.onToolCall?.(tc);

          // 2c. Permission Check Gate (Hard Constraint 6)
          let permitted = true;
          if (tc.name === 'runTerminal') {
            const cmd = tc.args?.command || '';
            const check = permissionPolicy.checkTerminalCommand(cmd);
            if (check.needsPrompt && options.onPermissionRequest) {
              options.onStatus?.('awaiting_permission');
              const decision = await options.onPermissionRequest({
                id: `perm_${Date.now()}`,
                toolName: tc.name,
                command: cmd,
              });

              if (decision === 'reject') {
                permitted = false;
              } else if (decision === 'allow_session') {
                permissionPolicy.grantSession(cmd);
              }
            }
          }

          let toolResult: any;
          if (!permitted) {
            toolResult = {
              toolName: tc.name,
              success: false,
              error: 'User rejected permission to execute this command.',
            };
          } else {
            // 2d. Execute tool and capture result
            options.onStatus?.(`executing_${tc.name}`);
            toolResult = await this.toolRegistry.executeTool(tc.name, tc.args, context);
          }

          options.onToolResult?.({
            toolCallId: tc.id,
            toolName: tc.name,
            success: toolResult.success,
            data: toolResult.data,
            error: toolResult.error,
          });

          // Sanitize & bound tool response payload to avoid token explosion
          let boundedContent: any = toolResult.error ? { error: toolResult.error } : toolResult.data || { success: true };
          if (boundedContent && typeof boundedContent === 'object') {
            if (Array.isArray(boundedContent.matches) && boundedContent.matches.length > 12) {
              boundedContent = {
                ...boundedContent,
                matches: boundedContent.matches.slice(0, 12),
                note: `[Truncated to 12 of ${boundedContent.matches.length} matches to conserve context]`,
              };
            }
            if (Array.isArray(boundedContent.entries) && boundedContent.entries.length > 20) {
              boundedContent = {
                ...boundedContent,
                entries: boundedContent.entries.slice(0, 20),
                note: `[Truncated to 20 of ${boundedContent.entries.length} directory entries]`,
              };
            }
            if (typeof boundedContent.content === 'string' && boundedContent.content.length > 3500) {
              boundedContent = {
                ...boundedContent,
                content: boundedContent.content.slice(0, 3500) + '\n... [Remaining content truncated to conserve context tokens]',
              };
            }
          }

          // 2e. Append tool result observation to context
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

      // 3. END CONDITIONS: finish stop
      break;
    }

    // 3b. Ensure complete narrative response: If tools were executed but no final explanation was generated
    if (!fullReply.trim() && iterations > 0) {
      try {
        options.onStatus?.('synthesizing_response');
        messages.push({
          role: 'user',
          content: 'Please synthesize your findings, explain what was analyzed or modified, and provide the complete answer in clear Markdown with code blocks.',
        });
        const finalPass = await this.queryModel({
          apiKey,
          model,
          systemPrompt: options.envelope.systemPrompt,
          messages,
          tools: [], // Empty tools array guarantees the model returns text
        });
        if (finalPass.text) {
          fullReply = finalPass.text;
          await this.streamTextDeltas(finalPass.text, options.onDelta);
        }
      } catch (err: any) {
        console.warn('[AgentLoop] Final synthesis pass error:', err?.message);
      }
    }

    // Persist session to workspace (.third-eye/sessions/)
    try {
      const sessionDir = path.join(workspaceRoot, '.third-eye', 'sessions');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir, `${options.sessionId || 'last'}.json`),
        JSON.stringify({ messages, timestamp: Date.now() }, null, 2),
        'utf-8'
      );
    } catch {}

    return { reply: fullReply, iterations };
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
      (process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY.startsWith('sk-') &&
      !process.env.OPENAI_API_KEY.includes('your_openai')
        ? process.env.OPENAI_API_KEY
        : '') || (params.apiKey && params.apiKey.startsWith('sk-') ? params.apiKey : '');
    const openAiBaseUrl = process.env.OPENAI_BASE_URL || '';
    const activeProvider = (process.env.AI_PROVIDER || '').toLowerCase();

    const isGeminiModel = Boolean(params.model && params.model.toLowerCase().includes('gemini'));
    const isExplicitOpenAi = Boolean(
      params.model &&
        (!params.model.toLowerCase().includes('gemini') ||
          params.model.toLowerCase().includes('nemotron') ||
          params.model.toLowerCase().includes('nvidia') ||
          params.model.includes('/') ||
          params.model.toLowerCase().includes('gpt') ||
          params.model.toLowerCase().includes('o1') ||
          params.model.toLowerCase().includes('o3') ||
          params.model.toLowerCase().includes('llama') ||
          params.model.toLowerCase().includes('gemma') ||
          params.model.toLowerCase().includes('qwen') ||
          params.model.toLowerCase().includes('openai'))
    );

    // Route to OpenAI/compatible provider if explicitly selected or model matches, but NOT if user picked Gemini
    const wantsOpenAI = !isGeminiModel && Boolean(
      isExplicitOpenAi ||
      (activeProvider === 'openai' && (openAiKey || openAiBaseUrl))
    );

    if (wantsOpenAI) {
      const effectiveOpenAiModel =
        params.model && !params.model.toLowerCase().includes('gemini')
          ? params.model
          : (process.env.OPENAI_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free');
      try {
        return await this.queryOpenAI({ ...params, model: effectiveOpenAiModel, apiKey: openAiKey || params.apiKey || 'ollama' });
      } catch (err: any) {
        if (geminiKey) {
          console.warn(`[AgentLoop] OpenAI/Ollama call failed (${err.message}). Gracefully falling back to Gemini...`);
        } else {
          throw err;
        }
      }
    }

    // Default to Google Gemini (always uses valid Gemini key)
    const effectiveKey = geminiKey || params.apiKey;
    const requestedModel = this.normalizeGeminiModel(params.model);
    const candidateModels = [
      requestedModel,
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3-flash-preview',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx && !isModelExhausted(m) && !m.includes('2.5') && !m.includes('2.0') && !m.includes('1.5') && !m.includes('gemma'));

    const effectiveCandidates = candidateModels.length > 0 ? candidateModels : ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];

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
            markModelExhausted(currentModel, 15 * 60 * 1000);
            console.warn(`[AgentLoop] Model ${currentModel} hit daily quota. Rotating to next healthy model...`);
            break;
          }

          if (isServerUnavailable) {
            markModelExhausted(currentModel, 30 * 1000);
            console.warn(`[AgentLoop] Model ${currentModel} returned server error (${msg.slice(0, 80)}). Rotating to next candidate...`);
            break;
          }

          // If temporary rate limit (RPM), extract retry delay (or 2.5s) and retry
          if (isPerMinuteLimit) {
            const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
            const waitSeconds = retryMatch ? Math.min(8, Math.ceil(parseFloat(retryMatch[1]))) : 3;
            console.warn(`[AgentLoop] Transient RPM limit on ${currentModel}. Pausing ${waitSeconds}s before retrying...`);
            await new Promise((r) => setTimeout(r, waitSeconds * 1000));
            if (attempt === 0) {
              continue;
            }
            markModelExhausted(currentModel, 20 * 1000);
            break;
          }

          // For any other unexpected error, fallback to next candidate model
          console.warn(`[AgentLoop] Model ${currentModel} failed: ${msg.slice(0, 100)}. Falling back to next candidate model...`);
          break;
        }
      }
    }
    throw lastError;
  }

  private normalizeGeminiModel(m?: string): string {
    const defaultModel = process.env.GEMINI_MODEL || (isModelExhausted('gemini-3.8-flash') ? 'gemini-3.5-flash-lite' : 'gemini-3.5-flash-lite');
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
    if (clean.includes('2.5') || clean.includes('2.0') || clean.includes('1.5')) {
      return 'gemini-3.5-flash-lite';
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
          contents.push({
            role: 'model',
            parts: [{ text: m.content || ' ' }],
          });
        }
        idx++;
        // Gather following tool responses for this model turn
        const toolResponses: any[] = [];
        while (idx < params.messages.length && params.messages[idx].role === 'tool') {
          const tm = params.messages[idx];
          let resContent = tm.content;
          if (typeof resContent === 'string') {
            try { resContent = JSON.parse(resContent); } catch {}
          }
          toolResponses.push({
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
        if (toolResponses.length > 0) {
          contents.push({
            role: 'user',
            parts: toolResponses,
          });
        }
      } else if (m.role === 'tool') {
        let resContent = m.content;
        if (typeof resContent === 'string') {
          try { resContent = JSON.parse(resContent); } catch {}
        }
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: m.name || 'tool',
              response: {
                name: m.name || 'tool',
                content: resContent,
              },
            },
          }],
        });
        idx++;
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

    const body: any = {
      systemInstruction: { parts: [{ text: params.systemPrompt }] },
      contents: normalizedContents,
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    };

    // Add function declarations
    if (params.tools && params.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: params.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    let res: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await this.fetchJson(url, body);
        break;
      } catch (err: any) {
        const isDailyQuota =
          err?.message?.includes('PerDay') ||
          err?.message?.includes('Daily') ||
          err?.message?.includes('exceeded your current quota') ||
          err?.message?.includes('free_tier_requests');
        if (!isDailyQuota && attempt < 2 && (err?.message?.includes('429') || err?.message?.includes('Quota exceeded') || err?.message?.includes('rate limit'))) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw err;
      }
    }

    const candidate = res.candidates?.[0]?.content?.parts || [];
    let text = '';
    const toolCalls: any[] = [];

    for (const part of candidate) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: part.functionCall.name,
          args: part.functionCall.args || {},
        });
      }
    }

    const extracted = this.extractInTextToolCalls(text, toolCalls.length > 0 ? toolCalls : undefined);
    return { text: extracted.text, toolCalls: extracted.toolCalls, rawParts: candidate };
  }

  private async queryOpenAI(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    messages: any[];
    tools: any[];
  }): Promise<{ text?: string; toolCalls?: Array<{ id: string; name: string; args: any }> }> {
    let rawBaseUrl = process.env.OPENAI_BASE_URL?.trim();
    if (
      (!rawBaseUrl || rawBaseUrl.includes('localhost') || rawBaseUrl.includes('127.0.0.1')) &&
      (params.apiKey?.startsWith('sk-or-') || process.env.OPENAI_API_KEY?.startsWith('sk-or-'))
    ) {
      rawBaseUrl = 'https://openrouter.ai/api/v1';
    }
    const normalizedBaseUrl = rawBaseUrl
      ? (rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl)
      : 'https://api.openai.com/v1';
    const url = normalizedBaseUrl.endsWith('/chat/completions')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/chat/completions`;
    const formattedMessages = params.messages.map((m) => {
      let content = m.content;
      if (typeof content !== 'string') {
        content = content ? JSON.stringify(content) : '';
      }

      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId || m.id || 'call_0',
          content,
        };
      }

      if (m.role === 'assistant') {
        const msg: any = {
          role: 'assistant',
          content,
        };
        if (m.toolCalls && m.toolCalls.length > 0) {
          msg.tool_calls = m.toolCalls.map((tc: any) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
            },
          }));
        }
        return msg;
      }

      if ((m.role === 'user' || !m.role) && m.images && Array.isArray(m.images) && m.images.length > 0) {
        const supportsVision = isVisionCapableModel(params.model);
        if (supportsVision) {
          const contentParts: any[] = [];
          if (content) {
            contentParts.push({ type: 'text', text: content });
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
          const notice = `\n[Notice: Attached image is omitted for this turn because the selected model (${params.model || 'active'}) is text-only. Proceeding using textual description and codebase inspection.]`;
          return {
            role: 'user',
            content: content ? `${content}${notice}` : 'Please proceed with the assigned task.',
          };
        }
      }

      return {
        role: m.role || 'user',
        content,
      };
    });

    const openaiMsgs = [{ role: 'system', content: params.systemPrompt }, ...formattedMessages];

    const modelName = params.model || process.env.OPENAI_MODEL || 'llama3';
    const body: any = {
      model: modelName,
      messages: openaiMsgs,
      temperature: 0.2,
    };

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${params.apiKey || process.env.OPENAI_API_KEY || 'ollama'}`,
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'third-eye-ai-service',
      'HTTP-Referer': 'https://thirdeye.dev',
      'X-Title': 'THIRD EYE IDE',
    };

    let res: any;
    try {
      res = await this.fetchJson(url, body, headers);
    } catch (err: any) {
      const errStr = (err?.message || '') + ' ' + (typeof err?.error === 'object' ? JSON.stringify(err.error) : (err?.error || ''));
      const isVisionUnsupported =
        /support image|Filter by Image Support|image input|vision capability|modality.*image/i.test(errStr) ||
        (err?.status === 404 && /image/i.test(errStr)) ||
        (err?.status === 400 && /image/i.test(errStr));

      if (isVisionUnsupported && body.messages) {
        console.warn(`[AgentLoop] Current model (${body.model}) does not support image input. Stripping images and retrying with text fallback...`);
        const textOnlyMessages = body.messages.map((m: any) => {
          if (m.role === 'user' && Array.isArray(m.content)) {
            const textParts = m.content
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text);
            const imageCount = m.content.filter((p: any) => p.type === 'image_url').length;
            if (imageCount > 0) {
              textParts.push(`\n[Notice: Attached image could not be processed because the selected model (${body.model}) does not support multimodal vision. Proceeding using textual description and codebase inspection.]`);
            }
            return {
              ...m,
              content: textParts.join('\n') || 'Please proceed with the assigned task.',
            };
          }
          return m;
        });
        body.messages = textOnlyMessages;
        res = await this.fetchJson(url, body, headers);
      } else {
        throw err;
      }
    }

    const choice = res.choices?.[0]?.message;
    // Some models like gemma/deepseek stream reasoning or put response in content or reasoning
    let text = choice?.content || '';
    if (!text && choice?.reasoning) {
      text = choice.reasoning;
    }
    let toolCalls: any[] | undefined = undefined;

    if (choice?.tool_calls) {
      toolCalls = choice.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}'),
      }));
    }

    const extracted = this.extractInTextToolCalls(text, toolCalls);
    return { text: extracted.text, toolCalls: extracted.toolCalls };
  }

  /**
   * Parse in-text tool calls emitted by models that output XML or raw JSON instead of function call objects.
   * Supports:
   * 1. <function=name><parameter=k>v</parameter></function>
   * 2. <tool_call>{ ... }</tool_call>
   * 3. Raw JSON: {"tool": "run_terminal", "command": "...", "background": true}
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

    return {
      text: text.trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private fetchJson(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;
      const timeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '120000', 10);

      const data = JSON.stringify(body);
      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...headers,
          },
          timeout: timeoutMs,
        },
        (res) => {
          let chunks = '';
          res.on('data', (d) => (chunks += d));
          res.on('end', () => {
            try {
              const json = JSON.parse(chunks);
              if (res.statusCode && res.statusCode >= 400) {
                return reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
              }
              resolve(json);
            } catch (err) {
              reject(new Error(`Failed to parse response: ${chunks.slice(0, 100)}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error(`Request to ${parsed.hostname} timed out after ${Math.round(timeoutMs / 1000)}s`));
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}
