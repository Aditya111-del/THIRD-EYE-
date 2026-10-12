import { useEffect, useRef, useState } from "react";
import { Copy, Clipboard } from "lucide-react";
import type { Session } from "@/types/terminal";
import { copyToClipboard, readFromClipboard } from "@/lib/clipboard";
import {
  setActiveXtermInstance,
  getActiveXtermInstance,
  sessionDataCache,
  appendSessionDataCache,
  setSessionDataCache,
} from "./terminalState";

// Cached module references for dynamic loading
let cachedXtermModules: { Terminal: any; FitAddon: any } | null = null;

async function loadXterm(): Promise<{ Terminal: any; FitAddon: any }> {
  if (cachedXtermModules) return cachedXtermModules;
  if (typeof window === "undefined") {
    throw new Error("Xterm can only run in the browser");
  }

  // 1. Check window global
  if ((window as any).Terminal && (window as any).FitAddon?.FitAddon) {
    cachedXtermModules = {
      Terminal: (window as any).Terminal,
      FitAddon: (window as any).FitAddon.FitAddon,
    };
    return cachedXtermModules;
  }

  // 2. Load via dynamic ES import
  try {
    const [termMod, fitMod] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);
    const Terminal = termMod.Terminal || (termMod as any).default?.Terminal || (termMod as any).default;
    const FitAddon = fitMod.FitAddon || (fitMod as any).default?.FitAddon || (fitMod as any).default;
    cachedXtermModules = { Terminal, FitAddon };
    return cachedXtermModules;
  } catch (err) {
    console.warn("[XtermView] Dynamic import failed, falling back to script loader:", err);
  }

  // 3. Fallback script injection
  if (!document.getElementById("xterm-css")) {
    const link = document.createElement("link");
    link.id = "xterm-css";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css";
    document.head.appendChild(link);
  }

  const loadScript = (src: string): Promise<void> => {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => res();
      s.onerror = (e) => rej(e);
      document.head.appendChild(s);
    });
  };

  await loadScript("https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.js");
  await loadScript("https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js");

  cachedXtermModules = {
    Terminal: (window as any).Terminal,
    FitAddon: (window as any).FitAddon.FitAddon,
  };
  return cachedXtermModules;
}

export interface XtermViewProps {
  session: Session;
  showLineNumbers?: boolean;
  showMinimap?: boolean;
}

