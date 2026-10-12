import React from "react";
import { DiffEditor } from "@monaco-editor/react";
import { Check, X, FileDiff, Sparkles, ArrowRight } from "lucide-react";
import type { PendingDiff } from "../fileModels";

interface DiffPreviewModalProps {
  pendingDiff: PendingDiff | null;
  onAccept: (uri: string) => void;
  onReject: (uri: string) => void;
  onClose?: () => void;
}

export const DiffPreviewModal: React.FC<DiffPreviewModalProps> = ({
  pendingDiff,
  onAccept,
  onReject,
  onClose,
}) => {
  if (!pendingDiff) return null;

  const fileName = pendingDiff.uri.split("/").pop() || pendingDiff.uri.split("\\").pop() || pendingDiff.uri;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="flex flex-col w-full max-w-6xl h-[85vh] bg-[#141519] border border-[#2b2f38] rounded-xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1a1c23] border-b border-[#2b2f38]">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-[#2563eb]/20 text-[#60a5fa]">
              <Sparkles className="w-4 h-4 text-[#38bdf8]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[#f1f5f9]">Review AI Suggested Changes</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#1e293b] text-[#94a3b8] border border-[#334155]">
                  In-Memory Diff
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#64748b] font-mono mt-0.5">
                <FileDiff className="w-3.5 h-3.5 text-[#94a3b8]" />
                <span className="text-[#cbd5e1]">{fileName}</span>
                <span className="text-[#475569]">({pendingDiff.uri})</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                onReject(pendingDiff.uri);
                if (onClose) onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#94a3b8] hover:text-[#f87171] hover:bg-[#ef4444]/10 border border-[#334155] rounded-md transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
            <button
              onClick={() => {
                onAccept(pendingDiff.uri);
                if (onClose) onClose();
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] shadow-sm rounded-md transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Accept & Apply</span>
            </button>
          </div>
        </div>

        {/* Diff Comparison Legend */}
        <div className="flex items-center justify-between px-5 py-2 bg-[#0e0f12] text-[11px] border-b border-[#21242c] font-mono">
          <div className="flex items-center gap-4 text-[#94a3b8]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]/60 inline-block" />
              <span>Original (Disk Baseline)</span>
            </span>
            <ArrowRight className="w-3 h-3 text-[#475569]" />
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e]/60 inline-block" />
              <span>AI Proposal</span>
            </span>
          </div>
          <div className="text-[#64748b]">
            Side-by-side Diff View
          </div>
        </div>

        {/* Monaco Diff Editor */}
        <div className="flex-1 w-full bg-[#0d0e12] overflow-hidden">
          <DiffEditor
            original={pendingDiff.originalContent}
            modified={pendingDiff.modifiedContent}
            language={
              fileName.endsWith(".ts") || fileName.endsWith(".tsx")
                ? "typescript"
                : fileName.endsWith(".js") || fileName.endsWith(".jsx")
                ? "javascript"
                : fileName.endsWith(".json")
                ? "json"
                : fileName.endsWith(".css")
                ? "css"
                : fileName.endsWith(".html")
                ? "html"
                : "plaintext"
            }
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
              minimap: { enabled: false },
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              renderOverviewRuler: false,
              lineNumbers: "on",
            }}
          />
        </div>
      </div>
    </div>
  );
};
