# THIRD_EYE Multi-Agent System Specification (AGENTS.md)

## 1. System Vision
The THIRD_EYE autonomous coding system is inspired by Cursor Agent mode and Google Antigravity. Given one high-level prompt (e.g., *"Build a React todo app with localStorage persistence, dark mode, and a bun dev setup. Verify it runs."*), the system plans, scaffolds, writes, edits, installs dependencies, executes terminal commands, runs tests, fixes bugs, previews in a browser, and iterates until the goal is verifiably accomplished — while streaming every thought, DAG step, and tool action live to the user.

---

## 2. Agent Roles and Prompts (`backend/ai-service/src/prompts/`)

### 2.1 Orchestrator (`orchestrator.md`)
- **Role**: Project Manager & Supervisor.
- **Responsibilities**:
  1. Decomposes the user's high-level goal into an atomic Task Graph DAG (`TaskGraphStep[]`).
  2. Schedules independent steps across the Worker Pool (max 3 concurrent).
  3. Validates worker outputs against acceptance criteria (file existence, compiler diagnostics, exit codes).
  4. Self-healing: retries failed steps up to 2 times with error context; executes supervisor hotfixes if a step stalls.
  5. Verification pass: executes build check, test suite, and browser preview before marking the task complete. Never marks complete without empirical evidence.

### 2.2 Coder (`coder.md`)
- **Role**: Software Implementation Engineer.
- **Responsibilities**:
  1. Reads relevant files and AST symbols prior to proposing modifications.
  2. Acquires file locks and creates pre-mutation snapshots before modifying files.
  3. Emits focused, verifiable edits via `write_file`, `edit_file`, or `apply_patch`.
  4. Executes terminal build commands and diagnostic checks to confirm correctness.

### 2.3 Debugger (`debugger.md`)
- **Role**: Root-Cause Analysis (RCA) & Hotfix Engineer.
- **Responsibilities**:
  1. Ingests terminal output traces, stack traces, compiler errors, and failing test assertions.
  2. Analyzes minimal root causes and applies precise, targeted fixes (changing as few lines as possible).
  3. Re-runs commands to verify the resolution before closing the task.

### 2.4 Tester (`tester.md`)
- **Role**: Quality Assurance & Verification Engineer.
- **Responsibilities**:
  1. Authors comprehensive unit, integration, and E2E test suites for the assigned scope.
  2. Executes test runners via terminal tools and captures exit codes and assertion logs.
  3. Reports detailed test results, coverage, and regressions back to the Orchestrator.

### 2.5 Researcher (`researcher.md`)
- **Role**: Architecture, Knowledge & Discovery Specialist.
- **Responsibilities**:
  1. Explores directory layouts, package dependencies, and configurations.
  2. Executes web search, URL fetching, and documentation lookups.
  3. Synthesizes findings into actionable plans. Never mutates workspace code.

---

## 3. Tool Matrix & Risk Tiers (`backend/ai-service/src/tools/`)

| Tool Name | Risk Tier | Needs Permission | Timeout | Description |
| :--- | :--- | :--- | :--- | :--- |
| `read_file` | `read` | No | 15s | Chunked file reader with line bounds and gitignore filtering |
| `list_dir` | `read` | No | 15s | Directory content tree inspector |
| `search_code` | `read` | No | 30s | Fast pattern & regex search across workspace via ripgrep |
| `search_symbols` | `read` | No | 30s | Tree-sitter / AST symbol table extraction |
| `read_file_lines` | `read` | No | 15s | Targeted window reader centered at a specific line |
| `get_diagnostics` | `read` | No | 30s | TypeScript & compiler diagnostics parser |
| `git_status` / `git_diff` | `read` | No | 15s | Working directory git state and diff inspection |
| `write_file` | `write` | Yes (Diff/Batch) | 30s | Pre-mutation checkpoint + file-model diff generation + write |
| `edit_file` | `write` | Yes (Diff/Batch) | 30s | Exact string match with Levenshtein fuzzy fallback |
| `apply_patch` | `write` | Yes (Diff/Batch) | 30s | Atomic unified diff patch application across files |
| `create_dir` / `delete_file` / `move_file` | `write` | Yes (Batch) | 30s | File system lifecycle operations with pre-mutation snapshot |
| `run_terminal` | `exec` | Policy-based | 120s | Terminal execution via PTY service; supports sync & background tasks |
| `read_task_output` | `exec` | No | 15s | Live output tail from PTY ring buffer |
| `list_tasks` / `kill_task` | `exec` | No | 15s | Background task lifecycle inspection and termination |
| `wait_for_pattern` | `exec` | No | 60s | Polling outputBus for regex readiness (e.g. "localhost:5173") |
| `web_search` | `network` | First per session | 30s | Search queries returning snippets, titles, and URLs |
| `fetch_url` | `network` | First per session | 30s | Web page markdown content extraction |
| `fetch_docs` | `network` | No | 30s | Cached documentation lookups for popular frameworks |
| `open_preview` | `exec` | No | 15s | Opens browser preview panel in workbench |
| `browser_eval` | `exec` | Yes | 15s | Evaluates JS in preview to capture runtime console errors |
| `take_screenshot` | `exec` | No | 15s | Headless browser capture with graceful fallback |
| `analyze_codebase` | `read` | No | 30s | Workspace repo map (top dirs, entrypoints, scripts) |
| `plan_check` | `read` | No | 15s | Orchestrator step dependency validator |

---

## 4. Context Envelope Budget Policy (`context/envelopeBuilder.ts`)

Strict allocation across 128k context window:
- **System Prompt**: 15%
- **Task Graph State / Assigned Task**: 15%
- **Repo Map Summary + Chunks**: 35%
- **Conversation History**: 25%
- **Terminal Output Tails**: 10%

**Overflow Handling**: Compacts history → shrinks retrieval radius → trims oldest terminal tails. Current task and acceptance criteria are NEVER dropped.

---

## 5. Safety, Locking & Checkpoint Guarantees
- **File Lock Registry**: Single-writer, unlimited readers per file. Prevents parallel worker edit collision.
- **Checkpoints**: SHA-256 content hashes recorded before every mutation in `.third-eye/checkpoints/`.
- **Kill Switch**: Immediate cancellation of running worker streams and child processes via `POST /api/ai/agent/stop`.
- **Rate Limiting**: LLM calls throttled to at most 2 concurrent streams to protect API quotas.
- **Auditing**: Every session logged to `.third-eye/sessions/<timestamp>.jsonl`.
