import { useState, useCallback } from "react";
import { Search, ChevronDown, ChevronRight, Replace, RotateCw, FileText } from "lucide-react";
import type { EditorWorkspaceApi } from "@/hooks/useEditorWorkspace";
import { getFileIcon } from "@/components/editor/MonacoCodeEditor";

interface SearchMatch {
  file: string;
  fullPath: string;
  line: number;
  content: string;
}

export function SearchExplorer({ editorApi }: { editorApi: EditorWorkspaceApi }) {
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      if (window.electronAPI?.fs?.search) {
        const res = await window.electronAPI.fs.search(searchQuery, { caseSensitive });
        if (res.success) {
          setResults(res.results || []);
        }
      }
    } catch (err) {
      console.error("[SearchExplorer] error:", err);
    } finally {
      setIsSearching(false);
    }
  }, [caseSensitive]);

  const grouped = results.reduce<Record<string, SearchMatch[]>>((acc, match) => {
    const list = acc[match.file] ?? [];
    list.push(match);
    acc[match.file] = list;
    return acc;
  }, {});

  const toggleFile = (file: string) => {
    setCollapsedFiles((prev) => {
      const s = new Set(prev);
      if (s.has(file)) s.delete(file);
      else s.add(file);
      return s;
    });
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#252526] border-r border-[#3C3C3C] select-none overflow-hidden font-sans">
      {/* Header */}
      <div className="flex h-[35px] shrink-0 items-center justify-between px-4 text-[11px] font-semibold tracking-[0.1em] text-[#BBBBBB] uppercase">
        <span>Search</span>
        <button
          onClick={() => handleSearch(query)}
          className="p-1 rounded text-[#C5C5C5] hover:text-white hover:bg-[#3C3C3C] transition-colors cursor-pointer"
          title="Refresh Search"
        >
          <RotateCw className={`h-3.5 w-3.5 ${isSearching ? "animate-spin text-[#007ACC]" : ""}`} />
        </button>
      </div>

      {/* Inputs */}
      <div className="p-3 space-y-2 border-b border-[#3C3C3C]">
        <div className="relative flex items-center">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            placeholder="Search files…"
            className="w-full bg-[#3C3C3C] border border-[#555555] focus:border-[#007ACC] text-[12px] text-white rounded px-2.5 py-1.5 outline-none font-mono placeholder:text-[#808080]"
          />
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`absolute right-2 px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
              caseSensitive ? "bg-[#007ACC] text-white" : "text-[#888888] hover:text-white"
            }`}
            title="Match Case"
          >
            Aa
          </button>
        </div>

        {showReplace && (
          <div className="flex items-center">
            <input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace…"
              className="w-full bg-[#3C3C3C] border border-[#555555] focus:border-[#007ACC] text-[12px] text-white rounded px-2.5 py-1.5 outline-none font-mono placeholder:text-[#808080]"
            />
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-[#808080] pt-1">
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="flex items-center gap-1 hover:text-white cursor-pointer transition-colors"
          >
            <Replace className="h-3 w-3" />
            <span>{showReplace ? "Hide Replace" : "Toggle Replace"}</span>
          </button>
          <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#424242 transparent" }}>
        {Object.entries(grouped).length === 0 ? (
          <div className="p-6 text-center text-[12px] text-[#6A6A6A]">
            {query.trim() ? "No results found." : "Type a query above to search across the workspace."}
          </div>
        ) : (
          Object.entries(grouped).map(([filePath, matches]) => {
            const fileName = filePath.split("/").pop() || filePath;
            const isCollapsed = collapsedFiles.has(filePath);

            return (
              <div key={filePath} className="border-b border-[#2A2A2A]">
                <div
                  onClick={() => toggleFile(filePath)}
                  className="flex items-center gap-1.5 px-3 py-1 hover:bg-[#2A2D2E] cursor-pointer text-[12px] text-[#CCCCCC]"
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                  <span className="shrink-0">{getFileIcon(fileName)}</span>
                  <span className="truncate font-sans font-medium">{fileName}</span>
                  <span className="ml-auto text-[10px] text-[#808080] bg-[#333333] px-1.5 py-0.2 rounded-full">
                    {matches.length}
                  </span>
                </div>

                {!isCollapsed && (
                  <div className="pl-6 pr-2 py-0.5 space-y-0.5">
                    {matches.map((m, idx) => (
                      <div
                        key={idx}
                        onClick={() => editorApi.openFile(m.fullPath)}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-[#094771] hover:text-white rounded cursor-pointer text-[11px] font-mono text-[#A0A0A0] transition-colors truncate"
                        title={m.content}
                      >
                        <span className="text-[#007ACC] shrink-0">{m.line}:</span>
                        <span className="truncate text-white">{m.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
