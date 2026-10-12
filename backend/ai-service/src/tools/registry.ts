/**
 * UNIFIED TOOL REGISTRY (Phase 4 & Multi-Agent Architecture)
 * Strict Zod validation for every tool invocation.
 * Errors are observations, never crashes: tool failures go back to the model verbatim.
 */

import { z } from 'zod';
import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from './toolTypes';
export { ToolExecutionContext, ToolExecutionResult } from './toolTypes';
import { CheckpointManager } from './checkpoints';
import { FileLockRegistry } from './fileLocks';

// Import all tool execution implementations
import { executeReadFile } from './readFile';
import { executeWriteFile } from './writeFile';
import { executeEditFile } from './editFile';
import { executeSearchCode } from './searchCode';
import { executeFindFiles } from './findFiles';
import { executeListDir } from './listDir';
import {
  executeRunTerminal,
  executeReadTaskOutput,
  executeListTasks,
  executeKillTask,
  executeStopServer,
  executeWaitForPattern,
} from './runTerminal';
import { executeReadFileLines } from './readFileLines';
import { executeSearchSymbols } from './searchSymbols';
import { executeGetDiagnostics } from './getDiagnostics';
import { executeGitStatus, executeGitDiff } from './gitTools';
import { executeApplyPatch } from './applyPatch';
import { executeDeleteFile, executeCreateDir, executeMoveFile } from './fileOps';
import { executeWebSearch, executeFetchUrl, executeFetchDocs } from './researchTools';
import { executeOpenPreview, executeBrowserEval, executeTakeScreenshot } from './browserTools';
import { executeAnalyzeCodebase, executePlanCheck } from './analysisTools';

export class ToolRegistry {
  private checkpointManager: CheckpointManager;
  private fileLockRegistry: FileLockRegistry;
  private tools: Map<string, ToolDefinition> = new Map();
  private aliasMap: Map<string, string> = new Map();

  constructor(workspaceRoot: string) {
    this.checkpointManager = new CheckpointManager(workspaceRoot);
    this.fileLockRegistry = new FileLockRegistry();
    this.registerAllTools();
  }

  public getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  public getFileLockRegistry(): FileLockRegistry {
    return this.fileLockRegistry;
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.checkpointManager.setWorkspaceRoot(workspaceRoot);
  }

