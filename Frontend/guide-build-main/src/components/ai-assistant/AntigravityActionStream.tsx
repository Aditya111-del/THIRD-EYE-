import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  ArrowLeft,
  Terminal,
  Check,
  AlertCircle,
  Search,
  Plus,
  Minus,
  X,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Easing & Timing Constants ────────────────────────────────────────────────
// Follows Google Antigravity minimalism: 180-240ms duration, 4-8px subtle shifts
const EASING_CUBIC = [0.22, 1, 0.36, 1] as const;

export type AntigravityFileState =
  | "analyzing"
  | "reading"
  | "editing"
  | "created"
  | "modified"
  | "deleted"
  | "completed"
  | "failed";

export interface AntigravityFileItem {
  id: string;
  type: "file";
  subType: AntigravityFileState;
  filePath: string;
  fileName: string;
  fileType: "js" | "ts" | "react" | "config" | "css" | "py" | "html" | "json" | "md" | "default";
  lineRange?: string | undefined;
  status: "running" | "completed" | "failed";
  addedCount?: number | undefined;
  removedCount?: number | undefined;
  durationMs?: number | undefined;
  timestamp: number;
}

export interface AntigravityAnalyzedItem {
  id: string;
  type: "analyzed";
  filePath: string;
  fileName: string;
  fileType: "js" | "ts" | "react" | "config" | "css" | "py" | "html" | "json" | "md" | "default";
  lineRange?: string | undefined;
  status?: "running" | "completed" | "failed" | undefined;
  timestamp: number;
}

export interface AntigravitySearchItem {
  id: string;
  type: "search";
  query: string;
  resultCount?: number | undefined;
  status?: "running" | "completed" | "failed" | undefined;
  timestamp: number;
}

export interface AntigravityTerminalItem {
  id: string;
  type: "terminal";
  command: string;
  status: "running" | "completed" | "failed";
  exitCode?: number | undefined;
  output?: string | undefined;
  timestamp: number;
}

export interface AntigravityEditedItem {
  id: string;
  type: "edited";
  filePath: string;
  fileName: string;
  fileType: "js" | "ts" | "react" | "config" | "css" | "py" | "html" | "json" | "md" | "default";
  addedCount: number;
  removedCount: number;
  timestamp: number;
}

