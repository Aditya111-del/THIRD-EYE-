import { useEffect, useRef, useState, useCallback } from "react";
import { Copy, Clipboard, Check, Trash2 } from "lucide-react";
import type { Session } from "@/types/terminal";
import { copyToClipboard, readFromClipboard } from "@/lib/clipboard";
import { TerminalGutter } from "./TerminalGutter";
import { TerminalMinimap } from "./TerminalMinimap";

// Global reference to the currently active Xterm instance for TitleBar / Toolbar actions
let activeXtermInstance: any = null;
let lastGlobalPasteTimestamp = 0;
let lastGlobalPastedContent = "";

export function getActiveTerminalSelection(): string {
  if (activeXtermInstance && typeof activeXtermInstance.hasSelection === "function" && activeXtermInstance.hasSelection()) {
    return activeXtermInstance.getSelection?.() || "";
  }
  return "";
}

export function pasteToActiveTerminal(text: string) {
  if (!text) return;
  const now = Date.now();
  if (now - lastGlobalPasteTimestamp < 350 && text === lastGlobalPastedContent) {
    return;
  }
  lastGlobalPasteTimestamp = now;
  lastGlobalPastedContent = text;

  if (activeXtermInstance) {
    activeXtermInstance.paste?.(text);
  }
}

/**
 * Extract live terminal buffer lines directly from the active Xterm instance
 * Captures all lines, outputs, commands, and logs currently loaded in the active terminal
 */
export function getActiveTerminalBufferLines(maxLines: number = 300): string[] {
  if (!activeXtermInstance || !activeXtermInstance.buffer || !activeXtermInstance.buffer.active) {
    return [];
  }
  try {
    const buf = activeXtermInstance.buffer.active;
    const lines: string[] = [];
    const count = Math.min(maxLines, buf.length);
    const start = Math.max(0, buf.length - count);
    for (let i = start; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }
    // Clean trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    return lines;
  } catch (_e) {
    return [];
  }
}

// Helper to dynamically load Xterm.js and FitAddon from CDN or window
function loadXterm(): Promise<{ Terminal: any; FitAddon: any }> {
  return new Promise((resolve, reject) => {
    if ((window as any).Terminal && (window as any).FitAddon?.FitAddon) {
      return resolve({
        Terminal: (window as any).Terminal,
        FitAddon: (window as any).FitAddon.FitAddon,
      });
    }

    // Ensure CSS is present
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

    loadScript("https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.js")
      .then(() => loadScript("https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js"))
      .then(() => {
        resolve({
          Terminal: (window as any).Terminal,
          FitAddon: (window as any).FitAddon.FitAddon,
        });
      })
      .catch(reject);
  });
}

// Global buffer cache so session data is preserved when switching tabs
export const sessionDataCache: Map<string, string[]> = new Map();

export function clearSessionDataCache(sessionId?: string) {
  if (sessionId) {
    sessionDataCache.delete(sessionId);
  } else {
    sessionDataCache.clear();
  }
}

interface XtermViewProps {
  session: Session;
  showLineNumbers?: boolean;
  showMinimap?: boolean;
}

