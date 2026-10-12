/**
 * Tool: searchCode (Phase 4)
 * Ripgrep wrapper with node fallback for regex/literal pattern matching in workspace.
 */

import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface SearchCodeInput {
  query: string;
  caseSensitive?: boolean;
  isRegex?: boolean;
  searchPath?: string;
  maxResults?: number;
}

export async function executeSearchCode(input: SearchCodeInput, workspaceRoot: string) {
  const query = input.query;
  if (!query) throw new Error('searchCode requires query');

  const targetDir = input.searchPath
    ? (path.isAbsolute(input.searchPath) ? input.searchPath : path.join(workspaceRoot, input.searchPath))
    : workspaceRoot;

  const max = input.maxResults || 50;

  // Attempt ripgrep if available
  const caseFlag = input.caseSensitive ? '-s' : '-i';
  const literalFlag = input.isRegex ? '' : '-F';
  const cmd = `rg ${caseFlag} ${literalFlag} --max-count ${max} --line-number --glob "!node_modules/**" --glob "!.git/**" --glob "!dist/**" --glob "!.output/**" -- "${query.replace(/"/g, '\\"')}" "${targetDir}"`;

  return new Promise((resolve) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (!err && stdout) {
        const matches: Array<{ file: string; lineNumber: number; lineContent: string }> = [];
        const lines = stdout.split('\n').filter(Boolean);
        for (const line of lines.slice(0, max)) {
          const parts = line.split(':');
          if (parts.length >= 3) {
            const file = path.relative(workspaceRoot, parts[0]);
            const lineNumber = parseInt(parts[1], 10);
            const lineContent = parts.slice(2).join(':').trim();
            matches.push({ file, lineNumber, lineContent });
          }
        }
        return resolve({
          query,
          matches,
          totalMatches: matches.length,
          truncated: lines.length > max,
        });
      }

      // Fallback: pure Node scan
      try {
        const matches: Array<{ file: string; lineNumber: number; lineContent: string }> = [];
        const scan = (dir: string) => {
          if (matches.length >= max) return;
          const list = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of list) {
            if (matches.length >= max) break;
            if (
              item.name.startsWith('.') ||
              item.name === 'node_modules' ||
              item.name === 'dist' ||
              item.name === '.output'
            ) {
              continue;
            }
            const full = path.join(dir, item.name);
            if (item.isDirectory()) {
              scan(full);
            } else if (item.isFile()) {
              try {
                const content = fs.readFileSync(full, 'utf-8');
                const cLines = content.split('\n');
                for (let idx = 0; idx < cLines.length; idx++) {
                  const lineText = cLines[idx];
                  const hit = input.caseSensitive
                    ? lineText.includes(query)
                    : lineText.toLowerCase().includes(query.toLowerCase());
                  if (hit) {
                    matches.push({
                      file: path.relative(workspaceRoot, full),
                      lineNumber: idx + 1,
                      lineContent: lineText.trim().slice(0, 200),
                    });
                    if (matches.length >= max) break;
                  }
                }
              } catch {}
            }
          }
        };

        scan(targetDir);
        resolve({
          query,
          matches,
          totalMatches: matches.length,
          truncated: matches.length >= max,
        });
      } catch (nodeErr: any) {
        resolve({
          query,
          matches: [],
          totalMatches: 0,
          error: nodeErr.message,
        });
      }
    });
  });
}
