import { useState } from "react";
import {
  ExternalLink,
  Laptop,
  Plus,
  Server,
  SquareTerminal,
  Terminal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Protocol } from "@/types/terminal";
import type { TerminalApi } from "@/hooks/useTerminalSession";
import { AddEnvironmentModal } from "./AddEnvironmentModal";

export const protoIcon: Record<Protocol, typeof Server> = {
  ssh: Server,
  container: Laptop,
  local: Laptop,
};

export function TerminalExplorer({ api }: { api: TerminalApi }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className="flex h-full w-full min-w-0 flex-col bg-[#0A0A0A] border-r border-[#262626] font-sans select-none">
      {/* Sidebar Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#242424] px-3 bg-[#0D0D0D] text-[10.5px] font-semibold uppercase tracking-wider text-[#808080]">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5 text-[#FF6B00]" />
          <span className="text-[#E0E0E0]">Terminals</span>
          {api.sessions.length > 0 && (
            <span className="rounded bg-[#181818] px-1.5 py-0.2 text-[10px] text-[#FF6B00] font-mono border border-[#2A2A2A]">
              {api.sessions.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded p-1 text-[#808080] hover:bg-[#181818] hover:text-[#E0E0E0] transition-colors cursor-pointer"
          title="New Terminal Connection"
          aria-label="New Terminal Connection"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Quick Launch Buttons */}
      <div className="p-2.5 space-y-2 border-b border-[#1C1C1C] bg-[#101010]">
        <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[#757575] px-1">
          Quick Launch
        </div>
        <button
          onClick={() => api.createTerminal('cmd')}
          className="flex w-full items-center gap-2.5 rounded-lg fabric-card px-3 py-2 text-left text-[12px] text-[#A0A0A0] hover:text-[#FFFFFF] transition-all cursor-pointer"
        >
          <SquareTerminal className="h-3.5 w-3.5 text-[#FF6B00] shrink-0" />
          <span className="font-semibold font-sans text-[#E0E0E0]">Command Prompt</span>
          <span className="ml-auto text-[10px] text-[#808080] font-mono fabric-tag px-1.5 py-0.5 rounded">cmd</span>
        </button>
        <button
          onClick={() => api.createTerminal('powershell')}
          className="flex w-full items-center gap-2.5 rounded-lg fabric-card px-3 py-2 text-left text-[12px] text-[#A0A0A0] hover:text-[#FFFFFF] transition-all cursor-pointer"
        >
          <Terminal className="h-3.5 w-3.5 text-[#FF6B00] shrink-0" />
          <span className="font-semibold font-sans text-[#E0E0E0]">Windows PowerShell</span>
          <span className="ml-auto text-[10px] text-[#808080] font-mono fabric-tag px-1.5 py-0.5 rounded">pwsh</span>
        </button>
      </div>

      {/* Active Sessions List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-2 bg-[#121212]">
        <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[#757575] px-1 mb-1">
          Active Sessions
        </div>

        {api.sessions.length === 0 ? (
          <div className="py-8 px-2 text-center text-xs text-[#808080] space-y-1">
            <p className="font-medium">No active sessions</p>
            <p className="text-[11px] text-[#606060]">
              Select Command Prompt or PowerShell above to start
            </p>
          </div>
        ) : (
          api.sessions.map((s) => {
            const isActive = api.activeId === s.id;
            return (
              <div
                key={s.id}
                onClick={() => api.setActiveId(s.id)}
                className={cn(
                  "group flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2 text-[12px] transition-all select-none",
                  isActive
                    ? "fabric-card-active text-[#E0E0E0]"
                    : "fabric-card text-[#808080] hover:text-[#E0E0E0]"
                )}
              >
                <div className="flex items-center gap-2">
                  <SquareTerminal className="h-3.5 w-3.5 text-[#FF6B00] shrink-0" />
                  <span className="font-sans font-semibold truncate min-w-0 text-[#E0E0E0]">
                    {s.title}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    {isActive && (
                      <span className="px-1.5 py-0.2 rounded fabric-tag text-[#FF6B00] font-mono text-[8.5px] font-bold">
                        ACTIVE
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        api.closeSession(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#2E2E2E] text-[#808080] hover:text-[#E0E0E0] transition-colors cursor-pointer"
                      title="Close Terminal Session"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
                <div className="text-[10px] font-mono text-[#757575] truncate pl-5">
                  {s.cwd || "C:\\Users\\aditya.s.ctr"}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer System Quick Action */}
      <div className="border-t border-[#1C1C1C] p-2 bg-[#101010]">
        <button
          onClick={() => {
            if (window.electronAPI?.system?.openExternalTerminal) {
              window.electronAPI.system.openExternalTerminal(api.active?.cwd);
            }
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg fabric-card py-2 text-[11px] font-sans font-semibold text-[#808080] hover:text-[#E0E0E0] transition-all cursor-pointer"
          title="Open native Command Prompt window on your desktop"
        >
          <ExternalLink className="h-3 w-3 text-[#FF6B00]" /> External OS Window
        </button>
      </div>

      <AddEnvironmentModal
        open={open}
        onOpenChange={setOpen}
        onAdd={api.addEnvironment}
        onCreateShell={api.createTerminal}
      />
    </aside>
  );
}
