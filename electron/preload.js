const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose secure TermX Desktop APIs to the Renderer process via window.electronAPI
 */
contextBridge.exposeInMainWorld('electronAPI', {
  services: {
    ptyUrl: 'http://localhost:4001',
    aiUrl: 'http://localhost:4002',
    wsUrl: 'ws://localhost:4001/pty/stream',
  },
  terminal: {
    /**
     * Spawn a new PTY session
     * @param {Object} [config] - { id, shell, cwd, cols, rows, env }
     * @returns {Promise<{ id: string, shell: string, cwd: string, cols: number, rows: number }>}
     */
    spawn: (config = {}) => ipcRenderer.invoke('terminal.spawn', config),

    /**
     * Send keystrokes or input text to PTY session
     * @param {string} id - Terminal ID
     * @param {string} data - Characters/keystroke data
     */
    write: (id, data) => ipcRenderer.send('terminal.keystroke', { id, data }),

    /**
     * Resize terminal dimensions
     * @param {string} id - Terminal ID
     * @param {number} cols - Columns
     * @param {number} rows - Rows
     */
    resize: (id, cols, rows) => ipcRenderer.send('terminal.resize', { id, cols, rows }),

    /**
     * Kill terminal session
     * @param {string} id - Terminal ID
     * @returns {Promise<boolean>}
     */
    kill: (id) => ipcRenderer.invoke('terminal.kill', { id }),

    /**
     * List all active terminal sessions
     * @returns {Promise<Array<{ id: string, shell: string, cwd: string, createdAt: number }>>}
     */
    list: () => ipcRenderer.invoke('terminal.list'),

    /**
     * Subscribe to incoming PTY data stream from backend
     * @param {(payload: { id: string, data: string }) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onData: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('terminal.incomingData', handler);
      return () => {
        ipcRenderer.removeListener('terminal.incomingData', handler);
      };
    },

    /**
     * Subscribe to terminal process exit events
     * @param {(payload: { id: string, exitCode: number, signal?: number }) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onExit: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('terminal.exit', handler);
      return () => {
        ipcRenderer.removeListener('terminal.exit', handler);
      };
    },

    /**
     * Change working directory of terminal session(s)
     * @param {string} [id] - Optional session ID
     * @param {string} [dir] - Target directory path
     * @returns {Promise<{ success: boolean }>}
     */
    cd: (id, dir) => ipcRenderer.invoke('terminal.cd', typeof id === 'object' ? id : { id, dir }),

    /**
     * Retrieve live terminal output buffer
     * @param {string} id - Terminal ID
     * @returns {Promise<string>}
     */
    getBuffer: (id) => ipcRenderer.invoke('terminal.getBuffer', { id }),
  },

  ai: {
    /**
     * Analyze recent terminal logs and get root-cause diagnosis + fix command
     * @param {Object} params - { terminalId: string, customPrompt?: string, logCount?: number }
     * @returns {Promise<{
     *   explanation: string,
     *   suggested_command: string,
     *   severity?: string,
     *   root_cause?: string,
     *   timestamp: number
     * }>}
     */
    analyze: (params) => ipcRenderer.invoke('ai.analyze', params),

    /**
     * Chat with AI using real-time terminal buffer context
     * @param {Object} params - { terminalId: string, messages: Array<{role: string, content: string}> }
     * @returns {Promise<{ reply: string }>}
     */
    chat: (params) => ipcRenderer.invoke('ai.chat', params),

    /**
     * Retrieve current buffered lines for a terminal
     * @param {Object} params - { terminalId: string, lineCount?: number }
     * @returns {Promise<string>}
     */
    getBuffer: (params) => ipcRenderer.invoke('ai.getBuffer', params),

    /**
     * Clear buffer for a terminal session
     * @param {string} terminalId
     * @returns {Promise<boolean>}
     */
    clearBuffer: (terminalId) => ipcRenderer.invoke('ai.clearBuffer', { terminalId }),

    /**
     * Subscribe to automated error detection events from the background AI engine
     * @param {(eventData: { terminalId: string, errorSummary: string, snippet: string, timestamp: number }) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onErrorDetected: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('ai.errorDetected', handler);
      return () => {
        ipcRenderer.removeListener('ai.errorDetected', handler);
      };
    },
  },


  window: {
    /**
     * Increase application UI zoom factor by 10%
     * @returns {Promise<number>}
     */
    zoomIn: () => ipcRenderer.invoke('window.zoomIn'),

    /**
     * Decrease application UI zoom factor by 10%
     * @returns {Promise<number>}
     */
    zoomOut: () => ipcRenderer.invoke('window.zoomOut'),

    /**
     * Reset UI zoom to default 100%
     * @returns {Promise<number>}
     */
    resetZoom: () => ipcRenderer.invoke('window.resetZoom'),

    /**
     * Get current zoom factor
     * @returns {Promise<number>}
     */
    getZoom: () => ipcRenderer.invoke('window.getZoom'),

    /**
     * Set explicit zoom factor
     * @param {number} factor
     * @returns {Promise<number>}
     */
    setZoom: (factor) => ipcRenderer.invoke('window.setZoom', factor),

    /**
     * Minimize Electron window
     * @returns {Promise<boolean>}
     */
    minimize: () => ipcRenderer.invoke('window.minimize'),

    /**
     * Close Electron window
     * @returns {Promise<boolean>}
     */
    close: () => ipcRenderer.invoke('window.close'),

    /**
     * Toggle maximize / restore of native Electron window
     * @returns {Promise<boolean>}
     */
    toggleMaximize: () => ipcRenderer.invoke('window.toggleMaximize'),

    /**
     * Check if window is currently maximized
     * @returns {Promise<boolean>}
     */
    isMaximized: () => ipcRenderer.invoke('window.isMaximized'),

    /**
     * Listen for maximized state changes
     * @param {(isMaximized: boolean) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onMaximizedChanged: (callback) => {
      const handler = (_event, isMax) => callback(isMax);
      ipcRenderer.on('window.maximizedChanged', handler);
      return () => ipcRenderer.removeListener('window.maximizedChanged', handler);
    },

    /**
     * Listen for zoom factor changes
     * @param {(zoom: number) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onZoomChanged: (callback) => {
      const handler = (_event, zoom) => callback(zoom);
      ipcRenderer.on('window.zoomChanged', handler);
      return () => ipcRenderer.removeListener('window.zoomChanged', handler);
    },
  },

  clipboard: {
    /**
     * Read plain text from the operating system clipboard
     * @returns {Promise<string>}
     */
    readText: () => ipcRenderer.invoke('clipboard.readText'),

    /**
     * Write plain text to the operating system clipboard
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    writeText: (text) => ipcRenderer.invoke('clipboard.writeText', text),
  },

  fs: {
    getWorkspaceRoot: () => ipcRenderer.invoke('fs.getWorkspaceRoot'),
    readDirectory: (dirPath) => ipcRenderer.invoke('fs.readDirectory', dirPath),
    scanTree: (dirPath, options = {}) => ipcRenderer.invoke('fs.scanTree', dirPath, options),
    readFile: (filePath) => ipcRenderer.invoke('fs.readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs.writeFile', { filePath, content }),
    createFile: (filePath) => ipcRenderer.invoke('fs.createFile', filePath),
    createDirectory: (dirPath) => ipcRenderer.invoke('fs.createDirectory', dirPath),
    deletePath: (targetPath) => ipcRenderer.invoke('fs.deletePath', targetPath),
    renamePath: (oldPath, newPath) => ipcRenderer.invoke('fs.renamePath', { oldPath, newPath }),
    search: (query, options = {}) => ipcRenderer.invoke('fs.search', { query, ...options }),
    onWatchEvent: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('fs.watchEvent', handler);
      return () => {
        ipcRenderer.removeListener('fs.watchEvent', handler);
      };
    },
  },

  git: {
    status: () => ipcRenderer.invoke('git.status'),
    init: () => ipcRenderer.invoke('git.init'),
    stage: (filePath) => ipcRenderer.invoke('git.stage', filePath),
    unstage: (filePath) => ipcRenderer.invoke('git.unstage', filePath),
    discard: (options) => ipcRenderer.invoke('git.discard', options),
    commit: (options) => ipcRenderer.invoke('git.commit', typeof options === 'string' ? { message: options } : options),
    push: (options) => ipcRenderer.invoke('git.push', options),
    pull: (options) => ipcRenderer.invoke('git.pull', options),
    fetch: (options) => ipcRenderer.invoke('git.fetch', options),
    setRemote: (options) => ipcRenderer.invoke('git.setRemote', options),
    clone: (options) => ipcRenderer.invoke('git.clone', options),
    onStatusChanged: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('git.statusChanged', handler);
      return () => ipcRenderer.removeListener('git.statusChanged', handler);
    },
  },

  github: {
    getUser: (options) => ipcRenderer.invoke('github.getUser', options),
    fork: (options) => ipcRenderer.invoke('github.fork', options),
    createRepo: (options) => ipcRenderer.invoke('github.createRepo', options),
  },

  dialog: {
    /**
     * Open native OS folder picker so user can select any folder from device
     * @returns {Promise<{ success: boolean, canceled?: boolean, folderPath?: string, folderName?: string }>}
     */
    openFolder: () => ipcRenderer.invoke('dialog.openFolder'),
  },

  workspace: {
    /**
     * Listen for project/workspace root change events
     * @param {(data: { root: string, name: string }) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onRootChanged: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('workspace.rootChanged', handler);
      return () => ipcRenderer.removeListener('workspace.rootChanged', handler);
    },

    /**
     * Programmatically switch workspace to an arbitrary folder path
     * @param {string} targetPath
     * @returns {Promise<{ success: boolean, folderPath?: string, folderName?: string }>}
     */
    openPath: (targetPath) => ipcRenderer.invoke('workspace.openPath', targetPath),
    openFolder: () => ipcRenderer.invoke('dialog.openFolder'),
    resetToDefault: () => ipcRenderer.invoke('workspace.resetToDefault'),
    close: () => ipcRenderer.invoke('workspace.close'),
  },

  system: {
    /**
     * Get platform default shell
     * @returns {Promise<string>}
     */
    getDefaultShell: () => ipcRenderer.invoke('system.getDefaultShell'),

    /**
     * Get current working directory or user home directory
     * @returns {Promise<string>}
     */
    getCwd: () => ipcRenderer.invoke('system.getCwd'),

    /**
     * Inspect directory files, subdirectories, package.json scripts, and git branch
     * @param {string} [cwd]
     * @returns {Promise<{ cwd: string, directories: string[], files: string[], packageData: any, gitInfo: { branch: string, hasGit: boolean } }>}
     */
    inspectDirectory: (cwd) => ipcRenderer.invoke('system.inspectDirectory', cwd),

    /**
     * Open native host terminal in the specified directory
     * @param {string} [cwd]
     * @returns {Promise<{ success: boolean }>}
     */
    openExternalTerminal: (cwd) => ipcRenderer.invoke('system.openExternalTerminal', cwd),

    /**
     * Relaunch Electron application to load updated main process code and environment
     * @returns {Promise<{ success: boolean }>}
     */
    relaunchApp: () => ipcRenderer.invoke('system.relaunchApp'),

    /** Host OS platform: 'win32' | 'darwin' | 'linux' */
    platform: process.platform,

    /** Electron framework version */
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    },
  },
});

