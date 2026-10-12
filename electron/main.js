const { app, BrowserWindow, ipcMain, shell, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');

// Load environment variables from .env in project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const { PTYManager } = require('./ptyManager');
const { AIEngine } = require('./aiEngine');


let mainWindow = null;
function resolveExistingPath(p) {
  if (!p || typeof p !== 'string') return '';
  if (fs.existsSync(p)) return p;
  if (fs.existsSync(p.trim())) return p.trim();
  if (fs.existsSync(p + ' ')) return p + ' ';
  if (fs.existsSync(p.trimEnd())) return p.trimEnd();
  return p;
}

let workspaceRoot = '';
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
    title: 'THIRD EYE',
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
    const targetCwd = config.cwd && fs.existsSync(config.cwd)
      ? config.cwd
      : (workspaceRoot && fs.existsSync(workspaceRoot) ? workspaceRoot : os.homedir());
    const spawnConfig = {
      ...config,
      cwd: targetCwd,
    };
    const sessionInfo = ptyManager.spawn(spawnConfig, handlePtyData, handlePtyExit);
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

// Retrieve live terminal output buffer
ipcMain.handle('terminal.getBuffer', async (_event, { id } = {}) => {
  return ptyManager.getBuffer(id);
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
   IPC HANDLERS - WORKSPACE FILE SYSTEM (VS CODE FILE EXPLORER & MONACO)
   ========================================================================== */

ipcMain.handle('fs.getWorkspaceRoot', async () => {
  return workspaceRoot;
});

// Native folder picker — lets the user open any folder from their device
ipcMain.handle('dialog.openFolder', async () => {
  if (!mainWindow) return { success: false, canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true };
  }
  workspaceRoot = result.filePaths[0];
  console.log(`[Electron] Workspace root changed to: ${workspaceRoot}`);
  setupFsWatcher(workspaceRoot);
  ptyManager.cdAllSessions(workspaceRoot);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace.rootChanged', {
      root: workspaceRoot,
      name: path.basename(workspaceRoot),
    });
  }
  broadcastGitStatusChanged();
  return { success: true, folderPath: workspaceRoot, folderName: path.basename(workspaceRoot) };
});

// Explicitly switch workspace to a specific folder path
ipcMain.handle('workspace.openPath', async (_event, targetPath) => {
  const cleanTarget = resolveExistingPath(targetPath);
  if (!cleanTarget || !fs.existsSync(cleanTarget)) return { success: false, error: 'Path not found' };
  workspaceRoot = cleanTarget;
  console.log(`[Electron] Workspace root explicitly set to: ${workspaceRoot}`);
  setupFsWatcher(workspaceRoot);
  ptyManager.cdAllSessions(workspaceRoot);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace.rootChanged', {
      root: workspaceRoot,
      name: path.basename(workspaceRoot),
    });
  }
  broadcastGitStatusChanged();
  return { success: true, folderPath: workspaceRoot, folderName: path.basename(workspaceRoot) };
});

// Explicitly reset workspace to default root (THIRD_EYE project folder)
ipcMain.handle('workspace.resetToDefault', async () => {
  const defaultTarget = path.resolve(__dirname, '..');
  workspaceRoot = defaultTarget;
  console.log(`[Electron] Workspace root reset to default: ${workspaceRoot}`);
  setupFsWatcher(workspaceRoot);
  ptyManager.cdAllSessions(workspaceRoot);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace.rootChanged', {
      root: workspaceRoot,
      name: path.basename(workspaceRoot),
    });
  }
  broadcastGitStatusChanged();
  return { success: true, folderPath: workspaceRoot, folderName: path.basename(workspaceRoot) };
});

// Explicitly close workspace (empty workspaceRoot)
ipcMain.handle('workspace.close', async () => {
  workspaceRoot = '';
  console.log(`[Electron] Workspace root closed (empty)`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace.rootChanged', {
      root: '',
      name: '',
    });
  }
  broadcastGitStatusChanged();
  return { success: true, folderPath: '', folderName: '' };
});

// Explicitly direct terminal session(s) to a folder
ipcMain.handle('terminal.cd', async (_event, { id, dir } = {}) => {
  const target = resolveExistingPath(dir) || workspaceRoot;
  if (id) {
    return { success: ptyManager.cdSession(id, target) };
  } else {
    ptyManager.cdAllSessions(target);
    return { success: true };
  }
});

