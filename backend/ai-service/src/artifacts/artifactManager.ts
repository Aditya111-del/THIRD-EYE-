/**
 * ANTIGRAVITY ARTIFACT MANAGER
 * Produces, persists, and synchronizes structured, reviewable Antigravity artifacts:
 * 1. Task List (Live execution state & statuses)
 * 2. Implementation Plan (Architecture, affected files, rollback, test strategy)
 * 3. Code Diffs (Unified diffs, modified files, checkpoint bindings)
 * 4. Walkthrough & Evidence (Evidence-backed verification, run commands, exit codes, preview URLs)
 *
 * Persisted locally to `<workspaceRoot>/.third-eye/artifacts/<sessionId>/<artifactId>.json`
 */

import fs from 'fs';
import path from 'path';
import {
  AgentArtifact,
  ArtifactType,
  ArtifactFeedbackItem,
  TaskListArtifactData,
  TaskListItem,
  ImplementationPlanArtifactData,
  CodeDiffsArtifactData,
  CodeDiffEntry,
  WalkthroughArtifactData,
  TaskGraphStep,
} from '@third-eye/shared';

export class ArtifactManager {
  private workspaceRoot: string;
  private memoryCache: Map<string, Map<string, AgentArtifact>> = new Map();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private getArtifactsDir(sessionId: string): string {
    const dir = path.join(this.workspaceRoot, '.third-eye', 'artifacts', sessionId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private persist(sessionId: string, artifact: AgentArtifact): void {
    try {
      const dir = this.getArtifactsDir(sessionId);
      const filePath = path.join(dir, `${artifact.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[ArtifactManager] Failed to persist artifact ${artifact.id}:`, err.message);
    }
  }

  private loadSessionArtifacts(sessionId: string): Map<string, AgentArtifact> {
    if (this.memoryCache.has(sessionId)) {
      return this.memoryCache.get(sessionId)!;
    }

    const sessionMap = new Map<string, AgentArtifact>();
    const dir = path.join(this.workspaceRoot, '.third-eye', 'artifacts', sessionId);
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          const parsed: AgentArtifact = JSON.parse(content);
          if (parsed && parsed.id) {
            sessionMap.set(parsed.id, parsed);
          }
        }
      } catch (err: any) {
        console.warn(`[ArtifactManager] Failed to read disk artifacts for ${sessionId}:`, err.message);
      }
    }

