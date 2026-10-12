/**
 * Tool: listDir (Phase 4)
 * Virtual directory listing with depth control and size caps.
 */

import fs from 'fs';
import path from 'path';

export interface ListDirInput {
  dirPath?: string;
  maxDepth?: number;
}

export async function executeListDir(input: ListDirInput, workspaceRoot: string) {
  const targetDir = input.dirPath
    ? (path.isAbsolute(input.dirPath) ? input.dirPath : path.join(workspaceRoot, input.dirPath))
    : workspaceRoot;

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory not found: ${input.dirPath || '.'}`);
  }

  const maxDepth = input.maxDepth || 2;
  const entries: Array<{
    name: string;
    relativePath: string;
    isDirectory: boolean;
    size?: number;
  }> = [];

  const traverse = (currentDir: string, currentDepth: number) => {
    if (currentDepth > maxDepth || entries.length >= 200) return;
    try {
      const items = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const item of items) {
        if (entries.length >= 200) break;
        if (
          item.name === 'node_modules' ||
          item.name === '.git' ||
          item.name === '.output' ||
          item.name === 'dist' ||
          item.name === '.wrangler'
        ) {
          continue;
        }

        const full = path.join(currentDir, item.name);
        const rel = path.relative(workspaceRoot, full);
        const isDir = item.isDirectory();

        entries.push({
          name: item.name,
          relativePath: rel,
          isDirectory: isDir,
        });

        if (isDir) {
          traverse(full, currentDepth + 1);
        }
      }
    } catch {}
  };

  traverse(targetDir, 1);

  return {
    dir: path.relative(workspaceRoot, targetDir) || '.',
    entries,
    totalEntries: entries.length,
    truncated: entries.length >= 200,
  };
}
