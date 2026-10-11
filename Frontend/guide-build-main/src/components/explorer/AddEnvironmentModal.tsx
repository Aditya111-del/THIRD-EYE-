import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SquareTerminal, Terminal, Server } from "lucide-react";
import type { Protocol } from "@/types/terminal";

export function AddEnvironmentModal({
  open,
  onOpenChange,
  onAdd,
  onCreateShell,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (p: Protocol, name: string, host: string) => void;
  onCreateShell?: (type: 'cmd' | 'powershell') => void;
}) {
  const [tab, setTab] = useState<'local' | 'ssh'>('local');
  const [name, setName] = useState("");
  const [host, setHost] = useState("");

  const submitSSH = () => {
    if (!name || !host) return;
    onAdd("ssh", name, host);
    setName("");
    setHost("");
    onOpenChange(false);
  };

  const handleLaunchLocal = (type: 'cmd' | 'powershell') => {
    if (onCreateShell) {
      onCreateShell(type);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#222222] sm:max-w-md border border-[#303030] text-[#E0E0E0]">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-tight text-[#E0E0E0]">
            Launch Terminal Session
          </DialogTitle>
        </DialogHeader>

        {/* Mode selector */}
        <div className="flex gap-1.5 p-1 bg-[#181818] rounded border border-[#303030]">
          <button
            onClick={() => setTab('local')}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
              tab === 'local'
                ? 'bg-[#252525] text-[#E0E0E0] border border-[#383838]'
                : 'text-[#808080] hover:text-[#E0E0E0]'
            }`}
          >
            Local Windows Shell
          </button>
          <button
            onClick={() => setTab('ssh')}
            className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
              tab === 'ssh'
                ? 'bg-[#252525] text-[#E0E0E0] border border-[#383838]'
                : 'text-[#808080] hover:text-[#E0E0E0]'
            }`}
          >
            Remote SSH
          </button>
        </div>

        {tab === 'local' ? (
          <div className="space-y-2 py-2">
            <button
              onClick={() => handleLaunchLocal('cmd')}
              className="flex w-full items-center gap-3 rounded border border-[#303030] bg-[#252525] p-3 text-left hover:bg-[#2A2A2A] hover:border-[#3E3E3E] transition-colors group cursor-pointer"
            >
              <div className="grid h-8 w-8 place-items-center rounded bg-[#1E1E1E] border border-[#303030] text-[#FF6B00]">
                <SquareTerminal className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#E0E0E0]">Command Prompt</div>
                <div className="text-[11px] text-[#808080]">cmd.exe &bull; Native Windows Command Shell</div>
              </div>
            </button>

            <button
              onClick={() => handleLaunchLocal('powershell')}
              className="flex w-full items-center gap-3 rounded border border-[#303030] bg-[#252525] p-3 text-left hover:bg-[#2A2A2A] hover:border-[#3E3E3E] transition-colors group cursor-pointer"
            >
              <div className="grid h-8 w-8 place-items-center rounded bg-[#1E1E1E] border border-[#303030] text-[#FF6B00]">
                <Terminal className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#E0E0E0]">Windows PowerShell</div>
                <div className="text-[11px] text-[#808080]">powershell.exe &bull; Object Shell &amp; Automation</div>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 py-2">
            <Input
              placeholder="Session name (e.g. prod-server)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xs font-sans"
            />
            <Input
              placeholder="user@hostname-or-ip"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="text-xs font-mono"
            />
            <DialogFooter className="pt-2">
              <Button size="sm" onClick={submitSSH} disabled={!name || !host}>
                <Server className="h-3 w-3 mr-1" /> Connect SSH
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