export function XtermView({
  session,
  showLineNumbers = true,
  showMinimap = true,
}: XtermViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  const lastColsRef = useRef(0);
  const lastRowsRef = useRef(0);
  const performPasteRef = useRef<(text: string) => void>(() => {});

  // Synchronized Terminal Buffer Metrics
  const [viewportY, setViewportY] = useState(0);
  const [rows, setRows] = useState(24);
  const [cursorBaseY, setCursorBaseY] = useState(0);
  const [totalLines, setTotalLines] = useState(24);
  const [rowHeight, setRowHeight] = useState(19);

  // Sync metrics directly from active Xterm buffer
  const syncBufferMetrics = useCallback((term: any) => {
    if (!term || !term.buffer || !term.buffer.active) return;
    const buf = term.buffer.active;
    setViewportY(buf.viewportY || 0);
    setRows(term.rows || 24);
    setCursorBaseY((buf.baseY || 0) + (buf.cursorY || 0));
    setTotalLines(Math.max(buf.length || 24, term.rows || 24));

    // Measure exact cell height
    const cssCellH = term._core?._renderService?.dimensions?.css?.cell?.height;
    if (typeof cssCellH === "number" && cssCellH > 10) {
      setRowHeight(cssCellH);
    } else if (containerRef.current) {
      const charMeasure = containerRef.current.querySelector(".xterm-char-measure-element");
      if (charMeasure) {
        const measured = charMeasure.getBoundingClientRect().height;
        if (measured > 10) setRowHeight(measured);
      }
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let onDataDisposable: any = null;
    let onScrollDisposable: any = null;
    let onLineFeedDisposable: any = null;
    let onCursorMoveDisposable: any = null;
    let onRenderDisposable: any = null;
    let unsubscribePty: (() => void) | null = null;
    let ro: ResizeObserver | null = null;
    let resizeTimer: any = null;
    let onWinFocus: (() => void) | null = null;
    let containerEl: HTMLDivElement | null = null;
    let onDomPaste: ((e: ClipboardEvent) => void) | null = null;

    loadXterm()
      .then(({ Terminal, FitAddon }) => {
        if (disposed || !containerRef.current) return;
        setLoading(false);

        const term = new Terminal({
          cursorBlink: true,
          cursorStyle: "block",
          cursorInactiveStyle: "block",
          cursorWidth: 2,
          fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.45,
          theme: {
            background: "#222222",
            foreground: "#E0E0E0",
            cursor: "#FF6B00",
            cursorAccent: "#222222",
            selectionBackground: "rgba(255, 107, 0, 0.25)",
            black: "#181818",
            red: "#F87171",
            green: "#4ADE80",
            yellow: "#FACC15",
            blue: "#38BDF8",
            magenta: "#C084FC",
            cyan: "#22D3EE",
            white: "#E0E0E0",
            brightBlack: "#555555",
            brightRed: "#F87171",
            brightGreen: "#4ADE80",
            brightYellow: "#FDE047",
            brightBlue: "#38BDF8",
            brightMagenta: "#C084FC",
            brightCyan: "#22D3EE",
            brightWhite: "#FFFFFF",
          },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);

        let lastLocalPasteTimestamp = 0;
        let lastLocalPastedContent = "";

        const performPaste = (text: string) => {
          if (!text) return;
          const now = Date.now();
          // Reject duplicate paste if identical content arrived within 350ms
          if (
            (now - lastLocalPasteTimestamp < 350 && text === lastLocalPastedContent) ||
            (now - lastGlobalPasteTimestamp < 350 && text === lastGlobalPastedContent)
          ) {
            return;
          }
          lastLocalPasteTimestamp = now;
          lastLocalPastedContent = text;
          lastGlobalPasteTimestamp = now;
          lastGlobalPastedContent = text;

          if (window.electronAPI && session.ptyId) {
            window.electronAPI.terminal.write(session.ptyId, text);
          } else if (termRef.current) {
            termRef.current.paste(text);
          }
        };

        performPasteRef.current = performPaste;

        // Catch and handle native browser paste event in capture phase to prevent double injection
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

        // Keyboard handler for Zoom, Copy (Ctrl+C), Paste (Ctrl+V) and Shortcuts
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          const isCtrlOrCmd = e.ctrlKey || e.metaKey;

          if (isCtrlOrCmd) {
            // 1. Zoom Controls (Ctrl + =, Ctrl + -, Ctrl + 0)
            if (
              e.key === '=' ||
              e.key === '+' ||
              e.key === '-' ||
              e.key === '_' ||
              e.key === '0' ||
              e.code === 'NumpadAdd' ||
              e.code === 'NumpadSubtract' ||
              e.code === 'Equal' ||
              e.code === 'Minus' ||
              e.code === 'Digit0' ||
              e.code === 'Numpad0'
            ) {
              if (e.type === 'keydown') {
                if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd' || e.code === 'Equal') {
                  if (window.electronAPI?.window?.zoomIn) window.electronAPI.window.zoomIn();
                } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.code === 'Minus') {
                  if (window.electronAPI?.window?.zoomOut) window.electronAPI.window.zoomOut();
                } else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
                  if (window.electronAPI?.window?.resetZoom) window.electronAPI.window.resetZoom();
                }
              }
              return false; // Do not send zoom keystrokes to PTY
            }

            // 2. COPY (Ctrl+C / Ctrl+Shift+C)
            // If user has highlighted text in terminal, copy to clipboard instead of sending SIGINT!
            if (e.key === 'c' || e.key === 'C') {
              const hasSel = Boolean(term.hasSelection && term.hasSelection());
              if (e.shiftKey || hasSel) {
                if (e.type === 'keydown') {
                  const selectedText = term.getSelection ? term.getSelection() : '';
                  if (selectedText) {
                    copyToClipboard(selectedText);
                  }
                }
                return false; // Intercept: do not terminate running command when copying text
              }
              // If NO text is selected, let Ctrl+C pass through to PTY as SIGINT to interrupt process
              return true;
            }

            // 3. PASTE (Ctrl+V / Ctrl+Shift+V)
            if (e.key === 'v' || e.key === 'V') {
              // Crucial: prevent browser default paste event to avoid duplicate entry!
              e.preventDefault();
              e.stopPropagation();
              if (e.type === 'keydown' && !e.repeat) {
                readFromClipboard().then((clipText) => {
                  if (clipText) {
                    performPaste(clipText);
                  }
                });
              }
              return false; // Intercept: prevent terminal from receiving raw \x16 (SYN)
            }

            // 4. Select All (Ctrl+Shift+A)
            if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
              if (e.type === 'keydown') {
                term.selectAll();
              }
              return false;
            }
          }

          // 5. Shift+Insert (Standard terminal paste shortcut)
          if (e.shiftKey && e.key === 'Insert') {
            e.preventDefault();
            e.stopPropagation();
            if (e.type === 'keydown' && !e.repeat) {
              readFromClipboard().then((clipText) => {
                if (clipText) {
                  performPaste(clipText);
                }
              });
            }
            return false;
          }

          return true;
        });

        termRef.current = term;
        activeXtermInstance = term;
        fitAddonRef.current = fitAddon;

        // Auto-focus terminal immediately and on any click
        term.focus();
        setTimeout(() => term.focus(), 100);
        setTimeout(() => term.focus(), 300);

        onWinFocus = () => {
          if (!disposed && termRef.current) {
            activeXtermInstance = termRef.current;
            termRef.current.focus();
          }
        };
        window.addEventListener("focus", onWinFocus);

        // Replay cached history if available and session is not brand new
        if (session.lines && session.lines.length > 0) {
          const cached = sessionDataCache.get(session.id);
          if (cached && cached.length > 0) {
            for (const chunk of cached) {
              term.write(chunk);
            }
          }
        } else {
          sessionDataCache.delete(session.id);
        }

        // Initial fit & resize
        setTimeout(() => {
          if (disposed) return;
          try {
            fitAddon.fit();
            syncBufferMetrics(term);
            const c = term.cols;
            const r = term.rows;
            if (window.electronAPI && session.ptyId && c && r) {
              lastColsRef.current = c;
              lastRowsRef.current = r;
              window.electronAPI.terminal.resize(session.ptyId, c, r);
            }
          } catch {}
        }, 60);

        // Listen to buffer changes to keep line numbers & minimap synchronized
        onScrollDisposable = term.onScroll(() => syncBufferMetrics(term));
        onLineFeedDisposable = term.onLineFeed(() => syncBufferMetrics(term));
        onCursorMoveDisposable = term.onCursorMove(() => syncBufferMetrics(term));
        onRenderDisposable = term.onRender(() => syncBufferMetrics(term));

        // Keystroke forwarding from Xterm to OS PTY
        onDataDisposable = term.onData((data: string) => {
          if (window.electronAPI && session.ptyId) {
            window.electronAPI.terminal.write(session.ptyId, data);
          }
        });

        // Streaming data from OS PTY to Xterm
        if (window.electronAPI) {
          unsubscribePty = window.electronAPI.terminal.onData((payload) => {
            if (payload.id === session.id || payload.id === session.ptyId) {
              term.write(payload.data);
              syncBufferMetrics(term);

              // Append to session cache
              let list = sessionDataCache.get(session.id);
              if (!list) {
                list = [];
                sessionDataCache.set(session.id, list);
              }
              list.push(payload.data);
              if (list.length > 800) list.shift();
            }
          });
        }

        // Debounced Resize Observer to eliminate duplicate prompts / blank lines on window maximize
        ro = new ResizeObserver(() => {
          if (disposed) return;
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (disposed || !termRef.current || !fitAddonRef.current) return;
            try {
              fitAddonRef.current.fit();
              syncBufferMetrics(termRef.current);
              const c = termRef.current.cols;
              const r = termRef.current.rows;
              if (
                window.electronAPI &&
                session.ptyId &&
                c &&
                r &&
                (c !== lastColsRef.current || r !== lastRowsRef.current)
              ) {
                lastColsRef.current = c;
                lastRowsRef.current = r;
                window.electronAPI.terminal.resize(session.ptyId, c, r);
              }
            } catch {}
          }, 120);
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
      if (onWinFocus) {
        window.removeEventListener("focus", onWinFocus);
      }
      if (containerEl && onDomPaste) {
        containerEl.removeEventListener("paste", onDomPaste, true);
      }
      if (onDataDisposable) onDataDisposable.dispose();
      if (onScrollDisposable) onScrollDisposable.dispose();
      if (onLineFeedDisposable) onLineFeedDisposable.dispose();
      if (onCursorMoveDisposable) onCursorMoveDisposable.dispose();
      if (onRenderDisposable) onRenderDisposable.dispose();
      if (unsubscribePty) unsubscribePty();
      if (ro) ro.disconnect();
      if (termRef.current) {
        if (activeXtermInstance === termRef.current) activeXtermInstance = null;
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [session.id, session.ptyId, syncBufferMetrics]);

  // Handle refit when showLineNumbers or showMinimap toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fitAddonRef.current && termRef.current) {
        try {
          fitAddonRef.current.fit();
          syncBufferMetrics(termRef.current);
          const c = termRef.current.cols;
          const r = termRef.current.rows;
          if (
            window.electronAPI &&
            session.ptyId &&
            c &&
            r &&
            (c !== lastColsRef.current || r !== lastRowsRef.current)
          ) {
            lastColsRef.current = c;
            lastRowsRef.current = r;
            window.electronAPI.terminal.resize(session.ptyId, c, r);
          }
        } catch {}
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [showLineNumbers, showMinimap, session.ptyId, syncBufferMetrics]);

  // Reset terminal buffer when session lines are cleared (e.g. user clicked Clear or Restart)
  useEffect(() => {
    if (session.lines && session.lines.length === 0 && termRef.current) {
      try {
        termRef.current.clear();
        syncBufferMetrics(termRef.current);
      } catch {}
    }
  }, [session.lines?.length, syncBufferMetrics]);

  const handleScrollToLine = (targetLine: number) => {
    if (termRef.current) {
      termRef.current.scrollToLine(targetLine);
      syncBufferMetrics(termRef.current);
    }
  };

  // Right-click context menu state
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
      x: Math.min(e.clientX, window.innerWidth - 190),
      y: Math.min(e.clientY, window.innerHeight - 160),
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

  const handleContextMenuSelectAll = () => {
    setContextMenu(null);
    termRef.current?.selectAll?.();
  };

  const handleContextMenuClear = () => {
    setContextMenu(null);
    if (window.electronAPI && session.ptyId) {
      window.electronAPI.terminal.write(session.ptyId, "cls\r\n");
    } else {
      termRef.current?.clear?.();
    }
    termRef.current?.focus();
  };

  return (
    <div className="relative h-full w-full bg-[#222222] flex overflow-hidden select-text">
      {/* 1. LEFT: Line Numbers Gutter */}
      {showLineNumbers && (
        <TerminalGutter
          viewportY={viewportY}
          rows={rows}
          cursorBaseY={cursorBaseY}
          totalLines={totalLines}
          rowHeight={rowHeight}
          topPadding={8}
        />
      )}

      {/* 2. CENTER: Interactive Xterm Canvas Viewport */}
      <div
        className="relative flex-1 h-full min-w-0 p-2 overflow-hidden bg-[#222222]"
        onClick={() => {
          activeXtermInstance = termRef.current;
          termRef.current?.focus();
        }}
        onContextMenu={handleContextMenu}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground font-mono">
            Connecting to native OS terminal via Xterm.js...
          </div>
        )}
        <div ref={containerRef} className="h-full w-full overflow-hidden" />
      </div>

      {/* Sleek Floating Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 min-w-[170px] rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl p-1 text-xs text-[#E0E0E0] select-none font-sans animate-in fade-in-50 zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleContextMenuCopy}
            disabled={!contextMenu.hasSelection}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#282828] hover:text-white disabled:opacity-35 disabled:hover:bg-transparent text-left cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <Copy className="h-3.5 w-3.5 text-[#FF6B00]" />
              <span>Copy</span>
            </span>
            <span className="font-mono text-[10px] text-[#707070]">Ctrl+C</span>
          </button>

          <button
            onClick={handleContextMenuPaste}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#282828] hover:text-white text-left cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2">
              <Clipboard className="h-3.5 w-3.5 text-[#FF6B00]" />
              <span>Paste</span>
            </span>
            <span className="font-mono text-[10px] text-[#707070]">Ctrl+V</span>
          </button>

          <div className="h-px bg-[#2C2C2C] my-1" />

          <button
            onClick={handleContextMenuSelectAll}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#282828] hover:text-white text-left cursor-pointer transition-colors"
          >
            <span>Select All</span>
            <span className="font-mono text-[10px] text-[#707070]">Ctrl+A</span>
          </button>

          <button
            onClick={handleContextMenuClear}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#282828] hover:text-white text-left cursor-pointer transition-colors"
          >
            <span>Clear Buffer</span>
            <span className="font-mono text-[10px] text-[#707070]">Ctrl+L</span>
          </button>
        </div>
      )}

      {/* 3. RIGHT: Minimap / Fast Scroller (Matches Image 2) */}
      {showMinimap && (
        <TerminalMinimap
          term={termRef.current}
          viewportY={viewportY}
          totalLines={totalLines}
          rows={rows}
          cursorBaseY={cursorBaseY}
          onScrollToLine={handleScrollToLine}
          width={88}
        />
      )}
    </div>
  );
}