ipcMain.handle('fs.readDirectory', async (_event, relativeOrAbsPath = '') => {
  try {
    if (!workspaceRoot && !relativeOrAbsPath) {
      return { success: true, root: '', currentDir: '', entries: [] };
    }
    const targetDir = path.isAbsolute(relativeOrAbsPath)
      ? relativeOrAbsPath
      : (workspaceRoot ? path.join(workspaceRoot, relativeOrAbsPath || '') : '');

    if (!targetDir || !fs.existsSync(targetDir)) {
      return { success: false, error: 'Directory does not exist', entries: [] };
    }

    // Only exclude internal version control and tool caches; do NOT exclude node_modules so users can inspect dependencies
    const hiddenOrNoise = new Set(['.git', '.output', '.wrangler', '.vite']);
    const dirents = await fs.promises.readdir(targetDir, { withFileTypes: true });
    const entries = dirents
      .filter((d) => !hiddenOrNoise.has(d.name))
      .map((d) => {
        const fullPath = path.join(targetDir, d.name);
        const relPath = path.relative(workspaceRoot, fullPath);
        return {
          name: d.name,
          path: fullPath,
          relativePath: relPath,
          isDirectory: d.isDirectory(),
          extension: d.isDirectory() ? '' : path.extname(d.name).toLowerCase().replace('.', ''),
        };
      })
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

    return { success: true, root: workspaceRoot, currentDir: targetDir, entries };
  } catch (err) {
    console.error('[Electron] fs.readDirectory error:', err.message);
    return { success: false, error: err.message, entries: [] };
  }
});

const TREE_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.output',
  '.wrangler',
  '.vite',
  '.next',
  'dist',
  'build',
  '.cache',
  '.turbo',
  '.gemini',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.DS_Store',
]);

async function scanDirectoryTreeHelper(rawTargetDir, maxDepth = 4, maxEntries = 350) {
  const targetDir = resolveExistingPath(rawTargetDir);
  if (!targetDir || !fs.existsSync(targetDir)) {
    return { success: false, error: 'Directory does not exist', treeString: '', entries: [] };
  }

  const stat = await fs.promises.stat(targetDir);
  if (!stat.isDirectory()) {
    return { success: false, error: 'Target path is not a directory', treeString: '', entries: [] };
  }

  const dirName = path.basename(targetDir) || targetDir;
  const entries = [];
  let totalFiles = 0;
  let totalDirs = 0;
  let truncated = false;

  async function walk(currentDir, currentDepth, prefix) {
    if (currentDepth > maxDepth || entries.length >= maxEntries) {
      if (entries.length >= maxEntries) truncated = true;
      return [];
    }

    let dirents;
    try {
      dirents = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const filtered = dirents.filter((d) => !TREE_IGNORE_DIRS.has(d.name) && !d.name.startsWith('.git'));
    filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const lines = [];
    for (let i = 0; i < filtered.length; i++) {
      if (entries.length >= maxEntries) {
        truncated = true;
        lines.push(`${prefix}└── ... (additional items truncated)`);
        break;
      }

      const d = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      const fullPath = path.join(currentDir, d.name);
      const relPath = path.relative(targetDir, fullPath).replace(/\\/g, '/');

      if (d.isDirectory()) {
        totalDirs++;
        entries.push({ name: d.name, relativePath: relPath, isDirectory: true });
        lines.push(`${prefix}${connector}${d.name}/`);
        const subLines = await walk(fullPath, currentDepth + 1, childPrefix);
        lines.push(...subLines);
      } else {
        totalFiles++;
        entries.push({ name: d.name, relativePath: relPath, isDirectory: false });
        lines.push(`${prefix}${connector}${d.name}`);
      }
    }
    return lines;
  }

  const treeLines = [`${dirName}/`, ...(await walk(targetDir, 1, ''))];
  const treeString = treeLines.join('\n');

  let packageInfo = null;
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = JSON.parse(await fs.promises.readFile(pkgPath, 'utf8'));
      packageInfo = {
        name: raw.name || dirName,
        version: raw.version || '1.0.0',
        description: raw.description || '',
        main: raw.main,
        scripts: Object.keys(raw.scripts || {}),
        dependencies: Object.keys(raw.dependencies || {}),
        devDependencies: Object.keys(raw.devDependencies || {}),
      };
    } catch {}
  }

  let readmePreview = null;
  const readmePath = path.join(targetDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    try {
      const rm = await fs.promises.readFile(readmePath, 'utf8');
      readmePreview = rm.slice(0, 600);
    } catch {}
  }

  return {
    success: true,
    dir: targetDir,
    name: dirName,
    treeString,
    entries,
    totalFiles,
    totalDirs,
    truncated,
    packageInfo,
    readmePreview,
  };
}

