import { Play, Bug, ChevronRight, ChevronDown, RotateCw } from "lucide-react";
import type { TerminalApi } from "@/hooks/useTerminalSession";

export function DebugExplorer({ terminalApi }: { terminalApi?: TerminalApi }) {
  const configs = [
    { name: "Launch Web IDE (Frontend: 3000)", cmd: "npm run dev" },
    { name: "Start PTY Service (Port: 4001)", cmd: "npm --prefix backend/pty-service run start" },
    { name: "Start AI Microservice (Port: 4002)", cmd: "npm --prefix backend/ai-service run start" },
  ];

  const handleLaunch = (cmd: string) => {
    if (terminalApi) {
      terminalApi.write(cmd + "\r");
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#252526] border-r border-[#3C3C3C] select-none overflow-hidden font-sans">
      <div className="flex h-[35px] shrink-0 items-center justify-between px-4 text-[11px] font-semibold tracking-[0.1em] text-[#BBBBBB] uppercase">
        <span>Run and Debug</span>
      </div>

      <div className="p-3 border-b border-[#3C3C3C]">
        <div className="text-[11px] text-[#A0A0A0] font-semibold mb-2">RUN CONFIGURATIONS</div>
        <div className="space-y-1.5">
          {configs.map((c, idx) => (
            <div
              key={idx}
              onClick={() => handleLaunch(c.cmd)}
              className="flex items-center justify-between p-2 rounded bg-[#333333] hover:bg-[#3C3C3C] cursor-pointer text-[12px] text-white transition-colors group"
            >
              <div className="flex items-center gap-2 truncate">
                <Play className="h-3.5 w-3.5 text-[#4ADE80] shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate">{c.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3 space-y-3 overflow-y-auto text-[12px] text-[#A0A0A0]">
        <div>
          <div className="font-semibold text-white flex items-center gap-1 text-[11px]">
            <ChevronDown className="h-3.5 w-3.5" />
            <span>VARIABLES</span>
          </div>
          <div className="pl-4 py-1 text-[11px] font-mono text-[#808080]">No variables attached</div>
        </div>

        <div>
          <div className="font-semibold text-white flex items-center gap-1 text-[11px]">
            <ChevronDown className="h-3.5 w-3.5" />
            <span>WATCH</span>
          </div>
          <div className="pl-4 py-1 text-[11px] font-mono text-[#808080]">No expressions watched</div>
        </div>

        <div>
          <div className="font-semibold text-white flex items-center gap-1 text-[11px]">
            <ChevronDown className="h-3.5 w-3.5" />
            <span>BREAKPOINTS</span>
          </div>
          <div className="pl-4 py-1 text-[11px] font-mono text-[#808080]">No breakpoints currently set</div>
        </div>
      </div>
    </div>
  );
}
