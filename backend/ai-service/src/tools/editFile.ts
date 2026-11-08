/**
 * Tool: editFile (Antigravity-Grade Surgical Code Replacement)
 * Search/replace block edits with exact match, line-range targeting, whitespace normalization,
 * fuzzy similarity fallback, checkpoint snapshot, and persistence.
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
  startLine?: number;
  endLine?: number;
}

/**
 * Normalize whitespace in code snippet for tolerant matching
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Tokenize a block of code into non-empty words/symbols for fuzzy comparison
 */
function tokenize(text: string): string[] {
  return text.replace(/\r\n/g, '\n').match(/\w+|[^\s\w]/g) || [];
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
    const normOriginal = originalContent.replace(/\r\n/g, '\n');
    const normSearch = search.replace(/\r\n/g, '\n');
    const normReplace = replace.replace(/\r\n/g, '\n');
    const originalLines = normOriginal.split('\n');

    // Strategy 1: Targeted Line Range (startLine / endLine)
    if (typeof input.startLine === 'number' && typeof input.endLine === 'number' && input.startLine >= 1) {
      const sIdx = Math.max(0, input.startLine - 1);
      const eIdx = Math.min(originalLines.length, input.endLine);
      const slice = originalLines.slice(sIdx, eIdx).join('\n');

      if (slice.includes(normSearch)) {
        const replacedSlice = slice.replace(normSearch, normReplace);
        const before = originalLines.slice(0, sIdx).join('\n');
        const after = originalLines.slice(eIdx).join('\n');
        modifiedContent = (before ? before + '\n' : '') + replacedSlice + (after ? '\n' + after : '');
      } else if (normalizeWhitespace(slice) === normalizeWhitespace(normSearch)) {
        const before = originalLines.slice(0, sIdx).join('\n');
        const after = originalLines.slice(eIdx).join('\n');
        modifiedContent = (before ? before + '\n' : '') + normReplace + (after ? '\n' + after : '');
      }
    }

    // Strategy 2: Exact Substring Match
    if (!modifiedContent && originalContent.includes(search)) {
      if (input.replaceAll) {
        modifiedContent = originalContent.split(search).join(replace);
      } else {
        modifiedContent = originalContent.replace(search, replace);
      }
    }

    // Strategy 3: Normalized Newline Match
    if (!modifiedContent && normOriginal.includes(normSearch)) {
      if (input.replaceAll) {
        modifiedContent = normOriginal.split(normSearch).join(normReplace);
      } else {
        modifiedContent = normOriginal.replace(normSearch, normReplace);
      }
    }

    // Strategy 4: Line-Trimmed Window Matching (Handles indentation and space differences)
    if (!modifiedContent) {
      const searchLines = normSearch.split('\n').map((l) => l.trim()).filter(Boolean);
      if (searchLines.length > 0) {
        let bestStart = -1;
        let bestLength = -1;

        for (let i = 0; i < originalLines.length; i++) {
          if (originalLines[i].trim() !== searchLines[0]) continue;

          let origCursor = i;
          let searchCursor = 0;
          let matched = true;

          while (searchCursor < searchLines.length) {
            // Skip purely empty lines in original file if search did not anticipate them
            while (origCursor < originalLines.length && originalLines[origCursor].trim() === '' && searchLines[searchCursor] !== '') {
              origCursor++;
            }
            if (origCursor >= originalLines.length) {
              matched = false;
              break;
            }
            if (originalLines[origCursor].trim() !== searchLines[searchCursor]) {
              matched = false;
              break;
            }
            origCursor++;
            searchCursor++;
          }

          if (matched) {
            bestStart = i;
            bestLength = origCursor - i;
            break;
          }
        }

        if (bestStart !== -1) {
          const before = originalLines.slice(0, bestStart).join('\n');
          const after = originalLines.slice(bestStart + bestLength).join('\n');
          modifiedContent = (before ? before + '\n' : '') + normReplace + (after ? '\n' + after : '');
        }
      }
    }

    // Strategy 5: Fuzzy Token Similarity Matching (Antigravity resilient match)
    if (!modifiedContent) {
      const searchTokens = tokenize(normSearch);
      if (searchTokens.length >= 4) {
        const searchJoined = searchTokens.join(' ');
        let bestSim = 0;
        let bestStartLine = -1;
        let bestEndLine = -1;

        // Sliding window across lines
        const windowSize = Math.max(1, normSearch.split('\n').length);
        for (let i = 0; i <= originalLines.length - windowSize; i++) {
          for (let len = Math.max(1, windowSize - 2); len <= windowSize + 3; len++) {
            if (i + len > originalLines.length) break;
            const candidate = originalLines.slice(i, i + len).join('\n');
            const candidateTokens = tokenize(candidate);
            if (candidateTokens.length === 0) continue;

            const candidateJoined = candidateTokens.join(' ');
            if (candidateJoined === searchJoined) {
              bestSim = 1.0;
              bestStartLine = i;
              bestEndLine = i + len;
              break;
            }

            // Approximate token overlap
            const setA = new Set(searchTokens);
            let overlap = 0;
            for (const t of candidateTokens) {
              if (setA.has(t)) overlap++;
            }
            const sim = (2 * overlap) / (searchTokens.length + candidateTokens.length);
            if (sim > bestSim && sim >= 0.85) {
              bestSim = sim;
              bestStartLine = i;
              bestEndLine = i + len;
            }
          }
          if (bestSim === 1.0) break;
        }

        if (bestSim >= 0.85 && bestStartLine !== -1) {
          const before = originalLines.slice(0, bestStartLine).join('\n');
          const after = originalLines.slice(bestEndLine).join('\n');
          modifiedContent = (before ? before + '\n' : '') + normReplace + (after ? '\n' + after : '');
        }
      }
    }

    if (!modifiedContent) {
      const preview = originalLines.slice(0, 15).map((l, idx) => `${idx + 1}: ${l}`).join('\n');
      throw new Error(
        `Could not locate snippet in ${filePath}.\nTarget snippet:\n${normSearch.slice(0, 200)}\n\nFirst lines of ${filePath}:\n${preview}`
      );
    }

    // Snapshot checkpoint before mutation
    const checkpoint = await checkpointManager.createCheckpoint([target], `Edit ${path.basename(filePath)}`);

    // Persist modifications to disk
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
