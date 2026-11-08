import { useRef, useState, useEffect } from "react";
import Editor, { DiffEditor, type OnMount } from "@monaco-editor/react";

const MonacoEditor: any = (Editor as any)?.default || Editor;
import {
  X,
  ChevronRight,
  SplitSquareVertical,
  MoreHorizontal,
  Check,
  FileDiff,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorWorkspaceApi, EditorFile } from "@/hooks/useEditorWorkspace";

import { ModernFolderIcon, ModernFileIcon } from "@/components/explorer/VsCodeTreeIcons";

export function FolderIconSVG({ isOpen = false }: { isOpen?: boolean }) {
  return <ModernFolderIcon name="folder" isOpen={isOpen} />;
}

export function getFolderIcon(folderName: string, isOpen = false) {
  return <ModernFolderIcon name={folderName} isOpen={isOpen} />;
}

export function getFileIcon(filename: string, isFolder = false, isOpen = false) {
  if (isFolder) {
    return <ModernFolderIcon name={filename} isOpen={isOpen} />;
  }
  return <ModernFileIcon name={filename} />;
}

function getBreadcrumbs(fullPath: string, rootDir = "THIRD_EYE"): string[] {
  const norm = fullPath.replace(/\\/g, "/");
  const idx = norm.indexOf(rootDir);
  let rel = "";
  if (idx !== -1) {
    rel = norm.substring(idx + rootDir.length).replace(/^\/+/, "");
  } else {
    const parts = norm.split("/").filter(Boolean);
    rel = parts.slice(Math.max(0, parts.length - 4)).join("/");
  }
  return rel ? rel.split("/").filter(Boolean) : [norm.split("/").pop() || "file"];
}

export interface MonacoCodeEditorProps {
  editorApi: EditorWorkspaceApi;
  onOpenTerminal?: () => void;
  onOpenFolder?: () => void;
  onQuickOpen?: () => void;
  onNewFile?: () => void;
  onCloneRepository?: () => void;
}

