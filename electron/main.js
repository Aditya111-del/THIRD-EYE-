const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');

// Load environment variables from .env in project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const { PTYManager } = require('./ptyManager');
const { AIEngine } = require('./aiEngine');

let mainWindow = null;
const ptyManager = new PTYManager();
const aiEngine = new AIEngine({ maxBufferLines: 300, errorCooldownMs: 4000 });

// Determine environment
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
// Candidate URLs for dev server (checks port 3000 primary, plus fallback ports 8080, 3001, 5173)
const candidateUrls = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

let isConnectingPageLoaded = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'THIRD EYE — Antigravity IDE',
    backgroundColor: '#090a0d',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Track maximized state changes and broadcast to renderer
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window.maximizedChanged', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window.maximizedChanged', false);
    }
  });

  // Forward renderer console logs to Node terminal
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    console.log(`[Renderer ${levels[level] || 'LOG'}] ${message} (${sourceId}:${line})`);
  });

  // Log renderer loading failures
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });

  // Open external links in default system browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Global Zoom & Keyboard Shortcut Handling (Ctrl + +, Ctrl + -, Ctrl + 0)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control || input.meta) {
      // Zoom In (Ctrl + =, Ctrl + +, NumpadAdd)
      if (
        input.key === '=' ||
        input.key === '+' ||
        input.code === 'NumpadAdd' ||
        input.code === 'Equal'
      ) {
        if (input.type === 'keyDown') {
          const currentZoom = mainWindow.webContents.getZoomFactor();
          const newZoom = Math.min(Number((currentZoom + 0.1).toFixed(2)), 3.0);
          mainWindow.webContents.setZoomFactor(newZoom);
          mainWindow.webContents.send('window.zoomChanged', newZoom);
          console.log(`[Electron] Zoomed In to ${Math.round(newZoom * 100)}%`);
        }
        event.preventDefault();
      }
      // Zoom Out (Ctrl + -, NumpadSubtract)
      else if (
        input.key === '-' ||
        input.key === '_' ||
        input.code === 'NumpadSubtract' ||
        input.code === 'Minus'
      ) {
        if (input.type === 'keyDown') {
          const currentZoom = mainWindow.webContents.getZoomFactor();
          const newZoom = Math.max(Number((currentZoom - 0.1).toFixed(2)), 0.5);
          mainWindow.webContents.setZoomFactor(newZoom);
          mainWindow.webContents.send('window.zoomChanged', newZoom);
          console.log(`[Electron] Zoomed Out to ${Math.round(newZoom * 100)}%`);
        }
        event.preventDefault();
      }
      // Zoom Reset (Ctrl + 0)
      else if (
        input.key === '0' ||
        input.code === 'Numpad0' ||
        input.code === 'Digit0'
      ) {
        if (input.type === 'keyDown') {
          mainWindow.webContents.setZoomFactor(1.0);
          mainWindow.webContents.send('window.zoomChanged', 1.0);
          console.log(`[Electron] Zoom Reset to 100%`);
        }
        event.preventDefault();
      }
    }
  });

  if (isDev) {
    // Open devtools in undocked mode so it does not crush the terminal workspace height
    mainWindow.webContents.openDevTools({ mode: 'undocked' });
    loadDevServer(mainWindow);
  } else {
    const fs = require('fs');
    const prodPaths = [
      path.join(__dirname, '../Frontend/guide-build-main/.output/public/index.html'),
      path.join(__dirname, '../Frontend/guide-build-main/dist/index.html'),
      path.join(__dirname, '../frontend/dist/index.html'),
    ];
    const targetFile = prodPaths.find((p) => fs.existsSync(p)) || prodPaths[0];
    mainWindow.loadFile(targetFile);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Probe a single URL with a fast 600ms timeout
 */
async function probeCandidateUrl(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok || res.status < 500) {
      return url;
    }
  } catch (_) {
    // Port not yet listening
  }
  return null;
}

/**
 * Concurrently check candidate ports to find the active Vite instance
 */
async function findActiveDevServer() {
  const primary = (await probeCandidateUrl('http://localhost:3000')) || (await probeCandidateUrl('http://127.0.0.1:3000'));
  if (primary) return primary;

  const probes = await Promise.all(candidateUrls.map(probeCandidateUrl));
  return probes.find((u) => u !== null) || null;
}

/**
 * Robust dev server loader with multi-port detection
 */
