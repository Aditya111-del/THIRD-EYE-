import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  ArrowLeft,
  Settings,
  Terminal,
  Check,
  Loader2,
  AlertCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AntigravityAnalyzedItem {
  id: string;
  type: "analyzed";
  filePath: string;
  fileName: string;
  fileType: "js" | "ts" | "react" | "config" | "css" | "py" | "default";
  lineRange?: string; // e.g. "#L2160-2205" or "#L1-89"
  status?: "running" | "completed" | "failed";
  timestamp: number;
}

export interface AntigravitySearchItem {
  id: string;
  type: "search";
  query: string;
  resultCount?: number | undefined;
  status?: "running" | "completed" | "failed";
  timestamp: number;
}

export interface AntigravityTerminalItem {
  id: string;
  type: "terminal";
  command: string;
  status: "running" | "completed" | "failed";
  exitCode?: number;
  output?: string;
  timestamp: number;
}

export interface AntigravityEditedItem {
  id: string;
  type: "edited";
  filePath: string;
  fileName: string;
  fileType: "js" | "ts" | "react" | "config" | "css" | "py" | "default";
  addedCount: number;
  removedCount: number;
  timestamp: number;
}

export interface AntigravityThoughtItem {
  id: string;
  type: "thought";
  duration?: string;
  thoughts?: string[];
  timestamp: number;
}

export interface AntigravityPlanItem {
  id: string;
  type: "planned";
  title: string;
  taskCount: number;
  tasks: string[];
  timestamp: number;
}

export interface AntigravityExploredItem {
  id: string;
  type: "explored";
  count: number;
  files: string[];
  timestamp: number;
}

export type AntigravityStreamItem =
  | AntigravityAnalyzedItem
  | AntigravitySearchItem
  | AntigravityTerminalItem
  | AntigravityEditedItem
  | AntigravityThoughtItem
  | AntigravityPlanItem
  | AntigravityExploredItem;

/**
 * Detects file type and returns an authentic Cursor / Antigravity badge
 */
export function getFileTypeBadge(filePath: string): {
  type: "js" | "ts" | "react" | "config" | "css" | "py" | "default";
  badge: React.ReactNode;
} {
  const lower = (filePath || "").toLowerCase();
  const base = lower.split("/").pop() || "";

  if (base.endsWith(".tsx") || base.endsWith(".jsx")) {
    return {
      type: "react",
      badge: (
        <span className="text-[9.5px] font-bold text-[#38BDF8] font-mono leading-none tracking-tight shrink-0 bg-[#38BDF8]/10 px-1 py-0.5 rounded border border-[#38BDF8]/20">
          TSX
        </span>
      ),
    };
  }

  if (base.endsWith(".ts") && !base.endsWith(".d.ts")) {
    return {
      type: "ts",
      badge: (
        <span className="text-[10px] font-bold text-[#3B82F6] font-mono leading-none tracking-tight shrink-0 bg-[#3B82F6]/10 px-1 py-0.5 rounded border border-[#3B82F6]/20">
          TS
        </span>
      ),
    };
  }

  if (base.endsWith(".js") || base.endsWith(".mjs") || base.endsWith(".cjs")) {
    return {
      type: "js",
      badge: (
        <span className="text-[10px] font-bold text-[#F59E0B] font-mono leading-none tracking-tight shrink-0 bg-[#F59E0B]/10 px-1 py-0.5 rounded border border-[#F59E0B]/20">
          JS
        </span>
      ),
    };
  }

  if (
    base.startsWith(".env") ||
    base.endsWith(".json") ||
    base.endsWith(".yaml") ||
    base.endsWith(".yml") ||
    base.includes("config")
  ) {
    return {
      type: "config",
      badge: (
        <span className="text-[9px] font-bold text-[#9CA3AF] font-mono leading-none tracking-tight shrink-0 bg-white/10 px-1 py-0.5 rounded border border-white/10">
          CFG
        </span>
      ),
    };
  }

  if (base.endsWith(".css") || base.endsWith(".scss")) {
    return {
      type: "css",
      badge: (
        <span className="text-[10px] font-bold text-[#EC4899] font-mono leading-none shrink-0 bg-[#EC4899]/10 px-1 py-0.5 rounded border border-[#EC4899]/20">
          #
        </span>
      ),
    };
  }

  if (base.endsWith(".py")) {
    return {
      type: "py",
      badge: (
        <span className="text-[10px] font-bold text-[#06B6D4] font-mono leading-none tracking-tight shrink-0 bg-[#06B6D4]/10 px-1 py-0.5 rounded border border-[#06B6D4]/20">
          PY
        </span>
      ),
    };
  }

  return {
    type: "default",
    badge: (
      <span className="text-[9.5px] font-bold text-[#9CA3AF] font-mono leading-none shrink-0 bg-white/10 px-1 py-0.5 rounded border border-white/10">
        FILE
      </span>
    ),
  };
}

