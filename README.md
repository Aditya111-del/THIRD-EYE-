# THIRD EYE — Industry-Grade Agentic IDE

**THIRD EYE** is a high-performance, enterprise-grade, AI-native Integrated Development Environment (IDE) architected with a decoupled 4-process topology. It unifies terminal multiplexing, Monaco editor workflows, file system virtualization, and an autonomous coding agent loop with side-effect transparency.

---

## 🏗️ 4-Process System Architecture

```text
THIRD_EYE/
├── package.json                         # Monorepo workspaces: packages/*, Frontend/*, backend/*
├── packages/
│   └── shared/                          # ★ CONTRACT LAYER (@third-eye/shared)
│       ├── src/ipc.ts                   # Channel constants + typed Request/Response signatures
│       ├── src/tools.ts                 # Tool schemas, parameters, and risk classifications
│       ├── src/events.ts                # Streaming terminal, file watch, and agent events
│       ├── src/agent.ts                 # Message turns, tool calls, checkpoints, context envelopes
│       └── src/permissions.ts           # Permission requests, decisions, and auto-allow policy
│
├── electron/                            # 🖥️ DESKTOP WRAPPER (Electron Main Process)
│   ├── main.js                          # Window manager, chokidar file watcher, typed IPC router
│   ├── preload.js                       # Secure ContextBridge exposing window.thirdEye & legacy adapters
│   ├── ptyManager.js                    # Native PTY engine adapter
│   └── aiEngine.js                      # Legacy adapter for backward compatibility
│
├── Frontend/guide-build-main/           # 🎨 RENDERER PROCESS (React 18 + TanStack + Monaco)
│   ├── src/editor/                      # ★ In-Memory File Model Registry & Diff Preview
│   │   ├── fileModels.ts                # In-memory models, versioning, external watch sync
│   │   └── diffPreview/                 # Monaco Diff Editor for AI proposed hunk reviews
│   ├── src/components/ai-assistant/     # AI Sidecar with Slash Commands & Checkpoint Restore
│   ├── src/components/terminal/         # High-performance xterm.js terminal integration
│   └── src/hooks/useEditorWorkspace.ts  # Workspace models & diff review actions
│
├── backend/
│   ├── pty-service/                     # ⚙️ PTY MICROSERVICE (Port 4001)
│   │   ├── src/sessionRegistry.ts       # Session coordinator (id → process, cwd, shell)
│   │   ├── src/outputBus.ts             # 10,000-line circular ring buffer for late subscribers
│   │   ├── src/shellIntegration.ts      # OSC 633 & OSC 7 sequence parser (cwd & exit code tracking)
│   │   └── src/server.ts                # REST & WebSocket streaming server
│   │
│   └── ai-service/                      # 🧠 AI AGENT MICROSERVICE (Port 4002)
│       ├── src/loop.ts                  # ★ Autonomous 5-Step Agent Loop (max 25 iterations)
│       ├── src/tools/                   # Tool registry (readFile, writeFile, editFile, searchCode, runTerminal)
│       ├── src/context/                 # Context engineering (repoMap, chunker, retriever, budgetManager, compaction)
│       ├── src/tools/checkpoints.ts     # Content-hash snapshot store for 1-click rollback
│       └── src/tools/permissions.ts     # Policy engine enforcing user permission decisions
│
├── scripts/
│   └── smoke-test.js                    # Automated E2E smoke test verifying all processes
└── docs/
    ├── ARCHITECTURE.md                  # Comprehensive process map, data flows, and IPC contracts
    ├── AGENT.md                         # Autonomous agent mental model, loop, and budget policy
    └── MIGRATION_LOG.md                 # Complete record of all migration phases (0 through 7)
```

---

## ⚡ Non-Negotiable Hard Constraints Enforced

1. **Zero Ground-Up Rewrite**: Incremental migration preserving all existing features behind typed contracts.
2. **Process Architecture**: Strict separation of Electron Main | Renderer | pty-service | ai-service.
3. **Typed Contracts Everywhere**: Inter-process communication strictly mediated by `@third-eye/shared`. No untyped string IPC.
4. **File Model Service**: Every agent write/edit routes through in-memory models and produces reviewable Monaco diff previews before persistent disk writes.
5. **Tool Permissions**: Every terminal command requires explicit permission decision unless matching the auto-allow list (`git status`, `ls`, `pwd`, etc.).
6. **Side-Effect Transparency & Checkpoints**: Content-hash snapshots recorded prior to each mutation, enabling single-click "Revert All AI Changes".

---

## 🚀 Running THIRD EYE

### 1. Environment Configuration
Verify your [`.env`](file:///Users/adityasalgotra/Downloads/THIRD_EYE/.env) in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
# Optional OpenAI fallback
OPENAI_API_KEY=your_openai_api_key_here
```

### 2. Build Workspaces
```bash
# Build the contract layer
npm run build:shared

# Run the end-to-end smoke test
npm run smoke
```

### 3. Launch Development Stack
```bash
npm run dev
```
Starts services concurrently:
- **PTY Service**: `http://localhost:4001` (WebSocket: `ws://localhost:4001/pty/stream`)
- **AI Agent Service**: `http://localhost:4002`
- **Frontend Web App**: `http://localhost:3000`
- **Electron Client**: Native desktop application with typed `window.thirdEye` bridge.
