/**
 * Context Engineering: Semantic File Chunker (Phase 5)
 * Chunks files into line-bounded windows. Never dumps whole files > 500 lines.
 */

export interface CodeChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  tokenEstimate: number;
}

export function chunkFileContent(
  filePath: string,
  content: string,
  chunkSizeLines = 150,
  overlapLines = 25
): CodeChunk[] {
  if (!content) return [];
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];

  if (lines.length <= chunkSizeLines) {
    return [
      {
        filePath,
        startLine: 1,
        endLine: lines.length,
        content,
        tokenEstimate: Math.ceil(content.length / 4),
      },
    ];
  }

  let currentStart = 1;
  while (currentStart <= lines.length) {
    const end = Math.min(lines.length, currentStart + chunkSizeLines - 1);
    const slice = lines.slice(currentStart - 1, end).join('\n');

    chunks.push({
      filePath,
      startLine: currentStart,
      endLine: end,
      content: slice,
      tokenEstimate: Math.ceil(slice.length / 4),
    });

    if (end === lines.length) break;
    currentStart += chunkSizeLines - overlapLines;
  }

  return chunks;
}
