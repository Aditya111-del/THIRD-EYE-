export type AgentRole = 'autonomous' | 'editor' | 'terminal';

export type UserIntent = 'greeting' | 'general_question' | 'direct_execution' | 'workspace_task';

export interface PlanStep {
  id: string;
  label: string;
  status: 'completed' | 'in_progress' | 'pending';
}

export interface ToolTrace {
  id: string;
  toolName: string;
  args?: any;
  result?: any;
  success?: boolean;
  durationMs?: number;
  error?: string;
}

export interface EditedFileMeta {
  name: string;
  path: string;
  added: number;
  removed: number;
  diffHunks?: string;
}

export interface AgentEvent {
  type: 'delta' | 'thought' | 'plan' | 'tool_call' | 'tool_result' | 'file_change' | 'agent.file_changed' | 'status' | 'permission_request' | 'finish' | 'error' | string;
  sessionId: string;
  data: any;
}

export interface AgentContext {
  workspaceRoot: string;
  sessionId: string;
  activeFile?: { path: string; name: string; content?: string; language?: string } | null;
  openTabs?: Array<{ path: string; name: string; isDirty?: boolean }>;
  terminalTail?: string;
  history: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; name?: string; toolCallId?: string }>;
  agentMode?: AgentRole;
  model?: string;
  apiKey?: string;
}

export interface AgentResult {
  reply: string;
  thoughtDuration?: string;
  thoughts?: string[];
  plan?: PlanStep[];
  traces?: ToolTrace[];
  editedFiles?: EditedFileMeta[];
  iterations: number;
}
