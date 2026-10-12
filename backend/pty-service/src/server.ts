/**
 * PTY Microservice Server (Phase 3)
 * Provides REST APIs and WebSocket stream with 10k-line ring buffer backfill and shell integration.
 */

import express from 'express';
import http from 'http';
import cors from 'cors';
import WebSocket from 'ws';
import path from 'path';
import { sessionRegistry } from './sessionRegistry';
import { outputBusRegistry } from './outputBus';

require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PTY_SERVICE_PORT || 4001;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/pty/stream' });

// Health Check
app.get('/health', (_req, res) => {
  const sessions = sessionRegistry.listSessions();
  res.json({
    status: 'ok',
    service: 'third-eye-pty-service',
    activeSessions: sessions.length,
    sessions,
    uptime: process.uptime(),
  });
});

// List Active Sessions
app.get('/api/pty/sessions', (_req, res) => {
  res.json(sessionRegistry.listSessions());
});

// Spawn New Session
app.post('/api/pty/spawn', (req, res) => {
  try {
    const session = sessionRegistry.spawn(req.body || {});
    res.json({
      success: true,
      id: session.id,
      shell: session.shell,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Write to Session
app.post('/api/pty/write', (req, res) => {
  const { id, data } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing session id' });
  const success = sessionRegistry.write(id, data);
  if (!success) return res.status(404).json({ error: 'Session not found' });
  res.json({ success: true });
});

// Resize Terminal
app.post('/api/pty/resize', (req, res) => {
  const { id, cols, rows } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing session id' });
  const success = sessionRegistry.resize(id, cols, rows);
  if (!success) return res.status(404).json({ error: 'Session not found' });
  res.json({ success: true });
});

// Kill Session
app.delete('/api/pty/:id', (req, res) => {
  const { id } = req.params;
  const success = sessionRegistry.kill(id);
  if (!success) return res.status(404).json({ error: 'Session not found' });
  res.json({ success: true });
});

// Change Directory
app.post('/api/pty/cd', (req, res) => {
  const { id, dir } = req.body || {};
  if (!id || !dir) return res.status(400).json({ error: 'Missing id or dir' });
  const success = sessionRegistry.cd(id, dir);
  res.json({ success });
});

// Read Ring Buffer Tail (Crucial for AI Agent Loop)
app.get('/api/pty/buffer', (req, res) => {
  const id = req.query.id as string;
  const lines = parseInt(req.query.lines as string, 10) || 200;
  if (!id) return res.status(400).json({ error: 'Missing session id' });
  const tail = sessionRegistry.getTail(id, lines);
  res.json({ id, tail, lines });
});

// WebSocket Streaming with Ring Buffer Backfill
wss.on('connection', (ws: WebSocket, req) => {
  const host = req.headers.host || 'localhost:4001';
  const url = new URL(req.url || '', `http://${host}`);
  const terminalId = url.searchParams.get('id') || `term-${Date.now()}`;

  let session = sessionRegistry.getSession(terminalId);
  if (!session) {
    session = sessionRegistry.spawn({ id: terminalId });
  }

  // Backfill late subscriber with existing ring buffer history
  const history = session.outputBus.getSnapshot();
  if (history && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'data', id: terminalId, data: history }));
  }

  // Subscribe to real-time output chunks
  const unsubscribe = session.outputBus.subscribe((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'data', id: terminalId, data }));
    }
  });

  ws.on('message', (message: WebSocket.RawData) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.type === 'write' && payload.data !== undefined) {
        sessionRegistry.write(terminalId, payload.data);
      } else if (payload.type === 'resize' && payload.cols && payload.rows) {
        sessionRegistry.resize(terminalId, payload.cols, payload.rows);
      }
    } catch {
      sessionRegistry.write(terminalId, message.toString());
    }
  });

  ws.on('close', () => {
    unsubscribe();
  });
});

export function startPtyServer() {
  server.listen(PORT, () => {
    console.log(`[THIRD EYE PTY Service] Running on http://localhost:${PORT}`);
    console.log(`[THIRD EYE PTY Service] OutputBus 10k-line ring buffer active`);
    console.log(`[THIRD EYE PTY Service] WebSocket streaming ready at ws://localhost:${PORT}/pty/stream`);
  });
  return server;
}

if (require.main === module) {
  startPtyServer();
}
