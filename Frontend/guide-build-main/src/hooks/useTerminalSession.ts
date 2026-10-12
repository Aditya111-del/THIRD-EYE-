import { useCallback, useState, useEffect, useRef } from "react";
import type { Environment, Protocol, Session, TermLine, TerminalInstance } from "@/types/terminal";
import { clearSessionDataCache } from "@/components/terminal/terminalState";
import { readFromClipboard } from "@/lib/clipboard";

export const initialEnvs: Environment[] = [
  {
    id: "local",
    protocol: "local",
    name: "Local Workstation",
    online: true,
    services: [
      {
        id: "shells",
        name: "Terminal Shells",
        terminals: [],
      },
    ],
  },
];

function stripAnsi(str: string): string {
  if (typeof str !== "string") return "";
  return str
    // Strip OSC sequences (e.g. \x1b]633;D;... ending with \x07 or \x1b\)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    // Strip DCS, APC, PM sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[P^_][^\x1b]*\x1b\\/g, "")
    // Strip standard ANSI / CSI escape sequences (including cursor moves like \x1b[1;1H, \x1b[2K, etc.)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    // Stray escape characters
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[@-Z\\-_]/g, "")
    // Control characters except newline and tab
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
}

let counter = 0;
export function makeSession(
  t: TerminalInstance,
  protocol: Protocol,
  shellType: 'cmd' | 'powershell' = 'cmd',
  workspaceDir?: string
): Session {
  const sessionId = `s${++counter}`;
  const isSSH = protocol === "ssh";
  const isLocal = protocol === "local";
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
  const resolvedType = t.shellType || shellType;
  const defaultShellName = isMac ? "zsh" : (resolvedType === "powershell" ? "Windows PowerShell" : "Command Prompt");
  const shellName = t.name || defaultShellName;
  const shellExe = resolvedType === "powershell" ? "powershell.exe" : (isMac ? "/bin/zsh" : "cmd.exe");
  const projectDir = workspaceDir || (typeof window !== "undefined" ? (window as any).__THIRD_EYE_WORKSPACE_ROOT__ : "") || "/Users/adityasalgotra/Downloads/THIRD_EYE";

  return {
    id: sessionId,
    terminalId: t.id,
    title: t.name || shellName,
    protocol,
    cwd: isLocal ? projectDir : "~",
    user: isMac ? "adityasalgotra" : "aditya.s.ctr",
    shellType: resolvedType,
    shell: shellExe,
    lines: isSSH
      ? [
          { kind: "info", text: `[THIRD EYE SSH] Session initialized for ${t.host}` },
          { kind: "info", text: `Connecting to ${t.host}...` },
        ]
      : [
          { kind: "input", text: "rakibulislam@panze-studio ~/universal-agent-skills (main) $ next dev" },
          { kind: "out", text: "▲ Next.js 15.0.3" },
          { kind: "out", text: "- Local: http://localhost:3000" },
          { kind: "out", text: "✓ Ready in 1.2s" },
          { kind: "out", text: "✓ Compiled /agents in 412ms" },
          { kind: "input", text: "rakibulislam@panze-studio ~/universal-agent-skills (main) $ " },
        ],
    currentPrompt: "",
    lastError: undefined,
    ptyId: sessionId,
  };
}

function runMock(cmd: string, s: Session): { lines: TermLine[]; error?: string; cwd?: string; clear?: boolean } {
  const [bin, ...args] = cmd.trim().split(/\s+/);
  switch (bin) {
    case "": return { lines: [] };
    case "clear":
    case "cls": return { lines: [], clear: true };
    case "help": return { lines: [{ kind: "out", text: "commands: dir, ls, cd, ipconfig, ping, ssh, npm, git, clear, cls" }] };
    case "ls":
    case "dir": return { lines: [{ kind: "out", text: "dist  node_modules  package.json  src  .env  electron" }] };
    case "pwd": return { lines: [{ kind: "out", text: s.cwd === "~" ? `/home/${s.user}` : s.cwd }] };
    case "cd": return { lines: [], cwd: args[0] ?? "~" };
    case "whoami": return { lines: [{ kind: "out", text: s.user }] };
    case "ssh": return { lines: [{ kind: "info", text: `Connecting to ${args[0] || "host"}...` }] };
    default: return { lines: [{ kind: "error", text: `'${bin}' is not recognized as an internal or external command` }], error: `Command '${bin}' not found` };
  }
}

