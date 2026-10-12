import React, { useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import {
  Check,
  CheckCheck,
  X,
  FileCode,
  Maximize2,
  Minimize2,
} from "lucide-react";

export interface FileDiffItem {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  addedCount?: number;
  removedCount?: number;
}

interface DiffViewerModalProps {
  files: FileDiffItem[];
  onAccept: (filePath: string) => void;
  onReject: (filePath: string) => void;
  onAcceptAll: () => void;
  onClose: () => void;
}

export function DiffViewerModal({
  files,
  onAccept,
  onReject,
  onAcceptAll,
  onClose,
}: DiffViewerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFull, setIsFull] = useState(false);

  if (!files || files.length === 0) return null;
  const activeFile = files[selectedIndex] || files[0]!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
      <div
        className={`flex flex-col rounded-xl bg-[#13141A] border border-[#262836] shadow-2xl overflow-hidden transition-all ${
          isFull ? "w-full h-full" : "w-[92vw] max-w-5xl h-[80vh]"
        }`}
      >
        {/* Top Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#22232E] bg-[#161720] px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-white font-semibold text-[13px]">
              <FileCode className="h-4 w-4 text-[#38BDF8]" />
              <span>Agent Proposed Changes ({files.length} files)</span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {files.map((f, idx) => (
                <button
                  key={f.filePath}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                    selectedIndex === idx
                      ? "bg-[#1E202B] text-white border border-[#38BDF8]/40"
                      : "text-[#8E8E9E] hover:text-white"
                  }`}
                >
                  {f.filePath.split("/").pop()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onReject(activeFile.filePath)}
              className="px-2.5 py-1 rounded bg-[#2A181A] hover:bg-[#381B1E] text-[#EF4444] border border-[#EF4444]/40 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <X className="h-3 w-3" />
              <span>Reject File</span>
            </button>
            <button
              type="button"
              onClick={() => onAccept(activeFile.filePath)}
              className="px-2.5 py-1 rounded bg-[#10281F] hover:bg-[#15382B] text-[#10B981] border border-[#10B981]/40 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Check className="h-3 w-3" />
              <span>Accept File</span>
            </button>
            <button
              type="button"
              onClick={onAcceptAll}
              className="px-3 py-1 rounded bg-[#007ACC] hover:bg-[#008AE6] text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm cursor-pointer transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Accept All ({files.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFull((p) => !p)}
              className="p-1.5 rounded hover:bg-[#252733] text-[#8E8E9E] hover:text-white cursor-pointer ml-1"
            >
              {isFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#252733] text-[#8E8E9E] hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Monaco Diff Editor */}
        <div className="flex-1 min-h-0 bg-[#1E1E1E]">
          <DiffEditor
            original={activeFile.originalContent}
            modified={activeFile.modifiedContent}
            language={
              activeFile.filePath.endsWith(".ts") || activeFile.filePath.endsWith(".tsx")
                ? "typescript"
                : activeFile.filePath.endsWith(".css")
                ? "css"
                : activeFile.filePath.endsWith(".json")
                ? "json"
                : "javascript"
            }
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false,
              renderSideBySide: true,
              smoothScrolling: true,
            }}
          />
        </div>
      </div>
    </div>
  );
}
