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
  rawParts?: any[];
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

export type ArtifactType = 'task_list' | 'implementation_plan' | 'code_diffs' | 'walkthrough';

export type VerificationEvidenceStatus = 'planned' | 'executed' | 'passed' | 'failed' | 'not_run' | 'blocked';

export interface VerificationEvidenceItem {
  id: string;
  name: string;
  category: 'static' | 'test' | 'build' | 'runtime' | 'preview';
  command?: string;
  status: VerificationEvidenceStatus;
  exitCode?: number;
  outputSummary?: string;
  url?: string;
  verifiedAt?: number;
}

export interface ArtifactFeedbackItem {
  id: string;
  timestamp: number;
  author: 'user' | 'agent';
  comment: string;
}

export interface TaskListItem {
  id: string;
  title: string;
  description?: string;
  status: 'planned' | 'running' | 'passed' | 'failed' | 'blocked';
  workerRole?: WorkerRole;
  error?: string;
  result?: string;
}

export interface TaskListArtifactData {
  goal: string;
  items: TaskListItem[];
}

export interface ImplementationPlanArtifactData {
  goal: string;
  existingBehavior?: string;
  architectureApproach: string;
  filesToTouch: string[];
  dependencies: string[];
  riskAndRollback: string;
  testStrategy: string;
}

export interface CodeDiffEntry {
  filePath: string;
  changeType: 'created' | 'modified' | 'deleted';
  addedLines: number;
  removedLines: number;
  originalContent?: string;
  modifiedContent?: string;
  patch?: string;
  checkpointId?: string;
}

export interface CodeDiffsArtifactData {
  totalFiles: number;
  diffs: CodeDiffEntry[];
}

export interface WalkthroughArtifactData {
  title: string;
  summary: string;
  changesMade: string[];
  touchedFiles: string[];
  evidence: VerificationEvidenceItem[];
  previewUrl?: string;
  knownLimitations?: string[];
}

export interface AgentArtifact {
  id: string;
  sessionId: string;
  type: ArtifactType;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  data: TaskListArtifactData | ImplementationPlanArtifactData | CodeDiffsArtifactData | WalkthroughArtifactData | any;
  feedback?: ArtifactFeedbackItem[];
}

