import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Cpu,
  GitBranch,
  MemoryStick,
  Network,
  FolderKanban,
  Server,
  Settings,
  Shield,
  RefreshCw,
  ExternalLink,
  Terminal,
  User,
  Bell,
  Search,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useTerminalSession } from "@/hooks/useTerminalSession";
import { useEditorWorkspace } from "@/hooks/useEditorWorkspace";
import { MonacoCodeEditor } from "@/components/editor/MonacoCodeEditor";
import { VsCodeFileExplorer } from "@/components/explorer/VsCodeFileExplorer";
import { VsCodeBottomTerminal } from "@/components/terminal/VsCodeBottomTerminal";
import { ActivityBar, type ActivityView } from "@/components/layout/ActivityBar";
import { TerminalExplorer } from "@/components/explorer/TerminalExplorer";
import { SearchExplorer } from "@/components/explorer/SearchExplorer";
import { SourceControlExplorer } from "@/components/explorer/SourceControlExplorer";
import { DebugExplorer } from "@/components/explorer/DebugExplorer";
import { RemoteExplorer } from "@/components/explorer/RemoteExplorer";
import { ExtensionsExplorer } from "@/components/explorer/ExtensionsExplorer";
import { TestingExplorer } from "@/components/explorer/TestingExplorer";
import { AddEnvironmentModal } from "@/components/explorer/AddEnvironmentModal";
import { SettingsModal } from "@/components/layout/SettingsModal";
import { AiSidecar } from "@/components/ai-assistant/AiSidecar";
import { AntigravityTitleBar } from "@/components/layout/AntigravityTitleBar";
import { CommandPaletteModal } from "@/components/layout/CommandPaletteModal";
import { DiffPreviewModal } from "@/editor/diffPreview/DiffPreviewModal";
import { useAgentActivityStore } from "@/stores/agentActivityStore";