ipcMain.handle('fs.scanTree', async (_event, targetPathOrOpts = {}, maybeOpts = {}) => {
  try {
    let target = '';
    let maxDepth = 4;
    let maxEntries = 350;

    if (typeof targetPathOrOpts === 'string') {
      target = targetPathOrOpts;
      if (maybeOpts.maxDepth) maxDepth = maybeOpts.maxDepth;
      if (maybeOpts.maxEntries) maxEntries = maybeOpts.maxEntries;
    } else if (targetPathOrOpts && typeof targetPathOrOpts === 'object') {
      target = targetPathOrOpts.dirPath || targetPathOrOpts.path || '';
      if (targetPathOrOpts.maxDepth) maxDepth = targetPathOrOpts.maxDepth;
      if (targetPathOrOpts.maxEntries) maxEntries = targetPathOrOpts.maxEntries;
    }

    const resolved = target
      ? (path.isAbsolute(target) ? target : path.join(workspaceRoot, target))
      : workspaceRoot;

    return await scanDirectoryTreeHelper(resolved, maxDepth, maxEntries);
  } catch (err) {
    console.error('[Electron] fs.scanTree error:', err.message);
    return { success: false, error: err.message, treeString: '', entries: [] };
  }
});

ipcMain.handle('fs.readFile', async (_event, filePath) => {
  try {
    let targetPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);

    // If relative path does not exist under workspaceRoot, check terminal sessions' cwd
    if (!fs.existsSync(targetPath) && !path.isAbsolute(filePath)) {
      const sessions = ptyManager.getSessions() || [];
      for (const s of sessions) {
        if (s.cwd) {
          const candidate = path.join(s.cwd, filePath);
          if (fs.existsSync(candidate)) {
            targetPath = candidate;
            break;
          }
        }
      }
    }

    const content = await fs.promises.readFile(targetPath, 'utf-8');
    return { success: true, content, path: targetPath };
  } catch (err) {
    console.error('[Electron] fs.readFile error:', err.message);
    return { success: false, error: err.message, content: '' };
  }
});

