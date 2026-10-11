import { useEffect, useState } from "react";
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
} from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useTerminalSession } from "@/hooks/useTerminalSession";
import { useSalesforceWorkspace } from "@/hooks/useSalesforceWorkspace";
import { ActivityBar, type ActivityView } from "@/components/layout/ActivityBar";
import { TicketsExplorer } from "@/components/explorer/TicketsExplorer";
import { SitesExplorer } from "@/components/explorer/SitesExplorer";
import { TerminalExplorer } from "@/components/explorer/TerminalExplorer";
import { AddEnvironmentModal } from "@/components/explorer/AddEnvironmentModal";
import { SettingsModal } from "@/components/layout/SettingsModal";
import { TerminalStage } from "@/components/terminal/TerminalStage";
import { AiSidecar } from "@/components/ai-assistant/AiSidecar";
import { AntigravityTitleBar } from "@/components/layout/AntigravityTitleBar";
import { CommandPaletteModal } from "@/components/layout/CommandPaletteModal";

export function MainLayout() {
  const terminalApi = useTerminalSession();
  const sfApi = useSalesforceWorkspace(terminalApi);

  const [activeView, setActiveView] = useState<ActivityView>('sites');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addEnvModalOpen, setAddEnvModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Layout toggles matching Antigravity IDE controls
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);

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

  // Ensure a clean default Command Prompt is ready on application startup
  useEffect(() => {
    if (terminalApi.sessions.length === 0) {
      terminalApi.createTerminal('cmd');
    }
  }, []);

  // Global Keyboard Shortcuts (Ctrl+K, Ctrl+B, Ctrl+Shift+A, Ctrl+J, Zoom)
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

        // Toggle Bottom Status Panel: Ctrl+J
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
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background font-sans select-none">
      {/* 1. Antigravity IDE Sleek Integrated Title Bar (Replaces dual Windows header) */}
      <AntigravityTitleBar
        terminalApi={terminalApi}
        sfApi={sfApi}
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={() => setShowLeftSidebar((prev) => !prev)}
        showRightSidebar={showRightSidebar}
        onToggleRightSidebar={() => setShowRightSidebar((prev) => !prev)}
        showBottomPanel={showBottomPanel}
        onToggleBottomPanel={() => setShowBottomPanel((prev) => !prev)}
        onSplitTerminal={() => terminalApi.createTerminal('powershell')}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {/* 2. Main Workspace Layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left vertical activity bar (if left sidebar is visible) */}
        {showLeftSidebar && (
          <ActivityBar
            activeView={activeView}
            onSelectView={setActiveView}
            onOpenSettings={() => setSettingsOpen(true)}
            sfApi={sfApi}
          />
        )}

        {/* Resizable panels */}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ResizablePanelGroup orientation="horizontal" className="h-full w-full min-w-0">
            {/* Panel 1: Primary Side Bar (Explorer - Tickets, Sites, or Terminals) */}
            {showLeftSidebar && (
              <>
                <ResizablePanel defaultSize="22%" minSize="16%" maxSize="35%" className="min-w-0 overflow-hidden">
                  {activeView === 'tickets' || activeView === 'salesforce' ? (
                    <TicketsExplorer
                      sfApi={sfApi}
                      terminalApi={terminalApi}
                      onOpenSettings={() => setSettingsOpen(true)}
                    />
                  ) : activeView === 'sites' ? (
                    <SitesExplorer
                      sfApi={sfApi}
                      terminalApi={terminalApi}
                      onOpenAddSite={() => setSettingsOpen(true)}
                    />
                  ) : (
                    <TerminalExplorer api={terminalApi} />
                  )}
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}

            {/* Panel 2: Center Stage (Terminal) - Expands dynamically */}
            <ResizablePanel
              defaultSize={showLeftSidebar && showRightSidebar ? "48%" : showLeftSidebar || showRightSidebar ? "72%" : "100%"}
              minSize="30%"
              className="min-w-0 overflow-hidden"
            >
              <TerminalStage
                api={terminalApi}
                onNew={() => terminalApi.createTerminal('cmd')}
              />
            </ResizablePanel>

            {/* Panel 3: Secondary Side Bar (THIRD EYE AI Sidecar) */}
            {showRightSidebar && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="30%" minSize="22%" maxSize="45%" className="min-w-0 overflow-hidden">
                  <AiSidecar api={terminalApi} sfApi={sfApi} />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>

      {/* 3. Bottom Status Bar (Controlled by Toggle Bottom Panel) */}
      {showBottomPanel && (
        <footer className="flex h-6.5 shrink-0 items-center justify-between border-t border-[#303030] bg-[#161616] px-3 font-sans text-[11px] text-[#808080] select-none">
          <div className="flex items-center gap-3">
            <span className="rounded bg-[#222222] border border-[#303030] px-1.5 py-0.2 text-[9.5px] font-mono font-bold tracking-wider text-[#FF6B00]">
              LOCAL
            </span>
            <span className="font-mono text-[11px] text-[#E0E0E0]">
              {terminalApi.active?.shellType === 'powershell' ? 'powershell.exe' : 'cmd.exe'}
            </span>
            <span className="flex items-center gap-1.5 text-[#808080] text-[11px]">
              <Terminal className="h-3 w-3 text-[#FF6B00]" />
              <span>{terminalApi.sessions.length} active terminal{terminalApi.sessions.length === 1 ? '' : 's'}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[#E0E0E0] text-[11px]">
              <Cpu className="h-3 w-3 text-[#FF6B00]" />
              <span>Gemini 3.8 Flash</span>
            </span>
            <span className="rounded bg-[#222222] border border-[#303030] px-1.5 py-0.2 font-mono text-[10px] text-[#FF6B00] font-bold">
              {tel.ms}ms
            </span>
          </div>
        </footer>
      )}

      {/* Command Palette Modal (Ctrl+K or Search icon) */}
      <CommandPaletteModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNewCmd={() => terminalApi.createTerminal('cmd')}
        onNewPowerShell={() => terminalApi.createTerminal('powershell')}
        onClearBuffer={() => {
          if (terminalApi.active) {
            terminalApi.execute(terminalApi.active.id, 'cls');
          }
        }}
        onPasteClipboard={() => terminalApi.pasteFromClipboard?.()}
        onSyncSalesforce={() => sfApi.syncSalesforce()}
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
        sfApi={sfApi}
      />

      {/* Add Local Environment Modal */}
      <AddEnvironmentModal
        open={addEnvModalOpen}
        onOpenChange={setAddEnvModalOpen}
        onAdd={terminalApi.addEnvironment}
        onCreateShell={terminalApi.createTerminal}
      />
    </div>
  );
}
