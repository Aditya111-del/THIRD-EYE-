import { useCallback, useState, useEffect, useRef } from "react";
import type { Environment, Protocol, Session, TermLine, TerminalInstance } from "@/types/terminal";
import { clearSessionDataCache } from "@/components/terminal/XtermView";
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

const seed: Record<string, TermLine[]> = {};

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
  shellType: 'cmd' | 'powershell' = 'cmd'
): Session {
  const sessionId = `s${++counter}`;
  const isSSH = protocol === "ssh";
  const isLocal = protocol === "local";
  const resolvedType = t.shellType || shellType;
  const shellName = resolvedType === "powershell" ? "Windows PowerShell" : "Command Prompt";
  const shellExe = resolvedType === "powershell" ? "powershell.exe" : "cmd.exe";

  return {
    id: sessionId,
    terminalId: t.id,
    title: t.name || shellName,
    protocol,
    cwd: isLocal ? "C:\\Users\\aditya.s.ctr" : "~",
    user: "aditya.s.ctr",
    shellType: resolvedType,
    shell: shellExe,
    lines: isSSH
      ? [
          { kind: "info", text: `[THIRD EYE SSH] Session initialized for ${t.host}` },
          { kind: "info", text: `Connecting to ${t.host}...` },
        ]
      : [],
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
  const active = sessions.find((s) => s.id === activeId) ?? (sessions.length > 0 ? sessions[0] : undefined);
  const spawnedPtySet = useRef<Set<string>>(new Set());
  const lastCommandRef = useRef<{ cmd: string; time: number }>({ cmd: "", time: 0 });

  // Spawn real PTY session for local shells
  const ensurePtySpawned = useCallback((sessionId: string, shellType: 'cmd' | 'powershell' = 'cmd') => {
    if (!window.electronAPI || spawnedPtySet.current.has(sessionId)) return;
    spawnedPtySet.current.add(sessionId);

    window.electronAPI.terminal.spawn({
      id: sessionId,
      shellType,
      shell: shellType === 'powershell' ? 'powershell.exe' : 'cmd.exe',
      cols: 120,
      rows: 24,
    }).then((res) => {
      if (res.success) {
        setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, ptyId: sessionId, cwd: res.cwd || s.cwd } : s));
      }
    }).catch((err) => {
      console.warn(`[useTerminalSession] Could not spawn PTY for ${sessionId}:`, err);
    });
  }, []);

  // Hook into Electron PTY streaming data
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribeData = window.electronAPI.terminal.onData((payload) => {
      const clean = stripAnsi(payload.data);
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
            // If connection closed or returned to Windows local prompt
            if (clean.includes("Connection to") || clean.includes("closed") || clean.includes("logout")) {
              detectedProtocol = "local";
            }
          }
        }

        // Linux / SSH prompt: user@host:path$ or user@host:path# or [user@host path]$
        const linuxMatches = [...clean.matchAll(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([^\r\n$#>]*)[$#]/g)];
        if (linuxMatches.length > 0) {
          const lastLinux = linuxMatches[linuxMatches.length - 1];
          if (lastLinux) {
            detectedUser = lastLinux[1];
            detectedIp = lastLinux[2];
            detectedCwd = lastLinux[3]?.trim() || "~";
            detectedProtocol = "ssh";
            if (detectedTitle.startsWith("Command Prompt") || detectedTitle.startsWith("Windows PowerShell")) {
              detectedTitle = `SSH: ${detectedUser}@${detectedIp}`;
            }
          }
        }

        // 2. Normalize CRLF line endings (ConPTY / Windows emits \r\n or \r\r\n)
        const normalizedChunk = clean.replace(/\r+\n/g, '\n');

        // 3. Accumulate stream chunks with active pending prompt
        let pending = (s.currentPrompt || "") + normalizedChunk;

        // Decouple prompt from ANY preceding text in buffer
        pending = pending.replace(/([^\r\n])\s*((?:PS\s+)?[a-zA-Z]:\\[^<>:"/|?*\r\n]*>\s*)/g, "$1\n$2");
        pending = pending.replace(/([^\r\n])\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^$#\r\n]*[$#]\s*)/g, "$1\n$2");

        // 4. Split by newline
        const parts = pending.split('\n');

        // All parts except the last one are completed lines
        const completedParts = parts.slice(0, -1);
        let newPrompt = parts[parts.length - 1] ?? "";

        // 5. Clean standalone carriage returns (\r) without erasing content
        const cleanCr = (t: string): string => {
          if (!t.includes('\r')) return t;
          const segments = t.split('\r').filter((seg) => seg.length > 0);
          return segments.length > 0 ? (segments[segments.length - 1] ?? "") : "";
        };

        const processedCompleted = completedParts.map(cleanCr);
        newPrompt = cleanCr(newPrompt);

        // 6. Guarantee that newPrompt does NOT contain preceding banner lines
        const promptMatch = newPrompt.match(/((?:PS\s+)?[a-zA-Z]:\\[^<>:"/|?*\r\n]*>\s*|[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^$#\r\n]*[$#]\s*)$/);
        if (promptMatch && promptMatch.index !== undefined && promptMatch.index > 0) {
          const preceding = newPrompt.slice(0, promptMatch.index).trim();
          const actualPrompt = newPrompt.slice(promptMatch.index);
          if (preceding) {
            processedCompleted.push(preceding);
          }
          newPrompt = actualPrompt;
        }

        // 7. Retain all lines including echoed command so AI has full context of executed command
        const finalCompleted = processedCompleted;

        // 8. Filter out excessive consecutive blank lines
        const cleanedLines: string[] = [];
        for (const line of finalCompleted) {
          if (line.trim() === "") {
            if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1]?.trim() === "") {
              continue; // Avoid consecutive blank lines
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
      setSessions((prev) => prev.map((s) => {
        if (s.id === event.terminalId || s.id === activeId) {
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
  }, [activeId]);

  // Create and launch a new terminal session
  const createTerminal = useCallback((type: 'cmd' | 'powershell' = 'cmd', meta?: Partial<Session> & { initialCommand?: string }) => {
    const id = `term-${Date.now()}`;
    const name = type === 'powershell' ? 'Windows PowerShell' : 'Command Prompt';
    const newTerm: TerminalInstance = {
      id,
      name: meta?.title || `${name} #${sessions.length + 1}`,
      host: meta?.ip || (type === 'powershell' ? 'powershell@localhost' : 'cmd@localhost'),
      shellType: type,
    };

    const s = makeSession(newTerm, meta?.protocol || 'local', type);
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

    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
    clearSessionDataCache(s.id);
    clearSessionDataCache(id);

    // Spawn real PTY session
    if (window.electronAPI) {
      spawnedPtySet.current.add(s.id);
      window.electronAPI.terminal.spawn({
        id: s.id,
        shellType: type,
        shell: type === 'powershell' ? 'powershell.exe' : 'cmd.exe',
        cols: 120,
        rows: 24,
      }).then((res) => {
        if (res.success) {
          setSessions((prev) => prev.map((item) => item.id === s.id ? { ...item, ptyId: s.id, cwd: res.cwd || item.cwd } : item));
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
  }, [sessions.length]);

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
      const s = makeSession(t, protocol, t.shellType || 'cmd');
      setActiveId(s.id);
      ensurePtySpawned(s.id, t.shellType);

      // If SSH protocol, automatically trigger SSH connection command into the shell after spawn
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
    if (window.electronAPI) {
      window.electronAPI.terminal.kill(id);
      spawnedPtySet.current.delete(id);
    }
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length) {
        if (id === activeId) setActiveId(next[next.length - 1]!.id);
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
            terminals: e.services[0]?.terminals.filter((t) => t.id !== id) || [],
          }],
        };
      }
      return e;
    }));
  }, [activeId]);

  const execute = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    const currentSession = sessions.find((s) => s.id === activeId);
    if (!currentSession) return;

    const isPowerShell = currentSession.shellType === "powershell";
    const defaultPrompt = isPowerShell
      ? `PS ${currentSession.cwd || "C:\\Users\\aditya.s.ctr"}> `
      : `${currentSession.cwd || "C:\\Users\\aditya.s.ctr"}>`;
    const promptText = (currentSession.currentPrompt && currentSession.currentPrompt.trim().length > 0)
      ? currentSession.currentPrompt.trimEnd()
      : defaultPrompt;

    if (trimmed === "clear" || trimmed === "cls") {
      clearSessionDataCache(currentSession.ptyId);
      clearSessionDataCache(currentSession.id);
      if (window.electronAPI && currentSession.ptyId) {
        window.electronAPI.terminal.write(currentSession.ptyId, "cls\r\n");
      }
      setSessions((prev) => prev.map((s) => s.id === activeId ? {
        ...s,
        lines: [],
        currentPrompt: promptText,
        lastError: undefined,
      } : s));
      return;
    }

    lastCommandRef.current = { cmd: trimmed, time: Date.now() };

    // Commit command line immediately so what the user typed is NEVER lost or delayed!
    setSessions((prev) => prev.map((s) => {
      if (s.id !== activeId) return s;
      return {
        ...s,
        lines: [...s.lines, { kind: "input" as const, text: `${promptText} ${cmd}` }],
        currentPrompt: "",
      };
    }));

    // Real Electron PTY execution
    if (window.electronAPI && currentSession.ptyId) {
      window.electronAPI.terminal.write(currentSession.ptyId, `${cmd}\r\n`);
      return;
    }

    // Fallback mock simulation for browser preview
    try {
      fetch("http://localhost:4001/api/pty/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentSession.id, data: `${cmd}\r\n` }),
      }).catch(() => {});
    } catch {
      // Microservice not running, proceed to mock
    }

    const r = runMock(cmd, currentSession);
    setSessions((prev) => prev.map((s) => s.id === activeId ? {
      ...s,
      lines: [...s.lines, ...r.lines],
      cwd: r.cwd ?? s.cwd,
      currentPrompt: `${r.cwd ?? s.cwd}>`,
      lastError: r.error ?? (r.lines.some((l) => l.kind === "success") ? undefined : s.lastError),
    } : s));
  }, [activeId, sessions]);

  const dismissError = useCallback(() => {
    setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, lastError: undefined } : s));
  }, [activeId]);

  const killAndRestart = useCallback(async () => {
    const current = sessions.find((s) => s.id === activeId);
    if (!current) return;

    if (window.electronAPI && current.ptyId) {
      // Cleanly terminate active shell process and flush cache
      clearSessionDataCache(current.ptyId);
      clearSessionDataCache(current.id);
      await window.electronAPI.terminal.kill(current.ptyId);
      spawnedPtySet.current.delete(current.ptyId);

      // Respawn fresh shell
      const res = await window.electronAPI.terminal.spawn({
        id: current.ptyId,
        shellType: current.shellType,
        shell: current.shellType === 'powershell' ? 'powershell.exe' : 'cmd.exe',
        cols: 120,
        rows: 24,
      });
      setSessions((prev) => prev.map((s) => s.id === activeId ? {
        ...s,
        lastError: undefined,
        cwd: res.cwd || s.cwd,
        lines: [],
        currentPrompt: "",
      } : s));
      return;
    }

    // Mock browser fallback
    setSessions((prev) => prev.map((s) => s.id !== activeId ? s : {
      ...s, lastError: undefined,
      lines: [],
    }));
  }, [activeId, sessions]);

  const toggleShellType = useCallback(async () => {
    const current = sessions.find((s) => s.id === activeId);
    if (!current) return;

    const nextType: 'cmd' | 'powershell' = current.shellType === 'powershell' ? 'cmd' : 'powershell';
    const nextShellName = nextType === 'powershell' ? 'Windows PowerShell' : 'Command Prompt';

    if (window.electronAPI && current.ptyId) {
      await window.electronAPI.terminal.kill(current.ptyId);
      spawnedPtySet.current.delete(current.ptyId);

      const res = await window.electronAPI.terminal.spawn({
        id: current.ptyId,
        shellType: nextType,
        shell: nextType === 'powershell' ? 'powershell.exe' : 'cmd.exe',
        cols: 120,
        rows: 24,
      });

      setSessions((prev) => prev.map((s) => s.id === activeId ? {
        ...s,
        shellType: nextType,
        shell: nextType === 'powershell' ? 'powershell.exe' : 'cmd.exe',
        title: `${nextShellName} #${sessions.findIndex((x) => x.id === activeId) + 1 || 1}`,
        lastError: undefined,
        cwd: res.cwd || s.cwd,
        lines: [],
        currentPrompt: "",
      } : s));
      return;
    }

    setSessions((prev) => prev.map((s) => s.id === activeId ? {
      ...s,
      shellType: nextType,
      shell: nextType === 'powershell' ? 'powershell.exe' : 'cmd.exe',
      title: `${nextShellName} #${sessions.findIndex((x) => x.id === activeId) + 1 || 1}`,
      lastError: undefined,
      lines: [],
    } : s));
  }, [activeId, sessions]);

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
    const currentSession = sessions.find((s) => s.id === activeId);
    if (!currentSession) return;
    if (window.electronAPI && currentSession.ptyId) {
      window.electronAPI.terminal.write(currentSession.ptyId, text);
    }
  }, [sessions, activeId]);

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
    pasteFromClipboard,
    killAndRestart,
    toggleShellType,
    dismissError,
    addEnvironment,
    toggleEnv,
  };
}

export type TerminalApi = ReturnType<typeof useTerminalSession>;
