/**
 * Context Engineering: Repo Map Indexer (Phase 5)
 * Extracts symbols (functions, classes, interfaces, exports) and builds a compact index.
 */

import fs from 'fs';
import path from 'path';

export interface SymbolEntry {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'export';
  line: number;
}

export interface FileSymbolIndex {
  filePath: string;
  symbols: SymbolEntry[];
  summary: string;
  lastIndexed: number;
}

export class RepoMap {
  private workspaceRoot: string;
  private fileIndices: Map<string, FileSymbolIndex> = new Map();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.buildIndex();
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.fileIndices.clear();
    this.buildIndex();
  }

  public buildIndex(): void {
    const scan = (dir: string, depth = 1) => {
      if (depth > 4) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (
            e.name.startsWith('.') ||
            e.name === 'node_modules' ||
            e.name === 'dist' ||
            e.name === '.output' ||
            e.name === '.wrangler'
          ) {
            continue;
          }
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            scan(full, depth + 1);
          } else if (e.isFile() && /\.(ts|tsx|js|jsx|json|py|md)$/.test(e.name)) {
            this.indexFile(full);
          }
        }
      } catch {}
    };

    scan(this.workspaceRoot);
  }

  public indexFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(this.workspaceRoot, filePath);
      const lines = content.split('\n');
      const symbols: SymbolEntry[] = [];

      // Regex-based symbol extraction for TS/JS/Python
      lines.forEach((lineText, idx) => {
        const trimmed = lineText.trim();
        if (/^(export\s+)?(async\s+)?function\s+([a-zA-Z0-9_$]+)/.test(trimmed)) {
          const m = trimmed.match(/function\s+([a-zA-Z0-9_$]+)/);
          if (m) symbols.push({ name: m[1], kind: 'function', line: idx + 1 });
        } else if (/^(export\s+)?class\s+([a-zA-Z0-9_$]+)/.test(trimmed)) {
          const m = trimmed.match(/class\s+([a-zA-Z0-9_$]+)/);
          if (m) symbols.push({ name: m[1], kind: 'class', line: idx + 1 });
        } else if (/^(export\s+)?interface\s+([a-zA-Z0-9_$]+)/.test(trimmed)) {
          const m = trimmed.match(/interface\s+([a-zA-Z0-9_$]+)/);
          if (m) symbols.push({ name: m[1], kind: 'interface', line: idx + 1 });
        } else if (/^(export\s+)?type\s+([a-zA-Z0-9_$]+)/.test(trimmed)) {
          const m = trimmed.match(/type\s+([a-zA-Z0-9_$]+)/);
          if (m) symbols.push({ name: m[1], kind: 'type', line: idx + 1 });
        } else if (/^(export\s+const|export\s+let)\s+([a-zA-Z0-9_$]+)/.test(trimmed)) {
          const m = trimmed.match(/export\s+(const|let)\s+([a-zA-Z0-9_$]+)/);
          if (m) symbols.push({ name: m[2], kind: 'const', line: idx + 1 });
        } else if (/^def\s+([a-zA-Z0-9_]+)/.test(trimmed)) {
          const m = trimmed.match(/^def\s+([a-zA-Z0-9_]+)/);
          if (m) symbols.push({ name: m[1], kind: 'function', line: idx + 1 });
        }
      });

      const symSummary = symbols.slice(0, 5).map((s) => s.name).join(', ');
      this.fileIndices.set(relPath, {
        filePath: relPath,
        symbols,
        summary: symSummary ? `(${symSummary})` : '',
        lastIndexed: Date.now(),
      });
    } catch {}
  }

  /**
   * Produce compact repo map text within token budget
   */
  public getRepoMapSummary(maxEntries = 60): string {
    const lines: string[] = [];
    let count = 0;

    for (const [relPath, index] of this.fileIndices.entries()) {
      if (count++ >= maxEntries) break;
      lines.push(`${relPath} ${index.summary}`);
    }

    return lines.join('\n');
  }

  public searchSymbol(query: string): SymbolEntry[] {
    const q = query.toLowerCase();
    const hits: SymbolEntry[] = [];
    for (const index of this.fileIndices.values()) {
      for (const s of index.symbols) {
        if (s.name.toLowerCase().includes(q)) {
          hits.push(s);
        }
      }
    }
    return hits;
  }
}
