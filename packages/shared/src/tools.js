"use strict";
/**
 * Tool Schemas, Parameter Signatures, Returns, and Risk Classifications
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITIONS = void 0;
exports.TOOL_DEFINITIONS = {
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
