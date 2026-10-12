import { z } from 'zod';
import { CheckpointManager } from './checkpoints';
import { FileLockRegistry } from './fileLocks';

export type ToolRisk = 'read' | 'write' | 'exec' | 'network';

export interface ToolExecutionContext {
  workspaceRoot: string;
  checkpointManager: CheckpointManager;
  fileLockRegistry?: FileLockRegistry;
  sessionId?: string;
  agentId?: string;
  agentRole?: string;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  data?: any;
  error?: string;
  diff?: {
    path?: string;
    original: string;
    modified: string;
    hunkCount?: number;
    addedCount?: number;
    removedCount?: number;
  };
  durationMs?: number;
  pendingApproval?: boolean;
}

export interface ToolDefinition<TArgs = any> {
  name: string;
  aliases?: string[];
  description: string;
  argsSchema: z.ZodType<TArgs>;
  risk: ToolRisk;
  needsPermission: boolean;
  timeoutMs: number;
  roles?: string[]; // If specified, only available to these roles
  handler: (args: TArgs, context: ToolExecutionContext) => Promise<any>;
}
