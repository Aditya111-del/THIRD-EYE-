---
name: ai-agentic-and-rag-systems
description: Architect and implement production-grade AI agentic workflows, RAG pipelines, tool-calling systems, and LLM integrations
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# AI Agentic Workflows & RAG Systems Mastery Skill

## Core Philosophy: Deterministic Reliability & Enterprise Quality
When engineering AI agents, autonomous tool-calling systems, or Retrieval-Augmented Generation (RAG) applications, the architecture must balance probabilistic model intelligence with deterministic software engineering. The system must never hallucinate execution paths, must implement robust error recovery, and must deliver low-latency, high-accuracy responses.

---

## 1. Zero-Stub & Architecture Mandate
- **NEVER use mock LLM responses** with hardcoded strings where real API integration is required.
- **Full Agentic Pipeline Requirements**:
  1. **Strict Type Safety & Schemas**: All tool calls and structured outputs must use Zod (TypeScript) or Pydantic (Python) schemas with explicit field descriptions and validation constraints.
  2. **Multi-Step Tool-Execution Loop**: Implement a resilient `while` loop with max-iteration caps, cycle detection, and tool execution error reflection.
  3. **Context Window Management**: Token-aware budgeting, sliding window compaction, and system prompt preservation. Never allow runaway token overflow.
  4. **Production RAG Engine**:
     - Chunking: Semantic or recursive character chunking with overlap (e.g., 500-1000 tokens with 100 token overlap).
     - Embeddings: Vector generation with OpenAI `text-embedding-3-small`, Gemini Embeddings, or HuggingFace local models.
     - Vector Store: Clean integration with Pinecone, Qdrant, ChromaDB, PGVector, or in-memory cosine similarity for development.
     - Re-ranking & Citations: Score threshold filtering and explicit source citation formatting.
  5. **Streaming & Observability**: Real-time token streaming (SSE / WebSockets), step-by-step telemetry, and structured tracing (LangSmith / OpenTelemetry / custom JSON logs).

---

## 2. Implementation Patterns

### Tool Calling Engine (Node.js / TypeScript)
```typescript
import { z } from 'zod';

export interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  parameters: T;
  execute: (args: z.infer<T>) => Promise<any>;
}

// Resilient tool execution wrapper
export async function executeToolSafely(tool: ToolDefinition, rawArgs: unknown) {
  try {
    const parsed = tool.parameters.parse(rawArgs);
    const result = await tool.execute(parsed);
    return { success: true, result };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof z.ZodError ? err.flatten() : err.message || String(err),
      instruction: "Self-correct parameters according to the error and retry."
    };
  }
}
```

### Python (FastAPI + LangChain / LlamaIndex / Raw SDK)
- Standardize on asynchronous calls (`async def`, `AsyncOpenAI`, `AsyncClient`).
- Use structured output parsing via `model.with_structured_output(Schema)` or Pydantic output parsers.
- Always include fallback model cascades (e.g., attempt primary fast model, cascade to secondary reasoning model on failure).

---

## 3. Production Verification Checklist
1. All prompts are templated with system instructions, user context, and explicit constraints.
2. Tools handle invalid parameters gracefully and return structured diagnostic errors instead of throwing unhandled exceptions.
3. RAG pipelines gracefully handle empty retrieval results without hallucinations.
4. Comprehensive test suites verify tool execution, schema parsing, and agent loop termination.
