/**
 * Tool: runTerminal & Background Task Automation (Phase 4)
 * Supports background execution, live tails, waiting for pattern, listing, and killing tasks.
 */

import { exec, spawn, execSync } from 'child_process';
import path from 'path';

export interface RunTerminalInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  background?: boolean;
}

export interface TaskRecord {
  id: string;
  command: string;
  child: any;
  buffer: string[];
  status: 'running' | 'completed' | 'failed' | 'killed';
  exitCode?: number;
  startTime: number;
}

const backgroundTasks: Map<string, TaskRecord> = new Map();

export async function executeRunTerminal(input: RunTerminalInput, workspaceRoot: string) {
  const command = input.command;
  if (!command) throw new Error('run_terminal requires command');

  const cwd = input.cwd
    ? (path.isAbsolute(input.cwd) ? input.cwd : path.join(workspaceRoot, input.cwd))
    : workspaceRoot;

  const timeout = input.timeoutMs || 45000;

  // Resolve project and workspace node_modules pathing to prevent dependency conflicts
  const localBin = path.join(cwd, 'node_modules', '.bin');
  const localNodeModules = path.join(cwd, 'node_modules');
  const wsBin = path.join(workspaceRoot, 'node_modules', '.bin');
  const wsNodeModules = path.join(workspaceRoot, 'node_modules');

  const pathParts = [localBin];
  if (wsBin !== localBin) pathParts.push(wsBin);
  if (process.env.PATH) pathParts.push(process.env.PATH);

  const nodePathParts = [localNodeModules];
  if (wsNodeModules !== localNodeModules) nodePathParts.push(wsNodeModules);
  if (process.env.NODE_PATH) nodePathParts.push(process.env.NODE_PATH);

  const customEnv = {
    ...process.env,
    PATH: pathParts.join(path.delimiter),
    NODE_PATH: nodePathParts.join(path.delimiter),
  };

  // Auto-promote dev servers / watchers to background tasks
  const isDevServerCmd = /\b(npm\s+run\s+dev|npm\s+start|yarn\s+dev|yarn\s+start|pnpm\s+dev|bun\s+dev|vite|next\s+dev)\b/i.test(command);
  const isBackground = Boolean(input.background || isDevServerCmd);

  // Background Task support: e.g. dev server, watchers
  if (isBackground) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const child = spawn(command, {
      cwd,
      shell: true,
      detached: true,
      env: customEnv,
    });

    const task: TaskRecord = {
      id: taskId,
      command,
      child,
      buffer: [],
      status: 'running',
      startTime: Date.now(),
    };

    child.stdout?.on('data', (d: any) => {
      const lines = d.toString().split('\n');
      for (const l of lines) {
        if (task.buffer.length >= 2000) task.buffer.shift();
        task.buffer.push(l);
      }
    });

    child.stderr?.on('data', (d: any) => {
      const lines = d.toString().split('\n');
      for (const l of lines) {
        if (task.buffer.length >= 2000) task.buffer.shift();
        task.buffer.push(l);
      }
    });

    child.on('exit', (code: number | null) => {
      task.status = code === 0 ? 'completed' : 'failed';
      task.exitCode = code ?? undefined;
    });

    backgroundTasks.set(taskId, task);

    return {
      command,
      background: true,
      taskId,
      status: 'running',
      message: `Launched background task "${command}" with taskId: ${taskId}. Dedicated task session active.`,
    };
  }

  // Synchronous execution with timeout & last 200 lines capped
  const startTime = Date.now();
  return new Promise((resolve) => {
    exec(command, { cwd, timeout, maxBuffer: 10 * 1024 * 1024, env: customEnv }, (err, stdout, stderr) => {
      const rawOutput = (stdout || '') + (stderr ? '\n' + stderr : '');
      const lines = rawOutput.split('\n');
      const capped = lines.slice(Math.max(0, lines.length - 200)).join('\n');
      const exitCode = err ? (err.code !== undefined ? err.code : 1) : 0;
      const durationMs = Date.now() - startTime;

      resolve({
        command,
        output: capped || (exitCode === 0 ? '(Command completed with no output)' : '(Command failed)'),
        exitCode,
        durationMs,
        background: false,
        truncated: lines.length > 200,
      });
    });
  });
}

