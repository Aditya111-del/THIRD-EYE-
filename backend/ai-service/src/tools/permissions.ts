/**
 * Policy Engine & Permission Guard (Phase 4)
 * Hard Constraint 6: Every terminal command executed by the agent requires a permission
 * decision (allow once / allow session / reject) unless it matches a user-defined auto-allow list.
 */

export interface PermissionCheckResult {
  allowed: boolean;
  needsPrompt: boolean;
  reason?: string;
}

export class PermissionPolicyEngine {
  private autoAllowCommands: Set<string> = new Set([
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
  ]);

  private sessionGrantedCommands: Set<string> = new Set();
  private pendingDecisions: Map<string, (decision: 'allow_once' | 'allow_session' | 'reject') => void> = new Map();

  public addAutoAllowCommand(command: string) {
    this.autoAllowCommands.add(command.trim().toLowerCase());
  }

  public grantSession(command: string) {
    this.sessionGrantedCommands.add(command.trim().toLowerCase());
  }

  public checkTerminalCommand(command: string): PermissionCheckResult {
    if (!command || typeof command !== 'string') {
      return { allowed: false, needsPrompt: false, reason: 'Empty command' };
    }

    const trimmed = command.trim().toLowerCase();

    // 1. Check if allowed in session
    if (this.sessionGrantedCommands.has(trimmed)) {
      return { allowed: true, needsPrompt: false, reason: 'Session grant active' };
    }

    for (const cmd of this.sessionGrantedCommands) {
      if (trimmed.startsWith(cmd + ' ')) {
        return { allowed: true, needsPrompt: false, reason: 'Session grant active' };
      }
    }

    // 2. Check auto-allow list
    for (const cmd of this.autoAllowCommands) {
      if (trimmed === cmd || trimmed.startsWith(cmd + ' ')) {
        return { allowed: true, needsPrompt: false, reason: 'Matches auto-allow policy' };
      }
    }

    // 3. Otherwise requires permission decision
    return {
      allowed: false,
      needsPrompt: true,
      reason: 'Requires user permission decision',
    };
  }

  public registerPendingPrompt(
    requestId: string,
    resolver: (decision: 'allow_once' | 'allow_session' | 'reject') => void
  ) {
    this.pendingDecisions.set(requestId, resolver);
  }

  public resolveDecision(requestId: string, decision: 'allow_once' | 'allow_session' | 'reject', command?: string) {
    const resolver = this.pendingDecisions.get(requestId);
    if (resolver) {
      if (decision === 'allow_session' && command) {
        this.grantSession(command);
      }
      resolver(decision);
      this.pendingDecisions.delete(requestId);
    }
  }
}

export const permissionPolicy = new PermissionPolicyEngine();
