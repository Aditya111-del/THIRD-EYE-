/**
 * Tool: findFiles
 * Fast workspace file finder by name, substring, or extension pattern.
 */

import fs from 'fs';
import path from 'path';

export interface FindFilesInput {
  pattern: string; // e.g. "index.ts", "styles.css", "auth"
  maxResults?: number;
}

export async function executeFindFiles(input: FindFilesInput, workspaceRoot: string) {
  const rawPattern = (input.pattern || '').trim();
  if (!rawPattern) {
    throw new Error('findFiles requires a pattern (e.g. "index.ts" or "styles.css")');
  }

  const pattern = rawPattern.toLowerCase().replace(/^\*+/, '').replace(/\*+$/, '');
  const max = input.maxResults || 30;
  const matches: string[] = [];

  const walk = (dir: string) => {
    if (matches.length >= max) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (matches.length >= max) break;
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === '.output' ||
          entry.name === 'dist' ||
          entry.name === '.wrangler' ||
          entry.name === '.nitro'
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workspaceRoot, fullPath);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          const fileName = entry.name.toLowerCase();
          if (fileName === pattern || fileName.includes(pattern) || relPath.toLowerCase().includes(pattern)) {
            matches.push(relPath);
          }
        }
      }
    } catch {}
  };

  walk(workspaceRoot);

  return {
    pattern: rawPattern,
    matches,
    totalMatches: matches.length,
    found: matches.length > 0,
  };
}