/**
 * Expose Industry-Grade Typed Contract window.thirdEye (Phase 1)
 */
contextBridge.exposeInMainWorld('thirdEye', {
  files: {
    readFile: (filePath) => ipcRenderer.invoke('files.read', typeof filePath === 'object' ? filePath.path : filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('files.write', typeof filePath === 'object' ? filePath : { path: filePath, content }),
    createFile: (filePath) => ipcRenderer.invoke('files.create', typeof filePath === 'object' ? filePath : { path: filePath }),
    createDirectory: (dirPath) => ipcRenderer.invoke('files.create', typeof dirPath === 'object' ? dirPath : { path: dirPath, isDirectory: true }),
    deletePath: (targetPath) => ipcRenderer.invoke('files.delete', typeof targetPath === 'object' ? targetPath : { path: targetPath }),
    renamePath: (oldPath, newPath) => ipcRenderer.invoke('files.rename', typeof oldPath === 'object' ? oldPath : { oldPath, newPath }),
    readDirectory: (dirPath) => ipcRenderer.invoke('files.readDirectory', dirPath),
    scanTree: (dirPath, options = {}) => ipcRenderer.invoke('files.scanTree', dirPath, options),
    search: (query, options = {}) => ipcRenderer.invoke('files.search', { query, ...options }),
    getWorkspaceRoot: () => ipcRenderer.invoke('files.getWorkspaceRoot'),
    onWatchEvent: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('files.watchEvent', handler);
      return () => ipcRenderer.removeListener('files.watchEvent', handler);
    },
  },

  terminal: {
    spawn: (config = {}) => ipcRenderer.invoke('terminal.spawn', config),
    write: (id, data) => {
      ipcRenderer.send('terminal.write', { id, data });
      ipcRenderer.send('terminal.keystroke', { id, data });
    },
    resize: (id, cols, rows) => ipcRenderer.send('terminal.resize', { id, cols, rows }),
    kill: (id) => ipcRenderer.invoke('terminal.kill', { id }),
    list: () => ipcRenderer.invoke('terminal.list'),
    cd: (id, dir) => ipcRenderer.invoke('terminal.cd', typeof id === 'object' ? id : { id, dir }),
    getBuffer: (id) => ipcRenderer.invoke('terminal.getBuffer', { id }),
    onData: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('terminal.incomingData', handler);
      return () => ipcRenderer.removeListener('terminal.incomingData', handler);
    },
    onExit: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('terminal.exit', handler);
      return () => ipcRenderer.removeListener('terminal.exit', handler);
    },
  },

  agent: {
    chat: (params) => ipcRenderer.invoke('agent.chat', params),
    cancel: (sessionId) => ipcRenderer.invoke('agent.cancel', { sessionId }),
    sendPermissionDecision: (decision) => ipcRenderer.invoke('agent.permissionDecision', decision),
    revertCheckpoint: (checkpointId) => ipcRenderer.invoke('agent.revertCheckpoint', { checkpointId }),
    onStatus: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('agent.statusStream', handler);
      return () => ipcRenderer.removeListener('agent.statusStream', handler);
    },
    onDelta: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('agent.delta', handler);
      return () => ipcRenderer.removeListener('agent.delta', handler);
    },
    onPermissionRequest: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('agent.permissionRequest', handler);
      return () => ipcRenderer.removeListener('agent.permissionRequest', handler);
    },
  },

  git: {
    status: () => ipcRenderer.invoke('git.status'),
    init: () => ipcRenderer.invoke('git.init'),
    stage: (filePath) => ipcRenderer.invoke('git.stage', filePath),
    unstage: (filePath) => ipcRenderer.invoke('git.unstage', filePath),
    discard: (options) => ipcRenderer.invoke('git.discard', options),
    commit: (options) => ipcRenderer.invoke('git.commit', typeof options === 'string' ? { message: options } : options),
    push: (options) => ipcRenderer.invoke('git.push', options),
    pull: (options) => ipcRenderer.invoke('git.pull', options),
    fetch: (options) => ipcRenderer.invoke('git.fetch', options),
    setRemote: (options) => ipcRenderer.invoke('git.setRemote', options),
    clone: (options) => ipcRenderer.invoke('git.clone', options),
    onStatusChanged: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('git.statusChanged', handler);
      return () => ipcRenderer.removeListener('git.statusChanged', handler);
    },
  },

  github: {
    getUser: (options) => ipcRenderer.invoke('github.getUser', options),
    fork: (options) => ipcRenderer.invoke('github.fork', options),
    createRepo: (options) => ipcRenderer.invoke('github.createRepo', options),
  },

  window: {
    zoomIn: () => ipcRenderer.invoke('window.zoomIn'),
    zoomOut: () => ipcRenderer.invoke('window.zoomOut'),
    resetZoom: () => ipcRenderer.invoke('window.resetZoom'),
    getZoom: () => ipcRenderer.invoke('window.getZoom'),
    setZoom: (factor) => ipcRenderer.invoke('window.setZoom', factor),
    minimize: () => ipcRenderer.invoke('window.minimize'),
    close: () => ipcRenderer.invoke('window.close'),
    toggleMaximize: () => ipcRenderer.invoke('window.toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('window.isMaximized'),
    onMaximizedChanged: (callback) => {
      const handler = (_event, isMax) => callback(isMax);
      ipcRenderer.on('window.maximizedChanged', handler);
      return () => ipcRenderer.removeListener('window.maximizedChanged', handler);
    },
    onZoomChanged: (callback) => {
      const handler = (_event, zoom) => callback(zoom);
      ipcRenderer.on('window.zoomChanged', handler);
      return () => ipcRenderer.removeListener('window.zoomChanged', handler);
    },
  },

  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog.openFolder'),
  },

  workspace: {
    openPath: (targetPath) => ipcRenderer.invoke('workspace.openPath', targetPath),
    openFolder: () => ipcRenderer.invoke('dialog.openFolder'),
    resetToDefault: () => ipcRenderer.invoke('workspace.resetToDefault'),
    onRootChanged: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('workspace.rootChanged', handler);
      return () => ipcRenderer.removeListener('workspace.rootChanged', handler);
    },
  },

  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard.readText'),
    writeText: (text) => ipcRenderer.invoke('clipboard.writeText', text),
  },

  system: {
    getDefaultShell: () => ipcRenderer.invoke('system.getDefaultShell'),
    getCwd: () => ipcRenderer.invoke('system.getCwd'),
    inspectDirectory: (cwd) => ipcRenderer.invoke('system.inspectDirectory', cwd),
    openExternalTerminal: (cwd) => ipcRenderer.invoke('system.openExternalTerminal', cwd),
    relaunchApp: () => ipcRenderer.invoke('system.relaunchApp'),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    },
  },
});
