/**
 * PTY Session Registry (Phase 3)
 * Orchestrates terminal processes, cwd tracking, background tasks, and ring buffer integration.
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { outputBusRegistry, SessionOutputBus } from './outputBus';
import { ShellIntegrationParser } from './shellIntegration';

export interface SpawnSessionOptions {
  id?: string;
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  taskId?: string;
}

export interface TerminalSession {
  id: string;
  pty: any;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
  lastActivity: number;
  taskId?: string;
  outputBus: SessionOutputBus;
  shellIntegration: ShellIntegrationParser;
}

export class SessionRegistry {
  private sessions: Map<string, TerminalSession> = new Map();
  private nodePty: any = null;

  constructor() {
    try {
      this.nodePty = require('node-pty');
    } catch (err: any) {
      console.warn('[SessionRegistry] node-pty native binary not found:', err.message);
    }
  }

  public getDefaultShell(): string {
    if (process.platform === 'win32') {
      const pwshPaths = [
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ];
      for (const p of pwshPaths) {
        if (fs.existsSync(p)) return p;
      }
      return process.env.COMSPEC || 'powershell.exe';
    }
    return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  }

  public spawn(options: SpawnSessionOptions = {}): TerminalSession {
    const id = options.id || `term-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let targetShell = options.shell || this.getDefaultShell();
    if (process.platform !== 'win32' && (targetShell.endsWith('.exe') || !fs.existsSync(targetShell))) {
      targetShell = this.getDefaultShell();
    }

    const targetCwd = options.cwd || os.homedir() || process.cwd();
    const cols = Math.max(10, options.cols || 80);
    const rows = Math.max(5, options.rows || 24);

    let shellArgs: string[] = [];
    if (process.platform === 'win32') {
      if (/powershell|pwsh/i.test(targetShell)) {
        shellArgs = ['-NoLogo'];
      } else if (/cmd\.exe$/i.test(targetShell)) {
        shellArgs = ['/Q'];
      }
    } else {
      shellArgs = ['-l'];
    }

    const outputBus = outputBusRegistry.getOrCreate(id);
    const shellIntegration = new ShellIntegrationParser(targetCwd);

    const localBin = path.join(targetCwd, 'node_modules', '.bin');
    const localNodeModules = path.join(targetCwd, 'node_modules');
    const customEnv = {
      ...process.env,
      ...(options.env || {}),
      PATH: `${localBin}${path.delimiter}${options.env?.PATH || process.env.PATH || ''}`,
      NODE_PATH: `${localNodeModules}${path.delimiter}${options.env?.NODE_PATH || process.env.NODE_PATH || ''}`,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    let ptyProcess: any;
    if (this.nodePty) {
      try {
        ptyProcess = this.nodePty.spawn(targetShell, shellArgs, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: targetCwd,
          env: customEnv,
        });

        // Initialize shell cleanly
        setTimeout(() => {
          try {
            if (process.platform === 'win32') {
              if (/powershell|pwsh/i.test(targetShell)) {
                ptyProcess.write('Clear-Host\r');
              } else {
                ptyProcess.write('doskey ls=dir /b $* >nul 2>&1 & doskey clear=cls >nul 2>&1 & doskey pwd=cd >nul 2>&1 & doskey which=where $* >nul 2>&1 & cls\r');
              }
            } else {
              ptyProcess.write('clear\r');
            }
          } catch {}
        }, 80);
      } catch (err: any) {
        console.warn('[SessionRegistry] nodePty spawn error, falling back to child_process:', err.message);
      }
    }

    if (!ptyProcess) {
      const { spawn: cpSpawn } = require('child_process');
      const child = cpSpawn(targetShell, shellArgs, {
        cwd: targetCwd,
        env: { ...process.env, ...(options.env || {}) },
        shell: true,
      });

      ptyProcess = {
        write: (d: string) => { if (child.stdin && !child.stdin.destroyed) child.stdin.write(d); },
        resize: () => {},
        kill: () => { try { child.kill(); } catch {} },
        onData: (cb: (d: string) => void) => {
          child.stdout?.on('data', (d: any) => cb(d.toString()));
          child.stderr?.on('data', (d: any) => cb(d.toString()));
        },
        onExit: (cb: (e: any) => void) => child.on('exit', cb),
      };
    }

    const session: TerminalSession = {
      id,
      pty: ptyProcess,
      shell: targetShell,
      cwd: targetCwd,
      cols,
      rows,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      taskId: options.taskId,
      outputBus,
      shellIntegration,
    };

    ptyProcess.onData((data: string) => {
      session.lastActivity = Date.now();
      shellIntegration.parseChunk(data);
      outputBus.write(data);
    });

    ptyProcess.onExit(() => {
      this.sessions.delete(id);
    });

    shellIntegration.setCallbacks({
      onCwdChange: (newCwd) => {
        session.cwd = newCwd;
      },
    });

    this.sessions.set(id, session);
    return session;
  }

  public getSession(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  public listSessions(): Array<{
    id: string;
    shell: string;
    cwd: string;
    cols: number;
    rows: number;
    createdAt: number;
    taskId?: string;
  }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      shell: s.shell,
      cwd: s.cwd,
      cols: s.cols,
      rows: s.rows,
      createdAt: s.createdAt,
      taskId: s.taskId,
    }));
  }

  public write(id: string, data: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.lastActivity = Date.now();
    s.pty.write(data);
    return true;
  }

  public resize(id: string, cols: number, rows: number): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    const safeCols = Math.max(10, cols || 80);
    const safeRows = Math.max(5, rows || 24);
    s.cols = safeCols;
    s.rows = safeRows;
    s.pty.resize(safeCols, safeRows);
    return true;
  }

  public kill(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.pty.kill();
    outputBusRegistry.remove(id);
    this.sessions.delete(id);
    return true;
  }

  public cd(id: string, dir: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    if (fs.existsSync(dir)) {
      s.cwd = dir;
      s.shellIntegration.setCwd(dir);
      const isWin = process.platform === 'win32';
      const localBin = path.join(dir, 'node_modules', '.bin');
      const localNodeModules = path.join(dir, 'node_modules');
      const cmd = isWin
        ? `cd /d "${dir}" & set "PATH=${localBin};%PATH%" & set "NODE_PATH=${localNodeModules};%NODE_PATH%"\r`
        : `cd "${dir}" && export PATH="${localBin}:$PATH" && export NODE_PATH="${localNodeModules}:$NODE_PATH"\n`;
      s.pty.write(cmd);
      return true;
    }
    return false;
  }

  public getTail(id: string, maxLines = 200): string {
    const s = this.sessions.get(id);
    if (!s) return '';
    return s.outputBus.getTail(maxLines);
  }
}

export const sessionRegistry = new SessionRegistry();