export function MainLayout() {
  const terminalApi = useTerminalSession();
  const editorApi = useEditorWorkspace();

  const [activeView, setActiveView] = useState<ActivityView>('explorer');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const agents = useAgentActivityStore((s) => s.agents);
  const tasks = useAgentActivityStore((s) => s.tasks);
  const activeAgentsCount = useMemo(
    () =>
      Object.values(agents).filter(
        (a) => a.status !== 'idle' && a.status !== 'completed' && a.status !== 'failed'
      ).length,
    [agents]
  );
  const pendingTasksCount = useMemo(
    () => tasks.filter((t) => t.status === 'pending').length,
    [tasks]
  );
  const [addEnvModalOpen, setAddEnvModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Status bar items state matching authentic VS Code / Image 4 reference
  const [indentation, setIndentation] = useState<string>("Spaces: 2");
  const [encoding, setEncoding] = useState<string>("UTF-8");
  const [eol, setEol] = useState<string>("LF");

  const currentLanguage = useMemo(() => {
    const pathOrName = editorApi.activeFile?.path || editorApi.activeFile?.name || "";
    if (!pathOrName) return "TypeScript JSX";
    const ext = pathOrName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'tsx': return 'TypeScript JSX';
      case 'ts': return 'TypeScript';
      case 'jsx': return 'JavaScript JSX';
      case 'js': return 'JavaScript';
      case 'json': return 'JSON';
      case 'html': return 'HTML';
      case 'css': return 'CSS';
      case 'scss': return 'SCSS';
      case 'md': return 'Markdown';
      case 'py': return 'Python';
      case 'sql': return 'SQL';
      case 'sh':
      case 'bash': return 'Shell Script';
      case 'yaml':
      case 'yml': return 'YAML';
      default: return 'TypeScript JSX';
    }
  }, [editorApi.activeFile]);

  // Layout toggles matching Antigravity IDE controls
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);

  const handleSelectActivityView = (view: ActivityView) => {
    if (activeView === view && showLeftSidebar) {
      // Toggle sidebar closed if clicking currently active view
      setShowLeftSidebar(false);
    } else {
      setActiveView(view);
      setShowLeftSidebar(true);
    }
  };

  // System telemetry simulation for bottom status bar
  const [tel, setTel] = useState({ cpu: 23, ram: 4.1, ms: 38 });
  useEffect(() => {
    const t = setInterval(
      () =>
        setTel({
          cpu: 15 + Math.round(Math.random() * 25),
          ram: +(3.8 + Math.random() * 0.8).toFixed(1),
          ms: 30 + Math.round(Math.random() * 20),
        }),
      2000
    );
    return () => clearInterval(t);
  }, []);

  // Git branch and sync state for bottom status bar (VS Code & Antigravity standard)
  const [gitStatus, setGitStatus] = useState<{
    isRepo: boolean;
    branch: string;
    ahead: number;
    behind: number;
  }>({
    isRepo: false,
    branch: '',
    ahead: 0,
    behind: 0,
  });
  const [isSyncingGit, setIsSyncingGit] = useState(false);

  useEffect(() => {
    const updateGit = () => {
      if (window.electronAPI?.git?.status) {
        window.electronAPI.git.status().then((res: any) => {
          if (res?.success && res.isRepo !== false) {
            setGitStatus({
              isRepo: true,
              branch: res.branch || 'main',
              ahead: typeof res.ahead === 'number' ? res.ahead : 0,
              behind: typeof res.behind === 'number' ? res.behind : 0,
            });
          } else {
            setGitStatus({ isRepo: false, branch: '', ahead: 0, behind: 0 });
          }
        }).catch(() => {
          setGitStatus({ isRepo: false, branch: '', ahead: 0, behind: 0 });
        });
      }
    };

    updateGit();
    const unsubFs = window.electronAPI?.fs?.onWatchEvent?.(() => updateGit());
    const unsubRoot = window.electronAPI?.workspace?.onRootChanged?.(() => updateGit());
    const unsubGit = window.electronAPI?.git?.onStatusChanged?.(() => updateGit());
    window.addEventListener('focus', updateGit);

    return () => {
      unsubFs?.();
      unsubRoot?.();
      unsubGit?.();
      window.removeEventListener('focus', updateGit);
    };
  }, []);

  const handleBottomBarSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSyncingGit || !gitStatus.isRepo) return;
    setIsSyncingGit(true);
    try {
      if (gitStatus.behind > 0 && window.electronAPI?.git?.pull) {
        await window.electronAPI.git.pull({ branch: gitStatus.branch });
      }
      if ((gitStatus.ahead > 0 || gitStatus.behind === 0) && window.electronAPI?.git?.push) {
        await window.electronAPI.git.push({ branch: gitStatus.branch });
      }
      if (window.electronAPI?.git?.status) {
        const res = await window.electronAPI.git.status();
        if (res?.success) {
          setGitStatus({
            isRepo: res.isRepo !== false,
            branch: res.branch || 'main',
            ahead: res.ahead || 0,
            behind: res.behind || 0,
          });
        }
      }
    } catch (err) {
      console.error('[MainLayout] Bottom bar git sync error:', err);
    } finally {
      setIsSyncingGit(false);
    }
  };

  // Ensure a clean default Command Prompt is ready on application startup
  const terminalSpawnedRef = useRef(false);
  useEffect(() => {
    if (!terminalSpawnedRef.current && terminalApi.sessions.length === 0) {
      terminalSpawnedRef.current = true;
      terminalApi.createTerminal('cmd');
    }
  }, []);

  // Open folder handler that opens OS dialog and auto-directs terminal to chosen folder
  const handleOpenFolder = useCallback(async () => {
    if (window.electronAPI?.dialog?.openFolder) {
      const res = await window.electronAPI.dialog.openFolder();
      if (res?.success && res.folderPath) {
        terminalApi.cdToDirectory(res.folderPath);
        if (editorApi?.setWorkspaceRoot) {
          editorApi.setWorkspaceRoot(res.folderPath);
        }
        if (typeof window !== "undefined") {
          (window as any).__THIRD_EYE_WORKSPACE_ROOT__ = res.folderPath;
        }
      }
    }
  }, [editorApi, terminalApi]);

  // Global Keyboard Shortcuts (Ctrl+K, Ctrl+B, Ctrl+Shift+A, Ctrl+J, Ctrl+O, Zoom)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl) {
        // Quick Command Palette: Ctrl+K
        if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          setSearchOpen(true);
          return;
        }

        // Open Folder / Project: Ctrl+O / Cmd+O
        if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          handleOpenFolder();
          return;
        }

        // Toggle Left Sidebar (Explorer): Ctrl+B
        if ((e.key === 'b' || e.key === 'B') && !e.shiftKey) {
          e.preventDefault();
          setShowLeftSidebar((prev) => !prev);
          return;
        }

        // Toggle Right Sidebar (THIRD EYE AI): Ctrl+Shift+A
        if ((e.key === 'a' || e.key === 'A') && e.shiftKey) {
          e.preventDefault();
          setShowRightSidebar((prev) => !prev);
          return;
        }

        // Toggle Bottom Terminal Panel: Ctrl+J
        if (e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          setShowBottomPanel((prev) => !prev);
          return;
        }

        // Zoom In / Out / Reset
        if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault();
          if (window.electronAPI?.window?.zoomIn) {
            window.electronAPI.window.zoomIn();
          }
        } else if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          if (window.electronAPI?.window?.zoomOut) {
            window.electronAPI.window.zoomOut();
          }
        } else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          if (window.electronAPI?.window?.resetZoom) {
            window.electronAPI.window.resetZoom();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleOpenFolder]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background font-sans select-none">
      {/* 1. Antigravity IDE Sleek Integrated Title Bar */}
      <AntigravityTitleBar
        terminalApi={terminalApi}
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={() => setShowLeftSidebar((prev) => !prev)}
        showRightSidebar={showRightSidebar}
        onToggleRightSidebar={() => setShowRightSidebar((prev) => !prev)}
        showBottomPanel={showBottomPanel}
        onToggleBottomPanel={() => setShowBottomPanel((prev) => !prev)}
        onSplitTerminal={() => terminalApi.createTerminal('powershell')}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenFolder={handleOpenFolder}
        activeFilePath={editorApi.activeFile?.path || ""}
      />

      {/* 2. Main Workspace Layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left vertical activity bar (Always visible, exactly like VS Code) */}
        <ActivityBar
          activeView={activeView}
          onSelectView={handleSelectActivityView}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleAi={() => setShowRightSidebar((prev) => !prev)}
          isAiActive={showRightSidebar}
          isSidebarOpen={showLeftSidebar}
        />

        {/* Resizable horizontal panels */}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ResizablePanelGroup orientation="horizontal" className="h-full w-full min-w-0">
            {/* Panel 1: Primary Side Bar (Explorer, Search, Git, Debug, Remote, Extensions, Testing) */}
            {showLeftSidebar && (
              <>
                <ResizablePanel defaultSize="22%" minSize="16%" maxSize="35%" className="min-w-0 overflow-hidden">
                  {activeView === 'explorer' ? (
                    <VsCodeFileExplorer
                      editorApi={editorApi}
                      terminalApi={terminalApi}
                      onOpenFolder={handleOpenFolder}
                      onCloneRepository={() => {
                        setActiveView('git');
                        setShowLeftSidebar(true);
                      }}
                    />
                  ) : activeView === 'search' ? (
                    <SearchExplorer editorApi={editorApi} />
                  ) : activeView === 'git' ? (
                    <SourceControlExplorer editorApi={editorApi} />
                  ) : activeView === 'debug' ? (
                    <DebugExplorer terminalApi={terminalApi} />
                  ) : activeView === 'remote' ? (
                    <RemoteExplorer terminalApi={terminalApi} />
                  ) : activeView === 'extensions' ? (
                    <ExtensionsExplorer />
                  ) : activeView === 'testing' ? (
                    <TestingExplorer terminalApi={terminalApi} />
                  ) : (
                    <TerminalExplorer api={terminalApi} />
                  )}
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}

            {/* Panel 2: Center Stage (Monaco Code Editor on Top + Resizable Bottom Terminal) */}
            <ResizablePanel
              defaultSize={showLeftSidebar && showRightSidebar ? "48%" : showLeftSidebar || showRightSidebar ? "72%" : "100%"}
              minSize="30%"
              className="min-w-0 overflow-hidden"
            >
              <ResizablePanelGroup orientation="vertical" className="h-full w-full">
                {/* Upper: Monaco Code Editor */}
                <ResizablePanel
                  defaultSize={showBottomPanel ? "60%" : "100%"}
                  minSize="25%"
                  className="min-h-0 min-w-0 overflow-hidden"
                >
                  <MonacoCodeEditor
                    editorApi={editorApi}
                    onOpenTerminal={() => setShowBottomPanel(true)}
                    onOpenFolder={handleOpenFolder}
                    onCloneRepository={() => {
                      setActiveView('git');
                      setShowLeftSidebar(true);
                    }}
                    onQuickOpen={() => setSearchOpen(true)}
                    onNewFile={() => {
                      const count = editorApi.openFiles.filter((f) => f.name.startsWith("Untitled")).length + 1;
                      const name = `Untitled-${count}.ts`;
                      editorApi.openFile(name, "// Start engineering with THIRD EYE\n");
                    }}
                  />
                </ResizablePanel>

                {/* Lower: VS Code Bottom Terminal Drawer */}
                {showBottomPanel && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      defaultSize="40%"
                      minSize="15%"
                      maxSize="75%"
                      className="min-h-0 min-w-0 overflow-hidden"
                    >
                      <VsCodeBottomTerminal
                        api={terminalApi}
                        onClose={() => setShowBottomPanel(false)}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>

            {/* Panel 3: Secondary Side Bar (THIRD EYE AI Sidecar with Editor & Terminal sync) */}
            {showRightSidebar && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="30%" minSize="22%" maxSize="45%" className="min-w-0 overflow-hidden">
                  <AiSidecar
                    api={terminalApi}
                    editorApi={editorApi}
                    onClose={() => setShowRightSidebar(false)}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>

      {/* 3. Authentic Status Bar matching Image 4 reference */}
      <footer className="flex h-[22px] shrink-0 items-center justify-between border-t border-[#1C1D24] bg-[#181818] pl-0 pr-2 font-sans text-[11px] text-[#CCCCCC] select-none z-20">
        {/* Left Section */}
        <div className="flex items-center h-full">
          {/* Remote badge >< */}
          <button
            onClick={() => {
              setActiveView('remote');
              setShowLeftSidebar(true);
            }}
            className="h-full bg-[#0078D4] hover:bg-[#006CBE] text-white px-2.5 flex items-center justify-center font-bold text-[11px] cursor-pointer transition-colors mr-2"
            title="Open a Remote Window (WSL / SSH / Dev Containers)"
          >
            &gt;&lt;
          </button>

          <div className="flex items-center gap-1.5 h-full">
            {/* Git Branch & Sync Button */}
            <div className="flex items-center h-full px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs cursor-pointer transition-colors group">
              <div
                onClick={() => {
                  setActiveView('git');
                  setShowLeftSidebar(true);
                }}
                className="flex items-center gap-1 text-[#CCCCCC] group-hover:text-white"
                title={`Git Branch: ${gitStatus.branch || 'main'}*+ (Click to open Source Control)`}
              >
                <span className="font-medium">{gitStatus.branch || 'main'}*+</span>
              </div>
              <button
                onClick={handleBottomBarSync}
                disabled={isSyncingGit}
                className="ml-1 text-[#CCCCCC] group-hover:text-white transition-colors cursor-pointer"
                title="Synchronize repository with remote (Click to sync)"
              >
                <RefreshCw className={cn("h-2.5 w-2.5", isSyncingGit && "animate-spin text-[#007ACC]")} />
              </button>
            </div>

            {/* Error / Warning counters matching screenshot with vector SVGs */}
            <div
              onClick={() => setShowBottomPanel((p) => !p)}
              className="flex items-center gap-2 px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs text-[#CCCCCC] hover:text-white cursor-pointer transition-colors text-[11px]"
              title="Problems: 0 Errors, 0 Warnings (Click to toggle bottom panel)"
            >
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3 text-[#CCCCCC]" />
                <span>0</span>
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-[#CCCCCC]" />
                <span>0</span>
              </span>
            </div>

            {/* Cloud project indicator: ☁ (no project) or ☁ {workspaceName} */}
            <div
              onClick={handleOpenFolder}
              className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs text-[#CCCCCC] hover:text-white cursor-pointer transition-colors text-[11px]"
              title={editorApi.workspaceRoot ? `Workspace: ${editorApi.workspaceRoot} (Click to switch)` : "No Project Open (Click to open folder)"}
            >
              <svg className="w-3.5 h-3.5 text-[#9E9E9E]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.724c-.655.564-1.127 1.309-1.258 2.062l-.088.508-.511.085C1.865 6.945.8 8.038.8 9.318 0 10.923 1.333 12.2 2.981 12.2h8.906C13.535 12.2 14.7 11.042 14.7 9.773c0-1.206-.97-2.188-2.223-2.247l-.547-.026-.083-.541C11.597 4.908 9.946 3.3 8 3.3c-1.396 0-2.617.818-3.141 1.942l-.248.534-.552-.71z" />
              </svg>
              <span>
                {editorApi.workspaceRoot
                  ? editorApi.workspaceRoot.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "THIRD_EYE"
                  : "(no project)"}
              </span>
            </div>

            {/* Active Agents Dynamic Indicator if any */}
            {activeAgentsCount > 0 && (
              <div
                className="flex items-center gap-1.5 px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs text-[#10B981] font-medium cursor-pointer transition-colors"
                title={`${activeAgentsCount} agents currently active`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                <span>{activeAgentsCount} active</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Section matching Image 4 reference without system emojis */}
        <div className="flex items-center gap-1 h-full text-[#CCCCCC]">
          {/* User Account */}
          <div
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px]"
            title="Account: salgotraaditya555@gmail.com (Google)"
          >
            <User className="h-3 w-3 text-[#CCCCCC]" />
            <span>salgotraaditya555@gmail.com (Google)</span>
          </div>

          {/* Settings */}
          <div
            onClick={() => setSettingsOpen(true)}
            className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px]"
            title="Settings (Ctrl+,)"
          >
            Settings
          </div>

          {/* Notification Bell */}
          <div
            onClick={() => setSettingsOpen(true)}
            className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px] flex items-center justify-center"
            title="Notifications"
          >
            <Bell className="h-3 w-3 text-[#CCCCCC]" />
          </div>

          {/* Search Icon */}
          <div
            onClick={() => setSearchOpen(true)}
            className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px] flex items-center justify-center"
            title="Search / Command Palette (⌘K / Ctrl+K)"
          >
            <Search className="h-3 w-3 text-[#CCCCCC]" />
          </div>

          {/* Cursor Position: Ln X, Col Y */}
          <div
            onClick={() => setSearchOpen(true)}
            className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px]"
            title="Go to Line/Column (Ctrl+G)"
          >
            Ln {editorApi.cursorPosition?.lineNumber || 1}, Col {editorApi.cursorPosition?.column || 1}
          </div>

          {/* Spaces: 2 */}
          <div
            onClick={() => setIndentation((p) => (p === "Spaces: 2" ? "Spaces: 4" : "Spaces: 2"))}
            className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px]"
            title="Select Indentation (Spaces: 2 / Spaces: 4)"
          >
            {indentation}
          </div>

          {/* UTF-8 */}
          <div
            onClick={() => setEncoding((p) => (p === "UTF-8" ? "UTF-16 LE" : "UTF-8"))}
            className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px]"
            title="Select Encoding (UTF-8)"
          >
            {encoding}
          </div>

          {/* LF */}
          <div
            onClick={() => setEol((p) => (p === "LF" ? "CRLF" : "LF"))}
            className="px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px]"
            title="Select End of Line Sequence (LF / CRLF)"
          >
            {eol}
          </div>

          {/* Language Mode: {} TypeScript JSX */}
          <div
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/[0.08] rounded-xs hover:text-white cursor-pointer transition-colors text-[11px]"
            title="Select Language Mode"
          >
            <span className="text-[#888888] font-mono">&#123;&#125;</span>
            <span>{currentLanguage}</span>
          </div>
        </div>
      </footer>

      {/* Command Palette Modal (Ctrl+K or Search icon) */}
      <CommandPaletteModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNewCmd={() => terminalApi.createTerminal('cmd')}
        onNewPowerShell={() => terminalApi.createTerminal('powershell')}
        onClearBuffer={() => {
          if (terminalApi.active) {
            terminalApi.execute('cls');
          }
        }}
        onPasteClipboard={() => terminalApi.pasteFromClipboard?.()}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleLeftSidebar={() => setShowLeftSidebar((prev) => !prev)}
        onToggleRightSidebar={() => setShowRightSidebar((prev) => !prev)}
        onToggleMaximize={() => window.electronAPI?.window?.toggleMaximize?.()}
        onZoomIn={() => window.electronAPI?.window?.zoomIn?.()}
        onZoomOut={() => window.electronAPI?.window?.zoomOut?.()}
        onResetZoom={() => window.electronAPI?.window?.resetZoom?.()}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      {/* Add Local Environment Modal */}
      <AddEnvironmentModal
        open={addEnvModalOpen}
        onOpenChange={setAddEnvModalOpen}
        onAdd={terminalApi.addEnvironment}
        onCreateShell={terminalApi.createTerminal}
      />

      {/* AI Diff Review Modal (Hard Constraint 5: In-Memory Model Diff Review) */}
      <DiffPreviewModal
        pendingDiff={editorApi.pendingDiff}
        onAccept={editorApi.acceptDiff}
        onReject={editorApi.rejectDiff}
      />
    </div>
  );
}
