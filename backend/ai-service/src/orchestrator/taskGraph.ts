/**
 * TASK GRAPH DAG ENGINE (Phase 4 & Multi-Agent Architecture)
 * Manages dependency ordering, ready step detection, and retry states.
 */

import { TaskGraphDAG, TaskGraphStep, TaskStepStatus, WorkerRole } from '@third-eye/shared';

export class TaskGraphManager {
  private dag: TaskGraphDAG;

  constructor(goal: string, steps: TaskGraphStep[] = []) {
    this.dag = {
      id: `dag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      goal,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'planning',
    };
  }

  public getDAG(): TaskGraphDAG {
    return this.dag;
  }

  public setSteps(steps: TaskGraphStep[]) {
    this.dag.steps = steps;
    this.dag.updatedAt = Date.now();
    this.dag.status = 'in_progress';
  }

  public getStep(id: string): TaskGraphStep | undefined {
    return this.dag.steps.find((s) => s.id === id);
  }

  public updateStepStatus(id: string, status: TaskStepStatus, error?: string, result?: any) {
    const step = this.getStep(id);
    if (step) {
      step.status = status;
      if (error) step.error = error;
      if (result) step.result = result;
      this.dag.updatedAt = Date.now();
    }
  }

  public incrementRetry(id: string): number {
    const step = this.getStep(id);
    if (step) {
      step.retryCount = (step.retryCount || 0) + 1;
      return step.retryCount;
    }
    return 0;
  }

  /**
   * Returns all steps whose dependencies are 100% complete and that are currently pending.
   */
  public getReadySteps(): TaskGraphStep[] {
    const completedIds = new Set(
      this.dag.steps.filter((s) => s.status === 'done').map((s) => s.id)
    );

    return this.dag.steps.filter((s) => {
      if (s.status !== 'pending') return false;
      return s.dependsOn.every((depId) => completedIds.has(depId));
    });
  }

  public isComplete(): boolean {
    return this.dag.steps.length > 0 && this.dag.steps.every((s) => s.status === 'done');
  }

  public hasFailures(): boolean {
    return this.dag.steps.some((s) => s.status === 'failed');
  }

  public anyRunning(): boolean {
    return this.dag.steps.some((s) => s.status === 'running');
  }
}
