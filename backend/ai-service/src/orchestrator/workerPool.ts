/**
 * WORKER POOL (Phase 4 & Multi-Agent Architecture)
 * Dispatches independent task steps to specialized workers (max 3 concurrent).
 */

import { AgentSpec, TaskGraphStep, WorkerRole } from '@third-eye/shared';
import { CoreAgentLoop, AgentRunContext, AgentRunResult } from '../core/loop';

export class WorkerPool {
  private maxConcurrency: number;
  private activeWorkersCount = 0;
  private loop: CoreAgentLoop;

  constructor(workspaceRoot: string, maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this.loop = new CoreAgentLoop(workspaceRoot);
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.loop.setWorkspaceRoot(workspaceRoot);
  }

  public canAcceptWork(): boolean {
    return this.activeWorkersCount < this.maxConcurrency;
  }

  public getActiveCount(): number {
    return this.activeWorkersCount;
  }

  public async executeTask(
    step: TaskGraphStep,
    context: AgentRunContext
  ): Promise<AgentRunResult> {
    this.activeWorkersCount++;

    const role: WorkerRole = step.workerHint || 'coder';
    const agentSpec: AgentSpec = {
      id: `${role}_${step.id}_${Math.random().toString(36).substring(2, 6)}`,
      role,
      name: `${role.charAt(0).toUpperCase() + role.slice(1)} Agent`,
      taskDescription: `[${step.title}] ${step.description}`,
      acceptanceCriteria: [
        `Implement ${step.title} with zero compile or syntax errors`,
        `Verify file modifications exist and pass diagnostics`,
      ],
    };

    try {
      const result = await this.loop.runAgent(agentSpec, {
        ...context,
        currentStep: step,
        userMessage: `You are assigned Task Step "${step.title}".
DESCRIPTION: ${step.description}
${step.error ? `PREVIOUS FAILURE CONTEXT TO FIX: ${step.error}` : ''}
Execute required tools (inspections, terminal commands, edits) and verify your changes.`,
      });

      return result;
    } finally {
      this.activeWorkersCount--;
    }
  }
}
