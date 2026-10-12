import { Radio, RefreshCw, ExternalLink, Terminal } from "lucide-react";
import type { TerminalApi } from "@/hooks/useTerminalSession";

export function RemoteExplorer({
  terminalApi,
}: {
  terminalApi: TerminalApi;
}) {
  const ports = [
    { port: 3000, name: "Web IDE / Frontend", status: "Active", url: "http://localhost:3000" },
    { port: 4001, name: "PTY Terminal Service", status: "Active", url: "http://localhost:4001" },
    { port: 4002, name: "AI Agent Orchestrator", status: "Active", url: "http://localhost:4002" },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-[#252526] border-r border-[#3C3C3C] select-none overflow-hidden font-sans">
      <div className="flex h-[35px] shrink-0 items-center justify-between px-4 text-[11px] font-semibold tracking-[0.1em] text-[#BBBBBB] uppercase">
        <span>Remote &amp; Ports</span>
      </div>

      <div className="p-3 border-b border-[#3C3C3C]">
        <div className="text-[11px] text-[#A0A0A0] font-semibold mb-2">FORWARDED PORTS</div>
        <div className="space-y-1.5">
          {ports.map((p) => (
            <div
              key={p.port}
              className="flex items-center justify-between p-2 rounded bg-[#333333] text-[12px] text-white font-mono"
            >
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-[#4ADE80]" />
                <span className="font-bold text-[#007ACC]">{p.port}</span>
                <span className="text-[#A0A0A0] text-[11px] font-sans">{p.name}</span>
              </div>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-[#808080] hover:text-white"
                title="Open in Browser"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto space-y-3">
        <div className="text-[11px] text-[#A0A0A0] font-semibold">ACTIVE TERMINAL SESSIONS ({terminalApi.sessions.length})</div>
        <div className="space-y-1.5">
          {terminalApi.sessions.map((sess) => (
            <div
              key={sess.id}
              onClick={() => terminalApi.setActiveId(sess.id)}
              className="p-2 rounded bg-[#333333] hover:bg-[#3C3C3C] cursor-pointer text-[12px] text-white transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-[#007ACC]" />
                <span className="font-mono text-xs">{sess.title}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-[#4ADE80] font-mono">
                {sess.shellType}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