    this.memoryCache.set(sessionId, sessionMap);
    return sessionMap;
  }

  public getAllArtifacts(sessionId: string): AgentArtifact[] {
    const map = this.loadSessionArtifacts(sessionId);
    return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  public getArtifact(sessionId: string, artifactId: string): AgentArtifact | undefined {
    const map = this.loadSessionArtifacts(sessionId);
    return map.get(artifactId);
  }

  /**
   * 1. Task List Artifact
   */
  public syncTaskList(
    sessionId: string,
    goal: string,
    steps: TaskGraphStep[],
    emitEvent?: (event: { type: string; sessionId: string; data: any }) => void
  ): AgentArtifact {
    const map = this.loadSessionArtifacts(sessionId);
    const artifactId = `artifact_task_list_${sessionId}`;
    const isNew = !map.has(artifactId);

    const items: TaskListItem[] = steps.map((s) => {
      let mappedStatus: TaskListItem['status'] = 'planned';
      if (s.status === 'running') mappedStatus = 'running';
      else if (s.status === 'done') mappedStatus = 'passed';
      else if (s.status === 'failed') mappedStatus = 'failed';

      return {
        id: s.id,
        title: s.title,
        description: s.description,
        status: mappedStatus,
        workerRole: s.workerHint,
        error: s.error,
        result: typeof s.result === 'string' ? s.result : undefined,
      };
    });

    const data: TaskListArtifactData = {
      goal,
      items,
    };

    const existing = map.get(artifactId);
    const now = Date.now();
    const artifact: AgentArtifact = {
      id: artifactId,
      sessionId,
      type: 'task_list',
      title: 'Task List & Execution DAG',
      description: `Itemized execution graph with live status tracking for: "${goal}"`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      data,
      feedback: existing?.feedback || [],
    };

    map.set(artifactId, artifact);
    this.persist(sessionId, artifact);

    emitEvent?.({
      type: isNew ? 'artifact.created' : 'artifact.updated',
      sessionId,
      data: { sessionId, artifact },
    });

    return artifact;
  }

  /**
   * 2. Implementation Plan Artifact
   */
  public createOrUpdatePlan(
    sessionId: string,
    planData: ImplementationPlanArtifactData,
    emitEvent?: (event: { type: string; sessionId: string; data: any }) => void
  ): AgentArtifact {
    const map = this.loadSessionArtifacts(sessionId);
    const artifactId = `artifact_plan_${sessionId}`;
    const isNew = !map.has(artifactId);
    const existing = map.get(artifactId);
    const now = Date.now();

    const artifact: AgentArtifact = {
      id: artifactId,
      sessionId,
      type: 'implementation_plan',
      title: 'Architectural Implementation Plan',
      description: `Technical roadmap, file surface, dependency notes, and risk strategy for: "${planData.goal}"`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      data: planData,
      feedback: existing?.feedback || [],
    };

    map.set(artifactId, artifact);
    this.persist(sessionId, artifact);

    emitEvent?.({
      type: isNew ? 'artifact.created' : 'artifact.updated',
      sessionId,
      data: { sessionId, artifact },
    });

    return artifact;
  }

  /**
   * 3. Code Diffs Artifact
   */
  public recordDiff(
    sessionId: string,
    diffEntry: CodeDiffEntry,
    emitEvent?: (event: { type: string; sessionId: string; data: any }) => void
  ): AgentArtifact {
    const map = this.loadSessionArtifacts(sessionId);
    const artifactId = `artifact_diffs_${sessionId}`;
    const isNew = !map.has(artifactId);
    const existing = map.get(artifactId);
    const now = Date.now();

    const existingDiffs: CodeDiffEntry[] = existing?.data?.diffs || [];
    // Replace if same file path exists, otherwise append
    const filtered = existingDiffs.filter((d) => d.filePath !== diffEntry.filePath);
    filtered.push(diffEntry);

    const diffData: CodeDiffsArtifactData = {
      totalFiles: filtered.length,
      diffs: filtered,
    };

    const artifact: AgentArtifact = {
      id: artifactId,
      sessionId,
      type: 'code_diffs',
      title: 'Code Modifications & Diffs',
      description: `Reviewable unified changes across ${filtered.length} project file(s)`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      data: diffData,
      feedback: existing?.feedback || [],
    };

    map.set(artifactId, artifact);
    this.persist(sessionId, artifact);

    emitEvent?.({
      type: isNew ? 'artifact.created' : 'artifact.updated',
      sessionId,
      data: { sessionId, artifact },
    });

    return artifact;
  }

  /**
   * 4. Walkthrough & Evidence Artifact
   */
  public createOrUpdateWalkthrough(
    sessionId: string,
    walkthroughData: WalkthroughArtifactData,
    emitEvent?: (event: { type: string; sessionId: string; data: any }) => void
  ): AgentArtifact {
    const map = this.loadSessionArtifacts(sessionId);
    const artifactId = `artifact_walkthrough_${sessionId}`;
    const isNew = !map.has(artifactId);
    const existing = map.get(artifactId);
    const now = Date.now();

    const artifact: AgentArtifact = {
      id: artifactId,
      sessionId,
      type: 'walkthrough',
      title: walkthroughData.title || 'Verification Evidence & Walkthrough',
      description: 'Comprehensive deliverable walkthrough with tool-backed verification proof',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      data: walkthroughData,
      feedback: existing?.feedback || [],
    };

    map.set(artifactId, artifact);
    this.persist(sessionId, artifact);

    emitEvent?.({
      type: isNew ? 'artifact.created' : 'artifact.updated',
      sessionId,
      data: { sessionId, artifact },
    });

    return artifact;
  }

  /**
   * User feedback on any artifact
   */
  public addFeedback(
    sessionId: string,
    artifactId: string,
    comment: string,
    author: 'user' | 'agent' = 'user',
    emitEvent?: (event: { type: string; sessionId: string; data: any }) => void
  ): AgentArtifact | null {
    const map = this.loadSessionArtifacts(sessionId);
    const artifact = map.get(artifactId);
    if (!artifact) return null;

    const feedbackItem: ArtifactFeedbackItem = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      author,
      comment,
    };

    if (!artifact.feedback) {
      artifact.feedback = [];
    }
    artifact.feedback.push(feedbackItem);
    artifact.updatedAt = Date.now();

    this.persist(sessionId, artifact);

    emitEvent?.({
      type: 'artifact.updated',
      sessionId,
      data: { sessionId, artifact },
    });

    return artifact;
  }
}
