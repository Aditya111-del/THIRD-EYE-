const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let nodePty = null;
try {
  nodePty = require('node-pty');
} catch (err) {
  console.warn('[PTY Service] Warning: node-pty binary not compiled yet.', err.message);
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PTY_SERVICE_PORT || 4001;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/pty/stream' });

/** @type {Map<string, { pty: any, shell: string, cwd: string, createdAt: number }>} */
const sessions = new Map();

function getDefaultShell() {
  if (process.platform === 'win32') {
    const pwshPaths = [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ];
    for (const p of pwshPaths) {
      if (fs.existsSync(p)) return p;
    }
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
}

// REST Endpoints
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'third-eye-pty-service',
    activeSessions: sessions.size,
    uptime: process.uptime(),
  });
});

app.get('/api/pty/sessions', (_req, res) => {
  const list = Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    shell: s.shell,
    cwd: s.cwd,
    createdAt: s.createdAt,
  }));
  res.json(list);
});

app.post('/api/pty/spawn', (req, res) => {
  const { id = `term-${Date.now()}`, cols = 80, rows = 24, cwd, shell } = req.body;
  const targetShell = shell || getDefaultShell();
  const targetCwd = cwd || os.homedir() || process.cwd();
  let shellArgs = [];
  const initBat = path.join(__dirname, 'init_shell.bat');
  if (process.platform === 'win32') {
    if (/powershell|pwsh/i.test(targetShell)) {
      shellArgs = ['-NoLogo'];
    } else if (/cmd\.exe$/i.test(targetShell)) {
      shellArgs = ['/Q'];
    }
  }

  if (nodePty) {
    try {
      const ptyProcess = nodePty.spawn(targetShell, shellArgs, {
        name: 'xterm-256color',
        cols: Number(cols),
        rows: Number(rows),
        cwd: targetCwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      });

      // Silent init so prompt starts at Line 1, Col 1
      setTimeout(() => {
        try {
          if (/powershell|pwsh/i.test(targetShell)) {
            ptyProcess.write('Clear-Host\r');
          } else {
            ptyProcess.write('doskey ls=dir /b $* >nul 2>&1 & doskey clear=cls >nul 2>&1 & doskey pwd=cd >nul 2>&1 & doskey which=where $* >nul 2>&1 & cls\r');
          }
        } catch {}
      }, 80);

      sessions.set(id, {
        pty: ptyProcess,
        shell: targetShell,
        cwd: targetCwd,
        lastCols: Number(cols),
        lastRows: Number(rows),
        createdAt: Date.now(),
      });

      ptyProcess.onExit(() => {
        sessions.delete(id);
      });

      return res.json({ success: true, id, shell: targetShell, cwd: targetCwd, cols, rows });
    } catch (err) {
      console.warn('[PTY Service] nodePty spawn failed, falling back to child_process:', err.message);
    }
  }

  // Fallback to pure Node child_process
  try {
    const { spawn: cpSpawn } = require('child_process');
    const child = cpSpawn(targetShell, shellArgs, { cwd: targetCwd, env: process.env, shell: true });
    const wrapper = {
      write: (data) => { if (child.stdin && !child.stdin.destroyed) child.stdin.write(data); },
      resize: () => {},
      kill: () => { try { child.kill(); } catch {} },
      onData: (cb) => { child.stdout.on('data', (d) => cb(d.toString())); child.stderr.on('data', (d) => cb(d.toString())); },
      onExit: (cb) => { child.on('exit', cb); },
    };
    sessions.set(id, { pty: wrapper, shell: targetShell, cwd: targetCwd, lastCols: Number(cols), lastRows: Number(rows), createdAt: Date.now() });
    child.on('exit', () => sessions.delete(id));
    return res.json({ success: true, id, shell: targetShell, cwd: targetCwd, cols, rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/pty/write', (req, res) => {
  const { id, data } = req.body;
  const session = sessions.get(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  session.pty.write(data);
  res.json({ success: true });
});

app.post('/api/pty/resize', (req, res) => {
  const { id, cols, rows } = req.body;
  const session = sessions.get(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const safeCols = Math.max(10, cols || 80);
  const safeRows = Math.max(5, rows || 24);
  if (session.lastCols === safeCols && session.lastRows === safeRows) {
    return res.json({ success: true });
  }
  session.lastCols = safeCols;
  session.lastRows = safeRows;
  session.pty.resize(safeCols, safeRows);
  res.json({ success: true });
});

app.delete('/api/pty/:id', (req, res) => {
  const { id } = req.params;
  const session = sessions.get(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  session.pty.kill();
  sessions.delete(id);
  res.json({ success: true });
});

// WebSocket Streaming for real-time keystrokes and stdout/stderr
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const terminalId = url.searchParams.get('id') || `term-${Date.now()}`;

  let session = sessions.get(terminalId);
  if (!session && nodePty) {
    const shell = getDefaultShell();
    const cwd = os.homedir() || process.cwd();
    const ptyProcess = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });

    session = { pty: ptyProcess, shell, cwd, createdAt: Date.now() };
    sessions.set(terminalId, session);
  }

  if (session) {
    const disposable = session.pty.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', id: terminalId, data }));
      }
    });

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (payload.type === 'write' && payload.data) {
          session.pty.write(payload.data);
        } else if (payload.type === 'resize' && payload.cols && payload.rows) {
          session.pty.resize(payload.cols, payload.rows);
        }
      } catch (err) {
        session.pty.write(message.toString());
      }
    });

    ws.on('close', () => {
      try {
        if (disposable && typeof disposable.dispose === 'function') {
          disposable.dispose();
        }
      } catch {}
    });
  }
});

server.listen(PORT, () => {
  console.log(`[THIRD EYE PTY Service] Running on http://localhost:${PORT}`);
  console.log(`[THIRD EYE PTY Service] WebSocket streaming ready at ws://localhost:${PORT}/pty/stream`);
});