async function loadDevServer(window, retries = 75) {
  if (!window || window.isDestroyed()) return;

  const activeUrl = await findActiveDevServer();

  if (activeUrl) {
    console.log(`[Electron] Frontend server detected at ${activeUrl}. Navigating...`);
    try {
      await window.loadURL(activeUrl);
      console.log(`[Electron] Successfully connected to THIRD EYE IDE at ${activeUrl}`);
      isConnectingPageLoaded = false;
      return;
    } catch (navErr) {
      console.warn(`[Electron] Navigation to ${activeUrl} deferred (${navErr.message}). Retrying...`);
    }
  }

  // Not ready yet: display connecting screen if not already shown
  if (!isConnectingPageLoaded && window && !window.isDestroyed()) {
    isConnectingPageLoaded = true;
    const connectingFile = path.join(__dirname, 'connecting.html');
    window.loadFile(connectingFile).catch(() => {});
  }

  if (retries > 0) {
    if (retries % 5 === 0 || retries > 70) {
      console.log(`[Electron] Waiting for Vite server (probed ports 3000, 8080, 3001, 5173)... (${retries} attempts left)`);
    }
    setTimeout(() => {
      if (window && !window.isDestroyed()) {
        loadDevServer(window, retries - 1);
      }
    }, 1200);
  } else {
    console.error('[Electron] Failed to connect to dev server after all attempts.');
  }
}

// Wire AI Engine automated error notifications to Renderer
aiEngine.setOnErrorDetected((eventData) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ai.errorDetected', eventData);
  }
});

// PTY Data Handler: route stream to AI Engine buffer and forward to Renderer
function handlePtyData(id, data) {
  aiEngine.ingest(id, data);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal.incomingData', { id, data });
  }
}

// PTY Exit Handler
function handlePtyExit(id, { exitCode, signal }) {
  console.log(`[Main] Terminal ${id} exited with code ${exitCode}`);
  aiEngine.removeBuffer(id);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal.exit', { id, exitCode, signal });
  }
}

/* ==========================================================================
   IPC HANDLERS - TERMINAL PTY
   ========================================================================== */

// Spawn new terminal process
ipcMain.handle('terminal.spawn', async (_event, config = {}) => {
  try {
    const sessionInfo = ptyManager.spawn(config, handlePtyData, handlePtyExit);
    return { success: true, ...sessionInfo };
  } catch (error) {
    console.error('[Main] Failed to spawn terminal:', error);
    return { success: false, error: error.message };
  }
});

// Pass user keystroke to PTY
ipcMain.on('terminal.keystroke', (_event, { id, data }) => {
  if (id && data !== undefined) {
    ptyManager.write(id, data);
  }
});

// Resize terminal
ipcMain.on('terminal.resize', (_event, { id, cols, rows }) => {
  if (id && cols && rows) {
    ptyManager.resize(id, cols, rows);
  }
});

// Terminate terminal
ipcMain.handle('terminal.kill', async (_event, { id }) => {
  aiEngine.removeBuffer(id);
  const result = ptyManager.kill(id);
  return { success: result };
});

// List terminal sessions
ipcMain.handle('terminal.list', async () => {
  return ptyManager.getSessions();
});

/* ==========================================================================
   IPC HANDLERS - AI ENGINE
   ========================================================================== */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || `http://localhost:${process.env.AI_SERVICE_PORT || 4002}`;

/**
 * Route AI requests to the dedicated Enterprise Backend Microservice (port 4002).
 * If the dedicated microservice is offline or unreachable, seamlessly fall back to the embedded engine.
 */
async function callDedicatedAiMicroservice(endpoint, payload) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const res = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (_err) {
    // Dedicated backend not running or timed out; fall through to embedded engine
  }
  return null;
}

// Analyze recent terminal buffer with LLM
ipcMain.handle('ai.analyze', async (_event, params = {}) => {
  try {
    // 1. Prioritize Dedicated Enterprise AI Microservice (backend/ai-service)
    const remoteResult = await callDedicatedAiMicroservice('/api/ai/analyze', params);
    if (remoteResult && (remoteResult.success || remoteResult.explanation)) {
      return { success: true, ...remoteResult };
    }

    // 2. Embedded local AI engine fallback (for standalone desktop deployment)
    const analysis = await aiEngine.analyzeLogs(params);
    return { success: true, ...analysis };
  } catch (err) {
    console.error('[Main] AI Analysis failed:', err);
    return {
      success: false,
      explanation: `Analysis error: ${err.message}`,
      suggested_command: '',
      severity: 'high',
      root_cause: err.message,
    };
  }
});

// Interactive terminal chat
ipcMain.handle('ai.chat', async (_event, params = {}) => {
  try {
    // 1. Prioritize Dedicated Enterprise AI Microservice (backend/ai-service)
    const remoteResult = await callDedicatedAiMicroservice('/api/ai/chat', params);
    if (remoteResult && (remoteResult.reply || remoteResult.success)) {
      return { success: true, ...remoteResult };
    }

    // 2. Embedded local AI engine fallback (for standalone desktop deployment)
    const result = await aiEngine.chat(params);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, reply: `Chat error: ${err.message}` };
  }
});