export interface AntigravityThoughtItem {
  id: string;
  type: "thought";
  duration?: string | undefined;
  thoughts?: string[] | undefined;
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
  | AntigravityFileItem
  | AntigravityAnalyzedItem
  | AntigravitySearchItem
  | AntigravityTerminalItem
  | AntigravityEditedItem
  | AntigravityThoughtItem
  | AntigravityPlanItem
  | AntigravityExploredItem;

/**
 * Normalized activity record for uniform, fluid rendering
 */
export interface NormalizedActivity {
  id: string;
  kind: "file" | "search" | "terminal" | "thought" | "general";
  state: AntigravityFileState | "searching" | "terminal" | "thought";
  label: string;
  target: string;
  fileName?: string;
  fileType?: "js" | "ts" | "react" | "config" | "css" | "py" | "html" | "json" | "md" | "default";
  lineRange?: string | undefined;
  status: "running" | "completed" | "failed";
  addedCount?: number | undefined;
  removedCount?: number | undefined;
  resultCount?: number | undefined;
  duration?: string | undefined;
  rawItem: AntigravityStreamItem;
}

/**
 * Detects file type and returns an authentic Antigravity badge
 */
export function getFileTypeBadge(filePath: string): {
  type: "js" | "ts" | "react" | "config" | "css" | "py" | "html" | "json" | "md" | "default";
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

  if (base.endsWith(".md") || base.endsWith(".mdx")) {
    return {
      type: "md",
      badge: (
        <span className="text-[9.5px] font-bold text-[#818CF8] font-mono leading-none shrink-0 bg-[#818CF8]/10 px-1 py-0.5 rounded border border-[#818CF8]/20">
          MD
        </span>
      ),
    };
  }

  if (base.endsWith(".html") || base.endsWith(".htm")) {
    return {
      type: "html",
      badge: (
        <span className="text-[9.5px] font-bold text-[#F97316] font-mono leading-none shrink-0 bg-[#F97316]/10 px-1 py-0.5 rounded border border-[#F97316]/20">
          HTML
        </span>
      ),
    };
  }

  if (
    base.startsWith(".env") ||
    base.endsWith(".json") ||
    base.endsWith(".yaml") ||
    base.endsWith(".yml") ||
    base.includes("config") ||
    base.endsWith(".toml")
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

  return {
    type: "default",
    badge: (
      <span className="text-[9px] font-bold text-zinc-500 font-mono leading-none shrink-0 bg-white/[0.05] px-1 py-0.5 rounded border border-white/[0.05]">
        FILE
      </span>
    ),
  };
}

/**
 * Normalizes any AntigravityStreamItem into a unified structure
 */
function normalizeItem(item: AntigravityStreamItem): NormalizedActivity {
  if (item.type === "file") {
    let label = "Interacting";
    if (item.subType === "analyzing") label = "Analyzing";
    else if (item.subType === "reading") label = "Reading";
    else if (item.subType === "editing") label = "Editing";
    else if (item.subType === "created") label = "Created";
    else if (item.subType === "modified") label = "Modified";
    else if (item.subType === "deleted") label = "Deleted";
    else if (item.subType === "completed") label = "Completed";
    else if (item.subType === "failed") label = "Failed";

    return {
      id: item.id,
      kind: "file",
      state: item.subType,
      label,
      target: item.filePath,
      fileName: item.fileName,
      fileType: item.fileType,
      lineRange: item.lineRange,
      status: item.status,
      addedCount: item.addedCount,
      removedCount: item.removedCount,
      rawItem: item,
    };
  }

  if (item.type === "analyzed") {
    const isRunning = item.status === "running";
    return {
      id: item.id,
      kind: "file",
      state: isRunning ? "analyzing" : "reading",
      label: isRunning ? "Analyzing" : "Analyzed",
      target: item.filePath,
      fileName: item.fileName,
      fileType: item.fileType,
      lineRange: item.lineRange,
      status: item.status || "completed",
      rawItem: item,
    };
  }

  if (item.type === "edited") {
    return {
      id: item.id,
      kind: "file",
      state: "modified",
      label: "Edited",
      target: item.filePath,
      fileName: item.fileName,
      fileType: item.fileType,
      status: "completed",
      addedCount: item.addedCount,
      removedCount: item.removedCount,
      rawItem: item,
    };
  }

  if (item.type === "search") {
    const isRunning = item.status === "running";
    return {
      id: item.id,
      kind: "search",
      state: "searching",
      label: isRunning ? "Searching" : "Searched",
      target: item.query,
      resultCount: item.resultCount,
      status: item.status || "completed",
      rawItem: item,
    };
  }

  if (item.type === "terminal") {
    const isRunning = item.status === "running";
    return {
      id: item.id,
      kind: "terminal",
      state: "terminal",
      label: isRunning ? "Running" : "Ran",
      target: item.command,
      status: item.status,
      rawItem: item,
    };
  }

  if (item.type === "thought") {
    return {
      id: item.id,
      kind: "thought",
      state: "thought",
      label: "Thought",
      target: item.duration || "1s",
      status: "completed",
      duration: item.duration,
      rawItem: item,
    };
  }

  if (item.type === "explored") {
    return {
      id: item.id,
      kind: "general",
      state: "completed",
      label: "Explored",
      target: `${item.count} ${item.count === 1 ? "file" : "files"}`,
      status: "completed",
      rawItem: item,
    };
  }

  // item.type === "planned"
  return {
    id: item.id,
    kind: "general",
    state: "completed",
    label: "Planned",
    target: `${item.taskCount} tasks`,
    status: "completed",
    rawItem: item,
  };
}

/**
 * Sleek Antigravity Status Icon corresponding to interaction state
 */
export function ActivityStatusIcon({
  state,
  isRunning = false,
}: {
  state: AntigravityFileState | "searching" | "terminal" | "thought";
  isRunning?: boolean;
}) {
  // 1. Analyzing: Subtle animated scanning cyan pulse ring
  if (isRunning || state === "analyzing") {
    return (
      <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400 thinking-dot-glow" />
      </span>
    );
  }

  // 2. Reading: Subtle blue dot
  if (state === "reading") {
    return (
      <span className="inline-flex rounded-full h-1.5 w-1.5 bg-sky-400/80 shrink-0" />
    );
  }

  // 3. Editing: File icon + purple active indicator
  if (state === "editing") {
    return (
      <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-purple-400/40" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.8)]" />
      </span>
    );
  }

  // 4. Created: File icon + green addition indicator
  if (state === "created") {
    return (
      <span className="text-emerald-400 font-mono text-[11px] font-bold shrink-0 leading-none">
        +
      </span>
    );
  }

  // 5. Modified: Small modified badge
  if (state === "modified") {
    return (
      <span className="text-amber-400 font-mono text-[10px] shrink-0 leading-none">
        ●
      </span>
    );
  }

  // 6. Deleted: Muted red deletion indicator
  if (state === "deleted") {
    return (
      <span className="text-rose-400 font-mono text-[11px] font-bold shrink-0 leading-none">
        −
      </span>
    );
  }

  // 7. Completed: Small checkmark
  if (state === "completed") {
    return (
      <Check className="w-3 h-3 text-emerald-400/90 shrink-0 stroke-[2.5]" />
    );
  }

  // 8. Failed: Subtle red error indicator
  if (state === "failed") {
    return (
      <X className="w-3 h-3 text-rose-400 shrink-0 stroke-[2.5]" />
    );
  }

  if (state === "searching") {
    return (
      <Search className="w-3 h-3 text-sky-400/90 shrink-0" />
    );
  }

  if (state === "terminal") {
    return (
      <Terminal className="w-3 h-3 text-purple-400/90 shrink-0" />
    );
  }

  return (
    <span className="inline-flex rounded-full h-1.5 w-1.5 bg-zinc-500 shrink-0" />
  );
}

export interface AntigravityActionStreamProps {
  items: AntigravityStreamItem[];
  activeStep?: string | undefined;
  duration?: string | undefined;
  thoughts?: string[] | undefined;
  isStreaming?: boolean | undefined;
  onOpenFile?: ((filePath: string) => void) | undefined;
  onViewAllChanges?: (() => void) | undefined;
  totalUniqueFilesCount?: number | undefined;
}

export function AntigravityActionStream({
  items,
  activeStep,
  duration,
  thoughts,
  isStreaming = false,
  onOpenFile,
  onViewAllChanges,
  totalUniqueFilesCount,
}: AntigravityActionStreamProps) {
  // Open by default so operations are visible live step-by-step matching Screenshot 2
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isTopExpanded, setIsTopExpanded] = useState<boolean>(true);

  // Normalize all items
  const normalized = useMemo(() => {
    return (items || []).map(normalizeItem);
  }, [items]);

  // Determine active item during live streaming:
  // If streaming, the running item or latest item is prominent.
  const { activeItem, historyItems } = useMemo(() => {
    if (!isStreaming) {
      return { activeItem: null, historyItems: normalized };
    }

    if (normalized.length === 0) {
      return { activeItem: null, historyItems: [] };
    }

    // Prefer running item
    const runningIdx = normalized.findIndex((it) => it.status === "running");
    if (runningIdx !== -1) {
      const active = normalized[runningIdx]!;
      const history = normalized.filter((_, idx) => idx !== runningIdx);
      return { activeItem: active, historyItems: history };
    }

    // Otherwise, all items are history
    return { activeItem: null, historyItems: normalized };
  }, [normalized, isStreaming]);

  // Compute summary metrics
  const { uniqueAnalyzed, uniqueModified, searchCount, commandCount } =
    useMemo(() => {
      const analyzedFiles = new Set<string>();
      const modifiedFiles = new Set<string>();
      let searches = 0;
      let commands = 0;

      for (const it of normalized) {
        if (it.kind === "file") {
          if (it.state === "analyzing" || it.state === "reading" || it.label.includes("Analyz")) {
            if (it.target) analyzedFiles.add(it.target);
          } else if (
            it.state === "modified" ||
            it.state === "editing" ||
            it.state === "created" ||
            it.state === "deleted"
          ) {
            if (it.target) modifiedFiles.add(it.target);
          }
        } else if (it.kind === "search") {
          searches++;
        } else if (it.kind === "terminal") {
          commands++;
        }
      }

      return {
        uniqueAnalyzed: analyzedFiles.size,
        uniqueModified: modifiedFiles.size,
        searchCount: searches,
        commandCount: commands,
      };
    }, [normalized]);

  // Active step override if no active item but activeStep is passed
  const displayActiveStep =
    !activeItem && isStreaming && activeStep ? activeStep : null;

  if (normalized.length === 0 && !displayActiveStep && !duration) {
    return null;
  }

  // Generate minimalist summary label (e.g. "Explored files, ran commands, edited files ⌵")
  const summaryParts: string[] = [];
  if (uniqueAnalyzed > 0) summaryParts.push("Explored files");
  if (commandCount > 0 || searchCount > 0) summaryParts.push("ran commands");
  if (uniqueModified > 0) summaryParts.push("edited files");

  const summaryLabel =
    summaryParts.length > 0
      ? summaryParts.join(", ")
      : normalized.length > 0
      ? `${normalized.length} operations`
      : "Explored files";

  const changesCount = totalUniqueFilesCount ?? uniqueModified;

  // Header duration text
  let headerDurationText = "Worked for a few seconds";
  if (duration) {
    headerDurationText = duration.toLowerCase().startsWith("worked") || duration.toLowerCase().startsWith("working")
      ? duration
      : `Worked for ${duration}`;
  } else if (isStreaming) {
    headerDurationText = "Working...";
  }

  return (
    <div className="my-1.5 font-sans select-none text-[12px]">
      {/* ── 1. Top Worked for duration ⌵ ── */}
      <button
        type="button"
        onClick={() => setIsTopExpanded((p) => !p)}
        className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer select-none py-0.5 group"
      >
        <span className={cn("font-sans tracking-tight", isStreaming && "thinking-text-shimmer")}>
          {headerDurationText}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200",
            !isTopExpanded && "-rotate-90"
          )}
        />
      </button>