export function MonacoCodeEditor({
  editorApi,
}: MonacoCodeEditorProps) {
  const {
    openFiles,
    activeFile,
    activeFilePath,
    setActiveFilePath,
    closeFile,
    updateContent,
    saveFile,
    acceptDiff,
    rejectDiff,
    exitDiffMode,
  } = editorApi as any;
  const editorRef = useRef<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [renderSideBySide, setRenderSideBySide] = useState(true);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const configureMonacoLanguages = (monaco: any) => {
    try {
      if (monaco?.languages?.typescript) {
        const { typescriptDefaults, javascriptDefaults } = monaco.languages.typescript;

        const compilerOpts = {
          target: monaco.languages.typescript.ScriptTarget?.Latest ?? 99,
          allowNonTextFiles: true,
          allowJs: true,
          checkJs: false,
          jsx: monaco.languages.typescript.JsxEmit?.ReactJSX ?? 4,
          jsxFactory: "React.createElement",
          reactNamespace: "React",
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          moduleResolution: monaco.languages.typescript.ModuleResolutionKind?.NodeJs ?? 2,
          module: monaco.languages.typescript.ModuleKind?.CommonJS ?? 1,
          noEmit: true,
          skipLibCheck: true,
        };

        typescriptDefaults?.setCompilerOptions(compilerOpts);
        javascriptDefaults?.setCompilerOptions(compilerOpts);

        // Turn off semantic diagnostics for missing in-browser node_modules
        // (Physical node_modules exist on disk, not mounted in the client-side Monaco web worker)
        typescriptDefaults?.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: false,
          noSuggestionDiagnostics: true,
        });

        javascriptDefaults?.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: false,
          noSuggestionDiagnostics: true,
        });

        // Add ambient global declarations for JSX and modules
        typescriptDefaults?.addExtraLib?.(
          `declare namespace JSX {
            interface IntrinsicElements {
              [elemName: string]: any;
            }
          }
          declare module "react" {
            const React: any;
            export default React;
            export const useState: any;
            export const useEffect: any;
            export const useRef: any;
            export const useMemo: any;
            export const useCallback: any;
          }
          declare module "react/jsx-runtime" {
            export const jsx: any;
            export const jsxs: any;
            export const Fragment: any;
          }
          declare module "*" {
            const value: any;
            export default value;
          }`,
          "file:///globals.d.ts"
        );
      }
    } catch (e) {
      console.warn("[MonacoCodeEditor] Error configuring languages:", e);
    }
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Ensure language compiler settings are active
    configureMonacoLanguages(monaco);

    // Define standard VS Code Dark+ theme
    monaco.editor.defineTheme("vscodeDarkPlus", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955" },
        { token: "keyword", foreground: "C586C0" },
        { token: "string", foreground: "CE9178" },
        { token: "number", foreground: "B5CEA8" },
        { token: "type", foreground: "4EC9B0" },
        { token: "class", foreground: "4EC9B0" },
        { token: "function", foreground: "DCDCAA" },
        { token: "variable", foreground: "9CDCFE" },
        { token: "identifier", foreground: "9CDCFE" },
        { token: "delimiter", foreground: "D4D4D4" },
      ],
      colors: {
        "editor.background": "#1E1E1E",
        "editor.foreground": "#D4D4D4",
        "editorCursor.foreground": "#AEAFAD",
        "editor.lineHighlightBackground": "#28282850",
        "editorLineNumber.foreground": "#858585",
        "editorLineNumber.activeForeground": "#C6C6C6",
        "editor.selectionBackground": "#264F78",
        "editor.inactiveSelectionBackground": "#3A3D4180",
        "editorIndentGuide.background": "#404040",
        "editorIndentGuide.activeBackground": "#707070",
        "editorWhitespace.foreground": "#3B3A32",
        "minimap.background": "#1E1E1E",
      },
    });

    monaco.editor.setTheme("vscodeDarkPlus");

    // Shortcut: Ctrl+S / Cmd+S saves the active file
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveFile();
    });

    // Track active cursor line & col in real time
    editor.onDidChangeCursorPosition((e) => {
      editorApi.setCursorPosition?.({
        lineNumber: e.position.lineNumber,
        column: e.position.column,
      });
    });
  };

  const breadcrumbs = activeFile ? getBreadcrumbs(activeFile.path) : [];

  return (
    <div className="flex h-full w-full flex-col bg-[#1E1E1E] select-none overflow-hidden font-sans">
      {/* ── 1. VS Code Simplified Tab Bar (Matches Image 2) ── */}
      <div className="flex h-[35px] shrink-0 items-center justify-between border-b border-[#252526] bg-[#181818] overflow-x-auto scrollbar-none">
        <div className="flex items-center h-full overflow-x-auto scrollbar-none">
          {openFiles.map((file: EditorFile) => {
            const isActive = file.path === activeFilePath;
            return (
              <div
                key={file.path}
                onClick={() => setActiveFilePath(file.path)}
                className={cn(
                  "group relative flex h-full items-center gap-2 px-3 border-r border-[#252526] text-[12px] font-sans cursor-pointer transition-colors max-w-[220px] shrink-0 select-none",
                  isActive
                    ? "bg-[#1E1E1E] text-white font-normal"
                    : "bg-[#181818] text-[#969696] hover:bg-[#1F1F1F] hover:text-[#CCCCCC]"
                )}
                title={file.path}
              >
                {/* File extension icon */}
                <div className="shrink-0 flex items-center justify-center">
                  {file.isDiffMode ? (
                    <FileDiff className="h-3.5 w-3.5 text-[#38BDF8]" />
                  ) : (
                    getFileIcon(file.name)
                  )}
                </div>

                {/* File title */}
                <span className="truncate">{file.name}</span>

                {/* Diff tag & line count badges */}
                {file.isDiffMode && (
                  <span className="px-1 py-0.2 rounded text-[8.5px] font-mono font-bold bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40 leading-tight shrink-0">
                    DIFF
                  </span>
                )}
                {file.isDiffMode && (file.addedCount !== undefined || file.removedCount !== undefined) && (
                  <span className="text-[10px] font-mono shrink-0 flex items-center gap-0.5">
                    {file.addedCount ? <span className="text-[#10B981]">+{file.addedCount}</span> : null}
                    {file.removedCount ? <span className="text-[#EF4444]">-{file.removedCount}</span> : null}
                  </span>
                )}

                {/* Dirty indicator dot OR close button on hover */}
                <div
                  className="flex items-center justify-center h-4 w-4 rounded hover:bg-[#333333] transition-colors ml-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(file.path);
                  }}
                  title="Close (⌘W)"
                >
                  {file.isDirty ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-[#CCCCCC] group-hover:hidden" />
                      <X className="h-3 w-3 text-[#969696] hover:text-white hidden group-hover:block" />
                    </>
                  ) : (
                    <X className="h-3 w-3 text-[#969696] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            );
          })}

          {/* New Tab Button matching Screenshot 2 */}
          <button
            onClick={() => editorApi.createFile("untitled.txt")}
            className="flex h-full items-center justify-center px-2.5 text-[13px] text-[#80808A] hover:text-white hover:bg-[#1F1F24] transition-colors cursor-pointer select-none border-r border-[#252526]"
            title="New File"
          >
            +
          </button>
        </div>

        {/* Right action controls */}
        {activeFile && (
          <div className="flex items-center gap-1.5 px-2 shrink-0 text-[#8C90A0]">
            {activeFile.isDiffMode ? (
              <>
                <button
                  type="button"
                  onClick={() => rejectDiff?.(activeFile.path)}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#2A181A] hover:bg-[#381B1E] text-[#EF4444] border border-[#EF4444]/40 text-[11px] font-medium cursor-pointer transition-colors"
                  title="Reject & Revert AI changes"
                >
                  <X className="h-3 w-3" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  onClick={() => acceptDiff?.(activeFile.path)}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#10281F] hover:bg-[#15382B] text-[#10B981] border border-[#10B981]/40 text-[11px] font-medium cursor-pointer transition-colors"
                  title="Accept & Apply AI changes"
                >
                  <Check className="h-3 w-3" />
                  <span>Accept</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRenderSideBySide((p) => !p)}
                  className="p-1 rounded hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
                  title={renderSideBySide ? "Switch to inline diff view" : "Switch to side-by-side diff view"}
                >
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => exitDiffMode?.(activeFile.path)}
                  className="px-2 py-0.5 rounded text-[11px] font-medium text-[#969696] hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
                  title="View standard file editor"
                >
                  Exit Diff
                </button>
              </>
            ) : (
              <>
                <button
                  className="p-1 rounded hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
                  title="Split Editor Right"
                >
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1 rounded hover:text-white hover:bg-[#2D2D2D] transition-colors cursor-pointer"
                  title="More Actions…"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 2. Simplified VS Code Breadcrumbs Bar (Matches Image 2) ── */}
      {activeFile && (
        <div className="flex h-[22px] shrink-0 items-center justify-between border-b border-[#252526] bg-[#1E1E1E] px-4 text-[12px] text-[#A0A0A0] font-sans overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1">
            {breadcrumbs.map((part, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <span key={i} className="flex items-center gap-1 shrink-0">
                  {isLast ? (
                    <div className="flex items-center gap-1 text-white font-normal">
                      <span className="shrink-0">{getFileIcon(part)}</span>
                      <span>{part}</span>
                    </div>
                  ) : (
                    <span className="hover:text-white cursor-pointer transition-colors">{part}</span>
                  )}
                  <ChevronRight className="h-3 w-3 text-[#6E6E6E] shrink-0" />
                </span>
              );
            })}
            <span className="text-[#6E6E6E] shrink-0">...</span>
          </div>

          {activeFile.isDiffMode && (
            <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
              <span className="flex items-center gap-1 text-[#EF4444]">
                <span className="w-2 h-2 rounded-xs bg-[#EF4444]/60 inline-block" />
                <span>Original</span>
              </span>
              <ArrowRight className="w-3 h-3 text-[#6E6E6E]" />
              <span className="flex items-center gap-1 text-[#10B981]">
                <span className="w-2 h-2 rounded-xs bg-[#10B981]/60 inline-block" />
                <span>Proposed Changes</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── 3. Monaco Editor Canvas / Diff View / Empty State ── */}
      <div className="relative flex-1 min-h-0 min-w-0 bg-[#1E1E1E]">
        {activeFile ? (
          activeFile.isDiffMode ? (
            <div className="h-full w-full bg-[#1E1E1E]">
              <DiffEditor
                original={activeFile.diffOriginal ?? activeFile.originalContent}
                modified={activeFile.diffModified ?? activeFile.content}
                language={activeFile.language}
                theme="vscodeDarkPlus"
                options={{
                  readOnly: false,
                  originalEditable: false,
                  renderSideBySide: renderSideBySide,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, 'Courier New', monospace",
                  fontLigatures: true,
                  lineNumbers: "on",
                  lineNumbersMinChars: 3,
                  glyphMargin: false,
                  folding: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  smoothScrolling: true,
                  enableSplitViewResizing: true,
                  padding: { top: 6, bottom: 6 },
                }}
              />
            </div>
          ) : isMounted ? (
            <MonacoEditor
              height="100%"
              path={activeFile.path.startsWith("/") ? activeFile.path : `/${activeFile.path}`}
              language={activeFile.language}
              value={activeFile.content}
              theme="vscodeDarkPlus"
              beforeMount={configureMonacoLanguages}
              onMount={handleEditorDidMount}
              onChange={(val: any) => {
                if (typeof val === "string") {
                  updateContent(activeFile.path, val);
                }
              }}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, 'Courier New', monospace",
                fontLigatures: true,
                lineNumbers: "on",
                lineNumbersMinChars: 3,
                glyphMargin: false,
                folding: true,
                lineDecorationsWidth: 6,
                minimap: { enabled: true, side: "right", scale: 1 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                tabSize: 2,
                wordWrap: "on",
                renderLineHighlight: "all",
                padding: { top: 6, bottom: 6 },
                contextmenu: true,
                bracketPairColorization: { enabled: true },
                guides: {
                  bracketPairs: true,
                  indentation: true,
                },
              }}
            />
          ) : (
            <div className="h-full w-full bg-[#1E1E1E]" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center select-none pointer-events-none bg-[#1E1E1E]">
            <span className="text-[24px] sm:text-[28px] font-light tracking-wide text-white/[0.08] select-none font-sans">
              start building
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
