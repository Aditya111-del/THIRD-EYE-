/**
 * Tool: writeFile (Phase 4)
 * Writes file to disk with automatic checkpoint snapshot and Monaco diff emission.
 */

import fs from 'fs';
import path from 'path';
import { CheckpointManager } from './checkpoints';
import { FileLockRegistry } from './fileLocks';

export interface WriteFileInput {
  path: string;
  content: string;
}

export async function executeWriteFile(
  input: WriteFileInput,
  workspaceRoot: string,
  checkpointManager: CheckpointManager,
  fileLockRegistry?: FileLockRegistry,
  agentId = 'coder'
) {
  const filePath = input.path;
  if (!filePath) throw new Error('writeFile requires path');

  const target = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);

  // 1. Acquire write lock
  if (fileLockRegistry) {
    const locked = await fileLockRegistry.acquireWrite(target, agentId);
    if (!locked) {
      throw new Error(`File is currently locked for writing by another worker: ${filePath}`);
    }
  }

  try {
    let originalContent = '';
    const fileExisted = fs.existsSync(target);
    if (fileExisted) {
      originalContent = await fs.promises.readFile(target, 'utf-8');
    }

    // 2. Snapshot checkpoint before mutation
    const checkpoint = await checkpointManager.createCheckpoint([target], `Write ${path.basename(filePath)}`);

    // 3. Ensure parent directory exists and write to disk
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, input.content, 'utf-8');

    const origLines = originalContent ? originalContent.split('\n').length : 0;
    const newLines = input.content.split('\n').length;
    const addedCount = Math.max(0, newLines - origLines) || (fileExisted ? 5 : newLines);
    const removedCount = Math.max(0, origLines - newLines) || 0;

    return {
      path: filePath,
      fullPath: target,
      checkpointId: checkpoint.id,
      diff: {
        path: filePath,
        original: originalContent,
        originalContent: originalContent,
        modified: input.content,
        modifiedContent: input.content,
        hunkCount: 1,
        addedCount,
        removedCount,
      },
      content: input.content,
      message: `Successfully wrote ${path.basename(filePath)} (${newLines} lines). Checkpoint ${checkpoint.id} created.`,
      pendingApproval: false,
    };
  } finally {
    if (fileLockRegistry) {
      fileLockRegistry.releaseWrite(target, agentId);
    }
  }
}