      {/* ── 2. Collapsible Activities Container ── */}
      <AnimatePresence>
        {isTopExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: EASING_CUBIC }}
            className="overflow-hidden space-y-0.5"
          >
            {/* Sub-header (e.g. "Explored files, ran commands, edited files ⌵") */}
            {(normalized.length > 0 || displayActiveStep) && (
              <button
                type="button"
                onClick={() => setIsExpanded((p) => !p)}
                className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer select-none py-0.5 pl-3 group"
              >
                <span className="font-sans tracking-tight">
                  {summaryLabel}
                </span>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200",
                    !isExpanded && "-rotate-90"
                  )}
                />
              </button>
            )}

            {/* Indented Live Step-by-Step Operation Stream (Matching Screenshot 2) */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: EASING_CUBIC }}
                  className="pl-5 space-y-0.5 my-0.5 overflow-hidden"
                >
                  {/* Historical completed items */}
                  {historyItems.map((item) => {
                    if (item.kind === "file") {
                      const isEdited = item.state === "modified" || item.label === "Edited";
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 py-0.5 text-[12px] leading-snug group"
                        >
                          <span className="text-zinc-400 font-sans shrink-0">
                            {isEdited ? "Edited" : "Analyzed"}
                          </span>

                          {item.fileType && (
                            <span className="shrink-0">
                              {getFileTypeBadge(item.target).badge}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenFile?.(item.target)}
                            className="font-mono text-zinc-300 hover:text-white truncate max-w-[280px] text-left transition-colors cursor-pointer hover:underline"
                            title={`Open ${item.target} in editor`}
                          >
                            {item.fileName || item.target}
                          </button>

                          {item.lineRange && (
                            <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                              {item.lineRange}
                            </span>
                          )}

                          {item.addedCount !== undefined && (
                            <div className="flex items-center gap-1 font-mono text-[11px] shrink-0 ml-auto">
                              <span className="text-emerald-400 font-medium">+{item.addedCount}</span>
                              <span className="text-rose-400/90 font-medium">-{item.removedCount ?? 0}</span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Terminal command or task
                    const cmdText = item.target.startsWith("Checked task") || item.target.endsWith("finished")
                      ? item.target
                      : item.target.startsWith("Ran")
                      ? item.target
                      : `Ran ${item.target}`;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-1.5 py-0.5 text-[12px] leading-snug text-zinc-400 font-sans group select-none"
                      >
                        <span className="truncate max-w-[360px]">
                          {cmdText}
                        </span>
                        <span className="text-zinc-600 text-[11px] shrink-0">&gt;</span>
                      </div>
                    );
                  })}

                  {/* Live active running step (e.g. ◉ Analyzing ... / ◉ Ran ...) */}
                  {activeItem && activeItem.status === "running" && (
                    <motion.div
                      key={`active-${activeItem.id}`}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 py-0.5 text-[12px] leading-snug select-none"
                    >
                      <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400 thinking-dot-glow" />
                      </span>
                      <span className="text-zinc-400 font-sans shrink-0">
                        {activeItem.label}
                      </span>
                      {activeItem.fileType && (
                        <span className="shrink-0">{getFileTypeBadge(activeItem.target).badge}</span>
                      )}
                      <span className="thinking-text-shimmer text-[12px] font-mono truncate max-w-[280px]">
                        {activeItem.fileName || activeItem.target}
                      </span>
                      {activeItem.lineRange && (
                        <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                          {activeItem.lineRange}
                        </span>
                      )}
                    </motion.div>
                  )}

                  {/* Fallback active step override (e.g. ◉ Analyzing project structure / ◉ Checked task ...) */}
                  {!activeItem && displayActiveStep && (
                    <motion.div
                      key="live-fallback-step"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 py-0.5 text-[12px] leading-snug select-none"
                    >
                      <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400 thinking-dot-glow" />
                      </span>
                      <span className="thinking-text-shimmer text-[12px] truncate">
                        {displayActiveStep}
                      </span>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 3. Minimal Bottom Action (e.g. ← 📄 3 Files With Changes) ── */}
      {changesCount > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onViewAllChanges}
            className="flex items-center gap-1.5 text-[11.5px] text-zinc-400 hover:text-white transition-colors cursor-pointer group py-0.5"
            title="Review all modified files in editor"
          >
            <ArrowLeft className="w-3 h-3 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
            <FileText className="w-3 h-3 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
            <span className="font-medium tracking-tight">
              {changesCount} {changesCount === 1 ? "File" : "Files"} With Changes
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
        name.includes("inspect") ||
        name.includes("list"));

    const isWrite =
      c.risk === "write" ||
      name.includes("edit") ||
      name.includes("write") ||
      name.includes("replace") ||
      name.includes("diff") ||
      name.includes("patch") ||
      name.includes("create");

    const isDelete =
      name.includes("delete") ||
      name.includes("unlink") ||
      name.includes("remove") ||
      name === "rm";

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
        c.args?.file_path ||
        (name.includes("analyze") ? "workspace" : "");
      const fileName = target
        ? target.split("/").pop() || target
        : (name.includes("analyze") ? "workspace" : "file");
      const start = c.args?.startLine || c.args?.StartLine;
      const end = c.args?.endLine || c.args?.EndLine;
      const lineRange = start && end ? `#L${start}-${end}` : c.args?.lineRange;

      const subType: AntigravityFileState =
        c.status === "failed"
          ? "failed"
          : name.includes("analyze")
            ? "analyzing"
            : "reading";

      result.push({
        id: `file-read-${i}`,
        type: "file",
        subType,
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
        c.args?.file_path ||
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

      const subType: AntigravityFileState =
        c.status === "failed"
          ? "failed"
          : c.status === "running"
            ? "editing"
            : name.includes("create")
              ? "created"
              : "modified";

      result.push({
        id: `file-write-${i}`,
        type: "file",
        subType,
        filePath,
        fileName,
        fileType: typeInfo.type,
        addedCount: added,
        removedCount: removed,
        status: c.status || "completed",
        timestamp: Date.now() - (cards.length - i) * 60,
      });
    } else if (isDelete) {
      const filePath =
        c.args?.path || c.args?.filePath || c.args?.file_path || "";
      const fileName = filePath ? filePath.split("/").pop() || filePath : "file";
      result.push({
        id: `file-del-${i}`,
        type: "file",
        subType: "deleted",
        filePath,
        fileName,
        fileType: getFileTypeBadge(filePath).type,
        status: c.status || "completed",
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
