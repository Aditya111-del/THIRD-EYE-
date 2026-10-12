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

// 1. readFile
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

// 2. writeFile (via File Model Diff)
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

// 3. editFile (Search & Replace with fuzzy fallback)
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

// 4. searchCode (Ripgrep / regex search)
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

// 5. listDir
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

// 6. getDiagnostics
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

// 7. runTerminal
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


// 9. restoreCheckpoint
export interface RestoreCheckpointArgs {
  checkpointId: string;
}
export interface RestoreCheckpointResult {
  success: boolean;
  restoredFiles: string[];
}

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  readFile: {
    name: 'readFile',
    description: 'Read contents of a file within the workspace. Supports line range slices.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute file path' },
        startLine: { type: 'number', description: 'Optional 1-indexed start line' },
        endLine: { type: 'number', description: 'Optional 1-indexed end line' },
      },
      required: ['path'],
    },
    risk: 'low',
    needsPermission: false,
  },
  listDir: {
    name: 'listDir',
    description: 'List contents of a directory in the workspace with recursive depths.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Directory path relative to workspace' },
        maxDepth: { type: 'number', description: 'Depth traversal limit' },
      },
    },
    risk: 'low',
    needsPermission: false,
  },
  searchCode: {
    name: 'searchCode',
    description: 'Search workspace files for regex pattern or literal query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or pattern to search' },
        caseSensitive: { type: 'boolean', description: 'Case sensitivity flag' },
        searchPath: { type: 'string', description: 'Subdirectory to search' },
      },
      required: ['query'],
    },
    risk: 'low',
    needsPermission: false,
  },
  getDiagnostics: {
    name: 'getDiagnostics',
    description: 'Fetch linter errors and TypeScript diagnostics for file or workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional specific file path' },
      },
    },
    risk: 'low',
    needsPermission: false,
  },
  writeFile: {
    name: 'writeFile',
    description: 'Propose writing/replacing a file. Routes through File Model Diff Review before disk commit.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Target file path' },
        content: { type: 'string', description: 'Complete new file content' },
      },
      required: ['path', 'content'],
    },
    risk: 'medium',
    needsPermission: false, // Goes through diff review UI
  },
  editFile: {
    name: 'editFile',
    description: 'Propose search & replace block edits on a file with diff review.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Target file path' },
        searchContent: { type: 'string', description: 'Exact code snippet to replace' },
        replaceContent: { type: 'string', description: 'New replacement code snippet' },
      },
      required: ['path', 'searchContent', 'replaceContent'],
    },
    risk: 'medium',
    needsPermission: false, // Goes through diff review UI
  },
  runTerminal: {
    name: 'runTerminal',
    description: 'Execute shell commands inside the terminal environment.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command line to execute' },
        cwd: { type: 'string', description: 'Optional execution directory' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds' },
        background: { type: 'boolean', description: 'Run as persistent background task' },
      },
      required: ['command'],
    },
    risk: 'high',
    needsPermission: true, // Requires permission decision unless auto-allowed
  },
  restoreCheckpoint: {
    name: 'restoreCheckpoint',
    description: 'Rollback all file mutations to a specified checkpoint snapshot.',
    parameters: {
      type: 'object',
      properties: {
        checkpointId: { type: 'string', description: 'Checkpoint hash ID to restore' },
      },
      required: ['checkpointId'],
    },
    risk: 'medium',
    needsPermission: true,
  },
};
