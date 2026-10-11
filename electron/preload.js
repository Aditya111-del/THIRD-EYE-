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

  salesforce: {
    testConnection: (params) => ipcRenderer.invoke('salesforce.test', params),
    fetchTickets: (params) => ipcRenderer.invoke('salesforce.fetchTickets', params),
    saveConfig: (params) => ipcRenderer.invoke('salesforce.saveConfig', params),
    getConfig: () => ipcRenderer.invoke('salesforce.getConfig'),
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
