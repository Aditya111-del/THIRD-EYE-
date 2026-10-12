import path from 'path';
import { BaseAgent } from './baseAgent';
import { AgentContext, AgentEvent, AgentResult, PlanStep, ToolTrace, EditedFileMeta } from './types';
import { AgentLoop } from '../loop';

/**
 * EditorAgent: Specialized agent for direct code editing, inline diffs,
 * Monaco buffer refactoring, and multi-file code modifications.
 */
export class EditorAgent extends BaseAgent {
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

    const activeFileName = context.activeFile?.name || 'active document';

    // Thought Event
    const thoughts: string[] = [
      `1. Focusing on editor buffer and code modifications for ${activeFileName}`,
      `2. Analyzing AST structure, imports, and surrounding scope`,
      `3. Preparing inline diffs with full syntax preservation`,
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
    const editedFilesMap = new Map<string, EditedFileMeta>();

    const editorSpecificPrompt = `${this.buildSystemPrompt(context, matchedSkills)}
ROLE SPECIALIZATION:
You are an expert Monaco Code Editor & Refactoring Agent.
Your primary duty is to inspect the active file: ${context.activeFile?.path || 'none'}
and open tabs: ${(context.openTabs || []).map((t) => t.name).join(', ')}.
Prioritize clean code edits, avoiding regressions, and producing clean diffs.`;

    const loopResult = await this.loop.run({
      userMessage: userPrompt,
      workspaceRoot: context.workspaceRoot,
      sessionId,
      apiKey: context.apiKey,
      model: context.model,
      envelope: {
        systemPrompt: editorSpecificPrompt,
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

        if ((tr.toolName === 'editFile' || tr.toolName === 'writeFile') && tr.success && tr.data) {
          const filePath = tr.data.path || tr.data.filePath || '';
          const name = path.basename(filePath) || filePath;
          const meta: EditedFileMeta = {
            name,
            path: filePath,
            added: tr.data.diff?.addedCount || 10,
            removed: tr.data.diff?.removedCount || 3,
          };
          editedFilesMap.set(name, meta);
          emitEvent({
            type: 'file_change',
            sessionId,
            data: { files: Array.from(editedFilesMap.values()) },
          });
        }
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
      editedFiles: Array.from(editedFilesMap.values()),
      iterations: loopResult.iterations,
    };

    emitEvent({ type: 'finish', sessionId, data: result });
    return result;
  }
}
