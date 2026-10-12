import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Globe,
  Settings,
  ChevronDown,
  RefreshCw,
  Minus,
  Square,
  Copy,
  X,
  Check,
  Terminal as TerminalIcon,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  User,
  LogOut,
  FolderOpen,
} from "lucide-react";
import type { TerminalApi } from "@/hooks/useTerminalSession";
import { copyToClipboard } from "@/lib/clipboard";
import { getActiveTerminalSelection } from "@/components/terminal/terminalState";

interface AntigravityTitleBarProps {
  terminalApi: TerminalApi;
  showLeftSidebar: boolean;
  onToggleLeftSidebar: () => void;
  showRightSidebar: boolean;
  onToggleRightSidebar: () => void;
  showBottomPanel: boolean;
  onToggleBottomPanel: () => void;
  onSplitTerminal: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenFolder?: (() => void) | undefined;
  activeFilePath?: string | undefined;
}

type MenuType = "file" | "edit" | "selection" | "view" | "terminal" | "help" | "more" | "avatar" | null;

export function AntigravityTitleBar({
  terminalApi,
  showLeftSidebar,
  onToggleLeftSidebar,
  showRightSidebar,
  onToggleRightSidebar,
  showBottomPanel,
  onToggleBottomPanel,
  onSplitTerminal,
  onOpenSettings,
  onOpenSearch,
  onOpenFolder,
  activeFilePath,
}: AntigravityTitleBarProps) {
  const activeFileName = activeFilePath ? activeFilePath.split(/[/\\]/).pop() || "" : "";
  const [activeMenu, setActiveMenu] = useState<MenuType>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Check window maximized state and subscribe to changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.window?.isMaximized) {
      window.electronAPI.window.isMaximized().then((max) => setIsMaximized(Boolean(max)));
    }

    let unsub: (() => void) | undefined;
    if (typeof window !== "undefined" && window.electronAPI?.window?.onMaximizedChanged) {
      unsub = window.electronAPI.window.onMaximizedChanged((max) => {
        setIsMaximized(max);
      });
    }
    return () => {
      unsub?.();
    };
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Window control actions
  const handleMinimize = () => {
    if (window.electronAPI?.window?.minimize) {
      window.electronAPI.window.minimize();
    }
  };

  const handleToggleMaximize = async () => {
    if (window.electronAPI?.window?.toggleMaximize) {
      const res = await window.electronAPI.window.toggleMaximize();
      setIsMaximized(Boolean(res));
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.window?.close) {
      window.electronAPI.window.close();
    }
  };

  const handleZoomIn = () => {
    window.electronAPI?.window?.zoomIn?.();
  };

  const handleZoomOut = () => {
    window.electronAPI?.window?.zoomOut?.();
  };

  const handleResetZoom = () => {
    window.electronAPI?.window?.resetZoom?.();
  };

  // Close active menu when any menu item action is clicked
  const exec = (action: () => void) => {
    action();
    setActiveMenu(null);
  };

  return (
    <div
      ref={menuBarRef}
      className="flex h-[35px] shrink-0 items-center justify-between border-b border-[#262626] bg-[#161616] select-none text-[12px] font-sans text-[#CCCCCC] z-50 relative app-drag-region"
      onDoubleClick={handleToggleMaximize}
    >
      {/* 1. LEFT: THIRD EYE Logo + Desktop Menu Bar */}
      <div className="flex items-center h-full pl-2 gap-0.5 app-no-drag max-w-[calc(50%-230px)] overflow-hidden">
        {/* Antigravity Multi-Colored Gradient Logo Badge matching Screenshot 2 */}
        <div
          className="flex items-center justify-center h-5 w-5 mr-1.5 cursor-pointer rounded-[4px] bg-gradient-to-tr from-[#FF5E62] via-[#FF9966] to-[#7B2CBF] shadow-sm shrink-0"
          title="THIRD EYE"
          onClick={() => setActiveMenu(activeMenu === "more" ? null : "more")}
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3 text-white" fill="none">
            <path
              d="M3 2.5L13 2.5L8 13.5L3 2.5Z"
              fill="white"
              fillOpacity="0.9"
            />
          </svg>
        </div>

        {/* Product Title + Dynamic Path */}
        <div className="flex items-center gap-1.5 text-[12px] font-sans mr-2 select-none">
          <span className="font-semibold text-white tracking-tight">THIRD EYE</span>
          {activeFileName && activeFilePath && (
            <>
              <span className="text-[#65656E]">/</span>
              <span className="text-[#E0E0E8] font-mono text-[11px] font-medium truncate max-w-[200px]">
                {activeFilePath.replace(/\\/g, "/")}
              </span>
            </>
          )}
        </div>

        {/* Menu Item: File */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === "file" ? null : "file")}
            onMouseEnter={() => activeMenu && setActiveMenu("file")}
            className={`px-2 py-1 rounded text-[12px] font-normal transition-colors cursor-pointer ${
              activeMenu === "file" ? "bg-[#282828] text-white" : "hover:bg-[#252525] hover:text-white"
            }`}
          >
            File
          </button>
          {activeMenu === "file" && (
            <div className="absolute left-0 top-full mt-0.5 w-56 rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl py-1 text-xs text-[#CCCCCC] z-50 animate-in fade-in-50 zoom-in-95">
              <button
                onClick={() =>
                  exec(() => {
                    if (onOpenFolder) {
                      onOpenFolder();
                    } else if (window.electronAPI?.dialog?.openFolder) {
                      window.electronAPI.dialog.openFolder().then((res) => {
                        if (res?.success && res.folderPath) {
                          terminalApi.cdToDirectory(res.folderPath);
                        }
                      });
                    }
                  })
                }
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left font-medium text-white"
              >
                <span>Open Folder / Project…</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+O</span>
              </button>
              <div className="h-px bg-[#2C2C2C] my-1" />
              <button
                onClick={() => exec(() => terminalApi.createTerminal("cmd"))}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>New CMD Terminal</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+Shift+`</span>
              </button>
              <button
                onClick={() => exec(() => terminalApi.createTerminal("powershell"))}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>New PowerShell Terminal</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+P</span>
              </button>
              <button
                onClick={() => exec(onSplitTerminal)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Split Terminal</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+\</span>
              </button>
              <div className="h-px bg-[#2C2C2C] my-1" />
              <button
                onClick={() => exec(onOpenSettings)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Preferences: Settings</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+,</span>
              </button>
              <div className="h-px bg-[#2C2C2C] my-1" />
              <button
                onClick={() => exec(handleClose)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left text-[#E08080]"
              >
                <span>Exit THIRD EYE</span>
                <span className="font-mono text-[10px] text-[#777777]">Alt+F4</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu Item: Edit */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === "edit" ? null : "edit")}
            onMouseEnter={() => activeMenu && setActiveMenu("edit")}
            className={`px-2 py-1 rounded text-[12px] font-normal transition-colors cursor-pointer ${
              activeMenu === "edit" ? "bg-[#282828] text-white" : "hover:bg-[#252525] hover:text-white"
            }`}
          >
            Edit
          </button>
          {activeMenu === "edit" && (
            <div className="absolute left-0 top-full mt-0.5 w-52 rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl py-1 text-xs text-[#CCCCCC] z-50 animate-in fade-in-50 zoom-in-95">
              <button
                onClick={() =>
                  exec(async () => {
                    const sel = getActiveTerminalSelection() || window.getSelection()?.toString() || "";
                    if (sel) {
                      await copyToClipboard(sel);
                    }
                  })
                }
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Copy</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+C</span>
              </button>
              <button
                onClick={() =>
                  exec(async () => {
                    await terminalApi.pasteFromClipboard?.();
                  })
                }
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Paste</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+V</span>
              </button>
              <div className="h-px bg-[#2C2C2C] my-1" />
              <button
                onClick={() => exec(() => {
                  if (terminalApi.active) {
                    terminalApi.execute("cls");
                  }
                })}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Clear Buffer</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+L</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu Item: Selection */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === "selection" ? null : "selection")}
            onMouseEnter={() => activeMenu && setActiveMenu("selection")}
            className={`px-2 py-1 rounded text-[12px] font-normal transition-colors cursor-pointer ${
              activeMenu === "selection" ? "bg-[#282828] text-white" : "hover:bg-[#252525] hover:text-white"
            }`}
          >
            Selection
          </button>
          {activeMenu === "selection" && (
            <div className="absolute left-0 top-full mt-0.5 w-52 rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl py-1 text-xs text-[#CCCCCC] z-50 animate-in fade-in-50 zoom-in-95">
              <button
                onClick={() => exec(() => document.execCommand("selectAll"))}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Select All</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+A</span>
              </button>
              <button
                onClick={() => exec(onOpenSearch)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Find in Workspace</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+F</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu Item: View */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === "view" ? null : "view")}
            onMouseEnter={() => activeMenu && setActiveMenu("view")}
            className={`px-2 py-1 rounded text-[12px] font-normal transition-colors cursor-pointer ${
              activeMenu === "view" ? "bg-[#282828] text-white" : "hover:bg-[#252525] hover:text-white"
            }`}
          >
            View
          </button>
          {activeMenu === "view" && (
            <div className="absolute left-0 top-full mt-0.5 w-60 rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl py-1 text-xs text-[#CCCCCC] z-50 animate-in fade-in-50 zoom-in-95">
              <button
                onClick={() => exec(onToggleLeftSidebar)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <Check className={`h-3 w-3 ${showLeftSidebar ? "opacity-100" : "opacity-0"}`} />
                  Primary Side Bar (Explorer)
                </span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+B</span>
              </button>
              <button
                onClick={() => exec(onToggleRightSidebar)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <Check className={`h-3 w-3 ${showRightSidebar ? "opacity-100" : "opacity-0"}`} />
                  Secondary Side Bar (THIRD EYE AI)
                </span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+Shift+A</span>
              </button>
              <button
                onClick={() => exec(onToggleBottomPanel)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <Check className={`h-3 w-3 ${showBottomPanel ? "opacity-100" : "opacity-0"}`} />
                  Bottom Status Bar
                </span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+J</span>
              </button>
              <div className="h-px bg-[#2C2C2C] my-1" />
              <button
                onClick={() => exec(handleZoomIn)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Zoom In</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+=</span>
              </button>
              <button
                onClick={() => exec(handleZoomOut)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Zoom Out</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+-</span>
              </button>
              <button
                onClick={() => exec(handleResetZoom)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Reset Zoom</span>
                <span className="font-mono text-[10px] text-[#777777]">Ctrl+0</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu Item: Terminal */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === "terminal" ? null : "terminal")}
            onMouseEnter={() => activeMenu && setActiveMenu("terminal")}
            className={`px-2 py-1 rounded text-[12px] font-normal transition-colors cursor-pointer ${
              activeMenu === "terminal" ? "bg-[#282828] text-white" : "hover:bg-[#252525] hover:text-white"
            }`}
          >
            Terminal
          </button>
          {activeMenu === "terminal" && (
            <div className="absolute left-0 top-full mt-0.5 w-56 rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl py-1 text-xs text-[#CCCCCC] z-50 animate-in fade-in-50 zoom-in-95">
              <button
                onClick={() => exec(() => terminalApi.createTerminal("cmd"))}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>New Command Prompt</span>
                <span className="font-mono text-[10px] text-[#777777]">cmd.exe</span>
              </button>
              <button
                onClick={() => exec(() => terminalApi.createTerminal("powershell"))}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>New PowerShell Shell</span>
                <span className="font-mono text-[10px] text-[#777777]">pwsh.exe</span>
              </button>
              <button
                onClick={() => exec(onSplitTerminal)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Split Active Terminal</span>
                <span className="font-mono text-[10px] text-[#777777]">Split</span>
              </button>
              <div className="h-px bg-[#2C2C2C] my-1" />
              <button
                onClick={() => exec(() => {
                  if (terminalApi.active) {
                    terminalApi.execute("cls");
                  }
                })}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Clear Buffer</span>
                <span className="font-mono text-[10px] text-[#777777]">cls</span>
              </button>
              {terminalApi.active && (
                <button
                  onClick={() => exec(() => terminalApi.closeSession(terminalApi.active!.id))}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left text-[#E08080]"
                >
                  <span>Kill Active Terminal</span>
                  <span className="font-mono text-[10px] text-[#777777]">kill</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Menu Item: Help */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === "help" ? null : "help")}
            onMouseEnter={() => activeMenu && setActiveMenu("help")}
            className={`px-2 py-1 rounded text-[12px] font-normal transition-colors cursor-pointer ${
              activeMenu === "help" ? "bg-[#282828] text-white" : "hover:bg-[#252525] hover:text-white"
            }`}
          >
            Help
          </button>
          {activeMenu === "help" && (
            <div className="absolute left-0 top-full mt-0.5 w-56 rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl py-1 text-xs text-[#CCCCCC] z-50 animate-in fade-in-50 zoom-in-95">
              <button
                onClick={() => exec(onOpenSearch)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Command Palette</span>
                <span className="font-mono text-[10px] text-[#777777]">⌘K</span>
              </button>
              <button
                onClick={() => exec(onOpenSettings)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <span>Settings</span>
              </button>
              <div className="h-px bg-[#2C2C2C] my-1" />
              <div className="px-3 py-2 text-[11px] text-[#777777]">
                <div className="font-semibold text-[#E0E0E0]">THIRD EYE v1.0.0</div>
                <div>Third Eye Neural IDE Engine</div>
              </div>
            </div>
          )}
        </div>

        {/* Menu Item: Three dots (...) overflow menu */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === "more" ? null : "more")}
            onMouseEnter={() => activeMenu && setActiveMenu("more")}
            className={`px-1.5 py-1 rounded text-[12px] font-normal transition-colors cursor-pointer ${
              activeMenu === "more" ? "bg-[#282828] text-white" : "hover:bg-[#252525] hover:text-white"
            }`}
            title="More actions"
          >
            ...
          </button>
          {activeMenu === "more" && (
            <div className="absolute left-0 top-full mt-0.5 w-52 rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl py-1 text-xs text-[#CCCCCC] z-50 animate-in fade-in-50 zoom-in-95">
              <button
                onClick={() => exec(onOpenSettings)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#282828] hover:text-white text-left"
              >
                <Settings className="h-3.5 w-3.5 text-[#888888]" />
                <span>Open Settings</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. CENTER: Clean Professional Title Bar Search Pill matching Reference Image */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[440px] px-2 z-20 app-no-drag pointer-events-auto">
        <button
          onClick={onOpenSearch}
          className="w-full h-[27px] flex items-center justify-between px-3 bg-[#1B1C22] hover:bg-[#23242E] border border-[#2F313D] hover:border-[#3E4050] rounded-[6px] text-[12px] text-[#8C8E9F] hover:text-[#D4D6E4] transition-all cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.3)] group select-none"
          title="Search files, symbols, and commands (⌘K / Ctrl+K)"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Search className="h-3.5 w-3.5 text-[#7E8092] group-hover:text-[#A0A2B6] shrink-0 transition-colors" />
            <span className="truncate tracking-wide font-normal">Search entire project</span>
          </div>
          <kbd className="h-[18px] px-1.5 flex items-center justify-center text-[10px] font-mono text-[#828496] group-hover:text-[#B4B6C8] bg-[#242530] border border-[#353746] rounded-[4px] shrink-0 ml-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* 3. RIGHT: Layout Toggles + Utilities + Avatar + Frameless Window Controls */}
      <div className="flex items-center h-full gap-1.5 app-no-drag">
        {/* Layout Control Buttons Group (Matches Screenshot 2) */}
        <div className="flex items-center gap-0.5 mr-1">
          {/* Layout 1: Split Editor / Columns */}
          <button
            onClick={onSplitTerminal}
            className="flex items-center justify-center h-6 w-6 rounded text-[#8E8E8E] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
            title="Split Terminal / Columns (Ctrl+\)"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <line x1="8" y1="2" x2="8" y2="14" />
            </svg>
          </button>

          {/* Layout 2: Toggle Primary Side Bar (Left Explorer) */}
          <button
            onClick={onToggleLeftSidebar}
            className={`flex items-center justify-center h-6 w-6 rounded transition-colors cursor-pointer ${
              showLeftSidebar
                ? "text-white bg-[#222222]"
                : "text-[#8E8E8E] hover:text-white hover:bg-[#252525]"
            }`}
            title="Toggle Primary Side Bar (Ctrl+B)"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <line x1="6" y1="2" x2="6" y2="14" strokeWidth="1.5" />
            </svg>
          </button>

          {/* Layout 3: Toggle Bottom Panel */}
          <button
            onClick={onToggleBottomPanel}
            className={`flex items-center justify-center h-6 w-6 rounded transition-colors cursor-pointer ${
              showBottomPanel
                ? "text-white bg-[#222222]"
                : "text-[#8E8E8E] hover:text-white hover:bg-[#252525]"
            }`}
            title="Toggle Bottom Panel (Ctrl+J)"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <line x1="2" y1="10" x2="14" y2="10" strokeWidth="1.5" />
            </svg>
          </button>

          {/* Layout 4: Toggle Secondary Side Bar (THIRD EYE AI) */}
          {/* MATCHES SCREENSHOT 2: Distinct highlighted frame around this icon when active! */}
          <button
            onClick={onToggleRightSidebar}
            className={`flex items-center justify-center h-6 w-6 rounded-[3px] transition-all cursor-pointer ${
              showRightSidebar
                ? "border border-[#666666] bg-[#2A2A2A] text-white shadow-sm"
                : "text-[#8E8E8E] hover:text-white hover:bg-[#252525] border border-transparent"
            }`}
            title="Toggle Secondary Side Bar (THIRD EYE AI)"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <line x1="10" y1="2" x2="10" y2="14" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {/* Separator */}
        <div className="h-3.5 w-px bg-[#333333] mx-0.5" />

        {/* Utility Icon 1: Search / Command Palette (Magnifier) */}
        <button
          onClick={onOpenSearch}
          className="flex items-center justify-center h-6 w-6 rounded text-[#8E8E8E] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
          title="Search commands (⌘K)"
        >
          <Search className="h-3.5 w-3.5" />
        </button>



        {/* Utility Icon 3: Settings Gear */}
        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center h-6 w-6 rounded text-[#8E8E8E] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
          title="Settings (⌘,)"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        {/* User Avatar with Gradient Ring matching Screenshot 2 */}
        <div className="relative ml-1">
          <button
            onClick={() => setActiveMenu(activeMenu === "avatar" ? null : "avatar")}
            className="flex items-center p-0.5 rounded-full bg-gradient-to-tr from-[#FF5E62] via-[#FF9966] to-[#7B2CBF] hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
            title="Engineer Profile: aditya.s.ctr"
          >
            <div className="h-5 w-5 rounded-full bg-[#18181C] flex items-center justify-center text-white text-[9px] font-bold font-sans">
              <User className="h-3 w-3 text-white" />
            </div>
          </button>

          {activeMenu === "avatar" && (
            <div className="absolute right-0 top-full mt-1 w-64 rounded-md bg-[#1C1C1C] border border-[#303030] shadow-2xl p-2 text-xs text-[#CCCCCC] z-50 animate-in fade-in-50 zoom-in-95">
              <div className="flex items-center gap-2.5 p-2 border-b border-[#2C2C2C]">
                <div className="h-8 w-8 rounded-full bg-[#2A1810] border border-[#FF6B00]/40 text-[#FF6B00] font-bold text-xs font-mono flex items-center justify-center">
                  AS
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-white truncate">aditya.s.ctr</div>
                  <div className="text-[10.5px] text-[#808080] truncate">Cloud DevOps & Systems</div>
                </div>
              </div>
              <div className="py-1.5 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-[11px] text-[#888888]">
                  <span>AI Diagnostics:</span>
                  <span className="font-mono text-[10px] text-amber-400">Gemini 2.0</span>
                </div>
              </div>
              <div className="h-px bg-[#2C2C2C] my-1" />
              <button
                onClick={() => exec(onOpenSettings)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#282828] hover:text-white text-left text-[11.5px]"
              >
                <Settings className="h-3.5 w-3.5 text-[#888888]" />
                <span>Account & Organization Settings</span>
              </button>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-[#2F2F2F] mx-1" />

        {/* Native Frameless Window Controls (Minimize, Maximize/Restore, Close) */}
        <div className="flex items-center h-full">
          {/* Minimize Button */}
          <button
            onClick={handleMinimize}
            className="flex items-center justify-center h-[35px] w-10 text-[#8E8E8E] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>

          {/* Maximize / Restore Button */}
          <button
            onClick={handleToggleMaximize}
            className="flex items-center justify-center h-[35px] w-10 text-[#8E8E8E] hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Copy className="h-3 w-3 rotate-90" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </button>

          {/* Close Button (Windows Red on Hover) */}
          <button
            onClick={handleClose}
            className="flex items-center justify-center h-[35px] w-10 text-[#8E8E8E] hover:text-white hover:bg-[#E81123] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
