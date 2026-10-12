"use strict";
/**
 * Unified IPC Channel Definitions and Type-Safe Request/Response Contracts
 * No raw untyped strings across IPC boundaries.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
exports.IPC_CHANNELS = {
    // File System & Models
    FILES_READ: 'files.read',
    FILES_WRITE: 'files.write',
    FILES_CREATE: 'files.create',
    FILES_DELETE: 'files.delete',
    FILES_RENAME: 'files.rename',
    FILES_READ_DIR: 'files.readDirectory',
    FILES_SCAN_TREE: 'files.scanTree',
    FILES_SEARCH: 'files.search',
    FILES_GET_WORKSPACE_ROOT: 'files.getWorkspaceRoot',
    FILES_WATCH_EVENT: 'files.watchEvent',
    // Terminal & PTY
    TERMINAL_SPAWN: 'terminal.spawn',
    TERMINAL_WRITE: 'terminal.write',
    TERMINAL_RESIZE: 'terminal.resize',
    TERMINAL_KILL: 'terminal.kill',
    TERMINAL_LIST: 'terminal.list',
    TERMINAL_GET_BUFFER: 'terminal.getBuffer',
    TERMINAL_CD: 'terminal.cd',
    TERMINAL_DATA_STREAM: 'terminal.incomingData',
    TERMINAL_EXIT: 'terminal.exit',
    // Agent & AI Loop
    AGENT_CHAT: 'agent.chat',
    AGENT_STREAM: 'agent.stream',
    AGENT_CANCEL: 'agent.cancel',
    AGENT_PERMISSION_DECISION: 'agent.permissionDecision',
    AGENT_REVERT_CHECKPOINT: 'agent.revertCheckpoint',
    AGENT_STATUS_STREAM: 'agent.statusStream',
    // Git Subsystem
    GIT_STATUS: 'git.status',
    GIT_COMMIT: 'git.commit',
    GIT_DIFF: 'git.diff',
    // Window Controls
    WINDOW_ZOOM_IN: 'window.zoomIn',
    WINDOW_ZOOM_OUT: 'window.zoomOut',
    WINDOW_RESET_ZOOM: 'window.resetZoom',
    WINDOW_GET_ZOOM: 'window.getZoom',
    WINDOW_SET_ZOOM: 'window.setZoom',
    WINDOW_MINIMIZE: 'window.minimize',
    WINDOW_CLOSE: 'window.close',
    WINDOW_TOGGLE_MAXIMIZE: 'window.toggleMaximize',
    WINDOW_IS_MAXIMIZED: 'window.isMaximized',
    WINDOW_MAXIMIZED_CHANGED: 'window.maximizedChanged',
    WINDOW_ZOOM_CHANGED: 'window.zoomChanged',
    // Native Dialogs & Workspace
    DIALOG_OPEN_FOLDER: 'dialog.openFolder',
    WORKSPACE_OPEN_PATH: 'workspace.openPath',
    WORKSPACE_ROOT_CHANGED: 'workspace.rootChanged',
    // System & Clipboard
    CLIPBOARD_READ_TEXT: 'clipboard.readText',
    CLIPBOARD_WRITE_TEXT: 'clipboard.writeText',
    SYSTEM_GET_DEFAULT_SHELL: 'system.getDefaultShell',
    SYSTEM_GET_CWD: 'system.getCwd',
    SYSTEM_INSPECT_DIRECTORY: 'system.inspectDirectory',
    SYSTEM_OPEN_EXTERNAL_TERMINAL: 'system.openExternalTerminal',
    SYSTEM_RELAUNCH_APP: 'system.relaunchApp',
};
