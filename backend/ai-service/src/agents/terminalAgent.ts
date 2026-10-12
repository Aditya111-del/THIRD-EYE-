import path from 'path';
import { BaseAgent } from './baseAgent';
import { AgentContext, AgentEvent, AgentResult, PlanStep, ToolTrace } from './types';
import { AgentLoop } from '../loop';

/**
 * TerminalAgent: Specialized agent for terminal execution, build error resolution,
 * test verification, and environment diagnostics.
 */
export class TerminalAgent extends BaseAgent {
  private loop: AgentLoop;

  constructor(workspaceRoot: string) {
    super(workspaceRoot);
    this.loop = new AgentLoop(workspaceRoot);
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    super.setWorkspaceRoot(workspaceRoot);
    this.loop.setWorkspaceRoot(workspaceRoot);
  }

  public async execute(
    userPrompt: string,
    context: AgentContext,
    emitEvent: (event: AgentEvent) => void
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const sessionId = context.sessionId || `session-${Date.now()}`;
    const matchedSkills = this.skillManager.matchSkills(userPrompt);

    const thoughts: string[] = [
      `1. Analyzing terminal tail state and command execution context`,
      `2. Formulating shell inspection commands with exit status tracking`,
      `3. Diagnosing errors, stack traces, and environment dependencies`,
    ];

    emitEvent({
      type: 'thought',
      sessionId,
      data: {
        duration: '1s',
        thoughts,
      },
    });

    const traces: ToolTrace[] = [];

    const terminalPrompt = `${this.buildSystemPrompt(context, matchedSkills)}
ROLE SPECIALIZATION:
You are an expert Terminal Diagnostics & Command Agent.
Terminal tail state:
${context.terminalTail || '(No recent terminal output)'}

Prioritize running safe terminal commands (e.g. tests, lint checks, build diagnostics, curl health checks) to verify operational state.`;

    const loopResult = await this.loop.run({
      userMessage: userPrompt,
      workspaceRoot: context.workspaceRoot,
      sessionId,
      apiKey: context.apiKey,
      model: context.model,
      envelope: {
        systemPrompt: terminalPrompt,
        openTabs: context.openTabs,
        terminalTail: context.terminalTail,
        history: context.history as any,
      },
      onDelta: (delta) => {
        emitEvent({ type: 'delta', sessionId, data: { delta } });
      },
      onToolCall: (tc) => {
        traces.push({ id: tc.id, toolName: tc.name, args: tc.args });
        emitEvent({ type: 'tool_call', sessionId, data: { toolCall: tc } });
      },
      onToolResult: (tr) => {
        const existing = traces.find((t) => t.id === tr.toolCallId);
        if (existing) {
          existing.success = tr.success;
          existing.result = tr.data;
          existing.error = tr.error;
        }
        emitEvent({ type: 'tool_result', sessionId, data: { toolResult: tr } });
      },
      onStatus: (status) => {
        emitEvent({ type: 'status', sessionId, data: { status } });
      },
    });

    const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const result: AgentResult = {
      reply: loopResult.reply,
      thoughtDuration: `${totalSeconds}s`,
      thoughts,
      plan: undefined,
      traces,
      editedFiles: [],
      iterations: loopResult.iterations,
    };

    emitEvent({ type: 'finish', sessionId, data: result });
    return result;
  }
}