export interface AntigravityActionStreamProps {
  items: AntigravityStreamItem[];
  activeStep?: string | undefined;
  isStreaming?: boolean | undefined;
  onOpenFile?: ((filePath: string) => void) | undefined;
  onViewAllChanges?: (() => void) | undefined;
  totalUniqueFilesCount?: number | undefined;
}

export function AntigravityActionStream({
  items,
  activeStep,
  isStreaming = false,
  onOpenFile,
  onViewAllChanges,
  totalUniqueFilesCount,
}: AntigravityActionStreamProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-roll / auto-scroll container to bottom as items stream in
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items, items.length, activeStep, isExpanded]);

  // Compute metrics for header
  const { uniqueFilesCount, searchesCount, terminalCount } = React.useMemo(() => {
    const fileSet = new Set<string>();
    let searches = 0;
    let terminals = 0;

    for (const it of items) {
      if (it.type === "analyzed" && it.filePath) {
        fileSet.add(it.filePath);
      } else if (it.type === "edited" && it.filePath) {
        fileSet.add(it.filePath);
      } else if (it.type === "explored" && it.files) {
        it.files.forEach((f) => fileSet.add(f));
      } else if (it.type === "search") {
        searches++;
      } else if (it.type === "terminal") {
        terminals++;
      }
    }

    return {
      uniqueFilesCount: fileSet.size,
      searchesCount: searches,
      terminalCount: terminals,
    };
  }, [items]);

  const displayCount = totalUniqueFilesCount ?? uniqueFilesCount;

  if ((!items || items.length === 0) && !activeStep) return null;

  // Header Title generation matching Antigravity / Cursor Screenshot
  let headerTitle = "Exploring files";
  const headerParts: string[] = [];
  if (uniqueFilesCount > 0) {
    headerParts.push(
      `Exploring ${uniqueFilesCount} ${uniqueFilesCount === 1 ? "file" : "files"}`
    );
  }
  if (searchesCount > 0) {
    headerParts.push(
      `${searchesCount} ${searchesCount === 1 ? "search" : "searches"}`
    );
  }
  if (terminalCount > 0 && uniqueFilesCount === 0) {
    headerParts.push(
      `${terminalCount} ${terminalCount === 1 ? "command" : "commands"}`
    );
  }
  if (headerParts.length > 0) {
    headerTitle = headerParts.join(", ");
  } else if (isStreaming && activeStep) {
    headerTitle = activeStep;
  } else {
    headerTitle = `Exploring ${items.length} items`;
  }

  return (
    <div className="my-2.5 font-sans select-none animate-in fade-in duration-200">
      {/* ── Collapsible Summary Header (e.g. Exploring 10 files, 5 searches ⌵) ── */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 text-[12.5px] font-sans text-zinc-300 hover:text-white transition-colors cursor-pointer group py-0.5"
      >
        <span className="font-medium tracking-tight">{headerTitle}</span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200",
            !isExpanded && "-rotate-90"
          )}
        />
        {isStreaming && (
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse ml-1" />
        )}
      </button>

      {/* ── Sub Rollable Box inside chat response ── */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="mt-1.5 max-h-60 overflow-y-auto overscroll-contain rounded-lg bg-[#111215]/95 border border-white/[0.07] px-3 py-2 space-y-1.5 select-text font-sans shadow-inner scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent transition-all"
        >
          {items.map((item) => {
            // 1. Analyzed File Row (e.g. Analyzed [JS] agent.js #L2200-2260)
            if (item.type === "analyzed") {
              const fileInfo = getFileTypeBadge(item.filePath || item.fileName);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-0.5 text-[12px] leading-snug group"
                >
                  <span className="text-zinc-500 font-sans shrink-0">Analyzed</span>
                  <div className="shrink-0">{fileInfo.badge}</div>
                  <button
                    type="button"
                    onClick={() => onOpenFile?.(item.filePath)}
                    className="font-mono text-zinc-200 hover:text-white hover:underline truncate max-w-[240px] text-left transition-colors cursor-pointer"
                    title={item.filePath}
                  >
                    {item.fileName}
                  </button>
                  {item.lineRange && (
                    <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                      {item.lineRange}
                    </span>
                  )}
                  {item.status === "running" && (
                    <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0 ml-auto" />
                  )}
                </div>
              );
            }

            // 2. Searched Query Row (e.g. Searched class AgentRouter [1 result])
            if (item.type === "search") {
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-0.5 text-[12px] leading-snug group"
                >
                  <span className="text-zinc-500 font-sans shrink-0">Searched</span>
                  <span className="font-mono text-zinc-200 truncate max-w-[220px]">
                    {item.query}
                  </span>
                  {item.resultCount !== undefined ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-white/[0.08] text-zinc-400 shrink-0 border border-white/[0.05]">
                      {item.resultCount} {item.resultCount === 1 ? "result" : "results"}
                    </span>
                  ) : item.status === "running" ? (
                    <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0 ml-auto" />
                  ) : null}
                </div>
              );
            }

            // 3. Terminal Execution Row (e.g. Ran npm run dev:full)
            if (item.type === "terminal") {
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-0.5 text-[12px] leading-snug"
                >
                  <span className="text-zinc-500 font-sans shrink-0">
                    {item.status === "running" ? "Running" : "Ran"}
                  </span>
                  <Terminal className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="font-mono text-zinc-200 truncate max-w-[230px]">
                    {item.command}
                  </span>
                  {item.status === "running" && (
                    <Loader2 className="w-3 h-3 text-sky-400 animate-spin shrink-0 ml-auto" />
                  )}
                  {item.status === "completed" && (
                    <Check className="w-3 h-3 text-emerald-400 shrink-0 ml-auto" />
                  )}
                  {item.status === "failed" && (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 ml-auto" />
                  )}
                </div>
              );
            }

            // 4. Thought Row (e.g. Thought for 1s >)
            if (item.type === "thought") {
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 py-0.5 text-[11.5px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer group"
                >
                  <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-transform" />
                  <span>Thought for {item.duration || "1s"}</span>
                </div>
              );
            }

            // 5. Edited File Row (e.g. Edited [TS] autonomousAgent.ts +20 -10)
            if (item.type === "edited") {
              const fileInfo = getFileTypeBadge(item.filePath || item.fileName);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-0.5 text-[12px] leading-snug"
                >
                  <span className="text-zinc-500 font-sans shrink-0">Edited</span>
                  <div className="shrink-0">{fileInfo.badge}</div>
                  <button
                    type="button"
                    onClick={() => onOpenFile?.(item.filePath)}
                    className="font-mono text-zinc-200 hover:text-white hover:underline truncate max-w-[220px] text-left transition-colors cursor-pointer font-medium"
                    title={item.filePath}
                  >
                    {item.fileName}
                  </button>
                  <div className="flex items-center gap-1 font-mono text-[11px] shrink-0 ml-auto">
                    <span className="text-emerald-400">+{item.addedCount}</span>
                    <span className="text-rose-400">-{item.removedCount}</span>
                  </div>
                </div>
              );
            }

            // 6. Legacy Explored / Fallback
            if (item.type === "explored") {
              return (
                <div key={item.id} className="py-0.5 text-[12px] text-zinc-500">
                  <span>
                    Explored {item.count} {item.count === 1 ? "file" : "files"}
                  </span>
                </div>
              );
            }

            // 7. Planned Row
            if (item.type === "planned") {
              return (
                <div key={item.id} className="py-0.5 text-[12px] text-zinc-500">
                  <span>Planned {item.taskCount} tasks</span>
                </div>
              );
            }

            return null;
          })}

          {/* Live In-Progress Action / Status Indicator (e.g. Compacting... or Reading...) */}
          {isStreaming && activeStep && (
            <div className="flex items-center gap-2 py-0.5 text-[11.5px] text-zinc-400 italic">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
              <span className="truncate">{activeStep}</span>
            </div>
          )}
        </div>
      )}

      {/* Bottom Summary Pill: ← 📄 N Files With Changes */}
      {displayCount > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onViewAllChanges}
            className="flex items-center gap-2 text-[12px] text-zinc-400 hover:text-white transition-colors cursor-pointer group py-0.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
            <FileText className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
            <span className="font-medium tracking-tight">
              {displayCount} {displayCount === 1 ? "File" : "Files"} With Changes
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Converts raw ToolCallCards into AntigravityStreamItems for authentic rendering
 */
