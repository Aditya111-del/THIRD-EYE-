# THIRD EYE — AI-Native Terminal Workspace

**THIRD EYE** is a full-stack, AI-native desktop terminal workspace combining your pre-built **Lovable.dev** frontend (`Frontend/guide-build-main`) with a high-performance **Electron desktop runtime** and dedicated **Backend microservices** (`backend/pty-service` and `backend/ai-service`).

---

## 📁 Project Architecture

```text
THIRD EYE/
├── Frontend/guide-build-main/         # 🎨 FRONTEND (Pre-built Lovable.dev App)
│   ├── src/
│   │   ├── components/
│   │   │   ├── terminal/
│   │   │   │   └── TerminalStage.tsx  # Terminal UI with Ctrl+C interrupt, Ctrl+L clear & history
│   │   │   ├── ai-assistant/
│   │   │   │   └── AiSidecar.tsx      # THIRD EYE AI with root-cause diagnosis & 1-click fix
│   │   │   ├── explorer/
│   │   │   │   └── TerminalExplorer.tsx # Environment & session manager
│   │   │   └── layout/
│   │   │       └── MainLayout.tsx     # Resizable multi-pane layout & telemetry
│   │   ├── hooks/
│   │   │   ├── useTerminalSession.ts  # LIVE PTY integration & session state
│   │   │   ├── useTerminalBackend.ts  # IPC connector hook
│   │   │   └── useAiContext.ts        # Terminal buffer summarizer
│   │   ├── types/
│   │   │   ├── electron.d.ts          # Window.electronAPI type definitions
│   │   │   └── terminal.ts            # Terminal and session interfaces
│   │   └── routes/                    # TanStack Start / React Router pages
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                           # ⚙️ BACKEND (Microservices)
│   ├── pty-service/
│   │   ├── package.json               # Dependencies: node-pty, express, ws, cors
│   │   └── server.js                  # PTY server (port 4001) with WebSocket stdout/stdin streaming
│   │
│   └── ai-service/
│       ├── package.json               # Dependencies: openai, langchain, express, cors
│       └── agent.js                   # AI agent (port 4002) for log root-cause analysis & chat
│
├── electron/                          # 🖥️ DESKTOP WRAPPER (Electron Runtime)
│   ├── main.js                        # Multi-port loader (ports 3000 & 5173), window & IPC coordinator
│   ├── preload.js                     # Secure ContextBridge exposing window.electronAPI
│   ├── ptyManager.js                  # Native PTY engine embedded in Electron main process
│   └── aiEngine.js                    # Rolling ring buffer, ANSI sanitizer & GPT-4o engine
│
├── .env                               # OPENAI_API_KEY, model selection & ports
├── package.json                       # Unified root workspace config
└── README.md
```

---

## ⚡ Integration Details

1. **PTY Execution:**
   - Spawns real system shells (PowerShell 7 / Windows PowerShell / `cmd.exe` on Windows; `zsh` / `bash` on macOS and Linux) via `node-pty`.
   - Live stdout/stderr is stripped of ANSI escape codes, inspected for errors, and rendered smoothly in the terminal view.
   - When run in browser preview outside Electron, falls back cleanly to mock mode.

2. **THIRD EYE AI Engine:**
   - Click **"Diagnose with AI"** or type `/explain` in the sidebar to send the rolling terminal buffer to GPT-4o.
   - Receives root-cause diagnosis and a suggested command with a **"Run"** button to execute the fix with one click!
   - Full interactive chat with context of recent terminal commands and logs.

3. **Desktop & Microservices Flexibility:**
   - **Embedded Mode (Default):** Electron runs the PTY manager and AI engine directly via Node.js IPC.
   - **Microservices Mode:** `backend/pty-service` (port 4001) and `backend/ai-service` (port 4002) can run as standalone HTTP/WebSocket services.

---

## 🚀 How to Run THIRD EYE

### 1. Set your OpenAI API Key
Edit [`.env`](file:///c:/Users/aditya.s.ctr/Desktop/THIRD%20EYE/.env):
```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o
```

### 2. Install Dependencies
```bash
# In the root directory:
npm install
npm run rebuild

# In the frontend directory:
cd Frontend/guide-build-main
npm install
cd ../..
```

### 3. Launch Development Mode
```bash
npm run dev
```
* Starts the frontend on `http://localhost:3000` (or `5173`).
* Launches Electron, connecting directly to the frontend with full PTY and AI integration.

> **Note on temporary scaffolding:** You can safely delete the temporary `termx-workspace` directory if it is present (`rmdir /s /q termx-workspace` in PowerShell).
