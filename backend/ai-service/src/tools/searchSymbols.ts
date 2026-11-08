/**
 * Tool: searchSymbols & findReferences
 * Polyglot AST/Regex-based Symbol Extraction & Dependency Impact Analysis.
 * Supports TypeScript, JavaScript, Python, Rust, Go, and C/C++.
 */

import fs from 'fs';
import path from 'path';

export interface SearchSymbolsInput {
  query: string;
}

export interface SymbolMatch {
  file: string;
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'struct' | 'enum' | 'trait' | 'export';
  line: number;
  preview: string;
  language: string;
}

interface PatternDef {
  kind: SymbolMatch['kind'];
  regex: RegExp;
  lang: string;
}

const POLYGLOT_PATTERNS: PatternDef[] = [
  // TS / JS
  { kind: 'function', regex: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, lang: 'typescript' },
  { kind: 'class', regex: /(?:export\s+)?class\s+([A-Za-z0-9_$]+)/, lang: 'typescript' },
  { kind: 'interface', regex: /(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/, lang: 'typescript' },
  { kind: 'type', regex: /(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/, lang: 'typescript' },
  { kind: 'const', regex: /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/, lang: 'typescript' },

  // Python
  { kind: 'function', regex: /(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/, lang: 'python' },
  { kind: 'class', regex: /class\s+([A-Za-z0-9_]+)\s*(?:\(.*\))?:/, lang: 'python' },

  // Rust
  { kind: 'function', regex: /(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/, lang: 'rust' },
  { kind: 'struct', regex: /(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/, lang: 'rust' },
  { kind: 'enum', regex: /(?:pub\s+)?enum\s+([A-Za-z0-9_]+)/, lang: 'rust' },
  { kind: 'trait', regex: /(?:pub\s+)?trait\s+([A-Za-z0-9_]+)/, lang: 'rust' },

  // Go
  { kind: 'function', regex: /func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/, lang: 'go' },
  { kind: 'struct', regex: /type\s+([A-Za-z0-9_]+)\s+struct/, lang: 'go' },
  { kind: 'interface', regex: /type\s+([A-Za-z0-9_]+)\s+interface/, lang: 'go' },

  // C / C++
  { kind: 'class', regex: /class\s+([A-Za-z0-9_]+)\s*(?:\{|:)/, lang: 'cpp' },
  { kind: 'struct', regex: /struct\s+([A-Za-z0-9_]+)\s*(?:\{|:)/, lang: 'cpp' },
];

export async function executeSearchSymbols(input: SearchSymbolsInput, workspaceRoot: string) {
  const query = (input.query || '').trim().toLowerCase();
  const matches: SymbolMatch[] = [];

  async function scanDir(dir: string, depth = 0) {
    if (depth > 6 || matches.length >= 60) return;
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (
          ent.name.startsWith('.') ||
          ent.name === 'node_modules' ||
          ent.name === 'dist' ||
          ent.name === 'target' ||
          ent.name === 'build' ||
          ent.name === '__pycache__' ||
          ent.name === '.venv'
        ) {
          continue;
        }
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await scanDir(full, depth + 1);
        } else if (/\.(ts|tsx|js|jsx|py|go|rs|c|cpp|h|hpp)$/i.test(ent.name)) {
          const content = await fs.promises.readFile(full, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pat of POLYGLOT_PATTERNS) {
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
                    language: pat.lang,
                  });
                  if (matches.length >= 60) return;
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
    truncated: matches.length >= 60,
  };
}

export interface FindReferencesInput {
  symbol: string;
}

export interface ReferenceMatch {
  file: string;
  line: number;
  preview: string;
  isImport: boolean;
}

/**
 * Finds all usages and imports of a symbol across the workspace (Impact Analysis)
 */
export async function executeFindReferences(input: FindReferencesInput, workspaceRoot: string) {
  const symbol = (input.symbol || '').trim();
  if (!symbol) throw new Error('find_references requires a non-empty symbol');

  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const symRegex = new RegExp(`\\b${escaped}\\b`);
  const importRegex = new RegExp(`(?:import|from|require|use|include).*\\b${escaped}\\b`);

  const references: ReferenceMatch[] = [];

  async function scanDir(dir: string, depth = 0) {
    if (depth > 6 || references.length >= 100) return;
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (
          ent.name.startsWith('.') ||
          ent.name === 'node_modules' ||
          ent.name === 'dist' ||
          ent.name === 'target' ||
          ent.name === 'build' ||
          ent.name === '__pycache__' ||
          ent.name === '.venv'
        ) {
          continue;
        }
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await scanDir(full, depth + 1);
        } else if (/\.(ts|tsx|js|jsx|py|go|rs|c|cpp|h|hpp|sql)$/i.test(ent.name)) {
          const content = await fs.promises.readFile(full, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (symRegex.test(line)) {
              references.push({
                file: path.relative(workspaceRoot, full),
                line: i + 1,
                preview: line.trim(),
                isImport: importRegex.test(line),
              });
              if (references.length >= 100) return;
            }
          }
        }
      }
    } catch {}
  }

  await scanDir(workspaceRoot);

  return {
    symbol,
    totalReferences: references.length,
    referencingFiles: Array.from(new Set(references.map((r) => r.file))),
    references,
    impactSummary: `Found ${references.length} references across ${new Set(references.map((r) => r.file)).size} files.`,
  };
}
