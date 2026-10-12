/**
 * Tool: searchSymbols
 * Tree-sitter / Regex-based AST symbol extraction across workspace files.
 */

import fs from 'fs';
import path from 'path';

export interface SearchSymbolsInput {
  query: string;
}

export interface SymbolMatch {
  file: string;
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'export';
  line: number;
  preview: string;
}

const SYMBOL_PATTERNS = [
  { kind: 'function' as const, regex: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/ },
  { kind: 'class' as const, regex: /(?:export\s+)?class\s+([A-Za-z0-9_$]+)/ },
  { kind: 'interface' as const, regex: /(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/ },
  { kind: 'type' as const, regex: /(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/ },
  { kind: 'const' as const, regex: /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/ },
];

export async function executeSearchSymbols(input: SearchSymbolsInput, workspaceRoot: string) {
  const query = (input.query || '').trim().toLowerCase();
  const matches: SymbolMatch[] = [];

  async function scanDir(dir: string, depth = 0) {
    if (depth > 5 || matches.length >= 50) return;
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.output') {
          continue;
        }
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await scanDir(full, depth + 1);
        } else if (/\.(ts|tsx|js|jsx|py|java|go|rs)$/.test(ent.name)) {
          const content = await fs.promises.readFile(full, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pat of SYMBOL_PATTERNS) {
              const m = line.match(pat.regex);
              if (m && m[1]) {
                const symName = m[1];
                if (!query || symName.toLowerCase().includes(query)) {
                  matches.push({
                    file: path.relative(workspaceRoot, full),
                    name: symName,
                    kind: pat.kind,
                    line: i + 1,
                    preview: line.trim(),
                  });
                  if (matches.length >= 50) return;
                }
              }
            }
          }
        }
      }
    } catch {}
  }

  await scanDir(workspaceRoot);

  return {
    query: input.query,
    matches,
    total: matches.length,
    truncated: matches.length >= 50,
  };
}
