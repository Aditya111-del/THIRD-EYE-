/**
 * Context Engineering: Token Budget Manager (Phase 5)
 * Enforces 128k context allocations:
 * system+tools ≤ 20%, repo-map ≤ 15%, history ≤ 40%, working set ≤ 25%.
 */

export interface BudgetAllocation {
  systemAndTools: number; // max ~25k tokens
  repoMap: number;        // max ~19k tokens
  history: number;        // max ~51k tokens
  workingSet: number;     // max ~32k tokens
  totalBudget: number;    // default 128k tokens
}

export class ContextBudgetManager {
  private totalBudget: number;
  private allocation: BudgetAllocation;

  constructor(totalTokens = 128000) {
    this.totalBudget = totalTokens;
    this.allocation = {
      systemAndTools: Math.floor(totalTokens * 0.20),
      repoMap: Math.floor(totalTokens * 0.15),
      history: Math.floor(totalTokens * 0.40),
      workingSet: Math.floor(totalTokens * 0.25),
      totalBudget: totalTokens,
    };
  }

  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
  }

  public truncateToBudget(text: string, maxTokens: number): string {
    const current = this.estimateTokens(text);
    if (current <= maxTokens) return text;
    const maxChars = Math.floor(maxTokens * 3.8);
    return text.slice(0, maxChars) + '\n\n... [Content truncated to fit context budget]';
  }

  public getAllocation(): BudgetAllocation {
    return { ...this.allocation };
  }
}
