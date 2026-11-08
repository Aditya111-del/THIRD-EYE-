/**
 * WORKER POOL (Phase 4 & Multi-Agent Architecture)
 * Dispatches independent task steps to specialized workers (max 3 concurrent).
 */

import { AgentSpec, TaskGraphStep, WorkerRole } from '@third-eye/shared';
import { CoreAgentLoop, AgentRunContext, AgentRunResult, isVisionCapableModel } from '../core/loop';

export class WorkerPool {
  private maxConcurrency: number;
  private activeWorkersCount = 0;
  private loop: CoreAgentLoop;
  private cancelledSessions: Set<string> = new Set();

  constructor(workspaceRoot: string, maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this.loop = new CoreAgentLoop(workspaceRoot);
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.loop.setWorkspaceRoot(workspaceRoot);
  }

  public cancel(sessionId: string): void {
    this.cancelledSessions.add(sessionId);
    this.loop.cancel(sessionId);
  }

  public resetCancellation(sessionId: string): void {
    this.cancelledSessions.delete(sessionId);
    this.loop.resetCancellation(sessionId);
  }

  public canAcceptWork(): boolean {
    return this.activeWorkersCount < this.maxConcurrency;
  }

  public getActiveCount(): number {
    return this.activeWorkersCount;
  }

  // Per-worker hard timeout: 8 minutes max per task step
  private readonly WORKER_TIMEOUT_MS = 8 * 60 * 1000;

  public async executeTask(
    step: TaskGraphStep,
    context: AgentRunContext
  ): Promise<AgentRunResult> {
    if (this.cancelledSessions.has(context.sessionId)) {
      return {
        agentId: `${step.workerHint || 'worker'}_${step.id}`,
        role: step.workerHint || 'coder',
        reply: 'Task cancelled by user.',
        iterations: 0,
        status: 'stuck',
        toolTraces: [],
        modifiedFiles: [],
      };
    }

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

    // Worker-level timeout: a stuck worker should never block the whole pipeline
    const timeoutPromise = new Promise<AgentRunResult>((resolve) =>
      setTimeout(() => {
        console.warn(`[WorkerPool] Worker for step "${step.title}" exceeded ${this.WORKER_TIMEOUT_MS / 1000}s hard timeout. Returning partial result.`);
        resolve({
          agentId: agentSpec.id,
          role,
          reply: `Step "${step.title}" timed out after ${this.WORKER_TIMEOUT_MS / 1000}s. Partial work may have been completed.`,
          iterations: 0,
          status: 'stuck',
          toolTraces: [],
          modifiedFiles: [],
        });
      }, this.WORKER_TIMEOUT_MS)
    );

    try {
      const isImageError = step.error && /image input|vision capability|support image|Filter by Image Support/i.test(step.error);
      const shouldStripImages = Boolean(isImageError || !isVisionCapableModel(context.model));
      const effectiveImages = shouldStripImages ? [] : context.images;
      let effectiveHistory = context.history;
      if (shouldStripImages && Array.isArray(effectiveHistory)) {
        effectiveHistory = effectiveHistory.map((h: any) => {
          if (h.images) {
            const { images, ...rest } = h;
            return rest;
          }
          return h;
        });
      }

      const result = await Promise.race([
        this.loop.runAgent(agentSpec, {
          ...context,
          history: effectiveHistory,
          images: effectiveImages,
          maxIterations: 30, // Generous iteration budget for writing code, fixing errors, and verifying
          currentStep: step,
          userMessage: `You are assigned Task Step "${step.title}".
DESCRIPTION: ${step.description}
${step.error ? `PREVIOUS FAILURE CONTEXT TO FIX: ${step.error}` : ''}
Execute required tools (inspections, terminal commands, edits) and verify your changes.`,
        }),
        timeoutPromise,
      ]);

      return result;
    } finally {
      this.activeWorkersCount--;
    }
  }
}
