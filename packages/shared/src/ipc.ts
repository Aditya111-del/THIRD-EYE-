/**
 * Unified IPC Channel Definitions and Type-Safe Request/Response Contracts
 * No raw untyped strings across IPC boundaries.
 */

export const IPC_CHANNELS = {
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
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// ======================== Request & Response Contracts ========================

export interface FileReadRequest {
  path: string;
}
export interface FileReadResponse {
  success: boolean;
  content: string;
  path?: string;
  error?: string;
}

export interface FileWriteRequest {
  path: string;
  content: string;
}
export interface FileWriteResponse {
  success: boolean;
  path?: string;
  error?: string;
}

export interface FileCreateRequest {
  path: string;
  isDirectory?: boolean;
}
export interface FileCreateResponse {
  success: boolean;
  path?: string;
  error?: string;
}

export interface FileDeleteRequest {
  path: string;
}
export interface FileDeleteResponse {
  success: boolean;
  error?: string;
}

export interface FileRenameRequest {
  oldPath: string;
  newPath: string;
}
export interface FileRenameResponse {
  success: boolean;
  newPath?: string;
  error?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  extension: string;
  size?: number;
}

export interface FileReadDirResponse {
  success: boolean;
  root?: string;
  currentDir?: string;
  entries: FileEntry[];
  error?: string;
}

export interface FileScanTreeRequest {
  dirPath?: string;
  maxDepth?: number;
  maxEntries?: number;
}
export interface FileScanTreeResponse {
  success: boolean;
  dir?: string;
  name?: string;
  treeString?: string;
  entries?: Array<{ name: string; relativePath: string; isDirectory: boolean }>;
  totalFiles?: number;
  totalDirs?: number;
  truncated?: boolean;
  packageInfo?: any;
  readmePreview?: string;
  error?: string;
}

export interface FileSearchRequest {
  query: string;
  caseSensitive?: boolean;
  maxResults?: number;
}
export interface FileSearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
}
export interface FileSearchResponse {
  success: boolean;
  results: FileSearchResult[];
  truncated?: boolean;
  error?: string;
}

// Terminal IPC Contracts
export interface TerminalSpawnRequest {
  id?: string;
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}
export interface TerminalSpawnResponse {
  success: boolean;
  id?: string;
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  error?: string;
}

export interface TerminalSessionItem {
  id: string;
  shell: string;
  cwd: string;
  cols?: number;
  rows?: number;
  createdAt?: number;
}

export interface GitStatusResponse {
  branch: string;
  tracking?: string;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}