export function useTerminalSession() {
  const [envs, setEnvs] = useState(initialEnvs);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const initialWorkspace = (typeof window !== "undefined" && (window as any).__THIRD_EYE_WORKSPACE_ROOT__) || "/Users/adityasalgotra/Downloads/THIRD_EYE";
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(initialWorkspace);

  const active = sessions.find((s) => s.id === activeId) ?? (sessions.length > 0 ? sessions[0] : undefined);
  const spawnedPtySet = useRef<Set<string>>(new Set());
  const lastCommandRef = useRef<{ cmd: string; time: number }>({ cmd: "", time: 0 });
  const workspaceRootRef = useRef<string>(initialWorkspace);
  const sessionsRef = useRef<Session[]>([]);
  const activeIdRef = useRef<string>("");

  sessionsRef.current = sessions;
  activeIdRef.current = activeId;

  // Synchronize workspace root on mount and listen to project switch events
  useEffect(() => {
    if (window.electronAPI?.fs?.getWorkspaceRoot) {
      window.electronAPI.fs.getWorkspaceRoot().then((root: string) => {
        if (root) {
          (window as any).__THIRD_EYE_WORKSPACE_ROOT__ = root;
          setWorkspaceRoot(root);
          workspaceRootRef.current = root;
          setSessions((prev) =>
            prev.map((s) => (s.protocol === "local" ? { ...s, cwd: root } : s))
          );
        }
      }).catch(() => {});
    }

    let unsub: (() => void) | undefined;
    if (window.electronAPI?.workspace?.onRootChanged) {
      unsub = window.electronAPI.workspace.onRootChanged((data: { root: string; name: string }) => {
        if (data?.root) {
          const newRoot = data.root;
          console.log(`[useTerminalSession] Project switched to: ${newRoot}. Auto-directing terminal.`);
          (window as any).__THIRD_EYE_WORKSPACE_ROOT__ = newRoot;
          setWorkspaceRoot(newRoot);
          workspaceRootRef.current = newRoot;

          // 1. Update working directory on all local sessions
          setSessions((prev) =>
            prev.map((s) => (s.protocol === "local" ? { ...s, cwd: newRoot } : s))
          );

          // 2. Direct all active terminal processes directly into the new project directory
          if (window.electronAPI?.terminal?.cd) {
            window.electronAPI.terminal.cd({ dir: newRoot });
          } else if (window.electronAPI?.terminal?.write) {
            const term = window.electronAPI.terminal;
            sessionsRef.current.forEach((s) => {
              if (s.ptyId && s.protocol === "local") {
                term.write(s.ptyId, `cd "${newRoot}"\r`);
              }
            });
          }
        }
      });
    }

    return () => {
      unsub?.();
    };
  }, []);

  // Spawn real PTY session for local shells
  const ensurePtySpawned = useCallback((sessionId: string, shellType: 'cmd' | 'powershell' = 'cmd') => {
    if (!window.electronAPI || spawnedPtySet.current.has(sessionId)) return;
    spawnedPtySet.current.add(sessionId);

    const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
    const targetCwd = workspaceRootRef.current || undefined;

    window.electronAPI.terminal.spawn({
      id: sessionId,
      shellType,
      shell: isMac ? '/bin/zsh' : (shellType === 'powershell' ? 'powershell.exe' : 'cmd.exe'),
      cwd: targetCwd,
      cols: 120,
      rows: 24,
    }).then((res) => {
      if (res.success) {
        setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, ptyId: sessionId, cwd: res.cwd || targetCwd || s.cwd } : s));
      }
    }).catch((err) => {
      console.warn(`[useTerminalSession] Could not spawn PTY for ${sessionId}:`, err);
    });
  }, []);

  // Hook into Electron PTY streaming data and AI error events (stable lifecycle)
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribeData = window.electronAPI.terminal.onData((payload) => {
      let rawClean = stripAnsi(payload.data);
      // Strip initial zsh PROMPT_EOL_MARK sequence (% followed by padded spaces and \r)
      rawClean = rawClean.replace(/^%[ ]{10,}\r[ ]*\r?/g, "");
      const clean = rawClean;
      if (!clean) return;

      setSessions((prev) => prev.map((s) => {
        if (s.id !== payload.id && s.ptyId !== payload.id) return s;

        // 1. Dynamically track real working directory & remote environment from shell prompt
        let detectedCwd = s.cwd;
        let detectedProtocol = s.protocol;
        let detectedUser = s.user;
        let detectedIp = s.ip;
        let detectedTitle = s.title;

        // Windows drive prompt (e.g. C:\Users\... or PS C:\Users\...>)
        const promptMatches = [...clean.matchAll(/(?:PS\s+)?([a-zA-Z]:\\[^<>:"/|?*\r\n]*?)>/g)];
        if (promptMatches.length > 0) {
          const lastMatch = promptMatches[promptMatches.length - 1];
          if (lastMatch && lastMatch[1]) {
            detectedCwd = lastMatch[1].trim();
            if (clean.includes("Connection to") || clean.includes("closed") || clean.includes("logout")) {
              detectedProtocol = "local";
            }
          }
        }

        // Linux / SSH prompt: user@host:path$ or user@host:path#
        const linuxMatches = [...clean.matchAll(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([^\r\n$#>]*)[$#]/g)];
        if (linuxMatches.length > 0) {
          const lastLinux = linuxMatches[linuxMatches.length - 1];
          if (lastLinux && lastLinux[1] && lastLinux[2]) {
            detectedUser = lastLinux[1];
            detectedIp = lastLinux[2];
            detectedCwd = lastLinux[3]?.trim() || "~";
            detectedProtocol = "ssh";
            if (detectedTitle.startsWith("Command Prompt") || detectedTitle.startsWith("Windows PowerShell") || detectedTitle.startsWith("zsh")) {
              detectedTitle = `SSH: ${detectedUser}@${detectedIp}`;
            }
          }
        }

        // macOS / zsh prompt: user@host dir % or dir %
        const macMatches = [...clean.matchAll(/(?:([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+)\s+)?([^\r\n%#$]+)\s+[%#$]/g)];
        if (macMatches.length > 0) {
          const lastMac = macMatches[macMatches.length - 1];
          if (lastMac) {
            if (lastMac[1]) detectedUser = lastMac[1];
            if (lastMac[2]) detectedIp = lastMac[2];
            if (lastMac[3]) {
              const possibleCwd = lastMac[3].trim();
              if (possibleCwd.startsWith("/")) {
                detectedCwd = possibleCwd;
              } else if (s.cwd && s.cwd.split("/").pop()?.trim() === possibleCwd) {
                detectedCwd = s.cwd;
              } else if (workspaceRootRef.current && workspaceRootRef.current.split("/").pop()?.trim() === possibleCwd) {
                detectedCwd = workspaceRootRef.current;
              } else if (typeof window !== "undefined" && (window as any).__THIRD_EYE_WORKSPACE_ROOT__ && (window as any).__THIRD_EYE_WORKSPACE_ROOT__.split("/").pop()?.trim() === possibleCwd) {
                detectedCwd = (window as any).__THIRD_EYE_WORKSPACE_ROOT__;
              }
            }
          }
        }

        // 2. Normalize CRLF line endings
        const normalizedChunk = clean.replace(/\r+\n/g, '\n');

        // 3. Accumulate stream chunks with active pending prompt
        let pending = (s.currentPrompt || "") + normalizedChunk;

        // Decouple prompt from preceding text in buffer
        pending = pending.replace(/([^\r\n])\s*((?:PS\s+)?[a-zA-Z]:\\[^<>:"/|?*\r\n]*>\s*)/g, "$1\n$2");
        pending = pending.replace(/([^\r\n])\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^$#\r\n]*[$#]\s*)/g, "$1\n$2");
        pending = pending.replace(/([^\r\n])\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\s+[^%#$\r\n]*[%#$]\s*)/g, "$1\n$2");

        // 4. Split by newline
        const parts = pending.split('\n');
        const completedParts = parts.slice(0, -1);
        let newPrompt = parts[parts.length - 1] ?? "";

        // 5. Clean standalone carriage returns without erasing content
        const cleanCr = (t: string): string => {
          if (!t.includes('\r')) return t;
          const segments = t.split('\r').filter((seg) => seg.length > 0);
          return segments.length > 0 ? (segments[segments.length - 1] ?? "") : "";
        };

        const processedCompleted = completedParts.map(cleanCr);
        newPrompt = cleanCr(newPrompt);

        // 6. Guarantee that newPrompt does NOT contain preceding banner lines
        const promptMatch = newPrompt.match(/((?:PS\s+)?[a-zA-Z]:\\[^<>:"/|?*\r\n]*>\s*|[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^$#\r\n]*[$#]\s*|[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\s+[^%#$\r\n]*[%#$]\s*)$/);
        if (promptMatch && promptMatch.index !== undefined && promptMatch.index > 0) {
          const preceding = newPrompt.slice(0, promptMatch.index).trim();
          const actualPrompt = newPrompt.slice(promptMatch.index);
          if (preceding) {
            processedCompleted.push(preceding);
          }
          newPrompt = actualPrompt;
        }

        // 7. Filter out excessive consecutive blank lines and standalone zsh PROMPT_EOL_MARK artifacts
        const cleanedLines: string[] = [];
        for (const line of processedCompleted) {
          const trimmed = line.trim();
          if (trimmed === "%" || trimmed === "#" || trimmed === "$") {
            continue; // Filter isolated shell EOL marker / prompt artifacts
          }
          if (trimmed === "") {
            if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1]?.trim() === "") {
              continue;
            }
          }
          cleanedLines.push(line);
        }

        const newTermLines: TermLine[] = cleanedLines.map((text) => {
          const isErr = /(error|exception|eaddrinuse|fatal|failed|timed out|refused|permission denied|could not resolve|cannot find the path|is not recognized as an internal)/i.test(text)
            && !/(0 error|no error)/i.test(text);
          return {
            kind: isErr ? "error" : "out",
            text,
          };
        });

        const detectedErr = newTermLines.find((l) => l.kind === "error");
        return {
          ...s,
          cwd: detectedCwd,
          protocol: detectedProtocol,
          user: detectedUser,
          ip: detectedIp,
          title: detectedTitle,
          lines: [...s.lines, ...newTermLines].slice(-1500),
          currentPrompt: newPrompt,
          lastError: detectedErr ? detectedErr.text : s.lastError,
        };
      }));
    });

    // Listen to background AI error detection events
    const unsubscribeError = window.electronAPI.ai.onErrorDetected((event) => {
      const curActiveId = activeIdRef.current;
      setSessions((prev) => prev.map((s) => {
        if (s.id === event.terminalId || s.id === curActiveId) {
          return {
            ...s,
            lastError: `${event.errorSummary}: ${event.snippet}`,
          };
        }
        return s;
      }));
    });

    return () => {
      unsubscribeData();
      unsubscribeError();
    };
  }, []);

  // Create and launch a new terminal session
  const createTerminal = useCallback((type: 'cmd' | 'powershell' = 'cmd', meta?: Partial<Session> & { initialCommand?: string }) => {
    const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
    const id = `term-${Date.now()}`;
    const defaultShell = isMac ? 'zsh' : (type === 'powershell' ? 'PowerShell' : 'cmd');
    const newTerm: TerminalInstance = {
      id,
      name: meta?.title || (sessionsRef.current.length === 0 ? defaultShell : `${defaultShell} #${sessionsRef.current.length + 1}`),
      host: meta?.ip || (type === 'powershell' ? 'powershell@localhost' : 'cmd@localhost'),
      shellType: type,
    };

    const s = makeSession(newTerm, meta?.protocol || 'local', type, workspaceRootRef.current);
    if (meta?.title) s.title = meta.title;
    if (meta?.ip) s.ip = meta.ip;
    if (meta?.user) s.user = meta.user;
    if (meta?.ticketId) s.ticketId = meta.ticketId;
    if (meta?.vmNodeId) s.vmNodeId = meta.vmNodeId;
    if (meta?.protocol) s.protocol = meta.protocol;
    if (meta?.protocol === 'ssh') s.cwd = '~';

    setEnvs((prev) => prev.map((e) => {
      if (e.id === "local") {
        return {
          ...e,
          services: [{
            ...e.services[0],
            id: e.services[0]?.id || "shells",
            name: e.services[0]?.name || "Terminal Shells",
            terminals: [...(e.services[0]?.terminals || []), newTerm],
          }],
        };
      }
      return e;
    }));

    setSessions((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
    setActiveId(s.id);
    clearSessionDataCache(s.id);
    clearSessionDataCache(id);

    // Spawn real PTY session
    if (window.electronAPI) {
      spawnedPtySet.current.add(s.id);
      const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
      const targetCwd = workspaceRootRef.current || s.cwd;

      window.electronAPI.terminal.spawn({
        id: s.id,
        shellType: type,
        shell: isMac ? '/bin/zsh' : (type === 'powershell' ? 'powershell.exe' : 'cmd.exe'),
        cwd: targetCwd,
        cols: 120,
        rows: 24,
      }).then((res) => {
        if (res.success) {
          setSessions((prev) => prev.map((item) => item.id === s.id ? { ...item, ptyId: s.id, cwd: res.cwd || targetCwd || item.cwd } : item));
        }
        if (meta?.initialCommand) {
          setTimeout(() => {
            if (window.electronAPI) {
              window.electronAPI.terminal.write(s.id, `${meta.initialCommand}\r\n`);
            }
          }, 450);
        }
      }).catch((err) => {
        console.warn(`[useTerminalSession] Could not spawn PTY for ${s.id}:`, err);
      });
    }
  }, []);

  const connectSsh = useCallback((options: {
    title: string;
    ip: string;
    user: string;
    keyPath?: string;
    ticketId?: string;
    vmNodeId?: string;
  }) => {
    let sshCmd = `ssh ${options.user}@${options.ip}`;
    if (options.keyPath) {
      sshCmd = `ssh -i "${options.keyPath}" ${options.user}@${options.ip}`;
    }
    createTerminal('cmd', {
      title: options.title || `SSH ${options.ip}`,
      protocol: 'ssh',
      ip: options.ip,
      user: options.user,
      ticketId: options.ticketId,
      vmNodeId: options.vmNodeId,
      initialCommand: sshCmd,
    });
  }, [createTerminal]);

  const openTerminal = useCallback((t: TerminalInstance, protocol: Protocol) => {
    setSessions((prev) => {
      const existing = prev.find((s) => s.terminalId === t.id);
      if (existing) {
        setActiveId(existing.id);
        ensurePtySpawned(existing.id, existing.shellType);
        return prev;
      }
      const s = makeSession(t, protocol, t.shellType || 'cmd', workspaceRootRef.current);
      setActiveId(s.id);
      ensurePtySpawned(s.id, t.shellType);

      if (protocol === "ssh" && t.host && t.host !== "local@host") {
        setTimeout(() => {
          if (window.electronAPI) {
            window.electronAPI.terminal.write(s.id, `ssh ${t.host}\r\n`);
          }
        }, 700);
      }

      return [...prev, s];
    });
  }, [ensurePtySpawned]);

  const closeSession = useCallback((id: string) => {
    const targetSession = sessionsRef.current.find((s) => s.id === id);
    const terminalIdToRemove = targetSession?.terminalId || id;
    const ptyIdToKill = targetSession?.ptyId || id;

    if (window.electronAPI) {
      window.electronAPI.terminal.kill(ptyIdToKill);
      spawnedPtySet.current.delete(ptyIdToKill);
      spawnedPtySet.current.delete(id);
    }
    clearSessionDataCache(id);
    clearSessionDataCache(ptyIdToKill);

    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length) {
        if (id === activeIdRef.current) setActiveId(next[next.length - 1]!.id);
      } else {
        setActiveId("");
      }
      return next;
    });

    setEnvs((prev) => prev.map((e) => {
      if (e.id === "local") {
        return {
          ...e,
          services: [{
            ...e.services[0],
            id: e.services[0]?.id || "shells",
            name: e.services[0]?.name || "Terminal Shells",
            terminals: e.services[0]?.terminals.filter((t) => t.id !== id && t.id !== terminalIdToRemove) || [],
          }],
        };
      }
      return e;
    }));
  }, []);

  const execute = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    const curActiveId = activeIdRef.current;
    const currentSession = sessionsRef.current.find((s) => s.id === curActiveId) || sessionsRef.current[0];
    if (!currentSession) return;

    const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
    const isPowerShell = currentSession.shellType === "powershell";
    const defaultUser = isMac ? "adityasalgotra" : "aditya.s.ctr";
    const defaultCwd = workspaceRootRef.current || currentSession.cwd || (isMac ? "/Users/adityasalgotra/Downloads/THIRD_EYE" : "C:\\Users\\aditya.s.ctr");
    const defaultPrompt = isMac
      ? `${defaultUser} ${defaultCwd.split("/").pop() || "workspace"} % `
      : isPowerShell
      ? `PS ${defaultCwd}> `
      : `${defaultCwd}>`;
    const promptText = (currentSession.currentPrompt && currentSession.currentPrompt.trim().length > 0)
      ? currentSession.currentPrompt.trimEnd()
      : defaultPrompt;

    const targetPtyId = currentSession.ptyId || currentSession.id;

    if (trimmed === "clear" || trimmed === "cls") {
      clearSessionDataCache(targetPtyId);
      clearSessionDataCache(currentSession.id);
      if (window.electronAPI && targetPtyId) {
        const isWin = typeof navigator !== "undefined" && !/mac|linux/i.test(navigator.userAgent);
        window.electronAPI.terminal.write(targetPtyId, isWin ? "cls\r\n" : "clear\r\n");
      }
      setSessions((prev) => prev.map((s) => s.id === currentSession.id ? {
        ...s,
        lines: [],
        currentPrompt: promptText,
        lastError: undefined,
      } : s));
      return;
    }

    lastCommandRef.current = { cmd: trimmed, time: Date.now() };

    // Commit command line immediately so what the user typed is never lost or delayed
    setSessions((prev) => prev.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        lines: [...s.lines, { kind: "input" as const, text: `${promptText} ${cmd}` }],
        currentPrompt: "",
      };
    }));

    // Real Electron PTY execution
    if (window.electronAPI && targetPtyId) {
      window.electronAPI.terminal.write(targetPtyId, `${cmd}\r\n`);
      return;
    }

    // Fallback mock simulation for browser preview
    try {
      fetch("http://localhost:4001/api/pty/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetPtyId, data: `${cmd}\r\n` }),
      }).catch(() => {});
    } catch {
      // Microservice not running, proceed to mock
    }

    const r = runMock(cmd, currentSession);
    setSessions((prev) => prev.map((s) => s.id === currentSession.id ? {
      ...s,
      lines: [...s.lines, ...r.lines],
      cwd: r.cwd ?? s.cwd,
      currentPrompt: `${r.cwd ?? s.cwd}>`,
      lastError: r.error ?? (r.lines.some((l) => l.kind === "success") ? undefined : s.lastError),
    } : s));
  }, []);

  const dismissError = useCallback(() => {
    const curActiveId = activeIdRef.current;
    setSessions((prev) => prev.map((s) => s.id === curActiveId ? { ...s, lastError: undefined } : s));
  }, []);

  const killAndRestart = useCallback(async () => {
    const curActiveId = activeIdRef.current;
    const current = sessionsRef.current.find((s) => s.id === curActiveId);
    if (!current) return;

    const targetPtyId = current.ptyId || current.id;
    if (window.electronAPI && targetPtyId) {
      clearSessionDataCache(targetPtyId);
      clearSessionDataCache(current.id);
      await window.electronAPI.terminal.kill(targetPtyId);
      spawnedPtySet.current.delete(targetPtyId);

      const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
      const targetCwd = workspaceRootRef.current || current.cwd;

      // Respawn fresh shell directly in project root
      const res = await window.electronAPI.terminal.spawn({
        id: targetPtyId,
        shellType: current.shellType,
        shell: isMac ? '/bin/zsh' : (current.shellType === 'powershell' ? 'powershell.exe' : 'cmd.exe'),
        cwd: targetCwd,
        cols: 120,
        rows: 24,
      });
      spawnedPtySet.current.add(targetPtyId);

      setSessions((prev) => prev.map((s) => s.id === curActiveId ? {
        ...s,
        lastError: undefined,
        cwd: res.cwd || targetCwd || s.cwd,
        lines: [],
        currentPrompt: "",
      } : s));
      return;
    }

    // Mock browser fallback
    setSessions((prev) => prev.map((s) => s.id !== curActiveId ? s : {
      ...s, lastError: undefined,
      lines: [],
    }));
  }, []);

  const toggleShellType = useCallback(async () => {
    const curActiveId = activeIdRef.current;
    const current = sessionsRef.current.find((s) => s.id === curActiveId);
    if (!current) return;

    const nextType: 'cmd' | 'powershell' = current.shellType === 'powershell' ? 'cmd' : 'powershell';
    const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
    const nextShellName = isMac ? 'zsh' : (nextType === 'powershell' ? 'Windows PowerShell' : 'Command Prompt');
    const targetCwd = workspaceRootRef.current || current.cwd;
    const targetPtyId = current.ptyId || current.id;

    if (window.electronAPI && targetPtyId) {
      await window.electronAPI.terminal.kill(targetPtyId);
      spawnedPtySet.current.delete(targetPtyId);

      const res = await window.electronAPI.terminal.spawn({
        id: targetPtyId,
        shellType: nextType,
        shell: isMac ? '/bin/zsh' : (nextType === 'powershell' ? 'powershell.exe' : 'cmd.exe'),
        cwd: targetCwd,
        cols: 120,
        rows: 24,
      });
      spawnedPtySet.current.add(targetPtyId);

      setSessions((prev) => prev.map((s) => s.id === curActiveId ? {
        ...s,
        shellType: nextType,
        shell: isMac ? '/bin/zsh' : (nextType === 'powershell' ? 'powershell.exe' : 'cmd.exe'),
        title: `${nextShellName} #${sessionsRef.current.findIndex((x) => x.id === curActiveId) + 1 || 1}`,
        lastError: undefined,
        cwd: res.cwd || targetCwd || s.cwd,
        lines: [],
        currentPrompt: "",
      } : s));
      return;
    }

    setSessions((prev) => prev.map((s) => s.id === curActiveId ? {
      ...s,
      shellType: nextType,
      shell: isMac ? '/bin/zsh' : (nextType === 'powershell' ? 'powershell.exe' : 'cmd.exe'),
      title: `${nextShellName} #${sessionsRef.current.findIndex((x) => x.id === curActiveId) + 1 || 1}`,
      lastError: undefined,
      lines: [],
    } : s));
  }, []);

  const addEnvironment = useCallback((protocol: Protocol, name: string, host: string) => {
    const id = `env-${Date.now()}`;
    const newTerminal: TerminalInstance = { id: `${id}-t`, name, host };
    const newEnv: Environment = {
      id,
      protocol,
      name,
      online: true,
      services: [{ id: `${id}-s`, name: "default", terminals: [newTerminal] }],
    };
    setEnvs((e) => [...e, newEnv]);
    openTerminal(newTerminal, protocol);
  }, [openTerminal]);

  const toggleEnv = useCallback((id: string) => {
    setEnvs((e) => e.map((x) => x.id === id ? { ...x, online: !x.online } : x));
  }, []);

  const write = useCallback((text: string) => {
    if (!text) return;
    const curActiveId = activeIdRef.current;
    const currentSession = sessionsRef.current.find((s) => s.id === curActiveId) || sessionsRef.current[0];
    if (!currentSession) return;
    const targetId = currentSession.ptyId || currentSession.id;
    if (window.electronAPI && targetId) {
      window.electronAPI.terminal.write(targetId, text);
    }
  }, []);

  const cdToDirectory = useCallback((dir: string) => {
    if (!dir) return;
    const curActiveId = activeIdRef.current;
    const targetSession = sessionsRef.current.find((s) => s.id === curActiveId) || sessionsRef.current[0];
    const targetPtyId = targetSession?.ptyId || targetSession?.id;

    if (window.electronAPI?.terminal?.cd) {
      window.electronAPI.terminal.cd({ ...(targetPtyId ? { id: targetPtyId } : {}), dir });
    } else if (targetPtyId && window.electronAPI) {
      window.electronAPI.terminal.write(targetPtyId, `cd "${dir}"\r`);
    }

    workspaceRootRef.current = dir;
    setWorkspaceRoot(dir);
    if (typeof window !== "undefined") {
      (window as any).__THIRD_EYE_WORKSPACE_ROOT__ = dir;
    }

    if (targetSession) {
      setSessions((prev) =>
        prev.map((s) => (s.id === targetSession.id ? { ...s, cwd: dir } : s))
      );
    }
  }, []);

  const lastSessionPasteRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  const pasteFromClipboard = useCallback(async () => {
    const text = await readFromClipboard();
    if (text) {
      const now = Date.now();
      if (now - lastSessionPasteRef.current.time < 350 && text === lastSessionPasteRef.current.text) {
        return text;
      }
      lastSessionPasteRef.current = { text, time: now };
      write(text);
    }
    return text;
  }, [write]);

  return {
    envs,
    sessions,
    active,
    activeId,
    setActiveId,
    createTerminal,
    connectSsh,
    openTerminal,
    closeSession,
    execute,
    write,
    cdToDirectory,
    workspaceRoot,
    pasteFromClipboard,
    killAndRestart,
    toggleShellType,
    dismissError,
    addEnvironment,
    toggleEnv,
  };
}

export type TerminalApi = ReturnType<typeof useTerminalSession>;
