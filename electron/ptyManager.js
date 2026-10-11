const os = require('os');
const path = require('path');
const fs = require('fs');

let nodePty = null;
try {
  nodePty = require('node-pty');
} catch (err) {
  console.warn(
    '[PTYManager] Warning: node-pty failed to load directly. If on Windows, run "npm run rebuild" to recompile node-pty against Electron.',
    err.message
  );
}

class PTYManager {
  constructor() {
    /** @type {Map<string, { pty: any, id: string, shell: string, cwd: string, createdAt: number }>} */
    this.sessions = new Map();
    this.defaultOnData = null;
    this.defaultOnExit = null;
  }

  /**
   * Determine the best default shell for the host operating system
   * @returns {string} Path or command of the shell
   */
  getDefaultShell() {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
    }

    return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  }

  /**
   * Resolve working directory
   * @param {string} [requestedCwd]
   * @returns {string}
   */
  resolveCwd(requestedCwd) {
    if (requestedCwd && fs.existsSync(requestedCwd)) {
      return requestedCwd;
    }
    return os.homedir() || process.cwd();
  }

  /**
   * Spawn a new PTY instance
   * @param {Object} options
   * @param {string} [options.id] - Optional custom ID
   * @param {string} [options.shell] - Shell executable
   * @param {string} [options.cwd] - Starting working directory
   * @param {number} [options.cols=80] - Columns
   * @param {number} [options.rows=24] - Rows
   * @param {Object} [options.env={}] - Additional environment variables
   * @param {(id: string, data: string) => void} onData - Callback when PTY emits stdout/stderr
   * @param {(id: string, exitInfo: { exitCode: number, signal?: number }) => void} onExit - Callback when shell exits
   * @returns {{ id: string, shell: string, cwd: string, cols: number, rows: number }}
   */
  spawn(options = {}, onData, onExit) {
    if (onData) this.defaultOnData = onData;
    if (onExit) this.defaultOnExit = onExit;

    const id = options.id || `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    if (this.sessions.has(id)) {
      console.log(`[PTYManager] Session ${id} already exists, cleanly terminating prior instance.`);
      this.kill(id);
    }

    let shell = options.shell;
    let shellArgs = [];
    const initBat = path.join(__dirname, 'init_shell.bat');

    if (process.platform === 'win32') {
      if (options.shellType === 'powershell' || (options.shell && /powershell|pwsh/i.test(options.shell))) {
        shell = process.env.SystemRoot
          ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
          : 'powershell.exe';
        shellArgs = ['-NoLogo'];
      } else {
        shell = process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
        shellArgs = ['/Q'];
      }
    } else {
      shell = shell || this.getDefaultShell();
      shellArgs = ['-i'];
    }
    const cwd = this.resolveCwd(options.cwd);
    const cols = options.cols || 120;
    const rows = options.rows || 24;

    const env = {
      ...process.env,
      ...options.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    // Prepend Git's usr/bin if available so GNU coreutils (ls, grep, cat, which) work in cmd.exe
    if (process.platform === 'win32') {
      const gitPaths = [
        'C:\\Program Files\\Git\\usr\\bin',
        'C:\\Program Files (x86)\\Git\\usr\\bin',
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\usr\\bin'),
      ];
      for (const gp of gitPaths) {
        if (fs.existsSync(gp) && env.PATH && !env.PATH.includes(gp)) {
          env.PATH = `${gp};${env.PATH}`;
          break;
        }
      }
    }

    if (nodePty && !process.env.FORCE_CHILD_PROCESS_PTY) {
      try {
        const ptyProcess = nodePty.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env,
          useConpty: true, // Native Windows PseudoConsole API
        });

        // Initialize shell silently and clear screen so prompt starts cleanly at Line 1, Col 1
        setTimeout(() => {
          try {
            if (options.shellType === 'powershell' || /powershell|pwsh/i.test(shell)) {
              ptyProcess.write('Clear-Host\r');
            } else {
              ptyProcess.write('doskey ls=dir /b $* >nul 2>&1 & doskey clear=cls >nul 2>&1 & doskey pwd=cd >nul 2>&1 & doskey which=where $* >nul 2>&1 & cls\r');
            }
          } catch {}
        }, 80);

        const spawnTime = Date.now();
        let fallbackTriggered = false;

        ptyProcess.onData((data) => {
          if (typeof onData === 'function') {
            onData(id, data);
          }
        });

        ptyProcess.onExit(({ exitCode, signal }) => {
          this.sessions.delete(id);
          // If node-pty died prematurely on startup, seamlessly auto-recover via child_process!
          if (!fallbackTriggered && (Date.now() - spawnTime < 1000) && (exitCode === -1073741510 || exitCode !== 0)) {
            fallbackTriggered = true;
            console.warn(`[PTYManager] node-pty died prematurely on startup (code ${exitCode}), seamlessly auto-recovering session ${id} with native child_process.`);
            this.spawnChildProcessFallback(id, shell, shellArgs, cwd, cols, rows, env, onData || this.defaultOnData, onExit || this.defaultOnExit);
            return;
          }
          if (typeof onExit === 'function') {
            onExit(id, { exitCode, signal });
          }
        });

        this.sessions.set(id, {
          pty: ptyProcess,
          id,
          shell,
          cwd,
          createdAt: Date.now(),
          isFallback: false,
          lastCols: cols,
          lastRows: rows,
          onData,
          onExit,
        });

        console.log(`[PTYManager] Spawned native PTY session ${id} (${shell}) in ${cwd}`);
        return { id, shell, cwd, cols, rows };
      } catch (err) {
        console.warn(`[PTYManager] node-pty spawn failed (${err.message}), attempting fallback subprocess shell.`);
      }
    }

    return this.spawnChildProcessFallback(id, shell, shellArgs, cwd, cols, rows, env, onData || this.defaultOnData, onExit || this.defaultOnExit);
  }

  /**
   * Spawns a robust native child_process shell
   */
  spawnChildProcessFallback(id, shell, shellArgs, cwd, cols, rows, env, onData, onExit) {
    try {
      const { spawn: cpSpawn } = require('child_process');
      const isWin = process.platform === 'win32';

      const safeArgs = Array.isArray(shellArgs) ? shellArgs : (isWin ? [] : ['-i']);
      const safeCwd = typeof cwd === 'string' && cwd.length > 0 ? cwd : this.resolveCwd();

      const child = cpSpawn(
        shell,
        safeArgs,
        {
          cwd: safeCwd,
          env: env || process.env,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      const resolvedOnData = onData || this.defaultOnData;
      const resolvedOnExit = onExit || this.defaultOnExit;

      child.on('error', (err) => {
        console.error(`[PTYManager] Subprocess error on session ${id}:`, err);
        if (typeof resolvedOnData === 'function') {
          resolvedOnData(id, `\r\n[PTYManager Error] Failed to execute shell: ${err.message}\r\n`);
        }
      });

      child.stdout.on('data', (d) => {
        if (typeof resolvedOnData === 'function') resolvedOnData(id, d.toString());
      });
      child.stderr.on('data', (d) => {
        if (typeof resolvedOnData === 'function') resolvedOnData(id, d.toString());
      });
      child.on('exit', (exitCode, signal) => {
        this.sessions.delete(id);
        if (typeof resolvedOnExit === 'function') resolvedOnExit(id, { exitCode: exitCode || 0, signal });
      });

      const wrapper = {
        write: (data) => {
          if (child.stdin && !child.stdin.destroyed) {
            let chunk = data;
            if (isWin && chunk.endsWith('\r') && !chunk.endsWith('\r\n')) {
              chunk = chunk + '\n';
            }
            child.stdin.write(chunk);
          }
        },
        resize: () => {},
        kill: () => {
          try {
            if (isWin && child.pid) {
              const { exec } = require('child_process');
              exec(`taskkill /pid ${child.pid} /t /f`, () => {});
            } else {
              child.kill();
            }
          } catch {}
        },
      };

      this.sessions.set(id, {
        pty: wrapper,
        id,
        shell,
        cwd: safeCwd,
        createdAt: Date.now(),
        isFallback: true,
        onData: resolvedOnData,
        onExit: resolvedOnExit,
      });

      console.log(`[PTYManager] Spawned fallback shell session ${id} (${shell}) in ${safeCwd}`);
      return { id, shell, cwd: safeCwd, cols, rows };
    } catch (err) {
      console.error(`[PTYManager] Error spawning fallback shell for session ${id}:`, err);
      throw err;
    }
  }

  /**
   * Write keystrokes or input commands to PTY
   * @param {string} id
   * @param {string} data
   */
  write(id, data) {
    let session = this.sessions.get(id);
    if (!session) {
      console.warn(`[PTYManager] Cannot write: session "${id}" not found. Auto-recovering session...`);
      const shell = process.platform === 'win32' ? (process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe') : this.getDefaultShell();
      const cwd = this.resolveCwd();
      this.spawnChildProcessFallback(id, shell, [], cwd, 140, 36, process.env, this.defaultOnData, this.defaultOnExit);
      session = this.sessions.get(id);
      if (!session) return false;
    }
    let formatted = data;
    if (session.isFallback && process.platform === 'win32') {
      if (formatted.endsWith('\r') && !formatted.endsWith('\r\n')) {
        formatted = formatted + '\n';
      }
    }
    session.pty.write(formatted);
    return true;
  }

  /**
   * Resize terminal dimensions
   * @param {string} id
   * @param {number} cols
   * @param {number} rows
   */
  resize(id, cols, rows) {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    const safeCols = Math.max(10, Math.floor(cols || 80));
    const safeRows = Math.max(5, Math.floor(rows || 24));

    if (session.lastCols === safeCols && session.lastRows === safeRows) {
      return true; // Ignore redundant resize calls
    }
    session.lastCols = safeCols;
    session.lastRows = safeRows;

    try {
      if (session.pty && typeof session.pty.resize === 'function') {
        session.pty.resize(safeCols, safeRows);
      }
      return true;
    } catch (err) {
      console.error(`[PTYManager] Failed to resize session ${id}:`, err.message);
      return false;
    }
  }

  /**
   * Terminate a specific terminal session
   * @param {string} id
   */
  kill(id) {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    this.sessions.delete(id);
    try {
      session.pty.kill();
      console.log(`[PTYManager] Killed session ${id}`);
      return true;
    } catch (err) {
      console.warn(`[PTYManager] Cleaned up session ${id}:`, err.message);
      return true;
    }
  }

  /**
   * Clean up all active sessions (e.g., when Electron quits)
   */
  killAll() {
    for (const [id, session] of this.sessions.entries()) {
      try {
        session.pty.kill();
      } catch (e) {
        // Ignore exit errors on app shutdown
      }
    }
    this.sessions.clear();
  }

  /**
   * List active sessions
   */
  getSessions() {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      shell: s.shell,
      cwd: s.cwd,
      createdAt: s.createdAt,
    }));
  }
}

module.exports = { PTYManager };