export async function executeReadTaskOutput(input: { taskId: string; tailLines?: number }) {
  const task = backgroundTasks.get(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  const maxLines = input.tailLines || 100;
  return {
    taskId: task.id,
    command: task.command,
    status: task.status,
    exitCode: task.exitCode,
    outputTail: task.buffer.slice(Math.max(0, task.buffer.length - maxLines)).join('\n'),
    totalLines: task.buffer.length,
  };
}

export async function executeListTasks() {
  const list = Array.from(backgroundTasks.values()).map((t) => ({
    taskId: t.id,
    command: t.command,
    status: t.status,
    exitCode: t.exitCode,
    uptimeSeconds: Math.round((Date.now() - t.startTime) / 1000),
    lineCount: t.buffer.length,
  }));
  return {
    tasks: list,
    total: list.length,
  };
}

export async function executeKillTask(input: { taskId: string }) {
  const task = backgroundTasks.get(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  try {
    if (task.child && task.child.pid) {
      process.kill(-task.child.pid, 'SIGKILL');
    }
  } catch {
    try {
      task.child?.kill('SIGKILL');
    } catch {}
  }

  task.status = 'killed';
  return {
    success: true,
    taskId: input.taskId,
    message: `Killed task ${input.taskId}`,
  };
}

export async function executeWaitForPattern(input: { taskId: string; regex?: string; timeoutMs?: number | string }) {
  const task = backgroundTasks.get(input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  const rawRegex = input.regex || 'ready|localhost|http|compiled|started|listening|running|v\\d+';
  const pattern = new RegExp(rawRegex, 'i');
  const timeoutMs = Number(input.timeoutMs) || 30000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const recentOutput = task.buffer.slice(-100).join('\n');
    if (pattern.test(recentOutput)) {
      const urlMatch = recentOutput.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i);
      return {
        matched: true,
        taskId: input.taskId,
        pattern: rawRegex,
        elapsedMs: Date.now() - startTime,
        serverUrl: urlMatch ? urlMatch[0] : undefined,
        sample: recentOutput.slice(-500),
      };
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'killed') {
      return {
        matched: false,
        taskExited: true,
        exitCode: task.exitCode,
        status: task.status,
        message: `Task exited before pattern matched. Status: ${task.status}`,
      };
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  return {
    matched: false,
    timedOut: true,
    elapsedMs: Date.now() - startTime,
    message: `Timed out waiting for pattern /${rawRegex}/ after ${timeoutMs}ms`,
  };
}

export function getBackgroundTaskOutput(taskId: string, maxLines = 200) {
  const task = backgroundTasks.get(taskId);
  if (!task) return { error: `Task not found: ${taskId}` };
  return {
    taskId,
    command: task.command,
    status: task.status,
    exitCode: task.exitCode,
    outputTail: task.buffer.slice(Math.max(0, task.buffer.length - maxLines)).join('\n'),
  };
}

export function getActiveRunningTasksSummary(): string {
  const items: string[] = [];
  for (const [taskId, task] of backgroundTasks.entries()) {
    if (task.status === 'running') {
      const output = task.buffer.slice(-30).join('\n');
      const urlMatch = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i);
      const portStr = urlMatch ? ` (Port: ${urlMatch[1]})` : '';
      items.push(`- Task ID: "${taskId}" | Command: "${task.command}" | Status: ${task.status}${portStr}`);
    }
  }

  // Also check common dev ports
  const commonPorts = [8080, 5173, 5174, 8000, 4200, 3001];
  for (const port of commonPorts) {
    try {
      const pidsOutput = execSync(`lsof -t -i :${port} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (pidsOutput) {
        items.push(`- Active Process on Port ${port} (PID: ${pidsOutput.replace(/\s+/g, ', ')})`);
      }
    } catch {}
  }

  return items.length > 0 ? items.join('\n') : 'No active background tasks or server processes running.';
}

export async function executeStopServer(input?: { port?: number | string; taskId?: string }) {
  const killedItems: string[] = [];

  // 1. If explicit taskId provided
  if (input?.taskId) {
    try {
      await executeKillTask({ taskId: input.taskId });
      killedItems.push(`Task ${input.taskId}`);
    } catch {}
  }

  // 2. Kill all tracked running background tasks in this agent
  for (const [id, task] of backgroundTasks.entries()) {
    if (task.status === 'running') {
      try {
        await executeKillTask({ taskId: id });
        killedItems.push(`Background task "${task.command}" (${id})`);
      } catch {}
    }
  }

  // 3. Collect target ports
  const targetPorts: number[] = [];
  if (input?.port) {
    const p = parseInt(String(input.port), 10);
    if (!isNaN(p)) targetPorts.push(p);
  } else {
    // Default common project dev ports
    targetPorts.push(8080, 5173, 5174, 8000, 4200, 3001, 8081, 5000);
  }

  // Filter out THIRD_EYE system infrastructure ports
  const safePorts = Array.from(new Set(targetPorts)).filter((p) => ![3000, 4001, 4002, 4003].includes(p));

  // Kill processes listening on target ports
  for (const port of safePorts) {
    try {
      const pidsOutput = execSync(`lsof -t -i :${port} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (pidsOutput) {
        const pids = pidsOutput.split(/\s+/).filter(Boolean);
        for (const pid of pids) {
          try {
            process.kill(parseInt(pid, 10), 'SIGKILL');
            killedItems.push(`Process on port ${port} (PID ${pid})`);
          } catch {}
        }
      }
    } catch {}
  }

  if (killedItems.length > 0) {
    return {
      success: true,
      message: `Successfully stopped server processes: ${killedItems.join(', ')}`,
      killed: killedItems,
    };
  }

  return {
    success: true,
    message: 'No active server processes or background tasks were found to stop.',
    killed: [],
  };
}

export function getActiveDevServerUrl(workspaceRoot?: string): { url: string; port: number; taskId: string } | null {
  const isThirdEyeRoot = workspaceRoot && /THIRD_EYE$/i.test(workspaceRoot);

  for (const [taskId, task] of backgroundTasks.entries()) {
    if (task.status === 'running') {
      const output = task.buffer.join('\n');
      const urlMatch = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i);
      if (urlMatch) {
        const port = parseInt(urlMatch[1], 10);
        if (port === 3000 && !isThirdEyeRoot) continue;
        return {
          url: urlMatch[0],
          port,
          taskId,
        };
      }
    }
  }
  return null;
}

