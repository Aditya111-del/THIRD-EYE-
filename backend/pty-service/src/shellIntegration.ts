/**
 * Shell Integration & OSC Sequence Parser (Phase 3)
 * Tracks working directory (CWD), prompt boundaries, and command exit codes.
 */

export interface ShellState {
  cwd: string;
  lastExitCode?: number;
  inCommand: boolean;
  lastCommand?: string;
}

export class ShellIntegrationParser {
  private state: ShellState;
  private onCwdChange?: (newCwd: string) => void;
  private onCommandFinish?: (exitCode: number) => void;

  constructor(initialCwd: string) {
    this.state = {
      cwd: initialCwd,
      inCommand: false,
    };
  }

  public setCallbacks(callbacks: {
    onCwdChange?: (newCwd: string) => void;
    onCommandFinish?: (exitCode: number) => void;
  }) {
    this.onCwdChange = callbacks.onCwdChange;
    this.onCommandFinish = callbacks.onCommandFinish;
  }

  /**
   * Parse chunk for OSC 633 / OSC 133 / OSC 7 sequences
   */
  public parseChunk(chunk: string): string {
    // OSC 7: Operating System Command 7 (CWD reporting: \x1b]7;file://hostname/path\x07)
    const osc7Regex = /\x1b\]7;file:\/\/[^\/]*([^\x07\x1b]+)(?:\x07|\x1b\\)/g;
    let match: RegExpExecArray | null;
    while ((match = osc7Regex.exec(chunk)) !== null) {
      try {
        let reportedPath = decodeURIComponent(match[1]);
        if (process.platform === 'win32' && reportedPath.startsWith('/')) {
          reportedPath = reportedPath.substring(1);
        }
        if (reportedPath && reportedPath !== this.state.cwd) {
          this.state.cwd = reportedPath;
          if (this.onCwdChange) this.onCwdChange(reportedPath);
        }
      } catch {}
    }

    // OSC 633;D;exitCode (Command finished)
    const osc633DRegex = /\x1b\]633;D(?:;([0-9]+))?(?:\x07|\x1b\\)/g;
    while ((match = osc633DRegex.exec(chunk)) !== null) {
      const exitCode = match[1] !== undefined ? parseInt(match[1], 10) : 0;
      this.state.lastExitCode = exitCode;
      this.state.inCommand = false;
      if (this.onCommandFinish) this.onCommandFinish(exitCode);
    }

    // OSC 633;C (Command executing)
    if (chunk.includes('\x1b]633;C')) {
      this.state.inCommand = true;
    }

    return chunk;
  }

  public getState(): ShellState {
    return { ...this.state };
  }

  public setCwd(newCwd: string): void {
    this.state.cwd = newCwd;
  }
}
