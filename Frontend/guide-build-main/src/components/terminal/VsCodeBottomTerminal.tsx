import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  AlertCircle,
  Activity,
  Terminal as TerminalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TerminalApi } from "@/hooks/useTerminalSession";
import { XtermView } from "./XtermView";

export type BottomPanelTab = "problems" | "output" | "debug" | "terminal" | "ports";

function SplitTerminalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M14 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 2h5v12H2V2zm12 12H8V2h6v12z" />
    </svg>
  );
}

export function VsCodeBottomTerminal({
  api,
  onClose,
  isMaximized,
  onToggleMaximize,
}: {
  api: TerminalApi;
  onClose?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<BottomPanelTab>("terminal");
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const [agentTasksCount, setAgentTasksCount] = useState<number>(0);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch("http://localhost:4002/api/ai/agent/background_tasks");
        if (res.ok) {
          const data = await res.json();
          setAgentTasksCount(data.count || 0);
        }
      } catch {}
    };
    fetchTasks();
    const interval = setInterval(fetchTasks, 4000);
    return () => clearInterval(interval);
  }, []);

  const activeTitle = api.active?.title || "zsh";

  return (
    <div className="flex h-full w-full flex-col bg-[#181818] border-t border-[#2B2B2B] select-none overflow-hidden font-sans">
      {/* ── Single VS Code Integrated Terminal Toolbar (Matches Image 2) ── */}
      <div className="flex h-[35px] shrink-0 items-center justify-between border-b border-[#2B2B2B] bg-[#181818] px-3">
        {/* Left Tabs matching Screenshot 2 */}
        <div className="flex items-center gap-1 h-full">
          {/* TERMINAL (Active highlighted pill + Agent TaskBadge) */}
          <button
            onClick={() => setActiveTab("terminal")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-normal transition-colors cursor-pointer rounded",
              activeTab === "terminal"
                ? "bg-[#2D2D2D] text-white font-medium shadow-xs"
                : "text-[#969696] hover:text-[#CCCCCC]"
            )}
          >
            <span>Terminal</span>
            {agentTasksCount > 0 && (
              <span
                className="flex items-center gap-1 rounded-full bg-[#152336] border border-[#007ACC]/70 px-1.5 py-0.2 text-[9.5px] font-mono text-[#38BDF8]"
                title={`${agentTasksCount} background agent tasks running`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8] animate-ping" />
                <span>{agentTasksCount}</span>
              </span>
            )}
          </button>

          {/* PROBLEMS (with blue badge 4) */}
          <button
            onClick={() => setActiveTab("problems")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-normal transition-colors cursor-pointer rounded",
              activeTab === "problems"
                ? "bg-[#2D2D2D] text-white"
                : "text-[#969696] hover:text-[#CCCCCC]"
            )}
          >
            <span>Problems</span>
            <span className="rounded-full bg-[#007ACC] px-1.5 py-0.2 text-[9.5px] font-bold text-white leading-tight">
              4
            </span>
          </button>

          {/* OUTPUT */}
          <button
            onClick={() => setActiveTab("output")}
            className={cn(
              "px-2.5 py-1 text-[12px] font-normal transition-colors cursor-pointer rounded",
              activeTab === "output"
                ? "bg-[#2D2D2D] text-white"
                : "text-[#969696] hover:text-[#CCCCCC]"
            )}
          >
            Output
          </button>

          {/* DEBUG */}
          <button
            onClick={() => setActiveTab("debug")}
            className={cn(
              "px-2.5 py-1 text-[12px] font-normal transition-colors cursor-pointer rounded",
              activeTab === "debug"
                ? "bg-[#2D2D2D] text-white"
                : "text-[#969696] hover:text-[#CCCCCC]"
            )}
          >
            Debug
          </button>

          {/* More Tabs (...) */}
          <button
            className="p-1 rounded text-[#969696] hover:text-[#CCCCCC] hover:bg-[#2D2D2D] transition-colors cursor-pointer"
            title="More Views…"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-1 text-[#CCCCCC]">
          {/* Active Shell Selector: >_ zsh ⌄ */}
          <div className="relative" ref={sessionMenuRef}>
            <button
              onClick={() => setSessionMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#CCCCCC] hover:text-white hover:bg-[#2D2D2D] rounded transition-colors cursor-pointer"
              title="Select Terminal Session"
            >
              <span className="font-mono font-bold text-[11px] text-[#CCCCCC]">&gt;_</span>
              <span className="font-sans text-[12px]">{activeTitle}</span>
              <ChevronDown className="h-3 w-3 text-[#969696]" />
            </button>

            {/* Dropdown for terminal sessions */}
            {sessionMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded bg-[#252526] border border-[#3C3C3C] shadow-2xl p-1 text-[12px] text-[#CCCCCC] animate-in fade-in-50">
                <div className="px-2 py-1 text-[10px] text-[#808080] font-semibold uppercase tracking-wider">
                  Terminal Sessions
                </div>
                {api.sessions.map((sess, idx) => {
                  const isActive = sess.id === api.activeId;
                  return (
                    <div
                      key={sess.id}
                      onClick={() => {
                        api.setActiveId(sess.id);
                        setSessionMenuOpen(false);
                      }}
                      className={cn(
                        "flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors",
                        isActive ? "bg-[#094771] text-white" : "hover:bg-[#2A2D2E]"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-[11px] text-[#808080]">{idx + 1}:</span>
                        <span className="truncate">{sess.title}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          api.closeSession(sess.id);
                        }}
                        className="p-0.5 rounded hover:bg-[#3C3C3C] text-[#808080] hover:text-white ml-2"
                        title="Kill Terminal"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                <div className="h-px bg-[#3C3C3C] my-1" />
                <button
                  onClick={() => {
                    api.createTerminal("cmd");
                    setSessionMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2A2D2E] text-left cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-[#007ACC]" />
                  <span>New Terminal</span>
                </button>
              </div>
            )}
          </div>

          {/* New Terminal (+) */}
          <button
            onClick={() => api.createTerminal("cmd")}
            className="p-1 rounded text-[#CCCCCC] hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
            title="New Terminal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          {/* Profiles dropdown (⌄) */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen((v) => !v)}
              className="p-1 rounded text-[#CCCCCC] hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
              title="Launch Profile…"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            {profileMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded bg-[#252526] border border-[#3C3C3C] shadow-2xl p-1 text-[12px] text-[#CCCCCC] animate-in fade-in-50">
                <div className="px-2 py-1 text-[10px] text-[#808080] font-semibold uppercase">Launch Profile</div>
                <button
                  onClick={() => {
                    api.createTerminal("cmd", { title: "zsh" });
                    setProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2A2D2E] text-left cursor-pointer"
                >
                  <span className="font-mono text-[11px]">&gt;_</span>
                  <span>zsh (Default)</span>
                </button>
                <button
                  onClick={() => {
                    api.createTerminal("cmd", { title: "bash" });
                    setProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2A2D2E] text-left cursor-pointer"
                >
                  <span className="font-mono text-[11px]">&gt;_</span>
                  <span>bash</span>
                </button>
                <button
                  onClick={() => {
                    api.createTerminal("powershell", { title: "sh" });
                    setProfileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2A2D2E] text-left cursor-pointer"
                >
                  <span className="font-mono text-[11px]">&gt;_</span>
                  <span>sh</span>
                </button>
              </div>
            )}
          </div>

          {/* Split Terminal */}
          <button
            onClick={() => api.createTerminal("cmd")}
            className="p-1 rounded text-[#CCCCCC] hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
            title="Split Terminal"
          >
            <SplitTerminalIcon />
          </button>

          {/* Kill Terminal (trash can) */}
          <button
            onClick={() => {
              if (api.active) api.closeSession(api.active.id);
            }}
            className="p-1 rounded text-[#CCCCCC] hover:text-[#EF4444] hover:bg-[#2D2D2D] transition-colors cursor-pointer"
            title="Kill Terminal"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {/* More Terminal Actions (...) */}
          <button
            className="p-1 rounded text-[#CCCCCC] hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
            title="More Actions…"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {/* Maximize / Restore Panel Size */}
          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              className="p-1 rounded text-[#CCCCCC] hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
              title={isMaximized ? "Restore Panel Size" : "Maximize Panel Size"}
            >
              <ChevronUp className={cn("h-3.5 w-3.5 transition-transform", isMaximized && "rotate-180")} />
            </button>
          )}

          {/* Close Panel (X) */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-[#CCCCCC] hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
              title="Close Panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Content Stage ── */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-[#181818]">
        {activeTab === "terminal" ? (
          api.active ? (
            <XtermView session={api.active} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#181818] text-[#808080] text-[12px]">
              <TerminalIcon className="h-8 w-8 text-[#404040]" />
              <span>No terminal open</span>
              <button
                onClick={() => api.createTerminal("cmd")}
                className="px-3 py-1 bg-[#007ACC] hover:bg-[#0062A3] text-white rounded text-[12px] cursor-pointer font-medium"
              >
                New Terminal
              </button>
            </div>
          )
        ) : activeTab === "problems" ? (
          <div className="p-3 text-[12px] text-[#CCCCCC] font-mono flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[#E5E5E5] font-sans font-semibold">
              <AlertCircle className="h-4 w-4 text-[#007ACC]" />
              <span>Workspace Diagnostics (3 items)</span>
            </div>
            <div className="pl-6 flex flex-col gap-1 text-[11px] text-[#A0A0A0]">
              <div>ℹ [Info] Vite tsconfig-paths natively supported via resolve.tsconfigPaths</div>
              <div>ℹ [Info] Electron PTY IPC channels bound to workspace root</div>
              <div>ℹ [Info] AI Sidecar microservice streaming on port 4002</div>
            </div>
          </div>
        ) : activeTab === "output" ? (
          <div className="p-3 text-[12px] font-mono text-[#9CDCFE] flex flex-col gap-1">
            <div className="text-[#6A9955]">// THIRD EYE Build &amp; Service Output</div>
            <div className="text-[#CCCCCC]">[Vite] Server running at http://localhost:3000/</div>
            <div className="text-[#CCCCCC]">[PTY] Listening on ws://localhost:4001/pty/stream</div>
            <div className="text-[#CCCCCC]">[AI Engine] Active on http://localhost:4002</div>
          </div>
        ) : activeTab === "debug" ? (
          <div className="p-3 text-[12px] font-mono text-[#808080]">
            Debugger is ready. Launch a configuration from the Run &amp; Debug view to attach.
          </div>
        ) : (
          /* PORTS TAB */
          <div className="p-3 text-[12px] text-[#CCCCCC] flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[#E5E5E5] font-sans font-semibold">
              <Activity className="h-4 w-4 text-[#4ADE80]" />
              <span>Forwarded Ports</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono border-t border-[#2B2B2B] pt-2 text-[#A0A0A0]">
              <div>3000 (Frontend / Web IDE)</div>
              <div>4001 (PTY Service)</div>
              <div>4002 (AI Service)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
