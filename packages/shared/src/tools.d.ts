/**
 * Tool Schemas, Parameter Signatures, Returns, and Risk Classifications
 */
export type ToolRiskLevel = 'low' | 'medium' | 'high';
export interface JSONSchemaProperty {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    enum?: string[];
    items?: JSONSchemaProperty;
    required?: boolean;
}
export interface ToolDefinition<TArgs = any, TReturn = any> {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, JSONSchemaProperty>;
        required?: string[];
    };
    risk: ToolRiskLevel;
    needsPermission: boolean;
}
export interface ReadFileArgs {
    path: string;
    startLine?: number;
    endLine?: number;
}
export interface ReadFileResult {
    path: string;
    content: string;
    totalLines: number;
    startLine: number;
    endLine: number;
    truncated: boolean;
}
export interface WriteFileArgs {
    path: string;
    content: string;
}
export interface WriteFileResult {
    path: string;
    diff: {
        original: string;
        modified: string;
        hunkCount: number;
    };
    pendingApproval: boolean;
}
export interface EditFileArgs {
    path: string;
    searchContent: string;
    replaceContent: string;
    allowMultiple?: boolean;
}
export interface EditFileResult {
    path: string;
    applied: boolean;
    diff: {
        original: string;
        modified: string;
    };
    pendingApproval: boolean;
}
export interface SearchCodeArgs {
    query: string;
    caseSensitive?: boolean;
    isRegex?: boolean;
    searchPath?: string;
    maxResults?: number;
}
export interface SearchCodeMatch {
    file: string;
    lineNumber: number;
    lineContent: string;
}
export interface SearchCodeResult {
    matches: SearchCodeMatch[];
    totalMatches: number;
    truncated: boolean;
}
export interface ListDirArgs {
    dirPath?: string;
    maxDepth?: number;
}
export interface ListDirResult {
    dir: string;
    entries: Array<{
        name: string;
        relativePath: string;
        isDirectory: boolean;
        size?: number;
    }>;
    totalEntries: number;
}
export interface GetDiagnosticsArgs {
    path?: string;
}
export interface DiagnosticItem {
    file: string;
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    source?: string;
}
export interface GetDiagnosticsResult {
    diagnostics: DiagnosticItem[];
}
export interface RunTerminalArgs {
    command: string;
    cwd?: string;
    timeoutMs?: number;
    background?: boolean;
}
export interface RunTerminalResult {
    command: string;
    output: string;
    exitCode: number;
    background: boolean;
    taskId?: string;
    durationMs: number;
}
export interface RestoreCheckpointArgs {
    checkpointId: string;
}
export interface RestoreCheckpointResult {
    success: boolean;
    restoredFiles: string[];
}
export declare const TOOL_DEFINITIONS: Record<string, ToolDefinition>;
