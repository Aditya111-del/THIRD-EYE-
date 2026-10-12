# THIRD_EYE Autonomous Agent Specification

## 1. Agent Mental Model & Principles
The THIRD_EYE agent is an autonomous, context-aware coding partner designed to mirror senior developer workflows. It operates under five foundational principles:

1. **Context-First, Not Token-Dumping**: The agent never reads 1,000-line files blindly. It relies on the Workspace Repo-Map, symbol search, and line-bounded chunk retrievers.
2. **Side-Effect Transparency**: Every mutating operation produces visible diffs before persistent disk mutation. Checkpoints are recorded prior to state changes.
3. **Safe Execution**: High-risk terminal commands (e.g. `rm -rf`, destructive migrations, package deletions) require explicit user permission unless matching the workspace auto-allow policy.
4. **Resilience to Failure**: Tool failures, compiler errors, and command non-zero exits are treated as informative observations, not system crashes.
5. **Background Task Awareness**: Long-running background jobs (e.g., dev servers, test runners) return detached task handles, allowing continuous agent work while polling output tails.

---

## 2. The Autonomous Agent Loop (`backend/ai-service/src/loop.ts`)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Renderer as Renderer (ChatPanel & Monaco)
    participant Loop as Agent Loop (ai-service)
    participant Ctx as Context Engine (repoMap/retriever)
    participant Perm as Policy Engine (permissions.ts)
    participant Tools as Tool Registry
    participant PTY as PTY Service (:4001)

    User->>Renderer: Submit task or prompt
    Renderer->>Loop: POST /api/ai/agent/stream
    Loop->>Ctx: Build Context Envelope (Budget ≤ 128k)
    Ctx-->>Loop: Envelope {System, RepoMap, Tabs, Tail, History}
    
    loop Max 25 Iterations
        Loop->>Loop: Stream LLM Generation
        Loop-->>Renderer: SSE text-delta (Smooth fading render)
        alt Model requests ToolCall
            Loop->>Perm: Check Risk Level & Grants
            alt Requires User Permission
                Loop-->>Renderer: SSE permission_request
                Renderer->>User: Display PermissionPrompt
                User->>Renderer: Decision (allow_once | allow_session | reject)
                Renderer->>Loop: POST /api/ai/agent/permission_decision
            end
            alt Tool == editFile / writeFile
                Loop->>Loop: Snapshot Checkpoint (content hash)
                Loop->>Tools: Generate In-Memory Diff
                Tools-->>Renderer: Mount Reviewable Diff in Monaco
            else Tool == runTerminal
                Loop->>PTY: Execute in session (streaming / background)
                PTY-->>Tools: Output tail (last 200 lines) + exitCode
            end
            Tools-->>Loop: ToolResult observation
            Loop->>Loop: Append ToolResult to Context Envelope
        else Model emits STOP
            Loop-->>Renderer: SSE finish (status: complete)
        end
    end
```

---

## 3. Tool Specifications & Risk Matrix

| Tool | Risk Level | Permission Requirement | Description |
| :--- | :--- | :--- | :--- |
| `readFile` | Low | Auto-allowed | Reads file with line-number slices; respects `.gitignore` |
| `listFiles` / `listDir` | Low | Auto-allowed | Virtual directory tree scan |
| `searchCode` | Low | Auto-allowed | Pattern & regex code search |
| `getDiagnostics` | Low | Auto-allowed | Compiler & linter error extraction |
| `writeFile` | Medium | Requires File Model Diff Preview | Creates or replaces file via in-memory model |
| `editFile` | Medium | Requires File Model Diff Preview | Precise search/replace hunk edits with fuzzy fallback |
| `runTerminal` | High / Configurable | Decision required unless command is in auto-allow list | Runs shell commands; supports `background: true` returning `taskId` |
| `restoreCheckpoint` | Medium | Prompt confirmation | Reverts workspace to a previous checkpoint hash |

---

## 4. Context Budget Management (128k Window)

```
[================= CONTEXT WINDOW ALLOCATION (128K TOKENS) =================]
[ System & Tool Schemas: 20% ] [ Repo-Map Index: 15% ] [ Working Tabs/Tail: 25% ] [ Turn History: 40% ]
```

When context approaches 85% of budget:
1. Low-relevance retrieval chunks are dropped first.
2. Old turns are summarized via `compaction.ts`, retaining key decisions and tool output summaries while discarding raw logs.