ipcMain.handle('fs.writeFile', async (_event, { filePath, content }) => {
  try {
    const targetPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, content, 'utf-8');
    return { success: true, path: targetPath };
  } catch (err) {
    console.error('[Electron] fs.writeFile error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs.createFile', async (_event, filePath) => {
  try {
    const targetPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    if (!fs.existsSync(targetPath)) {
      await fs.promises.writeFile(targetPath, '', 'utf-8');
    }
    return { success: true, path: targetPath };
  } catch (err) {
    console.error('[Electron] fs.createFile error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs.createDirectory', async (_event, dirPath) => {
  try {
    const targetPath = path.isAbsolute(dirPath) ? dirPath : path.join(workspaceRoot, dirPath);
    await fs.promises.mkdir(targetPath, { recursive: true });
    return { success: true, path: targetPath };
  } catch (err) {
    console.error('[Electron] fs.createDirectory error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs.deletePath', async (_event, targetPath) => {
  try {
    const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(workspaceRoot, targetPath);
    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(fullPath);
    }
    return { success: true };
  } catch (err) {
    console.error('[Electron] fs.deletePath error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs.renamePath', async (_event, { oldPath, newPath }) => {
  try {
    const fromPath = path.isAbsolute(oldPath) ? oldPath : path.join(workspaceRoot, oldPath);
    const toPath = path.isAbsolute(newPath) ? newPath : path.join(workspaceRoot, newPath);
    await fs.promises.rename(fromPath, toPath);
    return { success: true, newPath: toPath };
  } catch (err) {
    console.error('[Electron] fs.renamePath error:', err.message);
    return { success: false, error: err.message };
  }
});

// Workspace File Search
ipcMain.handle('fs.search', async (_event, { query, caseSensitive = false }) => {
  if (!query || typeof query !== 'string') return { success: true, results: [], count: 0 };
  const q = caseSensitive ? query : query.toLowerCase();
  const results = [];
  const maxMatches = 120;

  async function searchDir(dir) {
    if (results.length >= maxMatches) return;
    try {
      const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const d of dirents) {
        if (results.length >= maxMatches) break;
        if (['node_modules', '.git', '.output', '.vite', 'dist', 'build', '.cache', '__pycache__'].includes(d.name)) continue;
        const full = path.join(dir, d.name);
        if (d.isDirectory()) {
          await searchDir(full);
        } else if (d.isFile()) {
          try {
            const stat = await fs.promises.stat(full);
            if (stat.size > 1024 * 512) continue; // Skip files > 512KB
            const content = await fs.promises.readFile(full, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const check = caseSensitive ? line : line.toLowerCase();
              if (check.includes(q)) {
                results.push({
                  file: path.relative(workspaceRoot, full),
                  fullPath: full,
                  line: i + 1,
                  content: line.trim(),
                });
                if (results.length >= maxMatches) break;
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  await searchDir(workspaceRoot);
  return { success: true, results, count: results.length };
});

// ── Git & GitHub Full Integration ──────────────────────────────────────────
function broadcastGitStatusChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('git.statusChanged');
  }
}

function execGitCmd(cmd, cwd = workspaceRoot, token = null) {
  const { exec } = require('child_process');
  let finalCmd = cmd;
  if (token) {
    const authHeader = `AUTHORIZATION: basic ${Buffer.from('x-access-token:' + token).toString('base64')}`;
    finalCmd = `git -c http.extraHeader="${authHeader}" ${cmd}`;
  } else if (!finalCmd.startsWith('git ')) {
    finalCmd = `git ${finalCmd}`;
  }
  return new Promise((resolve) => {
    exec(finalCmd, { cwd: cwd || workspaceRoot, maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ success: false, error: (stderr || err.message || '').trim(), stdout: (stdout || '').trim() });
      }
      return resolve({ success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

function parseGitHubRepoName(url) {
  if (!url) return '';
  const match = url.match(/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git|\/|$)/);
  return match ? `${match[1]}/${match[2]}` : '';
}

ipcMain.handle('git.status', async () => {
  try {
    const checkRepo = await execGitCmd('rev-parse --is-inside-work-tree');
    if (!checkRepo.success) {
      return {
        success: true,
        isRepo: false,
        branch: '',
        remoteUrl: '',
        repoName: '',
        upstream: '',
        ahead: 0,
        behind: 0,
        outgoingCommits: [],
        recentCommits: [],
        files: [],
        stagedFiles: [],
        unstagedFiles: [],
        count: 0,
      };
    }

    const [statusRes, branchRes, remoteRes, upstreamRes] = await Promise.all([
      execGitCmd('status --porcelain'),
      execGitCmd('rev-parse --abbrev-ref HEAD'),
      execGitCmd('remote get-url origin'),
      execGitCmd('rev-parse --abbrev-ref --symbolic-full-name @{u}'),
    ]);

    const branch = branchRes.success && branchRes.stdout !== 'HEAD' ? branchRes.stdout : 'main';
    const remoteUrl = remoteRes.success ? remoteRes.stdout : '';
    const repoName = parseGitHubRepoName(remoteUrl);
    const upstream = upstreamRes.success ? upstreamRes.stdout : '';

    let ahead = 0;
    let behind = 0;
    let outgoingCommits = [];
    let recentCommits = [];

    if (upstream) {
      const countsRes = await execGitCmd(`rev-list --left-right --count ${upstream}...HEAD`);
      if (countsRes.success && countsRes.stdout) {
        const parts = countsRes.stdout.split(/\s+/).map((n) => parseInt(n, 10) || 0);
        behind = parts[0] || 0;
        ahead = parts[1] || 0;
      }
      if (ahead > 0) {
        const outLog = await execGitCmd(`log ${upstream}..HEAD --pretty=format:"%h%x09%an%x09%ar%x09%s" -n 20`);
        if (outLog.success && outLog.stdout) {
          outgoingCommits = outLog.stdout.split('\n').filter(Boolean).map((line) => {
            const [hash, author, date, message] = line.split('\t');
            return { hash: hash || '', author: author || '', date: date || '', message: message || '' };
          });
        }
      }
    } else if (remoteUrl) {
      // Remote exists, check if origin/<branch> exists
      const checkOriginBranch = await execGitCmd(`rev-parse --verify origin/${branch}`);
      if (checkOriginBranch.success) {
        const countsRes = await execGitCmd(`rev-list --left-right --count origin/${branch}...HEAD`);
        if (countsRes.success && countsRes.stdout) {
          const parts = countsRes.stdout.split(/\s+/).map((n) => parseInt(n, 10) || 0);
          behind = parts[0] || 0;
          ahead = parts[1] || 0;
        }
        if (ahead > 0) {
          const outLog = await execGitCmd(`log origin/${branch}..HEAD --pretty=format:"%h%x09%an%x09%ar%x09%s" -n 20`);
          if (outLog.success && outLog.stdout) {
            outgoingCommits = outLog.stdout.split('\n').filter(Boolean).map((line) => {
              const [hash, author, date, message] = line.split('\t');
              return { hash: hash || '', author: author || '', date: date || '', message: message || '' };
            });
          }
        }
      } else {
        // Brand new branch not yet pushed to origin
        const countRes = await execGitCmd('rev-list --count HEAD');
        if (countRes.success && countRes.stdout) {
          ahead = parseInt(countRes.stdout, 10) || 0;
        }
        if (ahead > 0) {
          const outLog = await execGitCmd('log -n 20 --pretty=format:"%h%x09%an%x09%ar%x09%s"');
          if (outLog.success && outLog.stdout) {
            outgoingCommits = outLog.stdout.split('\n').filter(Boolean).map((line) => {
              const [hash, author, date, message] = line.split('\t');
              return { hash: hash || '', author: author || '', date: date || '', message: message || '' };
            });
          }
        }
      }
    }

    // Load recent commits (up to 10)
    const recentLog = await execGitCmd('log -n 10 --pretty=format:"%h%x09%an%x09%ar%x09%s"');
    if (recentLog.success && recentLog.stdout) {
      recentCommits = recentLog.stdout.split('\n').filter(Boolean).map((line) => {
        const [hash, author, date, message] = line.split('\t');
        return { hash: hash || '', author: author || '', date: date || '', message: message || '' };
      });
    }

    const lines = (statusRes.stdout || '').split('\n').filter(Boolean);
    const files = [];
    const stagedFiles = [];
    const unstagedFiles = [];

    lines.forEach((l) => {
      const x = l.substring(0, 1);
      const y = l.substring(1, 2);
      const relPath = l.substring(3).trim();
      const fullPath = path.join(workspaceRoot, relPath);
      const isUntracked = x === '?' && y === '?';
      const isStaged = !isUntracked && x !== ' ' && x !== '?';
      const isUnstaged = !isUntracked && (y !== ' ' && y !== '?');

      const fileItem = {
        status: l.substring(0, 2).trim(),
        path: relPath,
        fullPath,
        isStaged,
        isUnstaged: isUnstaged || isUntracked,
        isUntracked,
      };

      files.push(fileItem);
      if (isStaged) stagedFiles.push(fileItem);
      if (isUnstaged || isUntracked) unstagedFiles.push(fileItem);
    });

    return {
      success: true,
      isRepo: true,
      branch,
      remoteUrl,
      repoName,
      upstream,
      ahead,
      behind,
      outgoingCommits,
      recentCommits,
      files,
      stagedFiles,
      unstagedFiles,
      count: files.length,
    };
  } catch (err) {
    return {
      success: false,
      isRepo: false,
      error: err.message,
      files: [],
      count: 0,
      ahead: 0,
      behind: 0,
      outgoingCommits: [],
      recentCommits: [],
    };
  }
});

ipcMain.handle('git.init', async () => {
  try {
    const initRes = await execGitCmd('init', workspaceRoot);
    if (!initRes.success) return initRes;
    await execGitCmd('branch -M main', workspaceRoot);

    // If no .gitignore exists, create a default one
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const defaultGitignore = `node_modules/\n.output/\n.next/\n.vite/\ndist/\nbuild/\n.cache/\n.env\n.env.local\n.DS_Store\n`;
      fs.writeFileSync(gitignorePath, defaultGitignore, 'utf8');
    }

    broadcastGitStatusChanged();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git.stage', async (_event, filePath) => {
  const target = filePath ? `"${filePath}"` : '-A';
  const res = await execGitCmd(`add ${target}`);
  broadcastGitStatusChanged();
  return res;
});

ipcMain.handle('git.unstage', async (_event, filePath) => {
  const target = filePath ? `"${filePath}"` : '.';
  const res = await execGitCmd(`restore --staged ${target}`);
  broadcastGitStatusChanged();
  return res;
});

ipcMain.handle('git.discard', async (_event, { filePath, isUntracked }) => {
  if (!filePath) return { success: false, error: 'Path required' };
  let res;
  if (isUntracked) {
    res = await execGitCmd(`clean -f -d "${filePath}"`);
  } else {
    res = await execGitCmd(`restore "${filePath}"`);
  }
  broadcastGitStatusChanged();
  return res;
});

ipcMain.handle('git.commit', async (_event, { message, stageAll = true }) => {
  if (!message || !message.trim()) return { success: false, error: 'Commit message is required' };
  const safeMsg = message.trim().replace(/"/g, '\\"');
  if (stageAll) {
    const addRes = await execGitCmd('add -A');
    if (!addRes.success) return addRes;
  }
  const res = await execGitCmd(`commit -m "${safeMsg}"`);
  broadcastGitStatusChanged();
  return res;
});

ipcMain.handle('git.push', async (_event, options = {}) => {
  const { branch, remote = 'origin', force = false, setUpstream = true, token } = options;
  let targetBranch = branch;
  if (!targetBranch) {
    const branchRes = await execGitCmd('rev-parse --abbrev-ref HEAD');
    targetBranch = branchRes.success ? branchRes.stdout : 'main';
  }
  const cmd = `push ${setUpstream ? '-u ' : ''}${remote} ${targetBranch}${force ? ' --force' : ''}`;
  const res = await execGitCmd(cmd, workspaceRoot, token);
  broadcastGitStatusChanged();
  return res;
});

ipcMain.handle('git.pull', async (_event, options = {}) => {
  const { remote = 'origin', branch, token } = options;
  const cmd = `pull --rebase ${remote} ${branch || ''}`.trim();
  const res = await execGitCmd(cmd, workspaceRoot, token);
  broadcastGitStatusChanged();
  return res;
});

ipcMain.handle('git.fetch', async (_event, options = {}) => {
  const { remote = 'origin', token } = options;
  const res = await execGitCmd(`fetch ${remote}`, workspaceRoot, token);
  broadcastGitStatusChanged();
  return res;
});

ipcMain.handle('git.setRemote', async (_event, { url, remote = 'origin' }) => {
  if (!url) return { success: false, error: 'Remote URL is required' };
  const checkRes = await execGitCmd(`remote get-url ${remote}`);
  let res;
  if (checkRes.success) {
    res = await execGitCmd(`remote set-url ${remote} "${url}"`);
  } else {
    res = await execGitCmd(`remote add ${remote} "${url}"`);
  }
  broadcastGitStatusChanged();
  return res;
});

ipcMain.handle('git.clone', async (_event, { url, targetDir, token }) => {
  if (!url) return { success: false, error: 'Clone repository URL is required' };
  let dest = targetDir;
  if (!dest) {
    const repoSlug = url.split('/').pop()?.replace(/\.git$/, '') || 'repository';
    const downloadsDir = app.getPath('downloads');
    dest = path.join(downloadsDir, repoSlug);
    let counter = 1;
    while (fs.existsSync(dest)) {
      dest = path.join(downloadsDir, `${repoSlug}-${counter++}`);
    }
  }

  const cloneRes = await execGitCmd(`clone "${url}" "${dest}"`, path.dirname(dest), token);
  if (!cloneRes.success) {
    return cloneRes;
  }

  // Auto-switch workspace root to newly cloned project
  workspaceRoot = dest;
  setupFsWatcher(workspaceRoot);
  ptyManager.cdAllSessions(workspaceRoot);
  if (mainWindow) {
    mainWindow.webContents.send('workspace.rootChanged', {
      root: workspaceRoot,
      name: path.basename(workspaceRoot),
    });
  }
  broadcastGitStatusChanged();

  return {
    success: true,
    folderPath: workspaceRoot,
    folderName: path.basename(workspaceRoot),
    output: cloneRes.stdout,
  };
});

// GitHub API Integration (User profile, Fork, Create Repo)
ipcMain.handle('github.getUser', async (_event, { token }) => {
  if (!token) return { success: false, error: 'GitHub Personal Access Token is required' };
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'THIRD_EYE_IDE',
      },
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { success: false, error: errBody.message || `GitHub error: HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      success: true,
      user: {
        login: data.login,
        name: data.name || data.login,
        avatar_url: data.avatar_url,
        html_url: data.html_url,
        bio: data.bio || '',
        public_repos: data.public_repos || 0,
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('github.fork', async (_event, { token, repoOwner, repoName, targetDir }) => {
  if (!token) return { success: false, error: 'GitHub token required for forking' };
  if (!repoOwner || !repoName) return { success: false, error: 'repoOwner and repoName required' };

  try {
    const forkRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/forks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'THIRD_EYE_IDE',
      },
    });

    if (!forkRes.ok) {
      const errBody = await forkRes.json().catch(() => ({}));
      return { success: false, error: errBody.message || `Failed to fork: HTTP ${forkRes.status}` };
    }

    const forkData = await forkRes.json();
    const cloneUrl = forkData.clone_url;
    const destName = forkData.name || repoName;
    const downloadsDir = app.getPath('downloads');
    let dest = targetDir || path.join(downloadsDir, destName);

    let counter = 1;
    while (fs.existsSync(dest)) {
      dest = path.join(downloadsDir, `${destName}-${counter++}`);
    }

    // Clone user's newly created fork
    const cloneRes = await execGitCmd(`clone "${cloneUrl}" "${dest}"`, path.dirname(dest), token);
    if (!cloneRes.success) {
      return { success: false, error: `Fork created on GitHub, but clone failed: ${cloneRes.error}` };
    }

    // Set upstream remote pointing to the original repo
    await execGitCmd(`remote add upstream https://github.com/${repoOwner}/${repoName}.git`, dest);

    // Switch workspace to cloned fork
    workspaceRoot = dest;
    setupFsWatcher(workspaceRoot);
    ptyManager.cdAllSessions(workspaceRoot);
    if (mainWindow) {
      mainWindow.webContents.send('workspace.rootChanged', {
        root: workspaceRoot,
        name: path.basename(workspaceRoot),
      });
    }
    broadcastGitStatusChanged();

    return {
      success: true,
      forkUrl: forkData.html_url,
      cloneUrl: forkData.clone_url,
      folderPath: workspaceRoot,
      folderName: path.basename(workspaceRoot),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('github.createRepo', async (_event, { token, name, description = '', isPrivate = false }) => {
  if (!token) return { success: false, error: 'GitHub token required' };
  if (!name || !name.trim()) return { success: false, error: 'Repository name required' };

  try {
    // 1. Ensure workspaceRoot is an initialized Git repo
    const checkRepo = await execGitCmd('rev-parse --is-inside-work-tree', workspaceRoot);
    if (!checkRepo.success) {
      await execGitCmd('init', workspaceRoot);
      await execGitCmd('branch -M main', workspaceRoot);
    }

    // 2. Ensure basic .gitignore exists so node_modules / build files are not uploaded
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const defaultGitignore = `node_modules/\n.output/\n.next/\n.vite/\ndist/\nbuild/\n.cache/\n.env\n.env.local\n.DS_Store\n`;
      fs.writeFileSync(gitignorePath, defaultGitignore, 'utf8');
    }

    // 3. Ensure there is at least one commit
    const checkHead = await execGitCmd('rev-parse HEAD', workspaceRoot);
    if (!checkHead.success) {
      await execGitCmd('add -A', workspaceRoot);
      await execGitCmd('commit -m "Initial commit"', workspaceRoot);
      await execGitCmd('branch -M main', workspaceRoot);
    }

    // 4. Create repository on GitHub via API
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'THIRD_EYE_IDE',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
        private: Boolean(isPrivate),
        auto_init: false,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { success: false, error: errBody.message || `Failed to create repo on GitHub: HTTP ${res.status}` };
    }

    const repoData = await res.json();
    const remoteUrl = repoData.clone_url;

    // 5. Configure remote origin
    const checkRemote = await execGitCmd('remote get-url origin', workspaceRoot);
    if (checkRemote.success) {
      await execGitCmd(`remote set-url origin "${remoteUrl}"`, workspaceRoot);
    } else {
      await execGitCmd(`remote add origin "${remoteUrl}"`, workspaceRoot);
    }

    // 6. Push code to GitHub
    const branchRes = await execGitCmd('rev-parse --abbrev-ref HEAD', workspaceRoot);
    const activeBranch = branchRes.success && branchRes.stdout !== 'HEAD' ? branchRes.stdout : 'main';
    const pushRes = await execGitCmd(`push -u origin ${activeBranch}`, workspaceRoot, token);
    broadcastGitStatusChanged();

    return {
      success: true,
      repoUrl: repoData.html_url,
      cloneUrl: repoData.clone_url,
      pushResult: pushRes,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Real-time Filesystem Watcher (Phase 2: Chokidar + Typed Events)
let chokidar = null;
try {
  chokidar = require(path.join(__dirname, '../node_modules/chokidar'));
} catch (e) {
  try {
    chokidar = require('chokidar');
  } catch (e2) {
    console.warn('[Electron] Chokidar not loaded, falling back to fs.watch');
  }
}

let fsWatcher = null;
let fsWatchDebounce = null;

function setupFsWatcher(targetDir) {
  if (fsWatcher) {
    try { fsWatcher.close(); } catch {}
    fsWatcher = null;
  }
  const cleanDir = resolveExistingPath(targetDir);
  if (!cleanDir || !fs.existsSync(cleanDir)) return;

  if (chokidar) {
    try {
      fsWatcher = chokidar.watch(cleanDir, {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.output/**',
          '**/.vite/**',
          '**/dist/**',
          '**/.wrangler/**',
        ],
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 150,
          pollInterval: 50,
        },
      });

      fsWatcher.on('all', (event, filePath) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const payload = {
            type: event,
            path: filePath,
            eventType: event,
            filename: path.relative(cleanDir, filePath),
          };
          mainWindow.webContents.send('files.watchEvent', payload);
          mainWindow.webContents.send('fs.watchEvent', payload);
        }
      });
      console.log(`[Electron] Chokidar file watcher initialized on: ${cleanDir}`);
      return;
    } catch (err) {
      console.warn('[Electron] Chokidar init error, falling back to fs.watch:', err.message);
    }
  }

  try {
    fsWatcher = fs.watch(cleanDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (
        filename.includes('node_modules') ||
        filename.includes('.git') ||
        filename.includes('.output') ||
        filename.includes('.vite')
      ) {
        return;
      }
      if (fsWatchDebounce) clearTimeout(fsWatchDebounce);
      fsWatchDebounce = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const fullPath = path.join(cleanDir, filename);
          const payload = { eventType, filename, type: eventType, path: fullPath };
          mainWindow.webContents.send('files.watchEvent', payload);
          mainWindow.webContents.send('fs.watchEvent', payload);
        }
      }, 200);
    });
    console.log(`[Electron] Native fs.watch initialized on: ${cleanDir}`);
  } catch (err) {
    console.warn('[Electron] fs.watch setup warning:', err.message);
  }
}

setupFsWatcher(workspaceRoot);

/* ==========================================================================
   TYPED IPC ALIAS HANDLERS (Phase 1 Contract Layer)
   ========================================================================== */
ipcMain.handle('files.read', async (_event, filePath) => {
  const p = typeof filePath === 'object' ? filePath.path : filePath;
  let targetPath = path.isAbsolute(p) ? p : path.join(workspaceRoot, p);
  if (!fs.existsSync(targetPath) && !path.isAbsolute(p)) {
    const sessions = ptyManager.getSessions() || [];
    for (const s of sessions) {
      if (s.cwd) {
        const candidate = path.join(s.cwd, p);
        if (fs.existsSync(candidate)) {
          targetPath = candidate;
          break;
        }
      }
    }
  }
  try {
    const content = await fs.promises.readFile(targetPath, 'utf-8');
    return { success: true, content, path: targetPath };
  } catch (err) {
    return { success: false, error: err.message, content: '' };
  }
});

ipcMain.handle('files.write', async (_event, payload) => {
  const p = typeof payload === 'object' ? (payload.path || payload.filePath) : payload;
  const content = payload.content !== undefined ? payload.content : '';
  const targetPath = path.isAbsolute(p) ? p : path.join(workspaceRoot, p);
  try {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, content, 'utf-8');
    return { success: true, path: targetPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('files.create', async (_event, payload) => {
  const p = typeof payload === 'object' ? (payload.path || payload.filePath) : payload;
  const isDir = Boolean(payload && payload.isDirectory);
  const targetPath = path.isAbsolute(p) ? p : path.join(workspaceRoot, p);
  try {
    if (isDir) {
      await fs.promises.mkdir(targetPath, { recursive: true });
    } else {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      if (!fs.existsSync(targetPath)) {
        await fs.promises.writeFile(targetPath, '', 'utf-8');
      }
    }
    return { success: true, path: targetPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('files.delete', async (_event, payload) => {
  const p = typeof payload === 'object' ? (payload.path || payload.targetPath) : payload;
  const fullPath = path.isAbsolute(p) ? p : path.join(workspaceRoot, p);
  try {
    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(fullPath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('files.rename', async (_event, payload) => {
  const oldP = payload.oldPath;
  const newP = payload.newPath;
  const fromPath = path.isAbsolute(oldP) ? oldP : path.join(workspaceRoot, oldP);
  const toPath = path.isAbsolute(newP) ? newP : path.join(workspaceRoot, newP);
  try {
    await fs.promises.rename(fromPath, toPath);
    return { success: true, newPath: toPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('files.getWorkspaceRoot', async () => {
  return workspaceRoot;
});

ipcMain.handle('files.readDirectory', async (_event, dirPath) => {
  const targetDir = dirPath ? (path.isAbsolute(dirPath) ? dirPath : path.join(workspaceRoot, dirPath)) : workspaceRoot;
  try {
    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
    const formatted = entries.map((e) => {
      const full = path.join(targetDir, e.name);
      return {
        name: e.name,
        path: full,
        relativePath: path.relative(workspaceRoot, full),
        isDirectory: e.isDirectory(),
        extension: path.extname(e.name).replace('.', ''),
      };
    });
    return { success: true, root: workspaceRoot, currentDir: targetDir, entries: formatted };
  } catch (err) {
    return { success: false, error: err.message, entries: [] };
  }
});

ipcMain.handle('files.scanTree', async (_event, targetPathOrOpts = {}, maybeOpts = {}) => {
  let targetPath = '';
  let options = {};
  if (typeof targetPathOrOpts === 'string') {
    targetPath = targetPathOrOpts;
    options = maybeOpts || {};
  } else if (typeof targetPathOrOpts === 'object') {
    options = targetPathOrOpts || {};
    targetPath = options.dirPath || options.dir || '';
  }
  const cleanTarget = resolveExistingPath(targetPath) || workspaceRoot;
  return scanDirectoryTree(cleanTarget, options);
});

ipcMain.handle('files.search', async (_event, { query, caseSensitive = false }) => {
  return searchWorkspaceFiles(query, { caseSensitive, workspaceRoot });
});

ipcMain.on('terminal.write', (_event, { id, data }) => {
  if (id && data !== undefined) {
    ptyManager.write(id, data);
  }
});

ipcMain.handle('agent.chat', async (_event, params) => {
  try {
    return await aiEngine.chatWithTerminalContext(params);
  } catch (err) {
    return { success: false, reply: `[AI Engine Error] ${err.message}` };
  }
});

ipcMain.handle('agent.cancel', async (_event, { sessionId }) => {
  return { success: true, sessionId };
});

ipcMain.handle('agent.permissionDecision', async (_event, decision) => {
  return { success: true, decision };
});

ipcMain.handle('agent.revertCheckpoint', async (_event, { checkpointId }) => {
  return { success: true, checkpointId };
});

ipcMain.handle('git.diff', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec('git diff', { cwd: workspaceRoot }, (err, stdout) => {
      resolve({ diff: stdout || '', error: err ? err.message : null });
    });
  });
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
