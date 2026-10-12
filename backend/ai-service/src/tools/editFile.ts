/**
 * Tool: editFile (Phase 4)
 * Search/replace block edits with exact-match first, fuzzy fallback, checkpoint snapshot, and persistence.
 */

import fs from 'fs';
import path from 'path';
import { CheckpointManager } from './checkpoints';
import { FileLockRegistry } from './fileLocks';

export interface EditFileInput {
  path: string;
  searchContent?: string;
  replaceContent?: string;
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
}

export async function executeEditFile(
  input: EditFileInput,
  workspaceRoot: string,
  checkpointManager: CheckpointManager,
  fileLockRegistry?: FileLockRegistry,
  agentId = 'coder'
) {
  const filePath = input.path;
  if (!filePath) throw new Error('editFile requires path');

  const search = input.oldString !== undefined ? input.oldString : input.searchContent;
  const replace = input.newString !== undefined ? input.newString : input.replaceContent;

  if (search === undefined || replace === undefined) {
    throw new Error('editFile requires searchContent/oldString and replaceContent/newString');
  }

  const target = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
  if (!fs.existsSync(target)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // 1. Acquire write lock
  if (fileLockRegistry) {
    const locked = await fileLockRegistry.acquireWrite(target, agentId);
    if (!locked) {
      throw new Error(`File is currently locked for writing by another worker: ${filePath}`);
    }
  }

  try {
    const originalContent = await fs.promises.readFile(target, 'utf-8');
    let modifiedContent = '';

    // 1. Exact match
    if (originalContent.includes(search)) {
      if (input.replaceAll) {
        modifiedContent = originalContent.split(search).join(replace);
      } else {
        modifiedContent = originalContent.replace(search, replace);
      }
    } else {
      // 2. Normalized newline match
      const normOriginal = originalContent.replace(/\r\n/g, '\n');
      const normSearch = search.replace(/\r\n/g, '\n');

      if (normOriginal.includes(normSearch)) {
        const normReplace = replace.replace(/\r\n/g, '\n');
        modifiedContent = input.replaceAll
          ? normOriginal.split(normSearch).join(normReplace)
          : normOriginal.replace(normSearch, normReplace);
      } else {
        // 3. Trimmed line-by-line fallback
        const searchLines = normSearch.split('\n').map((l) => l.trim()).filter(Boolean);
        const originalLines = normOriginal.split('\n');

        let startIdx = -1;
        for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
          let match = true;
          for (let j = 0; j < searchLines.length; j++) {
            if (originalLines[i + j].trim() !== searchLines[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            startIdx = i;
            break;
          }
        }

        if (startIdx !== -1) {
          const before = originalLines.slice(0, startIdx).join('\n');
          const after = originalLines.slice(startIdx + searchLines.length).join('\n');
          modifiedContent = (before ? before + '\n' : '') + replace + (after ? '\n' + after : '');
        } else {
          throw new Error(`Could not locate snippet to replace in ${filePath}. Verify exact characters.`);
        }
      }
    }

    // 2. Snapshot checkpoint before mutation
    const checkpoint = await checkpointManager.createCheckpoint([target], `Edit ${path.basename(filePath)}`);

    // 3. Persist modifications to disk
    await fs.promises.writeFile(target, modifiedContent, 'utf-8');

    const origLines = originalContent.split('\n').length;
    const newLines = modifiedContent.split('\n').length;
    const addedCount = Math.max(1, newLines - origLines) || 3;
    const removedCount = Math.max(0, origLines - newLines) || 1;

    return {
      path: filePath,
      fullPath: target,
      checkpointId: checkpoint.id,
      diff: {
        path: filePath,
        original: originalContent,
        originalContent: originalContent,
        modified: modifiedContent,
        modifiedContent: modifiedContent,
        hunkCount: 1,
        addedCount,
        removedCount,
      },
      content: modifiedContent,
      message: `Successfully applied edits to ${path.basename(filePath)}. Checkpoint ${checkpoint.id} created.`,
      pendingApproval: false,
    };
  } finally {
    if (fileLockRegistry) {
      fileLockRegistry.releaseWrite(target, agentId);
    }
  }
}
