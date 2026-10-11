import React from "react";

interface TerminalGutterProps {
  viewportY: number;
  rows: number;
  cursorBaseY: number;
  totalLines: number;
  rowHeight: number;
  topPadding?: number;
}

export function TerminalGutter({
  viewportY,
  rows,
  cursorBaseY,
  totalLines,
  rowHeight,
  topPadding = 8,
}: TerminalGutterProps) {
  // Generate row indices for the visible screen rows
  const lineRows = Array.from({ length: rows }, (_, idx) => {
    const lineIndex = viewportY + idx;
    const lineNumber = lineIndex + 1;
    const isActive = lineIndex === cursorBaseY;
    // Determine whether this row has content or is active
    const hasContent = lineIndex <= Math.max(cursorBaseY, totalLines - 1);

    return {
      idx,
      lineIndex,
      lineNumber,
      isActive,
      hasContent,
    };
  });

  return (
    <div
      className="w-11 shrink-0 bg-[#1A1A1A] select-none overflow-hidden font-mono text-[11px] z-10 flex flex-col items-end shadow-[inset_-1px_0_0_rgba(255,255,255,0.05),2px_0_8px_rgba(0,0,0,0.25)] border-r-0"
      style={{
        paddingTop: `${topPadding}px`,
      }}
      aria-hidden="true"
    >
      {lineRows.map((row) => (
        <div
          key={row.idx}
          className={`w-full flex items-center justify-end pr-2 transition-colors relative ${
            row.isActive
              ? "text-[#FF6B00] font-bold bg-[#261B14]"
              : row.hasContent
              ? "text-[#606060] hover:text-[#909090]"
              : "text-[#333333]"
          }`}
          style={{
            height: `${rowHeight}px`,
            lineHeight: `${rowHeight}px`,
          }}
        >
          {/* Active row indicator bar */}
          {row.isActive && (
            <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#FF6B00]" />
          )}

          <span className="tabular-nums font-mono text-[11px]">
            {row.lineNumber}
          </span>
        </div>
      ))}
    </div>
  );
}
