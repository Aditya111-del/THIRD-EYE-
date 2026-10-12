/**
 * Tool: readFileLines
 * Targeted line reading centered around a specific line number.
 */

import fs from 'fs';
import path from 'path';

export interface ReadFileLinesInput {
  path: string;
  centerLine: number;
  radius?: number;
}

export async function executeReadFileLines(input: ReadFileLinesInput, workspaceRoot: string) {
  const filePath = input.path;
  if (!filePath) throw new Error('readFileLines requires path');

  const center = Math.max(1, input.centerLine || 1);
  const radius = Math.max(1, Math.min(input.radius || 15, 100));

  const target = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
  if (!fs.existsSync(target)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const content = await fs.promises.readFile(target, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  const startLine = Math.max(1, center - radius);
  const endLine = Math.min(totalLines, center + radius);

  const sliced = lines
    .slice(startLine - 1, endLine)
    .map((line, idx) => `${startLine + idx}: ${line}`);

  return {
    path: filePath,
    content: sliced.join('\n'),
    totalLines,
    centerLine: center,
    startLine,
    endLine,
    radius,
  };
}