export function toolCardsToActionStream(cards: any[]): AntigravityStreamItem[] {
  if (!cards || cards.length === 0) return [];
  const result: AntigravityStreamItem[] = [];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!c) continue;
    const name = (c.toolName || "").toLowerCase();

    const isSearch =
      name.includes("search") ||
      name.includes("grep") ||
      name.includes("find") ||
      name === "searchcode";

    const isRead =
      !isSearch &&
      (c.risk === "read" ||
        name.includes("read") ||
        name.includes("view") ||
        name.includes("analyze") ||
        name.includes("list"));

    const isWrite =
      c.risk === "write" ||
      name.includes("edit") ||
      name.includes("write") ||
      name.includes("replace") ||
      name.includes("diff");

    const isExec =
      c.risk === "exec" ||
      name.includes("terminal") ||
      name.includes("command") ||
      name.includes("exec");

    if (isSearch) {
      const query =
        c.args?.query ||
        c.args?.pattern ||
        c.args?.Query ||
        c.args?.path ||
        name;
      let count: number | undefined = undefined;
      if (Array.isArray(c.result)) count = c.result.length;
      else if (Array.isArray(c.result?.matches)) count = c.result.matches.length;
      else if (Array.isArray(c.result?.data)) count = c.result.data.length;
      else if (typeof c.result?.totalResults === "number") count = c.result.totalResults;
      else if (typeof c.result?.count === "number") count = c.result.count;
      else if (c.result?.success) count = 1;

      result.push({
        id: `search-${i}`,
        type: "search",
        query: typeof query === "string" ? query : JSON.stringify(query),
        resultCount: count,
        status: c.status || "completed",
        timestamp: Date.now() - (cards.length - i) * 60,
      });
    } else if (isRead) {
      const target =
        c.args?.path ||
        c.args?.filePath ||
        c.args?.AbsolutePath ||
        c.args?.TargetFile ||
        (name === "analyze_codebase" ? "workspace" : "");
      const fileName = target
        ? target.split("/").pop() || target
        : (name === "analyze_codebase" ? "workspace" : "file");
      const start = c.args?.startLine || c.args?.StartLine;
      const end = c.args?.endLine || c.args?.EndLine;
      const lineRange = start && end ? `#L${start}-${end}` : c.args?.lineRange;

      result.push({
        id: `an-${i}`,
        type: "analyzed",
        filePath: target,
        fileName,
        fileType: getFileTypeBadge(target).type,
        lineRange,
        status: c.status || "completed",
        timestamp: Date.now() - (cards.length - i) * 60,
      });
    } else if (isWrite) {
      const filePath =
        c.result?.diff?.path ||
        c.args?.TargetFile ||
        c.args?.path ||
        c.args?.filePath ||
        "";
      const fileName = filePath ? filePath.split("/").pop() || filePath : "file";
      const typeInfo = getFileTypeBadge(filePath);
      const added =
        c.result?.diff?.addedCount ??
        c.result?.diff?.additions ??
        (c.args?.ReplacementContent
          ? c.args.ReplacementContent.split("\n").length
          : 0);
      const removed =
        c.result?.diff?.removedCount ??
        c.result?.diff?.deletions ??
        (c.args?.TargetContent
          ? c.args.TargetContent.split("\n").length
          : 0);
      result.push({
        id: `edit-${i}`,
        type: "edited",
        filePath,
        fileName,
        fileType: typeInfo.type,
        addedCount: added,
        removedCount: removed,
        timestamp: Date.now() - (cards.length - i) * 60,
      });
    } else if (isExec) {
      const cmd =
        c.args?.command ||
        c.args?.CommandLine ||
        (typeof c.args === "string" ? c.args : "");
      result.push({
        id: `term-${i}`,
        type: "terminal",
        command: cmd || name,
        status: c.status || "completed",
        output: typeof c.result === "string" ? c.result : c.result?.output,
        timestamp: Date.now() - (cards.length - i) * 60,
      });
    }
  }

  return result;
}
