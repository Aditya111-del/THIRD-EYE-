/**
 * Context Engineering: Conversation Turn Compactor (Phase 5)
 * Summarizes oldest conversation turns when exceeding threshold, keeping key decisions and tool results.
 */

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: any[];
  rawParts?: any[];
}

export function compactConversationHistory(
  turns: ConversationTurn[],
  maxTurnsToKeep = 12
): ConversationTurn[] {
  if (turns.length <= maxTurnsToKeep) {
    return turns;
  }

  const oldest = turns.slice(0, turns.length - maxTurnsToKeep);
  const recent = turns.slice(turns.length - maxTurnsToKeep);

  // Summarize oldest turns
  const summaryParts: string[] = [];
  for (const t of oldest) {
    if (t.role === 'user') {
      summaryParts.push(`User requested: "${t.content.slice(0, 120)}"`);
    } else if (t.role === 'assistant' && t.content) {
      summaryParts.push(`Assistant replied: "${t.content.slice(0, 100)}"`);
    } else if (t.role === 'tool') {
      summaryParts.push(`Tool ${t.name || 'execution'} observed.`);
    }
  }

  const compactedTurn: ConversationTurn = {
    role: 'system',
    content: `[Previous Context Summary (${oldest.length} turns compacted)]:\n` + summaryParts.join('\n'),
  };

  return [compactedTurn, ...recent];
}