  public register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
    if (tool.aliases) {
      for (const alias of tool.aliases) {
        this.aliasMap.set(alias, tool.name);
      }
    }
  }

  private registerAllTools() {
    // ── READ TOOLS ──
    this.register({
      name: 'read_file',
      aliases: ['readFile'],
      description: 'Read contents of a file within the workspace. Supports startLine and endLine slices.',
      argsSchema: z.object({
        path: z.string().describe('Relative or absolute file path to read'),
        startLine: z.number().optional().describe('1-indexed line to start reading from'),
        endLine: z.number().optional().describe('1-indexed line to stop reading at'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 8000,
      handler: async (args, ctx) => executeReadFile(args, ctx.workspaceRoot),
    });

    this.register({
      name: 'list_dir',
      aliases: ['listDir'],
      description: 'List contents of a directory in the workspace with recursive depth control.',
      argsSchema: z.object({
        path: z.string().optional().default('.').describe('Directory path to list'),
        dirPath: z.string().optional().describe('Alternative alias for path'),
        depth: z.coerce.number().optional().default(2).describe('Depth traversal limit'),
        maxDepth: z.coerce.number().optional().describe('Alternative alias for depth'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 10000,
      handler: async (args, ctx) => executeListDir({ dirPath: args.path || args.dirPath, maxDepth: args.depth || args.maxDepth }, ctx.workspaceRoot),
    });

    this.register({
      name: 'search_code',
      aliases: ['searchCode'],
      description: 'Search workspace files for regex pattern or literal query using ripgrep.',
      argsSchema: z.object({
        query: z.string().describe('Text or pattern to search'),
        caseSensitive: z.coerce.boolean().optional().describe('Case sensitivity flag'),
        regex: z.coerce.boolean().optional().describe('Use regex matching'),
        isRegex: z.coerce.boolean().optional().describe('Alias for regex'),
        glob: z.string().optional().describe('Filter files matching glob pattern'),
        searchPath: z.string().optional().describe('Subdirectory to limit search within'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 15000,
      handler: async (args, ctx) => executeSearchCode({
        query: args.query,
        caseSensitive: args.caseSensitive,
        isRegex: args.regex ?? args.isRegex,
        searchPath: args.searchPath,
      }, ctx.workspaceRoot),
    });

    this.register({
      name: 'find_files',
      aliases: ['findFiles'],
      description: 'Locate files in the workspace matching a pattern or filename.',
      argsSchema: z.object({
        pattern: z.string().describe('Filename or glob pattern to locate'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 10000,
      handler: async (args, ctx) => executeFindFiles(args, ctx.workspaceRoot),
    });

    this.register({
      name: 'search_symbols',
      aliases: ['searchSymbols'],
      description: 'Search symbols (functions, classes, interfaces, types) across the codebase.',
      argsSchema: z.object({
        query: z.string().describe('Symbol name or substring to find'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 10000,
      handler: async (args, ctx) => executeSearchSymbols(args, ctx.workspaceRoot),
    });

    this.register({
      name: 'read_file_lines',
      aliases: ['readFileLines'],
      description: 'Targeted read of a window of lines centered around a specific line number.',
      argsSchema: z.object({
        path: z.string().describe('Target file path'),
        centerLine: z.coerce.number().describe('Line number to center the slice on'),
        radius: z.coerce.number().optional().default(15).describe('Lines to read above and below centerLine'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 8000,
      handler: async (args, ctx) => executeReadFileLines(args, ctx.workspaceRoot),
    });

    this.register({
      name: 'get_diagnostics',
      aliases: ['getDiagnostics'],
      description: 'Retrieve compiler, TypeScript, and linter errors across the workspace.',
      argsSchema: z.object({
        path: z.string().optional().describe('Optional specific file path to check'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 25000,
      handler: async (args, ctx) => executeGetDiagnostics(args, ctx.workspaceRoot),
    });

    this.register({
      name: 'git_status',
      aliases: ['gitStatus'],
      description: 'Check git repository status and branch information.',
      argsSchema: z.object({}),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 10000,
      handler: async (_, ctx) => executeGitStatus(ctx.workspaceRoot),
    });

    this.register({
      name: 'git_diff',
      aliases: ['gitDiff'],
      description: 'View unstaged or staged git diffs.',
      argsSchema: z.object({
        path: z.string().optional().describe('Optional file path to inspect diff for'),
        staged: z.boolean().optional().describe('Check staged diff instead of unstaged'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 15000,
      handler: async (args, ctx) => executeGitDiff(args, ctx.workspaceRoot),
    });

    // ── WRITE TOOLS ──
    this.register({
      name: 'write_file',
      aliases: ['writeFile'],
      description: 'Write complete content to a file. Snapshots previous version and persists to disk.',
      argsSchema: z.object({
        path: z.string().describe('Target file path to write'),
        content: z.string().describe('Complete file content to save'),
      }),
      risk: 'write',
      needsPermission: true,
      timeoutMs: 12000,
      roles: ['coder', 'debugger', 'orchestrator'],
      handler: async (args, ctx) =>
        executeWriteFile(args, ctx.workspaceRoot, ctx.checkpointManager, ctx.fileLockRegistry, ctx.agentId),
    });

    this.register({
      name: 'edit_file',
      aliases: ['editFile'],
      description: 'Perform targeted search and replace modifications on a file with exact-match and fuzzy fallback.',
      argsSchema: z.object({
        path: z.string().describe('File path to edit'),
        oldString: z.string().optional().describe('Exact code snippet to replace'),
        searchContent: z.string().optional().describe('Alias for oldString'),
        newString: z.string().optional().describe('New replacement code snippet'),
        replaceContent: z.string().optional().describe('Alias for newString'),
        replaceAll: z.boolean().optional().describe('Replace all occurrences instead of only the first'),
      }),
      risk: 'write',
      needsPermission: true,
      timeoutMs: 12000,
      roles: ['coder', 'debugger', 'orchestrator'],
      handler: async (args, ctx) =>
        executeEditFile(args, ctx.workspaceRoot, ctx.checkpointManager, ctx.fileLockRegistry, ctx.agentId),
    });

    this.register({
      name: 'apply_patch',
      aliases: ['applyPatch'],
      description: 'Apply unified diff patches atomically across files.',
      argsSchema: z.object({
        patch: z.string().describe('Unified diff patch content'),
      }),
      risk: 'write',
      needsPermission: true,
      timeoutMs: 15000,
      roles: ['coder', 'debugger', 'orchestrator'],
      handler: async (args, ctx) =>
        executeApplyPatch(args, ctx.workspaceRoot, ctx.checkpointManager, ctx.fileLockRegistry, ctx.agentId),
    });

    this.register({
      name: 'delete_file',
      aliases: ['deleteFile'],
      description: 'Delete a file with automatic checkpoint snapshot for rollback.',
      argsSchema: z.object({
        path: z.string().describe('File path to delete'),
      }),
      risk: 'write',
      needsPermission: true,
      timeoutMs: 8000,
      roles: ['coder', 'debugger', 'orchestrator'],
      handler: async (args, ctx) =>
        executeDeleteFile(args, ctx.workspaceRoot, ctx.checkpointManager, ctx.fileLockRegistry, ctx.agentId),
    });

    this.register({
      name: 'create_dir',
      aliases: ['createDir'],
      description: 'Create a directory recursively within the workspace.',
      argsSchema: z.object({
        path: z.string().describe('Directory path to create'),
      }),
      risk: 'write',
      needsPermission: true,
      timeoutMs: 8000,
      roles: ['coder', 'orchestrator'],
      handler: async (args, ctx) => executeCreateDir(args, ctx.workspaceRoot),
    });

    this.register({
      name: 'move_file',
      aliases: ['moveFile'],
      description: 'Move or rename a file with checkpoint snapshot.',
      argsSchema: z.object({
        sourcePath: z.string().describe('Original file path'),
        destinationPath: z.string().describe('Target destination path'),
      }),
      risk: 'write',
      needsPermission: true,
      timeoutMs: 8000,
      roles: ['coder', 'orchestrator'],
      handler: async (args, ctx) =>
        executeMoveFile(args, ctx.workspaceRoot, ctx.checkpointManager, ctx.fileLockRegistry, ctx.agentId),
    });

    // ── TERMINAL TOOLS ──
    this.register({
      name: 'run_terminal',
      aliases: ['runTerminal'],
      description: 'Execute shell commands in the terminal. Set background: true for long-running servers.',
      argsSchema: z.object({
        command: z.string().describe('Shell command to execute'),
        cwd: z.string().optional().describe('Working directory relative to workspace'),
        timeoutMs: z.coerce.number().optional().default(60000).describe('Execution timeout limit'),
        background: z.coerce.boolean().optional().default(false).describe('Run as persistent background task'),
      }),
      risk: 'exec',
      needsPermission: true,
      timeoutMs: 60000,
      handler: async (args, ctx) => executeRunTerminal(args, ctx.workspaceRoot),
    });

    this.register({
      name: 'read_task_output',
      aliases: ['readTaskOutput'],
      description: 'Read the latest output buffer lines from a background terminal task.',
      argsSchema: z.object({
        taskId: z.string().describe('Task ID returned by run_terminal background: true'),
        tailLines: z.coerce.number().optional().default(100).describe('Number of trailing lines to fetch'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 5000,
      handler: async (args) => executeReadTaskOutput(args),
    });

    this.register({
      name: 'list_tasks',
      aliases: ['listTasks'],
      description: 'List all running and completed background terminal tasks.',
      argsSchema: z.object({}),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 5000,
      handler: async () => executeListTasks(),
    });

    this.register({
      name: 'kill_task',
      aliases: ['killTask'],
      description: 'Terminate a running background terminal task.',
      argsSchema: z.object({
        taskId: z.string().describe('Task ID to kill'),
      }),
      risk: 'exec',
      needsPermission: true,
      timeoutMs: 5000,
      handler: async (args) => executeKillTask(args),
    });

    this.register({
      name: 'stop_server',
      aliases: ['stopServer', 'kill_server', 'killServer', 'stop_dev'],
      description: 'Stop, terminate, or kill a running dev server or background process by port, taskId, or automatically detecting active servers.',
      argsSchema: z.object({
        port: z.union([z.coerce.number(), z.string()]).optional().describe('Port number of the server to stop (e.g. 8080, 5173)'),
        taskId: z.string().optional().describe('Background taskId to terminate if known'),
      }),
      risk: 'exec',
      needsPermission: true,
      timeoutMs: 8000,
      handler: async (args) => executeStopServer(args),
    });

    this.register({
      name: 'wait_for_pattern',
      aliases: ['waitForPattern'],
      description: 'Wait until a running background task outputs text matching a regex pattern (e.g. server ready).',
      argsSchema: z.object({
        taskId: z.string().describe('Background task ID to monitor'),
        regex: z.string().optional().default('ready|localhost|http|compiled|started|listening|running').describe('Regular expression pattern to wait for (defaults to common server startup patterns)'),
        timeoutMs: z.coerce.number().optional().default(30000).describe('Maximum wait time in ms'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 35000,
      handler: async (args) => executeWaitForPattern(args),
    });

    // ── RESEARCH TOOLS ──
    this.register({
      name: 'web_search',
      aliases: ['webSearch'],
      description: 'Search documentation and external resources for technical solutions.',
      argsSchema: z.object({
        query: z.string().describe('Search query'),
      }),
      risk: 'network',
      needsPermission: true,
      timeoutMs: 15000,
      handler: async (args) => executeWebSearch(args),
    });

    this.register({
      name: 'fetch_url',
      aliases: ['fetchUrl'],
      description: 'Fetch and extract text content from an external documentation URL.',
      argsSchema: z.object({
        url: z.string().describe('URL to fetch'),
      }),
      risk: 'network',
      needsPermission: true,
      timeoutMs: 15000,
      handler: async (args) => executeFetchUrl(args),
    });

    this.register({
      name: 'fetch_docs',
      aliases: ['fetchDocs'],
      description: 'Retrieve authoritative documentation for React, Bun, Tailwind, Vite, and common frameworks.',
      argsSchema: z.object({
        library: z.string().describe('Library or framework name (e.g. "react", "bun", "tailwindcss")'),
        topic: z.string().optional().describe('Specific API or hook (e.g. "useEffect", "serve")'),
      }),
      risk: 'network',
      needsPermission: false,
      timeoutMs: 10000,
      handler: async (args) => executeFetchDocs(args),
    });

    // ── BROWSER / PREVIEW TOOLS ──
    this.register({
      name: 'open_preview',
      aliases: ['openPreview'],
      description: 'Open and verify browser preview for dev server on port or URL.',
      argsSchema: z.object({
        urlOrPort: z.union([z.string(), z.number()]).describe('Local port number (e.g. 3000, 5173) or full URL'),
      }),
      risk: 'exec',
      needsPermission: false,
      timeoutMs: 8000,
      handler: async (args) => executeOpenPreview(args),
    });

    this.register({
      name: 'browser_eval',
      aliases: ['browserEval'],
      description: 'Evaluate JavaScript in the preview environment to check console health or response.',
      argsSchema: z.object({
        js: z.string().describe('JavaScript code to evaluate'),
      }),
      risk: 'exec',
      needsPermission: false,
      timeoutMs: 8000,
      handler: async (args) => executeBrowserEval(args),
    });

    this.register({
      name: 'take_screenshot',
      aliases: ['takeScreenshot'],
      description: 'Verify visual preview rendering and layout.',
      argsSchema: z.object({
        url: z.string().optional().describe('Target preview URL to verify'),
      }),
      risk: 'exec',
      needsPermission: false,
      timeoutMs: 8000,
      handler: async (args) => executeTakeScreenshot(args),
    });

    // ── ANALYSIS TOOLS ──
    this.register({
      name: 'analyze_codebase',
      aliases: ['analyzeCodebase'],
      description: 'Generate comprehensive workspace overview including directory layout, dependencies, and scripts.',
      argsSchema: z.object({}),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 10000,
      handler: async (_, ctx) => executeAnalyzeCodebase(ctx.workspaceRoot),
    });

    this.register({
      name: 'plan_check',
      aliases: ['planCheck'],
      description: 'Orchestrator validation check on task step acceptance criteria.',
      argsSchema: z.object({
        stepId: z.string().describe('Task step ID to validate'),
      }),
      risk: 'read',
      needsPermission: false,
      timeoutMs: 5000,
      roles: ['orchestrator'],
      handler: async (args) => executePlanCheck(args),
    });

  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name) || this.tools.get(this.aliasMap.get(name) || '');
  }

  public forAgent(role?: string): ToolDefinition[] {
    const list = Array.from(this.tools.values());
    if (!role) return list;
    return list.filter((t) => !t.roles || t.roles.includes(role));
  }

  public getDeclarations(role?: string): any[] {
    const targetTools = this.forAgent(role);
    return targetTools.map((t) => {
      // Generate standard OpenAI / Gemini tool function declaration
      const shape = (t.argsSchema as any)._def?.shape?.() || {};
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, val] of Object.entries(shape)) {
        const field = val as any;
        const typeName = field?._def?.typeName;
        let type = 'string';
        if (typeName === 'ZodNumber') type = 'number';
        if (typeName === 'ZodBoolean') type = 'boolean';
        if (typeName === 'ZodArray') type = 'array';
        if (typeName === 'ZodObject') type = 'object';

        properties[key] = {
          type,
          description: field?.description || key,
        };

        if (!field.isOptional()) {
          required.push(key);
        }
      }

      return {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'OBJECT',
          properties,
          required: required.length > 0 ? required : undefined,
        },
      };
    });
  }

  /**
   * Coerce and sanitize tool arguments passed by LLMs
   * (e.g. converting "true"/"false" strings to boolean, numeric strings to numbers, trimming keys)
   */
  public static sanitizeToolArgs(args: Record<string, any>): Record<string, any> {
    if (!args || typeof args !== 'object') return {};
    const sanitized: Record<string, any> = {};

    for (const [key, val] of Object.entries(args)) {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.toLowerCase() === 'true') {
          sanitized[key] = true;
        } else if (trimmed.toLowerCase() === 'false') {
          sanitized[key] = false;
        } else if (
          /^-?\d+(\.\d+)?$/.test(trimmed) &&
          !isNaN(Number(trimmed)) &&
          (key.toLowerCase().includes('timeout') ||
            key.toLowerCase().includes('line') ||
            key.toLowerCase().includes('limit') ||
            key.toLowerCase().includes('offset') ||
            key.toLowerCase().includes('count') ||
            key.toLowerCase().includes('depth') ||
            key.toLowerCase().includes('radius') ||
            key.toLowerCase().includes('port') ||
            key.toLowerCase().includes('ms'))
        ) {
          sanitized[key] = Number(trimmed);
        } else {
          sanitized[key] = val;
        }
      } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        sanitized[key] = ToolRegistry.sanitizeToolArgs(val);
      } else {
        sanitized[key] = val;
      }
    }

    // Common alias normalization
    if (sanitized.cmd && !sanitized.command) {
      sanitized.command = sanitized.cmd;
    }
    if (sanitized.filePath && !sanitized.path) {
      sanitized.path = sanitized.filePath;
    }
    if (sanitized.file && !sanitized.path) {
      sanitized.path = sanitized.file;
    }
    if (sanitized.dir && !sanitized.path && !sanitized.dirPath) {
      sanitized.path = sanitized.dir;
    }

    return sanitized;
  }

  /**
   * Execute tool with Zod validation, timeout safety, and verbatim error reporting
   */
  public async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const tool = this.getTool(toolName);
    if (!tool) {
      return {
        toolName,
        success: false,
        error: `Unknown tool: "${toolName}". Available tools: ${Array.from(this.tools.keys()).slice(0, 10).join(', ')}...`,
      };
    }

    // 0. Pre-sanitize and alias-normalize tool arguments
    const sanitizedArgs = ToolRegistry.sanitizeToolArgs(args || {});

    // Provide sensible default regex pattern for wait_for_pattern if LLM omits it
    if (tool.name === 'wait_for_pattern' && !sanitizedArgs.regex) {
      sanitizedArgs.regex = 'ready|localhost|http|compiled|started|listening|running';
    }

    // 1. Zod Argument Validation
    const parsed = tool.argsSchema.safeParse(sanitizedArgs);
    if (!parsed.success) {
      const errMsgs = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return {
        toolName: tool.name,
        success: false,
        error: `Invalid arguments for tool "${tool.name}": ${errMsgs}`,
      };
    }

    // 2. Timeout-Guarded Execution
    const start = Date.now();
    try {
      const execPromise = tool.handler(parsed.data, context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool "${tool.name}" timed out after ${tool.timeoutMs}ms`)), tool.timeoutMs)
      );

      const result = await Promise.race([execPromise, timeoutPromise]);
      const durationMs = Date.now() - start;

      const diff = result?.diff;
      return {
        toolName: tool.name,
        success: true,
        data: result,
        diff,
        durationMs,
        pendingApproval: result?.pendingApproval,
      };
    } catch (err: any) {
      return {
        toolName: tool.name,
        success: false,
        error: err.message || String(err),
        durationMs: Date.now() - start,
      };
    }
  }
}
