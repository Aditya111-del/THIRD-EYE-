export interface TerminalSpawnConfig {
  id?: string | undefined;
  shell?: string | undefined;
  shellType?: 'cmd' | 'powershell' | undefined;
  cwd?: string | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
  env?: Record<string, string> | undefined;
}

export interface TerminalSessionInfo {
  id: string;
  shell: string;
  cwd: string;
  cols?: number | undefined;
  rows?: number | undefined;
  createdAt?: number | undefined;
}

export interface TerminalSpawnResult extends Partial<TerminalSessionInfo> {
  success: boolean;
  error?: string | undefined;
}

export interface AIAnalysisResult {
  success: boolean;
  explanation: string;
  suggested_command: string;
  severity?: 'high' | 'medium' | 'low' | 'info' | undefined;
  root_cause?: string | undefined;
  timestamp: number;
}

export interface AIErrorDetectedEvent {
  terminalId: string;
  errorSummary: string;
  snippet: string;
  timestamp: number;
}

export interface ElectronAPI {
  services?: {
    ptyUrl: string;
    aiUrl: string;
    wsUrl: string;
  } | undefined;
  terminal: {
    spawn: (config?: TerminalSpawnConfig) => Promise<TerminalSpawnResult>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => Promise<{ success: boolean }>;
    list: () => Promise<TerminalSessionInfo[]>;
    cd: (options?: { id?: string; dir?: string } | string, dir?: string) => Promise<{ success: boolean }>;
    getBuffer: (id: string) => Promise<string>;
    onData: (callback: (payload: { id: string; data: string }) => void) => () => void;
    onExit: (
      callback: (payload: { id: string; exitCode: number; signal?: number | undefined }) => void
    ) => () => void;
  };
  dialog?: {
    openFolder: () => Promise<{ success: boolean; canceled?: boolean; folderPath?: string; folderName?: string }>;
  } | undefined;
  workspace?: {
    onRootChanged: (callback: (data: { root: string; name: string }) => void) => () => void;
    openPath: (targetPath: string) => Promise<{ success: boolean; folderPath?: string; folderName?: string }>;
    openFolder?: () => Promise<{ success: boolean; canceled?: boolean; folderPath?: string; folderName?: string }>;
    resetToDefault?: () => Promise<{ success: boolean; folderPath?: string; folderName?: string }>;
    close?: () => Promise<{ success: boolean; folderPath?: string; folderName?: string }>;
  } | undefined;
  ai: {
    analyze: (params: {
      terminalId: string;
      customPrompt?: string | undefined;
      logCount?: number | undefined;
      cwd?: string | undefined;
      recentLines?: string[] | undefined;
    }) => Promise<AIAnalysisResult>;
    chat: (params: {
      terminalId: string;
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
      cwd?: string | undefined;
      recentLines?: string[] | undefined;
      [key: string]: any;
    }) => Promise<{ success: boolean; reply: string }>;
    getBuffer: (params: { terminalId: string; lineCount?: number | undefined }) => Promise<string>;
    clearBuffer: (terminalId: string) => Promise<{ success: boolean }>;
    onErrorDetected: (callback: (event: AIErrorDetectedEvent) => void) => () => void;
  };
  window?: {
    zoomIn: () => Promise<number>;
    zoomOut: () => Promise<number>;
    resetZoom: () => Promise<number>;
    getZoom: () => Promise<number>;
    setZoom: (factor: number) => Promise<number>;
    minimize?: () => Promise<boolean>;
    close?: () => Promise<boolean>;
    toggleMaximize: () => Promise<boolean>;
    isMaximized: () => Promise<boolean>;
    onZoomChanged?: (callback: (zoom: number) => void) => () => void;
    onMaximizedChanged?: (callback: (isMaximized: boolean) => void) => () => void;
  } | undefined;
  clipboard?: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<boolean>;
  } | undefined;
  fs?: {
    getWorkspaceRoot: () => Promise<string>;
    readDirectory: (dirPath?: string) => Promise<{
      success: boolean;
      root?: string;
      currentDir?: string;
      entries: Array<{
        name: string;
        path: string;
        relativePath: string;
        isDirectory: boolean;
        extension: string;
      }>;
      error?: string;
    }>;
    scanTree?: (
      dirPath?: string,
      options?: { maxDepth?: number; maxEntries?: number }
    ) => Promise<{
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
    }>;
    readFile: (filePath: string) => Promise<{ success: boolean; content: string; path?: string; error?: string }>;
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    createFile: (filePath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    createDirectory: (dirPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    deletePath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
    renamePath: (oldPath: string, newPath: string) => Promise<{ success: boolean; newPath?: string; error?: string }>;
    search?: (query: string, options?: any) => Promise<any>;
    onWatchEvent?: (callback: (payload: { type: string; path: string; eventType?: string; filename?: string }) => void) => () => void;
  } | undefined;
  git?: {
    status: () => Promise<{
      success: boolean;
      isRepo?: boolean;
      branch?: string;
      remoteUrl?: string;
      repoName?: string;
      upstream?: string;
      ahead?: number;
      behind?: number;
      files?: Array<{
        status: string;
        path: string;
        fullPath: string;
        isStaged: boolean;
        isUnstaged: boolean;
        isUntracked: boolean;
      }>;
      stagedFiles?: Array<{
        status: string;
        path: string;
        fullPath: string;
        isStaged: boolean;
        isUnstaged: boolean;
        isUntracked: boolean;
      }>;
      unstagedFiles?: Array<{
        status: string;
        path: string;
        fullPath: string;
        isStaged: boolean;
        isUnstaged: boolean;
        isUntracked: boolean;
      }>;
      count?: number;
      outgoingCommits?: Array<{
        hash: string;
        author: string;
        date: string;
        message: string;
      }>;
      recentCommits?: Array<{
        hash: string;
        author: string;
        date: string;
        message: string;
      }>;
      error?: string;
    }>;
    init: () => Promise<{ success: boolean; error?: string | undefined; stdout?: string | undefined }>;
    stage: (filePath?: string | undefined) => Promise<{ success: boolean; error?: string | undefined }>;
    unstage: (filePath?: string | undefined) => Promise<{ success: boolean; error?: string | undefined }>;
    discard: (options: { filePath: string; isUntracked?: boolean | undefined }) => Promise<{ success: boolean; error?: string | undefined }>;
    commit: (options: string | { message: string; stageAll?: boolean | undefined }) => Promise<{ success: boolean; error?: string | undefined; output?: string | undefined }>;
    push: (options?: { branch?: string | undefined; remote?: string | undefined; force?: boolean | undefined; setUpstream?: boolean | undefined; token?: string | undefined } | undefined) => Promise<{ success: boolean; error?: string | undefined; stdout?: string | undefined }>;
    pull: (options?: { remote?: string | undefined; branch?: string | undefined; token?: string | undefined } | undefined) => Promise<{ success: boolean; error?: string | undefined; stdout?: string | undefined }>;
    fetch: (options?: { remote?: string | undefined; token?: string | undefined } | undefined) => Promise<{ success: boolean; error?: string | undefined; stdout?: string | undefined }>;
    setRemote: (options: { url: string; remote?: string | undefined }) => Promise<{ success: boolean; error?: string | undefined }>;
    clone: (options: { url: string; targetDir?: string | undefined; token?: string | undefined }) => Promise<{ success: boolean; error?: string | undefined; folderPath?: string | undefined; folderName?: string | undefined }>;
    onStatusChanged?: (callback: () => void) => () => void;
  } | undefined;
  github?: {
    getUser: (options: { token: string }) => Promise<{
      success: boolean;
      user?: {
        login: string;
        name: string;
        avatar_url: string;
        html_url: string;
        bio?: string | undefined;
        public_repos?: number | undefined;
      } | undefined;
      error?: string | undefined;
    }>;
    fork: (options: { token: string; repoOwner: string; repoName: string; targetDir?: string | undefined }) => Promise<{
      success: boolean;
      forkUrl?: string | undefined;
      cloneUrl?: string | undefined;
      folderPath?: string | undefined;
      folderName?: string | undefined;
      error?: string | undefined;
    }>;
    createRepo: (options: { token: string; name: string; description?: string | undefined; isPrivate?: boolean | undefined }) => Promise<{
      success: boolean;
      repoUrl?: string | undefined;
      cloneUrl?: string | undefined;
      error?: string | undefined;
    }>;
  } | undefined;
  system: {
    getDefaultShell: () => Promise<string>;
    getCwd: () => Promise<string>;
    inspectDirectory?: (cwd?: string) => Promise<{
      cwd: string;
      directories: string[];
      files: string[];
      packageData: any;
      gitInfo: { branch: string; hasGit: boolean };
      error?: string;
    }>;
    openExternalTerminal: (cwd?: string) => Promise<{ success: boolean }>;
    relaunchApp?: (() => Promise<{ success: boolean; error?: string | undefined }>) | undefined;
    platform: 'win32' | 'darwin' | 'linux';
    versions: {
      electron: string;
      node: string;
      chrome: string;
    };
  };
}

export interface ThirdEyeFilesAPI {
  readFile: (filePath: string | { path: string }) => Promise<{ success: boolean; content: string; path?: string; error?: string }>;
  writeFile: (filePath: string | { path: string; content: string }, content?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  createFile: (filePath: string | { path: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
  createDirectory: (dirPath: string | { path: string; isDirectory?: boolean }) => Promise<{ success: boolean; path?: string; error?: string }>;
  deletePath: (targetPath: string | { path: string }) => Promise<{ success: boolean; error?: string }>;
  renamePath: (oldPath: string | { oldPath: string; newPath: string }, newPath?: string) => Promise<{ success: boolean; newPath?: string; error?: string }>;
  readDirectory: (dirPath?: string) => Promise<{
    success: boolean;
    root?: string;
    currentDir?: string;
    entries: Array<{
      name: string;
      path: string;
      relativePath: string;
      isDirectory: boolean;
      extension: string;
      size?: number;
    }>;
    error?: string;
  }>;
  scanTree: (
    dirPath?: string | { dirPath?: string; maxDepth?: number; maxEntries?: number },
    options?: { maxDepth?: number; maxEntries?: number }
  ) => Promise<{
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
  }>;
  search: (query: string, options?: { caseSensitive?: boolean; maxResults?: number }) => Promise<{
    success: boolean;
    results: Array<{ filePath: string; lineNumber: number; lineContent: string }>;
    truncated?: boolean;
    error?: string;
  }>;
  getWorkspaceRoot: () => Promise<string>;
  onWatchEvent: (callback: (payload: { type: string; path: string; eventType?: string; filename?: string }) => void) => () => void;
}

export interface ThirdEyeTerminalAPI {
  spawn: (config?: TerminalSpawnConfig) => Promise<TerminalSpawnResult>;
  write: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
  kill: (id: string) => Promise<{ success: boolean }>;
  list: () => Promise<TerminalSessionInfo[]>;
  cd: (id: string | { id?: string; dir?: string }, dir?: string) => Promise<{ success: boolean }>;
  getBuffer: (id: string) => Promise<string>;
  onData: (callback: (payload: { id: string; data: string }) => void) => () => void;
  onExit: (callback: (payload: { id: string; exitCode: number; signal?: number }) => void) => () => void;
}

export interface ThirdEyeAgentAPI {
  chat: (params: any) => Promise<{ success: boolean; reply: string }>;
  cancel: (sessionId: string) => Promise<{ success: boolean }>;
  sendPermissionDecision: (decision: any) => Promise<{ success: boolean }>;
  revertCheckpoint: (checkpointId: string) => Promise<{ success: boolean }>;
  onStatus: (callback: (payload: any) => void) => () => void;
  onDelta: (callback: (payload: { sessionId: string; delta: string }) => void) => () => void;
  onPermissionRequest: (callback: (payload: any) => void) => () => void;
}

export interface ThirdEyeGitAPI {
  status: () => Promise<any>;
  commit: (message: string) => Promise<any>;
  diff: () => Promise<{ diff: string; error?: string }>;
}

export interface ThirdEyeWindowAPI {
  zoomIn: () => Promise<number>;
  zoomOut: () => Promise<number>;
  resetZoom: () => Promise<number>;
  getZoom: () => Promise<number>;
  setZoom: (factor: number) => Promise<number>;
  minimize: () => Promise<boolean>;
  close: () => Promise<boolean>;
  toggleMaximize: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChanged: (callback: (isMax: boolean) => void) => () => void;
  onZoomChanged: (callback: (zoom: number) => void) => () => void;
}

export interface ThirdEyeDialogAPI {
  openFolder: () => Promise<{ success: boolean; canceled?: boolean; folderPath?: string; folderName?: string }>;
}

export interface ThirdEyeWorkspaceAPI {
  openPath: (targetPath: string) => Promise<{ success: boolean; folderPath?: string; folderName?: string }>;
  openFolder?: () => Promise<{ success: boolean; canceled?: boolean; folderPath?: string; folderName?: string }>;
  resetToDefault?: () => Promise<{ success: boolean; folderPath?: string; folderName?: string }>;
  close?: () => Promise<{ success: boolean; folderPath?: string; folderName?: string }>;
  onRootChanged: (callback: (data: { root: string; name: string }) => void) => () => void;
}

export interface ThirdEyeClipboardAPI {
  readText: () => Promise<string>;
  writeText: (text: string) => Promise<boolean>;
}

export interface ThirdEyeSystemAPI {
  getDefaultShell: () => Promise<string>;
  getCwd: () => Promise<string>;
  inspectDirectory: (cwd?: string) => Promise<any>;
  openExternalTerminal: (cwd?: string) => Promise<{ success: boolean }>;
  relaunchApp: () => Promise<{ success: boolean }>;
  platform: 'win32' | 'darwin' | 'linux';
  versions: {
    electron: string;
    node: string;
    chrome: string;
  };
}

export interface ThirdEyeAPI {
  files: ThirdEyeFilesAPI;
  terminal: ThirdEyeTerminalAPI;
  agent: ThirdEyeAgentAPI;
  git: ThirdEyeGitAPI;
  window: ThirdEyeWindowAPI;
  dialog: ThirdEyeDialogAPI;
  workspace: ThirdEyeWorkspaceAPI;
  clipboard: ThirdEyeClipboardAPI;
  system: ThirdEyeSystemAPI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI | undefined;
    thirdEye?: ThirdEyeAPI | undefined;
  }
}

