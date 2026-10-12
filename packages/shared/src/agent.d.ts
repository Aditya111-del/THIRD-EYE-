/**
 * Agent Message Turns, Tool Invocations, Checkpoints, and Context Envelopes
 */
export type AgentRole = 'user' | 'assistant' | 'system' | 'tool';
export interface ToolCall {
    id: string;
    name: string;
    args: Record<string, any>;
}
export interface DiffPreviewData {
    path: string;
    original: string;
    modified: string;
    hunkCount?: number;
}
export interface ToolResult {
    toolCallId: string;
    toolName: string;
    success: boolean;
    data?: any;
    error?: string;
    diff?: DiffPreviewData;
}
export interface AgentMessage {
    id?: string;
    role: AgentRole;
    content: string;
    name?: string;
    toolCalls?: ToolCall[];
    toolCallId?: string;
    timestamp?: number;
    reasoning?: string;
    pendingPermission?: boolean;
}
export interface CheckpointFileSnapshot {
    path: string;
    hash: string;
    content?: string;
}
export interface Checkpoint {
    id: string;
    timestamp: number;
    description: string;
    files: Record<string, CheckpointFileSnapshot>;
}
export interface OpenTabInfo {
    path: string;
    selection?: string;
    isDirty?: boolean;
    contentPreview?: string;
}
export interface ContextEnvelope {
    systemPrompt: string;
    repoMapSummary: string;
    openTabs: OpenTabInfo[];
    terminalTail: string;
    recentDiagnostics?: string;
    history: AgentMessage[];
    tokenEstimate?: number;
}
export interface AgentChatRequest {
    sessionId?: string;
    terminalId?: string;
    messages: AgentMessage[];
    model?: string;
    cwd?: string;
    stream?: boolean;
}
export interface AgentChatResponse {
    sessionId: string;
    reply: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    checkpoints?: Checkpoint[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
export type TaskStepStatus = 'pending' | 'running' | 'done' | 'failed';
export type WorkerRole = 'orchestrator' | 'coder' | 'runner' | 'debugger' | 'tester' | 'researcher' | 'reviewer';
export interface TaskGraphStep {
    id: string;
    title: string;
    description: string;
    dependsOn: string[];
    status: TaskStepStatus;
    workerHint: WorkerRole;
    retryCount?: number;
    error?: string;
    result?: any;
    assignedAgentId?: string;
}
export interface TaskGraphDAG {
    id: string;
    goal: string;
    steps: TaskGraphStep[];
    createdAt: number;
    updatedAt: number;
    status: 'planning' | 'in_progress' | 'verifying' | 'completed' | 'failed';
}
export interface AgentSpec {
    id: string;
    role: WorkerRole;
    name: string;
    taskDescription?: string;
    acceptanceCriteria?: string[];
    activeFile?: string;
}
export interface FileLockInfo {
    path: string;
    agentId: string;
    acquiredAt: number;
}
