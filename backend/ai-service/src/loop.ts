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

export interface AgentContextEnvelope {
  systemPrompt: string;
  repoMapSummary?: string;
  openTabs?: Array<{ path: string; selection?: string; isDirty?: boolean }>;
  terminalTail?: string;
  history: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; toolCallId?: string; name?: string; rawParts?: any[]; toolCalls?: any[] }>;
}

export interface RunAgentOptions {
  userMessage: string;
  workspaceRoot: string;
  sessionId: string;
  envelope: AgentContextEnvelope;
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

  constructor(workspaceRoot: string) {
    this.toolRegistry = new ToolRegistry(workspaceRoot);
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
    const maxIterations = Math.min(options.maxIterations || 8, 12);
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
    let model = options.model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
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
      messages.push({ role: 'user', content: options.userMessage });
    }

    let iterations = 0;
    let fullReply = '';

    while (iterations < maxIterations) {
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
        if (
          err?.message?.includes('quota') ||
          err?.message?.includes('Quota') ||
          err?.message?.includes('429') ||
          err?.message?.includes('RESOURCE_EXHAUSTED')
        ) {
          console.warn(`[AgentLoop] Rate limit encountered at iteration ${iterations}. Switching to gemini-3.1-flash-lite-preview...`);
          model = 'gemini-3.1-flash-lite-preview';
          continue;
        }
        throw err;
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
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY.startsWith('sk-') &&
      !process.env.OPENAI_API_KEY.includes('your_openai')
        ? process.env.OPENAI_API_KEY
        : '';

    // Route to OpenAI only if valid OpenAI key exists AND explicitly requested GPT/o1/o3/OpenAI model
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

    // Default to Google Gemini (always uses valid Gemini key)
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
            console.warn(`[AgentLoop] Model ${currentModel} returned (${msg.slice(0, 80)}). Switching immediately to next candidate model...`);
            break;
          }

          // If temporary rate limit (RPM), quick 1s pause once
          if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
            if (attempt < 1) {
              console.warn(`[AgentLoop] Transient RPM limit on ${currentModel}. Pausing 1s...`);
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
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
        if (attempt < 2 && (err?.message?.includes('429') || err?.message?.includes('Quota exceeded') || err?.message?.includes('rate limit'))) {
          await new Promise((r) => setTimeout(r, 4500));
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

    return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, rawParts: candidate };
  }

  private async queryOpenAI(params: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    messages: any[];
    tools: any[];
  }): Promise<{ text?: string; toolCalls?: Array<{ id: string; name: string; args: any }> }> {
    const url = 'https://api.openai.com/v1/chat/completions';
    const openaiMsgs = [{ role: 'system', content: params.systemPrompt }, ...params.messages];

    const body: any = {
      model: params.model.includes('gpt') ? params.model : 'gpt-4o',
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

    const res = await this.fetchJson(url, body, {
      Authorization: `Bearer ${params.apiKey}`,
    });

    const choice = res.choices?.[0]?.message;
    const text = choice?.content || '';
    let toolCalls: any[] | undefined = undefined;

    if (choice?.tool_calls) {
      toolCalls = choice.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}'),
      }));
    }

    return { text, toolCalls };
  }

  private fetchJson(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;

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
          timeout: 45000,
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

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}
