import { FlaskConical, Play, CheckCircle2, RotateCw } from "lucide-react";
import type { TerminalApi } from "@/hooks/useTerminalSession";

export function TestingExplorer({ terminalApi }: { terminalApi?: TerminalApi }) {
  const tests = [
    { file: "Frontend/tests/unit/workspace.test.ts", name: "Workspace filesystem integration", status: "passed" },
    { file: "Frontend/tests/unit/terminal.test.ts", name: "PTY keystrokes stream protocol", status: "passed" },
    { file: "backend/tests/pty.test.js", name: "PTY spawn & auto-resize lifecycle", status: "passed" },
    { file: "backend/tests/ai.test.js", name: "AI diagnostics & code synthesis", status: "passed" },
  ];

  const handleRunAll = () => {
    if (terminalApi) {
      terminalApi.write("npm test\r");
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#252526] border-r border-[#3C3C3C] select-none overflow-hidden font-sans">
      <div className="flex h-[35px] shrink-0 items-center justify-between px-4 text-[11px] font-semibold tracking-[0.1em] text-[#BBBBBB] uppercase">
        <span>Test Explorer</span>
        <button
          onClick={handleRunAll}
          className="p-1 rounded text-[#C5C5C5] hover:text-white hover:bg-[#3C3C3C] transition-colors cursor-pointer"
          title="Run All Tests"
        >
          <Play className="h-3.5 w-3.5 text-[#4ADE80]" />
        </button>
      </div>

      <div className="p-3 border-b border-[#3C3C3C]">
        <button
          onClick={handleRunAll}
          className="w-full flex items-center justify-center gap-2 py-1.5 bg-[#007ACC] hover:bg-[#0062A3] text-white rounded text-[12px] font-medium transition-colors cursor-pointer"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Run All Tests (Vitest)</span>
        </button>
      </div>

      <div className="flex-1 p-2 space-y-1 overflow-y-auto">
        <div className="text-[11px] text-[#808080] font-semibold uppercase px-2 py-1">Vitest Suites ({tests.length})</div>
        {tests.map((t, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2 rounded hover:bg-[#2A2D2E] text-[12px] text-white font-mono cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2 truncate">
              <CheckCircle2 className="h-4 w-4 text-[#4ADE80] shrink-0" />
              <div className="truncate">
                <div className="truncate text-white font-sans text-[12px]">{t.name}</div>
                <div className="truncate text-[#707070] text-[10px]">{t.file}</div>
              </div>
            </div>
            <span className="text-[10px] text-[#4ADE80] bg-[#1E3A2B] px-1.5 py-0.2 rounded shrink-0">PASS</span>
          </div>
        ))}
      </div>
    </div>
  );
}
