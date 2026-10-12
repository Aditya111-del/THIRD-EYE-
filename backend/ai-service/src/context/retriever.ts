/**
 * Context Engineering: Hybrid Context Retriever (Phase 5)
 * Retrieval priority order: exact file mentions > open tabs > symbol search > grep
 */

import fs from 'fs';
import path from 'path';
import { RepoMap } from './repoMap';
import { chunkFileContent, CodeChunk } from './chunker';

export interface RetrievalQuery {
  userQuery: string;
  workspaceRoot: string;
  openTabs?: Array<{ path: string; selection?: string }>;
  maxChunks?: number;
}

export class HybridRetriever {
  private repoMap: RepoMap;

  constructor(repoMap: RepoMap) {
    this.repoMap = repoMap;
  }

  public async retrieveRelevantChunks(query: RetrievalQuery): Promise<CodeChunk[]> {
    const results: CodeChunk[] = [];
    const seenFiles = new Set<string>();
    const max = query.maxChunks || 5;

    // 1. Exact file mentions in user query (e.g. "look at package.json" or "in server.ts")
    const words = query.userQuery.split(/\s+/);
    for (const word of words) {
      const cleanWord = word.replace(/['"`:,]/g, '');
      if (cleanWord.includes('.') && cleanWord.length > 3) {
        const candidate = path.join(query.workspaceRoot, cleanWord);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          seenFiles.add(cleanWord);
          const content = fs.readFileSync(candidate, 'utf-8');
          const chunks = chunkFileContent(cleanWord, content);
          results.push(...chunks.slice(0, 2));
        }
      }
    }

    if (results.length >= max) return results.slice(0, max);

    // 2. Open editor tabs (highest active context)
    if (query.openTabs && query.openTabs.length > 0) {
      for (const tab of query.openTabs) {
        if (results.length >= max) break;
        if (!seenFiles.has(tab.path)) {
          seenFiles.add(tab.path);
          const full = path.isAbsolute(tab.path) ? tab.path : path.join(query.workspaceRoot, tab.path);
          if (fs.existsSync(full)) {
            try {
              const content = fs.readFileSync(full, 'utf-8');
              const chunks = chunkFileContent(tab.path, content);
              results.push(...chunks.slice(0, 2));
            } catch {}
          }
        }
      }
    }

    if (results.length >= max) return results.slice(0, max);

    // 3. Symbol Search (matches in repo map)
    for (const word of words) {
      if (word.length > 3 && /^[a-zA-Z_$][a-zA-Z0-9_$]+$/.test(word)) {
        const symbols = this.repoMap.searchSymbol(word);
        for (const s of symbols) {
          if (results.length >= max) break;
          // Add symbol chunk
        }
      }
    }

    return results.slice(0, max);
  }
}
