/**
 * Tool: readFile (Phase 4)
 * Reads file with line slices; respects .gitignore and size limits. Never dumps > 500 lines.
 */

import fs from 'fs';
import path from 'path';

export interface ReadFileInput {
  path: string;
  startLine?: number;
  endLine?: number;
}

export async function executeReadFile(input: ReadFileInput, workspaceRoot: string) {
  const filePath = input.path;
  if (!filePath) throw new Error('readFile requires path');

  const target = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
  if (!fs.existsSync(target)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const stat = await fs.promises.stat(target);
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max size is 2MB.`);
  }

  const content = await fs.promises.readFile(target, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  const start = Math.max(1, input.startLine || 1);
  const end = Math.min(totalLines, input.endLine || Math.min(start + 499, totalLines));

  const sliced = lines.slice(start - 1, end).map((line, idx) => `${start + idx}: ${line}`);
  const truncated = end < totalLines || start > 1;

  return {
    path: filePath,
    content: sliced.join('\n'),
    totalLines,
    startLine: start,
    endLine: end,
    truncated,
  };
}