// Get buffered lines
ipcMain.handle('ai.getBuffer', async (_event, { terminalId, lineCount }) => {
  const buffer = aiEngine.getBuffer(terminalId);
  return buffer.getLogs(lineCount || 200);
});

// Clear buffer
ipcMain.handle('ai.clearBuffer', async (_event, { terminalId }) => {
  aiEngine.clearBuffer(terminalId);
  return { success: true };
});

/* ==========================================================================
   IPC HANDLERS - SALESFORCE SERVICE CLOUD
   ========================================================================== */

const SF_MICROSERVICE_URL = 'http://localhost:4003';

ipcMain.handle('salesforce.test', async (_event, params = {}) => {
  try {
    const res = await fetch(`${SF_MICROSERVICE_URL}/api/salesforce/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (err) {
    const instanceUrl = (params.instanceUrl || process.env.SALESFORCE_INSTANCE_URL || '').replace(/\/+$/, '');
    const apiKey = (params.apiKey || process.env.SALESFORCE_API_KEY || '').trim();
    if (!instanceUrl || !apiKey) {
      return { success: false, error: 'Salesforce Instance URL and API Key are required.' };
    }
    try {
      const sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Case/describe`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!sfRes.ok) {
        return { success: false, error: `Salesforce HTTP ${sfRes.status}: Invalid API Key or URL.` };
      }
      return { success: true, message: 'Connected to Salesforce Service Cloud successfully.' };
    } catch (e) {
      return { success: false, error: `Connection failed: ${e.message}` };
    }
  }
});

ipcMain.handle('salesforce.fetchTickets', async (_event, params = {}) => {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${SF_MICROSERVICE_URL}/api/salesforce/tickets?${query}`);
    return await res.json();
  } catch (err) {
    const instanceUrl = (params.instanceUrl || process.env.SALESFORCE_INSTANCE_URL || '').replace(/\/+$/, '');
    const apiKey = (params.apiKey || process.env.SALESFORCE_API_KEY || '').trim();
    const userEmail = params.userEmail || process.env.SALESFORCE_USER_EMAIL || '';
    if (!instanceUrl || !apiKey) {
      return { success: false, error: 'Salesforce API Key not configured. Set your credentials in Settings.', tickets: [] };
    }
    try {
      let soql = `SELECT Id, CaseNumber, Subject, Description, Status, Priority, ContactEmail, CreatedDate, LastModifiedDate, Account.Name, Owner.Name, Owner.Email FROM Case WHERE Status != 'Closed' ORDER BY CreatedDate DESC LIMIT 50`;
      if (userEmail) {
        soql = `SELECT Id, CaseNumber, Subject, Description, Status, Priority, ContactEmail, CreatedDate, LastModifiedDate, Account.Name, Owner.Name, Owner.Email FROM Case WHERE (Owner.Email = '${userEmail}' OR Status != 'Closed') ORDER BY CreatedDate DESC LIMIT 50`;
      }
      const sfRes = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!sfRes.ok) {
        return { success: false, error: `Salesforce HTTP ${sfRes.status}`, tickets: [] };
      }
      const data = await sfRes.json();
      const tickets = (data.records || []).map((r) => {
        const ipMatch = (r.Subject + ' ' + (r.Description || '')).match(/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/);
        return {
          id: r.Id,
          ticketNumber: r.CaseNumber || `SF-${r.Id.slice(-5)}`,
          subject: r.Subject || 'Incident',
          description: r.Description || '',
          status: r.Status || 'New',
          priority: r.Priority || 'Medium',
          siteId: 'site-gor-prod',
          siteName: r.Account?.Name || 'Enterprise Site',
          primaryIp: ipMatch ? ipMatch[0] : '172.28.76.144',
          assignedTo: r.Owner?.Name || userEmail,
          assignedEmail: r.Owner?.Email || userEmail,
          customer: r.Account?.Name || 'Enterprise Customer',
          createdAt: r.CreatedDate ? new Date(r.CreatedDate).toLocaleString() : 'Recent',
          updatedAt: r.LastModifiedDate ? new Date(r.LastModifiedDate).toLocaleString() : 'Recent',
          caseOrigin: 'Salesforce Service Cloud',
        };
      });
      return { success: true, count: tickets.length, tickets };
    } catch (e) {
      return { success: false, error: e.message, tickets: [] };
    }
  }
});

ipcMain.handle('salesforce.saveConfig', async (_event, config) => {
  try {
    const res = await fetch(`${SF_MICROSERVICE_URL}/api/salesforce/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return await res.json();
  } catch (err) {
    if (config.apiKey) process.env.SALESFORCE_API_KEY = config.apiKey;
    if (config.instanceUrl) process.env.SALESFORCE_INSTANCE_URL = config.instanceUrl;
    if (config.userEmail) process.env.SALESFORCE_USER_EMAIL = config.userEmail;
    return { success: true, message: 'Saved configuration to local environment.' };
  }
});

