import { useRef, useState, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";

const MonacoEditor: any = (Editor as any)?.default || Editor;
import {
  X,
  ChevronRight,
  SplitSquareVertical,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorWorkspaceApi } from "@/hooks/useEditorWorkspace";

export function FolderIconSVG({ isOpen = false }: { isOpen?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[#DCB67A]">
      {isOpen ? (
        <path
          d="M1.5 2.5h4l1.5 1.5h7.5v2.5h-13v-4zm13 4.5l-1.5 6.5h-11.5l1.5-6.5h11.5z"
          fill="currentColor"
        />
      ) : (
        <path
          d="M1.5 2.5h4l1.5 1.5h7.5v8h-13v-9.5zm1 1.5v7h11v-6h-7l-1.5-1.5h-2.5z"
          fill="currentColor"
        />
      )}
    </svg>
  );
}

export function getFolderIcon(folderName: string, isOpen = false) {
  const lower = folderName.toLowerCase();
  if (lower === "node_modules") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        <FolderIconSVG isOpen={isOpen} />
        <span className="absolute -bottom-0.5 -right-0.5 px-0.5 rounded-[2px] bg-[#0284C7] text-[6.5px] font-mono font-bold text-white leading-tight select-none">
          npm
        </span>
      </span>
    );
  }
  if (lower === "themes") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        <FolderIconSVG isOpen={isOpen} />
        <span className="absolute -bottom-0.5 -right-0.5 px-0.5 rounded-[2px] bg-[#10B981] text-[7px] font-mono font-bold text-black leading-tight select-none">
          &lt;/&gt;
        </span>
      </span>
    );
  }
  if (lower === "assets" || lower === "images" || lower === "media") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        <FolderIconSVG isOpen={isOpen} />
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
      </span>
    );
  }
  if (lower === "transitions" || lower === "components") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        <FolderIconSVG isOpen={isOpen} />
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-sm bg-[#3B82F6]" />
      </span>
    );
  }
  if (lower === "next" || lower === ".next") {
    return (
      <span className="relative inline-flex items-center justify-center shrink-0">
        <FolderIconSVG isOpen={isOpen} />
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-[#E5E5E5]" />
      </span>
    );
  }
  return <FolderIconSVG isOpen={isOpen} />;
}

export function getFileIcon(filename: string, isFolder = false, isOpen = false) {
  if (isFolder) {
    return getFolderIcon(filename, isOpen);
  }
  const lower = filename.toLowerCase();
  if (lower === "package.json") {
    return <span className="text-[#00D8FF] font-bold text-[11px] font-mono select-none">&#123;&#125;</span>;
  }
  if (lower === "package-lock.json") {
    return <span className="text-[#F59E0B] font-bold text-[11px] font-mono select-none">&#123;&#125;</span>;
  }
  if (lower.startsWith(".env")) {
    return <span className="text-[#FF9800] text-[11px] font-bold select-none">⚙</span>;
  }
  if (lower.endsWith(".bat") || lower.endsWith(".ps1") || lower.endsWith(".sh")) {
    return <span className="text-[#4CAF50] font-bold text-[11px] font-mono select-none">&gt;_</span>;
  }
  if (lower.endsWith(".md")) {
    return <span className="text-[#42A5F5] font-bold text-[11px] font-mono select-none">M↓</span>;
  }
  if (lower === ".gitignore" || lower === ".env.example") {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-[#C5C5C5] shrink-0">
        <path d="M3 2h7l3 3v9H3V2zm6.5 0.5V5H12l-2.5-2.5zM4 3v10h8V6H9V3H4z" fill="currentColor" />
      </svg>
    );
  }
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "ts":
      return <span className="text-[#3178C6] font-bold text-[11px] font-mono select-none">TS</span>;
    case "tsx":
      return <span className="text-[#00D8FF] font-bold text-[11px] font-mono select-none">⚛</span>;
    case "js":
      return <span className="text-[#F7DF1E] font-bold text-[11px] font-mono select-none">JS</span>;
    case "jsx":
      return <span className="text-[#F7DF1E] font-bold text-[11px] font-mono select-none">⚛</span>;
    case "json":
      return <span className="text-[#CBCB41] font-bold text-[11px] font-mono select-none">&#123;&#125;</span>;
    case "html":
      return <span className="text-[#E34F26] font-bold text-[11px] font-mono select-none">&lt;&gt;</span>;
    case "css":
    case "scss":
      return <span className="text-[#42A5F5] font-bold text-[11px] font-mono select-none">#</span>;
    default:
      return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-[#888888] shrink-0">
          <path d="M3 2h7l3 3v9H3V2zm6.5 0.5V5H12l-2.5-2.5zM4 3v10h8V6H9V3H4z" fill="currentColor" />
        </svg>
      );
  }
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
  } = editorApi;
  const editorRef = useRef<any>(null);
  const [isMounted, setIsMounted] = useState(false);

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
          {openFiles.map((file) => {
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
                  {getFileIcon(file.name)}
                </div>

                {/* File title */}
                <span className="truncate">{file.name}</span>

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
          <div className="flex items-center gap-0.5 px-2 shrink-0 text-[#8C90A0]">
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
          </div>
        )}
      </div>

      {/* ── 2. Simplified VS Code Breadcrumbs Bar (Matches Image 2) ── */}
      {activeFile && (
        <div className="flex h-[22px] shrink-0 items-center gap-1 border-b border-[#252526] bg-[#1E1E1E] px-4 text-[12px] text-[#A0A0A0] font-sans overflow-x-auto scrollbar-none">
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
      )}

      {/* ── 3. Monaco Editor Canvas / Empty State ── */}
      <div className="relative flex-1 min-h-0 min-w-0 bg-[#1E1E1E]">
        {activeFile ? (
          isMounted ? (
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