export function XtermView({ session }: XtermViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  const lastColsRef = useRef(0);
  const lastRowsRef = useRef(0);
  const performPasteRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let onDataDisposable: any = null;
    let unsubscribePty: (() => void) | null = null;
    let ro: ResizeObserver | null = null;
    let resizeTimer: any = null;
    let containerEl: HTMLDivElement | null = null;
    let onDomPaste: ((e: ClipboardEvent) => void) | null = null;
    let fallbackWs: WebSocket | null = null;

    loadXterm()
      .then(({ Terminal, FitAddon }) => {
        if (disposed || !containerRef.current) return;
        setLoading(false);

        // VS Code integrated terminal styling
        const term = new Terminal({
          cursorBlink: true,
          cursorStyle: "block",
          cursorInactiveStyle: "outline",
          cursorWidth: 1,
          fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, Monaco, Consolas, "Courier New", monospace',
          fontSize: 13,
          lineHeight: 1.25,
          letterSpacing: 0,
          theme: {
            background: "#181818",
            foreground: "#CCCCCC",
            cursor: "#FFFFFF",
            cursorAccent: "#181818",
            selectionBackground: "rgba(255, 255, 255, 0.22)",
            black: "#000000",
            red: "#CD3131",
            green: "#0DBC79",
            yellow: "#E5E510",
            blue: "#2472C8",
            magenta: "#BC3FBC",
            cyan: "#11A8CD",
            white: "#E5E5E5",
            brightBlack: "#666666",
            brightRed: "#F14C4C",
            brightGreen: "#23D18B",
            brightYellow: "#F5F543",
            brightBlue: "#3B8EEA",
            brightMagenta: "#D670D6",
            brightCyan: "#29B8DB",
            brightWhite: "#FFFFFF",
          },
          allowTransparency: false,
          convertEol: true,
          scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);

        termRef.current = term;
        fitAddonRef.current = fitAddon;
        setActiveXtermInstance(term);

        // Restore cached session data or replay buffer directly from native PTY
        const sessionId = session.id;
        const ptyId = session.ptyId || session.id;
        const cached = sessionDataCache.get(sessionId) || sessionDataCache.get(ptyId);

        const stripZshEolMark = (raw: string) => {
          return raw.replace(/^%[ ]{10,}\r[ ]*\r?/g, "");
        };

        if (cached && cached.length > 0) {
          term.write(stripZshEolMark(cached.join("")));
        }

        // Replay full buffer from Electron PTY to catch any missed chunks
        if (window.electronAPI?.terminal?.getBuffer && ptyId) {
          window.electronAPI.terminal.getBuffer(ptyId).then((buf: string) => {
            if (disposed || !termRef.current || !buf) return;
            const cleanBuf = stripZshEolMark(buf);
            const currentCached = sessionDataCache.get(sessionId);
            if (!currentCached || currentCached.length === 0) {
              termRef.current.write(cleanBuf);
              setSessionDataCache(sessionId, [cleanBuf]);
            } else {
              const fullCachedStr = currentCached.join("");
              if (cleanBuf.length > fullCachedStr.length && cleanBuf.startsWith(fullCachedStr)) {
                const delta = cleanBuf.slice(fullCachedStr.length);
                termRef.current.write(delta);
                appendSessionDataCache(sessionId, delta);
              }
            }
          }).catch(() => {});
        }

        // Initial fit & trigger prompt display
        try {
          fitAddon.fit();
          const c = term.cols;
          const r = term.rows;
          if (c > 0 && r > 0 && window.electronAPI && ptyId) {
            lastColsRef.current = c;
            lastRowsRef.current = r;
            window.electronAPI.terminal.resize(ptyId, c, r);
          }
        } catch {}

        let lastLocalPasteTimestamp = 0;
        let lastLocalPastedContent = "";

        const performPaste = (text: string) => {
          if (!text) return;
          const now = Date.now();
          if (
            now - lastLocalPasteTimestamp < 350 &&
            text === lastLocalPastedContent
          ) {
            return;
          }
          lastLocalPasteTimestamp = now;
          lastLocalPastedContent = text;

          const targetId = session.ptyId || session.id;
          if (window.electronAPI && targetId) {
            window.electronAPI.terminal.write(targetId, text);
          } else if (termRef.current) {
            termRef.current.paste(text);
          }
        };

        performPasteRef.current = performPaste;

        // Native paste handler
        containerEl = containerRef.current;
        onDomPaste = (pasteEvent: ClipboardEvent) => {
          pasteEvent.preventDefault();
          pasteEvent.stopPropagation();
          const text = pasteEvent.clipboardData?.getData("text/plain");
          if (text) {
            performPaste(text);
          } else {
            readFromClipboard().then((clip) => {
              if (clip) performPaste(clip);
            });
          }
        };

        if (containerEl) {
          containerEl.addEventListener("paste", onDomPaste, true);
        }

        // Keystroke handler (Copy on Ctrl/Cmd+C if text selected, Paste on Ctrl/Cmd+V)
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          const isCtrlOrCmd = e.ctrlKey || e.metaKey;

          if (isCtrlOrCmd) {
            // Zoom controls
            if (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '_' || e.key === '0') {
              if (e.type === 'keydown') {
                if (e.key === '=' || e.key === '+') {
                  window.electronAPI?.window?.zoomIn?.();
                } else if (e.key === '-' || e.key === '_') {
                  window.electronAPI?.window?.zoomOut?.();
                } else if (e.key === '0') {
                  window.electronAPI?.window?.resetZoom?.();
                }
              }
              return false;
            }

            // Copy if text is selected; if not selected, allow Ctrl+C to pass through as SIGINT
            if (e.key === 'c' || e.key === 'C') {
              if (term.hasSelection && term.hasSelection()) {
                const sel = term.getSelection();
                if (sel) {
                  copyToClipboard(sel);
                  return false;
                }
              }
            }

            // Paste
            if (e.key === 'v' || e.key === 'V') {
              if (e.type === 'keydown') {
                readFromClipboard().then((clip) => {
                  if (clip) performPaste(clip);
                });
              }
              return false;
            }

            // Clear terminal on Ctrl+K
            if (e.key === 'k' || e.key === 'K') {
              if (e.type === 'keydown') {
                term.clear();
                return false;
              }
            }
          }
          return true;
        });

        // WebSocket connection for browser preview when running outside Electron
        if (!window.electronAPI && typeof WebSocket !== "undefined") {
          try {
            const targetId = session.ptyId || session.id;
            fallbackWs = new WebSocket(`ws://localhost:4001/pty/stream?id=${targetId}`);
            fallbackWs.onmessage = (event) => {
              try {
                const parsed = JSON.parse(event.data);
                const chunk = parsed.data || "";
                if (chunk && termRef.current) {
                  termRef.current.write(chunk);
                  appendSessionDataCache(sessionId, chunk);
                }
              } catch {
                if (event.data && termRef.current) {
                  termRef.current.write(event.data);
                  appendSessionDataCache(sessionId, event.data);
                }
              }
            };
          } catch (e) {
            console.warn("[XtermView] Fallback WebSocket connection error:", e);
          }
        }

        // Forward keystrokes to PTY
        onDataDisposable = term.onData((data: string) => {
          const targetId = session.ptyId || session.id;
          if (window.electronAPI && targetId) {
            window.electronAPI.terminal.write(targetId, data);
          } else if (fallbackWs && fallbackWs.readyState === WebSocket.OPEN) {
            fallbackWs.send(JSON.stringify({ type: "write", data }));
          }
        });

        // Stream PTY output into Xterm
        if (window.electronAPI) {
          unsubscribePty = window.electronAPI.terminal.onData((payload) => {
            if (payload.id === session.id || payload.id === session.ptyId) {
              const cleanData = stripZshEolMark(payload.data);
              term.write(cleanData);
              appendSessionDataCache(sessionId, cleanData);
            }
          });
        }

        // Automatic responsive fit
        ro = new ResizeObserver(() => {
          if (disposed) return;
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (disposed || !termRef.current || !fitAddonRef.current) return;
            try {
              fitAddonRef.current.fit();
              const c = termRef.current.cols;
              const r = termRef.current.rows;
              const targetId = session.ptyId || session.id;
              if (
                window.electronAPI &&
                targetId &&
                c > 0 &&
                r > 0 &&
                (c !== lastColsRef.current || r !== lastRowsRef.current)
              ) {
                lastColsRef.current = c;
                lastRowsRef.current = r;
                window.electronAPI.terminal.resize(targetId, c, r);
              }
            } catch {}
          }, 60);
        });
        ro.observe(containerRef.current);

        term.focus();
      })
      .catch((err) => {
        console.error("[XtermView] Failed to load Xterm.js:", err);
        setLoading(false);
      });

    return () => {
      disposed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      if (containerEl && onDomPaste) {
        containerEl.removeEventListener("paste", onDomPaste, true);
      }
      if (fallbackWs) {
        try {
          fallbackWs.close();
        } catch {}
      }
      if (unsubscribePty) unsubscribePty();
      if (onDataDisposable) onDataDisposable.dispose();
      if (ro) ro.disconnect();
      if (termRef.current) {
        if (getActiveXtermInstance() === termRef.current) {
          setActiveXtermInstance(null);
        }
        try {
          termRef.current.dispose();
        } catch {}
        termRef.current = null;
      }
    };
  }, [session.id, session.ptyId]);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
  } | null>(null);

  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener("click", handleCloseMenu);
    return () => window.removeEventListener("click", handleCloseMenu);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const hasSelection = Boolean(termRef.current?.hasSelection?.());
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 150),
      hasSelection,
    });
  };

  const handleContextMenuCopy = async () => {
    const selected = termRef.current?.getSelection?.() || "";
    if (selected) {
      await copyToClipboard(selected);
    }
    setContextMenu(null);
    termRef.current?.focus();
  };

  const handleContextMenuPaste = async () => {
    setContextMenu(null);
    const clipText = await readFromClipboard();
    if (clipText) {
      performPasteRef.current(clipText);
    }
    termRef.current?.focus();
  };

  const handleContextMenuClear = () => {
    setContextMenu(null);
    const targetId = session.ptyId || session.id;
    if (window.electronAPI && targetId) {
      const isWin = typeof navigator !== "undefined" && !/mac|linux/i.test(navigator.userAgent);
      window.electronAPI.terminal.write(targetId, isWin ? "cls\r" : "clear\r");
    } else {
      termRef.current?.clear?.();
    }
    termRef.current?.focus();
  };

  return (
    <div
      className="relative h-full w-full bg-[#181818] overflow-hidden select-text"
      onClick={() => {
        setActiveXtermInstance(termRef.current);
        termRef.current?.focus();
      }}
      onContextMenu={handleContextMenu}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-[#808080] font-mono">
          Starting terminal…
        </div>
      )}
      <div ref={containerRef} className="h-full w-full px-2 py-1 overflow-hidden" />

      {/* Floating Context Menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 min-w-[160px] rounded bg-[#252526] border border-[#454545] shadow-xl p-1 text-xs text-[#CCCCCC] select-none font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleContextMenuCopy}
            disabled={!contextMenu.hasSelection}
            className="w-full flex items-center justify-between px-2.5 py-1 rounded hover:bg-[#094771] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent text-left cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </span>
            <span className="font-mono text-[10px] text-[#808080]">⌘C</span>
          </button>
          <button
            onClick={handleContextMenuPaste}
            className="w-full flex items-center justify-between px-2.5 py-1 rounded hover:bg-[#094771] hover:text-white text-left cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <Clipboard className="h-3.5 w-3.5" />
              <span>Paste</span>
            </span>
            <span className="font-mono text-[10px] text-[#808080]">⌘V</span>
          </button>
          <div className="h-px bg-[#3C3C3C] my-1" />
          <button
            onClick={handleContextMenuClear}
            className="w-full flex items-center justify-between px-2.5 py-1 rounded hover:bg-[#094771] hover:text-white text-left cursor-pointer transition-colors"
          >
            <span>Clear Buffer</span>
            <span className="font-mono text-[10px] text-[#808080]">⌘K</span>
          </button>
        </div>
      )}
    </div>
  );
}