ipcMain.handle('salesforce.getConfig', async () => {
  try {
    const res = await fetch(`${SF_MICROSERVICE_URL}/api/salesforce/config`);
    return await res.json();
  } catch (err) {
    return {
      instanceUrl: process.env.SALESFORCE_INSTANCE_URL || '',
      hasApiKey: Boolean(process.env.SALESFORCE_API_KEY),
      userEmail: process.env.SALESFORCE_USER_EMAIL || '',
    };
  }
});

/* ==========================================================================
   IPC HANDLERS - SYSTEM UTILITIES
   ========================================================================== */

ipcMain.handle('system.getDefaultShell', async () => {
  return ptyManager.getDefaultShell();
});

ipcMain.handle('system.getCwd', async () => {
  return os.homedir() || process.cwd();
});

ipcMain.handle('system.inspectDirectory', async (_event, cwd) => {
  try {
    return aiEngine.inspectDirectoryContext(cwd);
  } catch (err) {
    return {
      cwd: cwd || process.cwd(),
      directories: [],
      files: [],
      packageData: null,
      gitInfo: { branch: '', hasGit: false },
      error: err.message,
    };
  }
});

ipcMain.handle('system.openExternalTerminal', async (_event, cwd) => {
  const targetDir = cwd || os.homedir() || process.cwd();
  const { exec } = require('child_process');
  if (process.platform === 'win32') {
    exec(`start cmd.exe /k "cd /d ${targetDir}"`);
  } else if (process.platform === 'darwin') {
    exec(`open -a Terminal "${targetDir}"`);
  } else {
    exec(`x-terminal-emulator --working-directory="${targetDir}" || xterm`);
  }
  return { success: true };
});

ipcMain.handle('system.relaunchApp', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* ==========================================================================
   IPC HANDLERS - OS CLIPBOARD INTEGRATION
   ========================================================================== */

ipcMain.handle('clipboard.readText', async () => {
  try {
    return clipboard.readText() || '';
  } catch (err) {
    console.warn('[Electron] clipboard.readText error:', err);
    return '';
  }
});

ipcMain.handle('clipboard.writeText', async (_event, text) => {
  try {
    clipboard.writeText(String(text || ''));
    return true;
  } catch (err) {
    console.warn('[Electron] clipboard.writeText error:', err);
    return false;
  }
});

/* ==========================================================================
   IPC HANDLERS - WINDOW SIZING & ZOOM CONTROLS
   ========================================================================== */

ipcMain.handle('window.zoomIn', async () => {
  if (!mainWindow) return 1.0;
  const current = mainWindow.webContents.getZoomFactor();
  const next = Math.min(Number((current + 0.1).toFixed(2)), 3.0);
  mainWindow.webContents.setZoomFactor(next);
  mainWindow.webContents.send('window.zoomChanged', next);
  return next;
});

ipcMain.handle('window.zoomOut', async () => {
  if (!mainWindow) return 1.0;
  const current = mainWindow.webContents.getZoomFactor();
  const next = Math.max(Number((current - 0.1).toFixed(2)), 0.5);
  mainWindow.webContents.setZoomFactor(next);
  mainWindow.webContents.send('window.zoomChanged', next);
  return next;
});

ipcMain.handle('window.resetZoom', async () => {
  if (!mainWindow) return 1.0;
  mainWindow.webContents.setZoomFactor(1.0);
  mainWindow.webContents.send('window.zoomChanged', 1.0);
  return 1.0;
});

ipcMain.handle('window.getZoom', async () => {
  return mainWindow ? mainWindow.webContents.getZoomFactor() : 1.0;
});

ipcMain.handle('window.setZoom', async (_event, factor) => {
  if (!mainWindow) return 1.0;
  const clamped = Math.min(Math.max(Number(factor), 0.5), 3.0);
  mainWindow.webContents.setZoomFactor(clamped);
  mainWindow.webContents.send('window.zoomChanged', clamped);
  return clamped;
});

ipcMain.handle('window.minimize', async () => {
  if (!mainWindow) return false;
  mainWindow.minimize();
  return true;
});

ipcMain.handle('window.toggleMaximize', async () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

ipcMain.handle('window.close', async () => {
  if (!mainWindow) return false;
  mainWindow.close();
  return true;
});

ipcMain.handle('window.isMaximized', async () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

/* ==========================================================================
   APP LIFECYCLE
   ========================================================================== */

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  ptyManager.killAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  ptyManager.killAll();
});
