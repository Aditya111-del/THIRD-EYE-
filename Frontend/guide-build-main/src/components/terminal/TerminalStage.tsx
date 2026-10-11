import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Play,
  Plus,
  RotateCw,
  SquareTerminal,
  Terminal,
  Trash2,
  X,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Hash,
  PanelRight,
  ChevronLeft,
  Clipboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TerminalApi } from "@/hooks/useTerminalSession";
import type { SalesforceWorkspaceApi } from "@/hooks/useSalesforceWorkspace";
import { XtermView } from "./XtermView";

export function TerminalStage({
  api,
  sfApi,
  onNew,
}: {
  api: TerminalApi;
  sfApi?: SalesforceWorkspaceApi;
  onNew: () => void;
}) {
  const s = api.active;
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("thirdeye_terminal_toolbar_expanded");
      return saved === "true";
    }
    return false;
  });

  const toggleToolbar = () => {
    setIsToolbarExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("thirdeye_terminal_toolbar_expanded", String(next));
      } catch {}
      return next;
    });
  };

  // Sync zoom level with Electron
  useEffect(() => {
    if (window.electronAPI?.window?.getZoom) {
      window.electronAPI.window.getZoom().then((z: number) => {
        if (typeof z === 'number') setZoomLevel(Math.round(z * 100));
      });
    }
    if (window.electronAPI?.window?.onZoomChanged) {
      return window.electronAPI.window.onZoomChanged((z: number) => {
        if (typeof z === 'number') setZoomLevel(Math.round(z * 100));
      });
    }
  }, []);

  const handleZoomIn = () => {
    if (window.electronAPI?.window?.zoomIn) {
      window.electronAPI.window.zoomIn().then((z: number) => setZoomLevel(Math.round(z * 100)));
    }
  };

  const handleZoomOut = () => {
    if (window.electronAPI?.window?.zoomOut) {
      window.electronAPI.window.zoomOut().then((z: number) => setZoomLevel(Math.round(z * 100)));
    }
  };

  const handleResetZoom = () => {
    if (window.electronAPI?.window?.resetZoom) {
      window.electronAPI.window.resetZoom().then((z: number) => setZoomLevel(Math.round(z * 100)));
    }
  };

  return (
    <section className="flex h-full w-full min-w-0 flex-col bg-[#222222] overflow-hidden">
      {/* Pro IDE Tab Bar with hard fabric depth & zero outline borders */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#1C1C1C] bg-[#121212] px-2 select-none">
        <div className="flex h-full items-center overflow-x-auto no-scrollbar gap-1">
          {api.sessions.map((t) => {
            const on = t.id === api.activeId;
            return (
              <div
                key={t.id}
                onClick={() => api.setActiveId(t.id)}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 px-3 text-[12px] transition-all select-none h-7.5 rounded-md",
                  on
                    ? "fabric-tab-active text-[#E0E0E0] font-semibold"
                    : "fabric-tab-inactive text-[#808080] hover:text-[#D0D0D0]"
                )}
              >
                <SquareTerminal className={cn("h-3.5 w-3.5 shrink-0", on ? "text-[#FF6B00]" : "text-[#808080]")} />
                <span className="whitespace-nowrap font-sans text-[12px]">{t.title}</span>
                {t.lastError && (
                  <span className="px-1.5 py-0.2 rounded fabric-tag text-[#FF6B00] font-mono text-[9px] font-bold">
                    ERR
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    api.closeSession(t.id);
                  }}
                  className="p-0.5 rounded text-[#808080] hover:text-[#E0E0E0] hover:bg-[#2C2C2C] transition-colors cursor-pointer ml-1"
                  aria-label="Close tab"
                  title="Close Tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Plus icon to create new tab */}
          <button
            onClick={() => api.createTerminal('cmd')}
            className="my-auto ml-1 flex h-7 w-7 items-center justify-center rounded-md fabric-card text-[#808080] hover:text-[#E0E0E0] transition-all cursor-pointer"
            title="Create New Command Prompt"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {s && (
          <div className="flex shrink-0 items-center py-1 ml-2">
            {/* Collapsible Action Controls in Horizontal Plane */}
            <div
              className={cn(
                "flex items-center gap-1.5 overflow-hidden transition-all duration-300 ease-out whitespace-nowrap",
                isToolbarExpanded
                  ? "max-w-[850px] opacity-100 mr-1.5 translate-x-0"
                  : "max-w-0 opacity-0 mr-0 translate-x-4 pointer-events-none"
              )}
            >
              {/* Shell Switcher Pill */}
              <button
                onClick={() => api.toggleShellType?.()}
                className="flex shrink-0 items-center gap-1.5 rounded-md fabric-card px-2.5 py-1 text-[11px] font-mono transition-all cursor-pointer"
                title={`Active shell: ${s.shellType === 'powershell' ? 'PowerShell' : 'cmd.exe'}. Click to toggle.`}
              >
                <span className="text-[#FF6B00] font-bold">{s.shellType === 'powershell' ? 'pwsh' : 'cmd.exe'}</span>
                <span className="text-[#808080] text-[10px]">&rarr; {s.shellType === 'powershell' ? 'cmd' : 'pwsh'}</span>
              </button>

              {/* Paste Button */}
              <button
                onClick={() => api.pasteFromClipboard?.()}
                className="flex shrink-0 items-center gap-1.5 rounded-md fabric-card px-2.5 py-1 text-[11px] font-sans font-medium text-[#E0E0E0] transition-all cursor-pointer"
                title="Paste from clipboard into terminal (Ctrl+V)"
              >
                <Clipboard className="h-3 w-3 text-[#FF6B00]" /> Paste
              </button>

              {/* Clear Button */}
              <button
                onClick={() => api.execute("clear")}
                className="flex shrink-0 items-center gap-1.5 rounded-md fabric-card px-2.5 py-1 text-[11px] font-sans font-medium text-[#E0E0E0] transition-all cursor-pointer"
                title="Clear terminal buffer"
              >
                <Trash2 className="h-3 w-3 text-[#808080]" /> Clear
              </button>

              {/* Restart Button */}
              <button
                onClick={api.killAndRestart}
                className="flex shrink-0 items-center gap-1.5 rounded-md fabric-card px-2.5 py-1 text-[11px] font-sans font-medium text-[#E0E0E0] transition-all cursor-pointer"
                title="Restart terminal session"
              >
                <RotateCw className="h-3 w-3 text-[#808080]" /> Restart
              </button>

              {/* Line Numbers Gutter Toggle */}
              <button
                onClick={() => setShowLineNumbers((prev) => !prev)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-mono transition-all cursor-pointer",
                  showLineNumbers
                    ? "fabric-card-active text-[#FF6B00] font-semibold"
                    : "fabric-card text-[#808080] hover:text-[#E0E0E0]"
                )}
                title={`Line Numbers: ${showLineNumbers ? "Enabled" : "Disabled"}. Click to toggle.`}
              >
                <span className="font-bold text-[10px]">#</span>
                <span className="text-[10px] hidden sm:inline">Lines</span>
              </button>

              {/* Fast Scroller / Minimap Toggle */}
              <button
                onClick={() => setShowMinimap((prev) => !prev)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-mono transition-all cursor-pointer",
                  showMinimap
                    ? "fabric-card-active text-[#FF6B00] font-semibold"
                    : "fabric-card text-[#808080] hover:text-[#E0E0E0]"
                )}
                title={`Fast Scroller Minimap: ${showMinimap ? "Enabled" : "Disabled"}. Click to toggle.`}
              >
                <PanelRight className="h-3 w-3" />
                <span className="text-[10px] hidden sm:inline">Minimap</span>
              </button>

              {/* UI Zoom Controls Widget */}
              <div className="flex shrink-0 items-center gap-0.5 rounded-md fabric-card px-1.5 py-0.5 text-[11px] font-mono select-none">
                <button
                  onClick={handleZoomOut}
                  className="p-1 rounded text-[#808080] hover:text-[#E0E0E0] hover:bg-[#282828] transition-colors cursor-pointer"
                  title="Zoom Out (Ctrl + -)"
                >
                  <ZoomOut className="h-3 w-3" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="px-1.5 py-0.5 text-[10px] text-[#FF6B00] font-bold hover:text-orange-300 transition-colors cursor-pointer"
                  title="Reset Zoom to 100% (Ctrl + 0)"
                >
                  {zoomLevel}%
                </button>
                <button
                  onClick={handleZoomIn}
                  className="p-1 rounded text-[#808080] hover:text-[#E0E0E0] hover:bg-[#282828] transition-colors cursor-pointer"
                  title="Zoom In (Ctrl + + / Ctrl + =)"
                >
                  <ZoomIn className="h-3 w-3" />
                </button>
              </div>

              {/* Expand / Maximize Window Button */}
              <button
                onClick={() => {
                  if (window.electronAPI?.window?.toggleMaximize) {
                    window.electronAPI.window.toggleMaximize();
                  }
                }}
                className="flex shrink-0 p-1.5 rounded border border-[#303030] bg-[#222222] text-[#808080] hover:text-[#E0E0E0] hover:bg-[#282828] transition-colors cursor-pointer"
                title="Maximize / Restore Window"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Arrow Trigger Button: expands / collapses tools horizontally */}
            <button
              onClick={toggleToolbar}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all cursor-pointer",
                isToolbarExpanded
                  ? "fabric-card-active text-[#FF6B00] shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                  : "fabric-card text-[#8E8E8E] hover:text-[#E0E0E0] hover:bg-[#252525]"
              )}
              title={isToolbarExpanded ? "Collapse terminal tools" : "Terminal Tools & Actions"}
              aria-expanded={isToolbarExpanded}
            >
              <ChevronLeft
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  isToolbarExpanded ? "rotate-180 text-[#FF6B00]" : "text-[#A0A0A0]"
                )}
              />
            </button>
          </div>
        )}
      </div>

      {/* GreyOrange Site Cluster Node Fleet Bar */}
      {sfApi?.activeSite && (
        <div className="flex h-7.5 shrink-0 items-center justify-between border-b border-[#303030] bg-[#1A1A1A] px-3 text-[11px] font-sans">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-[#FF6B00] text-[11px]">
              {sfApi.activeSite.code}
            </span>
            <span className="text-[#404040]">|</span>
            <span className="text-[#808080] truncate hidden sm:inline text-[11px]">
              {sfApi.activeSite.name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {sfApi.activeSite.vms.map((vm) => {
              const isCurrent = s?.ip === vm.ip;
              return (
                <button
                  key={vm.id}
                  onClick={() => {
                    if (sfApi.activeTicket) {
                      sfApi.addTerminalToTicket(sfApi.activeTicket.id, vm);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-mono transition-colors cursor-pointer border",
                    isCurrent
                      ? "border-[#FF6B00]/60 bg-[#2A1810] text-[#FF6B00] font-semibold"
                      : "border-[#303030] bg-[#222222] text-[#808080] hover:text-[#E0E0E0] hover:bg-[#282828]"
                  )}
                  title={`Connect to ${vm.name} (${vm.ip})`}
                >
                  <span
                    className={cn(
                      "px-1 py-0.2 rounded text-[8.5px] font-mono font-bold uppercase",
                      isCurrent ? "bg-[#FF6B00] text-black" : "bg-[#2A2A2A] text-[#808080]"
                    )}
                  >
                    {vm.role === "primary" ? "PRI" : "VM"}
                  </span>
                  <span>{vm.role === "primary" ? "Primary" : vm.name.split("-")[1] || vm.role}</span>
                  <span className="text-[#606060] text-[9.5px]">({vm.ip})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Terminal Area */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 overflow-hidden bg-[#222222]"
      >
        {!s ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center select-none font-sans">
            <div className="max-w-lg w-full space-y-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#303030] bg-[#252525] px-3 py-1 text-[11.5px] font-medium text-[#E0E0E0] font-sans">
                  <Terminal className="h-3.5 w-3.5 text-[#FF6B00]" /> Native Terminal Environment
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-[#E0E0E0] pt-1">
                  Create a Terminal Workspace
                </h2>
                <p className="text-[13px] text-[#808080] max-w-sm mx-auto leading-relaxed">
                  Select your preferred shell below. THIRD EYE AI will automatically ingest live session logs for error diagnostics.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left">
                <button
                  onClick={() => api.createTerminal('cmd')}
                  className="group flex flex-col justify-between rounded-lg border border-[#303030] bg-[#252525] p-4 hover:bg-[#2A2A2A] hover:border-[#404040] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-[#202020] border border-[#303030] text-[#FF6B00]">
                      <SquareTerminal className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-mono text-[#808080] bg-[#1E1E1E] px-2 py-0.5 rounded border border-[#303030]">
                      cmd.exe
                    </span>
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#E0E0E0]">Command Prompt</div>
                    <p className="mt-1 text-[11.5px] text-[#808080] leading-relaxed">
                      Classic Windows command line with direct batch scripting and native CLI execution.
                    </p>
                  </div>
                  <div className="mt-4 text-[12px] font-medium text-[#FF6B00] group-hover:text-orange-300 flex items-center gap-1 transition-colors">
                    Launch cmd.exe <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </div>
                </button>

                <button
                  onClick={() => api.createTerminal('powershell')}
                  className="group flex flex-col justify-between rounded-lg border border-[#303030] bg-[#252525] p-4 hover:bg-[#2A2A2A] hover:border-[#404040] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-[#202020] border border-[#303030] text-[#FF6B00]">
                      <Terminal className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-mono text-[#808080] bg-[#1E1E1E] px-2 py-0.5 rounded border border-[#303030]">
                      pwsh
                    </span>
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#E0E0E0]">Windows PowerShell</div>
                    <p className="mt-1 text-[11.5px] text-[#808080] leading-relaxed">
                      Advanced object-based automation engine with cmdlet pipelines and scripting.
                    </p>
                  </div>
                  <div className="mt-4 text-[12px] font-medium text-[#FF6B00] group-hover:text-orange-300 flex items-center gap-1 transition-colors">
                    Launch PowerShell <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </div>
                </button>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => {
                    if (window.electronAPI?.system?.openExternalTerminal) {
                      window.electronAPI.system.openExternalTerminal();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" /> Or launch native Command Prompt outside in an OS desktop window
                </button>
              </div>
            </div>
          </div>
        ) : (
          <XtermView
            session={s}
            showLineNumbers={showLineNumbers}
            showMinimap={showMinimap}
          />
        )}
      </div>
    </section>
  );
}
