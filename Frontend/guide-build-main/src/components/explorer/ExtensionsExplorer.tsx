import { useState } from "react";
import { Puzzle, Check, Search, Download } from "lucide-react";

export function ExtensionsExplorer() {
  const [query, setQuery] = useState("");

  const extensions = [
    { name: "TypeScript and JavaScript Language Features", publisher: "Microsoft", version: "v1.0.0", installed: true, desc: "Provides rich language support for TypeScript and JavaScript." },
    { name: "Tailwind CSS IntelliSense", publisher: "Tailwind Labs", version: "v0.12.0", installed: true, desc: "Intelligent Tailwind CSS tooling for VS Code." },
    { name: "ESLint", publisher: "Microsoft", version: "v2.4.4", installed: true, desc: "Integrates ESLint JavaScript into VS Code." },
    { name: "Prettier - Code formatter", publisher: "Prettier", version: "v10.4.0", installed: true, desc: "Code formatter using prettier." },
    { name: "GitLens — Git supercharged", publisher: "GitKraken", version: "v15.0.0", installed: true, desc: "Supercharge Git within VS Code." },
    { name: "Python", publisher: "Microsoft", version: "v2024.2.0", installed: true, desc: "Python language support with extension capabilities." },
  ];

  const filtered = extensions.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()) || e.desc.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex h-full w-full flex-col bg-[#252526] border-r border-[#3C3C3C] select-none overflow-hidden font-sans">
      <div className="flex h-[35px] shrink-0 items-center justify-between px-4 text-[11px] font-semibold tracking-[0.1em] text-[#BBBBBB] uppercase">
        <span>Extensions</span>
      </div>

      <div className="p-3 border-b border-[#3C3C3C]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search extensions in Marketplace…"
          className="w-full bg-[#3C3C3C] border border-[#555555] focus:border-[#007ACC] text-[12px] text-white rounded px-2.5 py-1.5 outline-none font-sans placeholder:text-[#808080]"
        />
      </div>

      <div className="flex-1 p-2 space-y-1 overflow-y-auto">
        <div className="text-[11px] text-[#808080] font-semibold uppercase px-2 py-1">Installed ({filtered.length})</div>
        {filtered.map((ext, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2.5 p-2 rounded hover:bg-[#2A2D2E] cursor-pointer transition-colors"
          >
            <div className="h-8 w-8 rounded bg-[#333333] flex items-center justify-center shrink-0 text-[#007ACC]">
              <Puzzle className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-white truncate">{ext.name}</span>
                <span className="text-[10px] text-[#4ADE80] flex items-center gap-0.5 shrink-0">
                  <Check className="h-3 w-3" />
                </span>
              </div>
              <p className="text-[11px] text-[#909090] truncate leading-tight mt-0.5">{ext.desc}</p>
              <div className="flex items-center gap-2 text-[10px] text-[#666666] mt-1 font-mono">
                <span>{ext.publisher}</span>
                <span>•</span>
                <span>{ext.version}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
