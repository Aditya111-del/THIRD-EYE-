/**
 * Workspace Snapshot Checkpoint System (Phase 4)
 * Hard Constraint: Snapshot before each agent write (content-hash store) → enables "Revert all AI changes"
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface FileSnapshot {
  path: string;
  hash: string;
  content: string;
}

export interface CheckpointRecord {
  id: string;
  timestamp: number;
  description: string;
  files: Record<string, FileSnapshot>;
}

export class CheckpointManager {
  private checkpointsDir: string;
  private inMemoryCheckpoints: Map<string, CheckpointRecord> = new Map();

  constructor(workspaceRoot: string) {
    this.checkpointsDir = path.join(workspaceRoot, '.third-eye', 'checkpoints');
    try {
      fs.mkdirSync(this.checkpointsDir, { recursive: true });
    } catch {}
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.checkpointsDir = path.join(workspaceRoot, '.third-eye', 'checkpoints');
    try {
      fs.mkdirSync(this.checkpointsDir, { recursive: true });
    } catch {}
  }

  /**
   * Take snapshot of target file(s) before mutation
   */
  public async createCheckpoint(
    filePaths: string[],
    description: string
  ): Promise<CheckpointRecord> {
    const id = `cp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const files: Record<string, FileSnapshot> = {};

    for (const p of filePaths) {
      if (fs.existsSync(p)) {
        try {
          const content = await fs.promises.readFile(p, 'utf-8');
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          files[p] = { path: p, hash, content };
        } catch {}
      } else {
        files[p] = { path: p, hash: 'new-file', content: '' };
      }
    }

    const checkpoint: CheckpointRecord = {
      id,
      timestamp: Date.now(),
      description,
      files,
    };

    this.inMemoryCheckpoints.set(id, checkpoint);

    // Persist to disk (.third-eye/checkpoints/{id}.json)
    try {
      const diskPath = path.join(this.checkpointsDir, `${id}.json`);
      await fs.promises.writeFile(diskPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[CheckpointManager] Disk persist warning:', err.message);
    }

    return checkpoint;
  }

  /**
   * Revert workspace files to the recorded checkpoint state
   */
  public async revertCheckpoint(id: string): Promise<{ success: boolean; revertedFiles: string[] }> {
    let checkpoint = this.inMemoryCheckpoints.get(id);

    if (!checkpoint) {
      const diskPath = path.join(this.checkpointsDir, `${id}.json`);
      if (fs.existsSync(diskPath)) {
        try {
          checkpoint = JSON.parse(await fs.promises.readFile(diskPath, 'utf-8'));
        } catch {}
      }
    }

    if (!checkpoint) {
      return { success: false, revertedFiles: [] };
    }

    const revertedFiles: string[] = [];
    for (const [filePath, snapshot] of Object.entries(checkpoint.files)) {
      try {
        if (snapshot.hash === 'new-file') {
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            revertedFiles.push(filePath);
          }
        } else {
          await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
          await fs.promises.writeFile(filePath, snapshot.content, 'utf-8');
          revertedFiles.push(filePath);
        }
      } catch (err: any) {
        console.error(`[CheckpointManager] Revert error on ${filePath}:`, err.message);
      }
    }

    return { success: true, revertedFiles };
  }

  public listCheckpoints(): CheckpointRecord[] {
    return Array.from(this.inMemoryCheckpoints.values()).sort((a, b) => b.timestamp - a.timestamp);
  }
}
