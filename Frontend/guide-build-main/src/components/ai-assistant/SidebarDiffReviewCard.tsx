import React, { useState, useMemo } from "react";
import {
  FileDiff,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCheck,
  FileCode,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileDiffItem {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  addedCount?: number;
  removedCount?: number;
}

interface SidebarDiffReviewCardProps {
  files: FileDiffItem[];
  onOpenFileDiff: (file: FileDiffItem) => void;
  onAcceptFile: (filePath: string) => void;
  onRejectFile: (filePath: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  title?: string;
  compact?: boolean;
}

interface SimpleDiffLine {
  type: "added" | "removed" | "context";
  text: string;
  lineNum?: number;
}

/**
 * Computes an inline snippet of changed lines between original and modified strings
 */
function computeInlineDiff(
  original: string = "",
  modified: string = "",
  maxLines: number = 30
): { lines: SimpleDiffLine[]; totalAdded: number; totalRemoved: number } {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");

  let start = 0;
  while (
    start < origLines.length &&
    start < modLines.length &&
    origLines[start] === modLines[start]
  ) {
    start++;
  }

  let origEnd = origLines.length - 1;
  let modEnd = modLines.length - 1;
  while (
    origEnd >= start &&
    modEnd >= start &&
    origLines[origEnd] === modLines[modEnd]
  ) {
    origEnd--;
    modEnd--;
  }

  const diffLines: SimpleDiffLine[] = [];

  // Context line before change if available
  if (start > 0) {
    diffLines.push({
      type: "context",
      text: origLines[start - 1] ?? "",
      lineNum: start,
    });
  }

  // Removed lines
  for (let i = start; i <= origEnd; i++) {
    if (diffLines.length < maxLines) {
      diffLines.push({
        type: "removed",
        text: origLines[i] ?? "",
        lineNum: i + 1,
      });
    }
  }

  // Added lines
  for (let j = start; j <= modEnd; j++) {
    if (diffLines.length < maxLines) {
      diffLines.push({
        type: "added",
        text: modLines[j] ?? "",
        lineNum: j + 1,
      });
    }
  }

  // Context line after change if available
  if (origEnd + 1 < origLines.length) {
    if (diffLines.length < maxLines) {
      diffLines.push({
        type: "context",
        text: origLines[origEnd + 1] ?? "",
        lineNum: origEnd + 2,
      });
    }
  }

  const totalAdded = Math.max(0, modEnd - start + 1);
  const totalRemoved = Math.max(0, origEnd - start + 1);

  return { lines: diffLines, totalAdded, totalRemoved };
}

export function SidebarDiffReviewCard({
  files,
  onOpenFileDiff,
  onAcceptFile,
  onRejectFile,
  onAcceptAll,
  onRejectAll,
  title = "Proposed Changes",
  compact = false,
}: SidebarDiffReviewCardProps) {
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>(() => {
    // Expand the first file by default for immediate preview
    if (files.length > 0 && files[0]?.filePath) {
      return { [files[0].filePath]: true };
    }
    return {};
  });

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFiles((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const { totalAdded, totalRemoved } = useMemo(() => {
    let a = 0;
    let r = 0;
    for (const f of files) {
      a += f.addedCount ?? 0;
      r += f.removedCount ?? 0;
    }
    return { totalAdded: a, totalRemoved: r };
  }, [files]);

  if (!files || files.length === 0) return null;

  return (
    <div className="rounded-lg bg-[#121318] border border-[#262836] shadow-md overflow-hidden select-none my-2 font-sans">
      {/* Top Header with summary & batch buttons */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#171821] border-b border-[#232430]">
        <div className="flex items-center gap-2">
          <FileDiff className="h-4 w-4 text-[#38BDF8] shrink-0" />
          <span className="text-[12px] font-semibold text-white">
            {title} ({files.length} {files.length === 1 ? "file" : "files"})
          </span>
          <div className="flex items-center gap-1 font-mono text-[11px] ml-1">
            <span className="text-[#10B981] font-semibold">+{totalAdded}</span>
            <span className="text-[#EF4444] font-semibold">-{totalRemoved}</span>
          </div>
        </div>

        {/* Global Batch Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRejectAll}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-[#EF4444] border border-rose-600/30 text-[10.5px] font-medium transition-colors cursor-pointer"
            title="Reject all changes"
          >
            <X className="h-3 w-3" />
            <span>Reject All</span>
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/50 hover:bg-emerald-900/70 text-[#10B981] border border-emerald-600/40 text-[10.5px] font-medium transition-colors cursor-pointer"
            title="Accept all changes"
          >
            <CheckCheck className="h-3 w-3" />
            <span>Accept All</span>
          </button>
        </div>
      </div>

      {/* Per-File Diff List */}
      <div className="divide-y divide-[#1D1E28]">
        {files.map((file) => {
          const fileName = file.filePath.split("/").pop() || file.filePath.split("\\").pop() || file.filePath;
          const dirPath = file.filePath.replace(fileName, "").replace(/^\/+|\/+$/g, "");
          const isExpanded = !!expandedFiles[file.filePath];

          const diffResult = computeInlineDiff(
            file.originalContent,
            file.modifiedContent,
            24
          );

          const added = file.addedCount ?? diffResult.totalAdded;
          const removed = file.removedCount ?? diffResult.totalRemoved;

          return (
            <div key={file.filePath} className="group/item">
              {/* File Row Header */}
              <div
                onClick={() => onOpenFileDiff(file)}
                className="flex items-center justify-between px-3 py-2 hover:bg-[#1A1B24] cursor-pointer transition-colors"
                title={`Click to view diff for ${fileName} in Monaco tab`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => toggleExpand(file.filePath, e)}
                    className="p-0.5 text-zinc-500 hover:text-white transition-colors cursor-pointer shrink-0"
                    title={isExpanded ? "Collapse diff preview" : "Expand inline diff"}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <FileCode className="h-3.5 w-3.5 text-[#38BDF8] shrink-0" />

                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-medium text-white group-hover/item:text-[#38BDF8] transition-colors truncate">
                      {fileName}
                    </span>
                    {dirPath && (
                      <span className="text-[10px] text-zinc-500 truncate -mt-0.5">
                        {dirPath}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[10.5px] shrink-0 ml-1.5">
                    <span className="text-[#10B981]">+{added}</span>
                    <span className="text-[#EF4444]">-{removed}</span>
                  </div>
                </div>

                {/* Per-File Actions */}
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenFileDiff(file);
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                    title="Open side-by-side in Monaco tab"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="hidden sm:inline">Monaco</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRejectFile(file.filePath);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-[#EF4444] hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Reject this file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcceptFile(file.filePath);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-[#10B981] hover:bg-emerald-500/10 transition-colors cursor-pointer"
                    title="Accept this file"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Inline Diff Preview Accordion */}
              {isExpanded && (
                <div className="px-3 pb-2.5 pt-0.5 bg-[#0C0D11] border-t border-[#1C1D26]">
                  <div className="rounded border border-[#202230] bg-[#0E0F14] overflow-hidden max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 font-mono text-[11px] leading-tight select-text">
                    {diffResult.lines.length === 0 ? (
                      <div className="p-2 text-zinc-500 italic text-[11px]">
                        No inline differences detected.
                      </div>
                    ) : (
                      diffResult.lines.map((dl, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-start px-2 py-0.5 font-mono",
                            dl.type === "added" && "bg-[#10B981]/15 text-[#34D399]",
                            dl.type === "removed" && "bg-[#EF4444]/15 text-[#F87171]",
                            dl.type === "context" && "text-zinc-500 bg-transparent"
                          )}
                        >
                          <span className="w-5 shrink-0 text-right select-none opacity-40 pr-2 text-[10px]">
                            {dl.lineNum ?? ""}
                          </span>
                          <span className="w-3 shrink-0 select-none font-bold">
                            {dl.type === "added" ? "+" : dl.type === "removed" ? "-" : " "}
                          </span>
                          <span className="whitespace-pre overflow-x-auto break-all font-mono">
                            {dl.text || " "}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex justify-end pt-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenFileDiff(file)}
                      className="flex items-center gap-1 text-[10.5px] text-[#38BDF8] hover:text-[#7DD3FC] hover:underline cursor-pointer transition-colors font-mono"
                    >
                      <span>Open full side-by-side in Monaco tab</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
