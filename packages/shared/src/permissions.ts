/**
 * Agent Execution Permission Decision Contracts and Auto-Allow Policies
 */

import { ToolRiskLevel } from './tools';

export type PermissionAction = 'allow_once' | 'allow_session' | 'reject';

export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  description: string;
  command?: string;
  riskLevel: ToolRiskLevel;
  autoAllowEligible?: boolean;
  timestamp: number;
}

export interface PermissionDecision {
  requestId: string;
  decision: PermissionAction;
  reason?: string;
}

export interface AutoAllowPolicy {
  allowedCommands: string[];
  sessionGrantedCommands: Set<string> | string[];
}

export const DEFAULT_AUTO_ALLOW_COMMANDS: readonly string[] = [
  'git status',
  'git branch',
  'git log',
  'git diff',
  'ls',
  'pwd',
  'dir',
  'echo',
  'cat',
  'node -v',
  'npm -v',
  'bun -v',
  'python --version',
  'python3 --version',
];

export function isCommandAutoAllowed(command: string, customAllowedList: string[] = []): boolean {
  if (!command || typeof command !== 'string') return false;
  const trimmed = command.trim().toLowerCase();
  
  // Check exact matches or prefixes in default list
  for (const cmd of DEFAULT_AUTO_ALLOW_COMMANDS) {
    if (trimmed === cmd || trimmed.startsWith(cmd + ' ')) {
      return true;
    }
  }

  // Check custom allowed list
  for (const cmd of customAllowedList) {
    const customTrimmed = cmd.trim().toLowerCase();
    if (trimmed === customTrimmed || trimmed.startsWith(customTrimmed + ' ')) {
      return true;
    }
  }

  return false;
}
