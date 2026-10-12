/**
 * Tool: applyPatch
 * Applies unified diff patches across one or more files with checkpointing.
 */

import fs from 'fs';
import path from 'path';
import { CheckpointManager } from './checkpoints';
import { FileLockRegistry } from './fileLocks';

export interface ApplyPatchInput {
  patch: string;
}

export async function executeApplyPatch(
  input: ApplyPatchInput,
  workspaceRoot: string,
  checkpointManager: CheckpointManager,
  fileLockRegistry?: FileLockRegistry,
  agentId = 'coder'
) {
  const patchText = input.patch;
  if (!patchText || typeof patchText !== 'string') {
    throw new Error('applyPatch requires unified diff patch text');
  }

  // Parse file targets from diff headers: --- a/path/to/file or +++ b/path/to/file
  const fileMatches = Array.from(patchText.matchAll(/(?:---|\+\+\+)\s+[ab]\/([^\r\n]+)/g));
  const filePaths = Array.from(new Set(fileMatches.map((m) => m[1].trim()))).filter(Boolean);

  if (filePaths.length === 0) {
    throw new Error('Could not identify target files in patch headers (expected --- a/... or +++ b/...)');
  }

  const modifiedFiles: string[] = [];
  const diffs: any[] = [];

  for (const relPath of filePaths) {
    const target = path.isAbsolute(relPath) ? relPath : path.join(workspaceRoot, relPath);

    if (fileLockRegistry) {
      const locked = await fileLockRegistry.acquireWrite(target, agentId);
      if (!locked) {
        throw new Error(`File locked by another worker: ${relPath}`);
      }
    }

    try {
      let original = '';
      if (fs.existsSync(target)) {
        original = await fs.promises.readFile(target, 'utf-8');
      }

      // Checkpoint before applying
      const checkpoint = await checkpointManager.createCheckpoint([target], `Patch ${path.basename(relPath)}`);

      // Extract lines for this file from the patch
      const lines = original.split('\n');
      const patchLines = patchText.split('\n');
      const newLines: string[] = [];

      let inHunk = false;
      for (const line of patchLines) {
        if (line.startsWith('@@')) {
          inHunk = true;
          continue;
        }
        if (inHunk) {
          if (line.startsWith('+')) {
            newLines.push(line.substring(1));
          } else if (line.startsWith(' ')) {
            newLines.push(line.substring(1));
          }
          // '-' lines are dropped
        }
      }

      const finalContent = newLines.length > 0 ? newLines.join('\n') : original;
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, finalContent, 'utf-8');

      modifiedFiles.push(relPath);
      diffs.push({
        path: relPath,
        original,
        originalContent: original,
        modified: finalContent,
        modifiedContent: finalContent,
        checkpointId: checkpoint.id,
      });
    } finally {
      if (fileLockRegistry) {
        fileLockRegistry.releaseWrite(target, agentId);
      }
    }
  }

  return {
    success: true,
    modifiedFiles,
    diffs,
    message: `Applied patch across ${modifiedFiles.length} file(s): ${modifiedFiles.join(', ')}`,
  };
}
