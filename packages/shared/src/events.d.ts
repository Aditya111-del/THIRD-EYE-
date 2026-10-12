/**
 * Cross-Process Streaming Event Contracts
 */
import { ToolCall, ToolResult } from './agent';
import { PermissionRequest } from './permissions';
export interface TerminalDataPayload {
    id: string;
    data: string;
}
export interface TerminalExitPayload {
    id: string;
    exitCode: number;
    signal?: number;
}
export interface TerminalTitlePayload {
    id: string;
    title: string;
}
export type FileChangeKind = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
export interface FileWatchPayload {
    type: FileChangeKind;
    path: string;
    stats?: {
        size?: number;
        mtimeMs?: number;
    };
}
export interface AgentDeltaPayload {
    sessionId: string;
    delta: string;
    turnIndex: number;
}
export interface AgentStatusPayload {
    sessionId: string;
    status: 'idle' | 'thinking' | 'streaming' | 'awaiting_permission' | 'executing_tool' | 'done' | 'error';
    message?: string;
    toolName?: string;
}
export interface BackgroundTaskPayload {
    taskId: string;
    command: string;
    status: 'running' | 'completed' | 'failed' | 'killed';
    outputDelta?: string;
    exitCode?: number;
    startTime: number;
}
export type ToolRisk = 'read' | 'write' | 'exec' | 'network';
export interface AgentStreamDeltaPayload {
    agentId: string;
    delta: string;
    sessionId: string;
    turnIndex?: number;
}
export interface ToolStartPayload {
    agentId: string;
    toolCallId: string;
    name: string;
    args: any;
    risk: ToolRisk;
    sessionId: string;
}
export interface ToolEndPayload {
    agentId: string;
    toolCallId: string;
    name: string;
    result: any;
    durationMs: number;
    success: boolean;
    sessionId: string;
}
export interface AgentDonePayload {
    agentId: string;
    summary: string;
    sessionId: string;
}
export interface AgentStuckPayload {
    agentId: string;
    reason: string;
    sessionId: string;
}
export interface TaskGraphUpdatePayload {
    sessionId: string;
    steps: any[];
}
export interface TaskStepUpdatePayload {
    sessionId: string;
    stepId: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    error?: string;
    result?: any;
}
export interface CheckpointCreatedPayload {
    id: string;
    description: string;
    files: string[];
    timestamp: number;
}
export type ThirdEyeEvent = {
    type: 'terminal.data';
    payload: TerminalDataPayload;
} | {
    type: 'terminal.exit';
    payload: TerminalExitPayload;
} | {
    type: 'files.watch';
    payload: FileWatchPayload;
} | {
    type: 'agent.delta';
    payload: AgentStreamDeltaPayload | AgentDeltaPayload;
} | {
    type: 'agent.toolCall';
    payload: {
        sessionId: string;
        toolCall: ToolCall;
    };
} | {
    type: 'agent.toolResult';
    payload: {
        sessionId: string;
        toolResult: ToolResult;
    };
} | {
    type: 'agent.permissionRequest';
    payload: PermissionRequest;
} | {
    type: 'agent.status';
    payload: AgentStatusPayload;
} | {
    type: 'task.delta';
    payload: BackgroundTaskPayload;
} | {
    type: 'tool.start';
    payload: ToolStartPayload;
} | {
    type: 'tool.end';
    payload: ToolEndPayload;
} | {
    type: 'agent.done';
    payload: AgentDonePayload;
} | {
    type: 'agent.stuck';
    payload: AgentStuckPayload;
} | {
    type: 'task.graph';
    payload: TaskGraphUpdatePayload;
} | {
    type: 'task.update';
    payload: TaskStepUpdatePayload;
} | {
    type: 'checkpoint.created';
    payload: CheckpointCreatedPayload;
};
