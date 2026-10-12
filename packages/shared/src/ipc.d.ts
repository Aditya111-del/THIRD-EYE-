/**
 * Unified IPC Channel Definitions and Type-Safe Request/Response Contracts
 * No raw untyped strings across IPC boundaries.
 */
export declare const IPC_CHANNELS: {
    readonly FILES_READ: "files.read";
    readonly FILES_WRITE: "files.write";
    readonly FILES_CREATE: "files.create";
    readonly FILES_DELETE: "files.delete";
    readonly FILES_RENAME: "files.rename";
    readonly FILES_READ_DIR: "files.readDirectory";
    readonly FILES_SCAN_TREE: "files.scanTree";
    readonly FILES_SEARCH: "files.search";
    readonly FILES_GET_WORKSPACE_ROOT: "files.getWorkspaceRoot";
    readonly FILES_WATCH_EVENT: "files.watchEvent";
    readonly TERMINAL_SPAWN: "terminal.spawn";
    readonly TERMINAL_WRITE: "terminal.write";
    readonly TERMINAL_RESIZE: "terminal.resize";
    readonly TERMINAL_KILL: "terminal.kill";
    readonly TERMINAL_LIST: "terminal.list";
    readonly TERMINAL_GET_BUFFER: "terminal.getBuffer";
    readonly TERMINAL_CD: "terminal.cd";
    readonly TERMINAL_DATA_STREAM: "terminal.incomingData";
    readonly TERMINAL_EXIT: "terminal.exit";
    readonly AGENT_CHAT: "agent.chat";
    readonly AGENT_STREAM: "agent.stream";
    readonly AGENT_CANCEL: "agent.cancel";
    readonly AGENT_PERMISSION_DECISION: "agent.permissionDecision";
    readonly AGENT_REVERT_CHECKPOINT: "agent.revertCheckpoint";
    readonly AGENT_STATUS_STREAM: "agent.statusStream";
    readonly GIT_STATUS: "git.status";
    readonly GIT_COMMIT: "git.commit";
    readonly GIT_DIFF: "git.diff";
    readonly WINDOW_ZOOM_IN: "window.zoomIn";
    readonly WINDOW_ZOOM_OUT: "window.zoomOut";
    readonly WINDOW_RESET_ZOOM: "window.resetZoom";
    readonly WINDOW_GET_ZOOM: "window.getZoom";
    readonly WINDOW_SET_ZOOM: "window.setZoom";
    readonly WINDOW_MINIMIZE: "window.minimize";
    readonly WINDOW_CLOSE: "window.close";
    readonly WINDOW_TOGGLE_MAXIMIZE: "window.toggleMaximize";
    readonly WINDOW_IS_MAXIMIZED: "window.isMaximized";
    readonly WINDOW_MAXIMIZED_CHANGED: "window.maximizedChanged";
    readonly WINDOW_ZOOM_CHANGED: "window.zoomChanged";
    readonly DIALOG_OPEN_FOLDER: "dialog.openFolder";
    readonly WORKSPACE_OPEN_PATH: "workspace.openPath";
    readonly WORKSPACE_ROOT_CHANGED: "workspace.rootChanged";
    readonly CLIPBOARD_READ_TEXT: "clipboard.readText";
    readonly CLIPBOARD_WRITE_TEXT: "clipboard.writeText";
    readonly SYSTEM_GET_DEFAULT_SHELL: "system.getDefaultShell";
    readonly SYSTEM_GET_CWD: "system.getCwd";
    readonly SYSTEM_INSPECT_DIRECTORY: "system.inspectDirectory";
    readonly SYSTEM_OPEN_EXTERNAL_TERMINAL: "system.openExternalTerminal";
    readonly SYSTEM_RELAUNCH_APP: "system.relaunchApp";
};
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
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
    entries?: Array<{
        name: string;
        relativePath: string;
        isDirectory: boolean;
    }>;
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
