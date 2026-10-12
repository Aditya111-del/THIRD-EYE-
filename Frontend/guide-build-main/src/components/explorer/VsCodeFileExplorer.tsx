import { useState, useEffect, useCallback, useRef, type ReactElement } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  RotateCw,
  RotateCcw,
  ChevronsDownUp,
  Trash2,
  FolderOpen,
  MoreHorizontal,
  Terminal,
  X,
  Package,
  Play,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorWorkspaceApi } from "@/hooks/useEditorWorkspace";
import type { TerminalApi } from "@/hooks/useTerminalSession";
import { getFileIcon, getFolderIcon } from "@/components/editor/MonacoCodeEditor";

interface FileEntry {
  name: string;
  path: string;       // always absolute (from Electron)
  relativePath: string;
  isDirectory: boolean;
  extension: string;
  children?: FileEntry[];
  childrenLoaded?: boolean;
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-7.57.95.95-7.18 8.39z" />
    </svg>
  );
}

// Hidden entries to skip in the tree (keep VCS and internal caches hidden; node_modules is controlled by showNodeModules)
const HIDDEN = new Set([
  '.git', '.output', '.wrangler', '.vite',
  '.next', 'dist', 'build', '.cache', '__pycache__',
]);

export function VsCodeFileExplorer({
  editorApi,
  terminalApi,
  onOpenFolder,
  onCloneRepository,
  onOpenDocs,
}: {
  editorApi: EditorWorkspaceApi;
  terminalApi?: TerminalApi;
  onOpenFolder?: () => void;
  onCloneRepository?: () => void;
  onOpenDocs?: () => void;
}) {
  const editorApiRef = useRef(editorApi);
  editorApiRef.current = editorApi;

  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [workspaceName, setWorkspaceName] = useState("THIRD_EYE");
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [noFolderSectionOpen, setNoFolderSectionOpen] = useState(true);
  const [openedEditorsOpen, setOpenedEditorsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [showNodeModules, setShowNodeModules] = useState(true);
  const [nodeModulesOnDisk, setNodeModulesOnDisk] = useState<boolean>(true);
  const [pkgData, setPkgData] = useState<{
    name?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null>(null);
  const [hasBun, setHasBun] = useState(false);
  const [nodeModulesCount, setNodeModulesCount] = useState<number | null>(null);

  // Create / rename state
  const [creating, setCreating] = useState<{ parentPath: string; type: "file" | "folder" } | null>(null);
  const [createName, setCreateName] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);

  const [renaming, setRenaming] = useState<{ entry: FileEntry } | null>(null);
  const [renameName, setRenameName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus input when creating or renaming
  useEffect(() => {
    if (creating && createInputRef.current) {
      createInputRef.current.focus();
      createInputRef.current.select();
    }
  }, [creating]);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  // ── Verify node_modules directly on disk ──────────────────────────────────
  const verifyNodeModulesOnDisk = useCallback(async () => {
    if (!window.electronAPI?.fs?.readDirectory) return;
    try {
      const nmRes = await window.electronAPI.fs.readDirectory("node_modules");
      if (nmRes?.success && Array.isArray(nmRes.entries)) {
        setNodeModulesOnDisk(true);
        setNodeModulesCount(nmRes.entries.length);
      } else {
        setNodeModulesOnDisk(false);
        setNodeModulesCount(null);
      }
    } catch {
      setNodeModulesOnDisk(false);
      setNodeModulesCount(null);
    }
  }, []);

  // ── Read directory via Electron fs IPC ────────────────────────────────────
  const readDir = useCallback(async (absPath: string): Promise<FileEntry[]> => {
    if (!window.electronAPI?.fs?.readDirectory) return [];
    try {
      const res = await window.electronAPI.fs.readDirectory(absPath);
      if (!res.success) {
        console.error("[Explorer] readDirectory failed:", res.error);
        return [];
      }
      const rawEntries = (res.entries as any[]) || [];
      if (!absPath || absPath === "") {
        const hasNM = rawEntries.some((e) => e.name === "node_modules");
        if (hasNM) {
          setNodeModulesOnDisk(true);
        }
      }
      return rawEntries
        .filter((e) => {
          if (HIDDEN.has(e.name)) return false;
          if (!showNodeModules && e.name === "node_modules") return false;
          return true;
        })
        .map((e) => ({
          name: e.name,
          path: e.path,
          relativePath: e.relativePath,
          isDirectory: e.isDirectory,
          extension: e.extension,
        }));
    } catch (err) {
      console.error("[Explorer] readDir error:", err);
      return [];
    }
  }, [showNodeModules]);

  function attachChildren(nodes: FileEntry[], targetPath: string, children: FileEntry[]): FileEntry[] {
    return nodes.map((n) => {
      if (n.path === targetPath) return { ...n, children, childrenLoaded: true };
      if (n.children) return { ...n, children: attachChildren(n.children, targetPath, children) };
      return n;
    });
  }

  // ── Refresh the full tree while preserving expanded folders ───────────────
  const refreshTree = useCallback(
    async (overrideExpanded?: Set<string>) => {
      if (!window.electronAPI?.fs?.readDirectory) return;
      setIsLoading(true);
      try {
        const activeExpanded = overrideExpanded || expandedSet;
        const rootNodes = await readDir("");

        const populate = async (nodes: FileEntry[]): Promise<FileEntry[]> => {
          return Promise.all(
            nodes.map(async (n) => {
              if (n.isDirectory && activeExpanded.has(n.path)) {
                const rawChildren = await readDir(n.path);
                const populatedChildren = await populate(rawChildren);
                return { ...n, children: populatedChildren, childrenLoaded: true };
              }
              return n;
            })
          );
        };

        const fullTree = await populate(rootNodes);
        setRootEntries(fullTree);
      } catch (err) {
        console.error("[Explorer] refresh error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [expandedSet, readDir]
  );

  // ── Initial load & root directory detection ──────────────────────────────
  const loadRoot = useCallback(async () => {
    refreshTree();
    verifyNodeModulesOnDisk();
  }, [refreshTree, verifyNodeModulesOnDisk]);

  useEffect(() => {
    if (window.electronAPI?.fs?.getWorkspaceRoot) {
      window.electronAPI.fs.getWorkspaceRoot().then((root) => {
        if (root) {
          const parts = root.replace(/\\/g, "/").split("/").filter(Boolean);
          setWorkspaceName(parts[parts.length - 1] || "THIRD_EYE");
          if (editorApiRef.current?.setWorkspaceRoot) {
            editorApiRef.current.setWorkspaceRoot(root);
          }
        }
      });
    }
    loadRoot();
  }, [loadRoot]);

  // Reload tree when showNodeModules toggle changes
  useEffect(() => {
    refreshTree();
  }, [showNodeModules]);

  // Inspect project dependencies & package metadata
  useEffect(() => {
    if (!window.electronAPI?.fs?.readFile) return;
    window.electronAPI.fs.readFile("package.json").then((res: any) => {
      if (res?.success && res.content) {
        try {
          const parsed = JSON.parse(res.content);
          setPkgData(parsed);
        } catch {
          setPkgData(null);
        }
      } else {
        setPkgData(null);
      }
    }).catch(() => setPkgData(null));

    // Default to npm since bun binary is not installed on this system
    setHasBun(false);

    // Verify node_modules folder presence and package count directly on disk
    verifyNodeModulesOnDisk();
  }, [workspaceName, verifyNodeModulesOnDisk]);

  // Real-time synchronization with filesystem events
  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (window.electronAPI?.fs?.onWatchEvent) {
      unsub = window.electronAPI.fs.onWatchEvent(() => {
        refreshTree();
      });
    }
    return () => {
      unsub?.();
    };
  }, [refreshTree]);

  // Real-time synchronization when a project is opened
  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (window.electronAPI?.workspace?.onRootChanged) {
      unsub = window.electronAPI.workspace.onRootChanged((data: { root: string; name: string }) => {
        if (data?.root) {
          setWorkspaceName(data.name || "THIRD_EYE");
          setExpandedSet(new Set());
          if (editorApiRef.current?.setWorkspaceRoot) {
            editorApiRef.current.setWorkspaceRoot(data.root);
          }
          refreshTree();
          const candidate = `${data.root}/package.json`;
          if (window.electronAPI?.fs?.readFile) {
            window.electronAPI.fs.readFile(candidate).then((fileRes: any) => {
              if (fileRes?.success) {
                editorApiRef.current?.openFile(candidate, fileRes.content);
              }
            }).catch(() => {});
          }
        }
      });
    }
    return () => {
      unsub?.();
    };
  }, [refreshTree]);

  // ── Toggle dir expand / lazy-load children ────────────────────────────────
  const toggleDir = useCallback(
    async (entry: FileEntry) => {
      const isExpanded = expandedSet.has(entry.path);
      const nextExpanded = new Set(expandedSet);

      if (isExpanded) {
        nextExpanded.delete(entry.path);
        setExpandedSet(nextExpanded);
      } else {
        nextExpanded.add(entry.path);
        setExpandedSet(nextExpanded);
        if (!entry.childrenLoaded) {
          const children = await readDir(entry.path);
          setRootEntries((prev) => attachChildren(prev, entry.path, children));
        }
      }
    },
    [expandedSet, readDir]
  );

  // ── Native Open Folder dialog ─────────────────────────────────────────────
  const openFolder = useCallback(async () => {
    if (onOpenFolder) {
      onOpenFolder();
      return;
    }
    const opener = window.electronAPI?.workspace?.openFolder || window.electronAPI?.dialog?.openFolder;
    if (opener) {
      const res = await opener();
      if (res?.success && res.folderPath) {
        const parts = res.folderPath.replace(/\\/g, "/").split("/").filter(Boolean);
        setWorkspaceName(parts[parts.length - 1] || "THIRD_EYE");
        setExpandedSet(new Set());
        if (editorApi?.setWorkspaceRoot) {
          editorApi.setWorkspaceRoot(res.folderPath);
        }
        if (terminalApi) {
          terminalApi.cdToDirectory(res.folderPath);
        }
        refreshTree();

        // Auto-open package.json or README.md so the editor center stage is populated with project files
        const candidate = `${res.folderPath}/package.json`;
        if (window.electronAPI?.fs?.readFile) {
          window.electronAPI.fs.readFile(candidate).then((fileRes: any) => {
            if (fileRes?.success) {
              editorApi.openFile(candidate, fileRes.content);
            }
          }).catch(() => {});
        }
      }
    }
  }, [editorApi, refreshTree, terminalApi]);

  // ── Reset to default THIRD_EYE workspace ─────────────────────────────────
  const resetToDefaultWorkspace = useCallback(async () => {
    if (window.electronAPI?.workspace?.resetToDefault) {
      await window.electronAPI.workspace.resetToDefault();
    } else if (window.electronAPI?.workspace?.openPath) {
      await window.electronAPI.workspace.openPath("/Users/adityasalgotra/Downloads/THIRD_EYE");
    }
    setWorkspaceName("THIRD_EYE");
    setExpandedSet(new Set());
    if (editorApi?.setWorkspaceRoot) {
      editorApi.setWorkspaceRoot("/Users/adityasalgotra/Downloads/THIRD_EYE");
    }
    if (terminalApi) {
      terminalApi.cdToDirectory("/Users/adityasalgotra/Downloads/THIRD_EYE");
    }
    refreshTree();
  }, [editorApi, refreshTree, terminalApi]);

  // ── File/Folder Creation ──────────────────────────────────────────────────
  const confirmCreate = useCallback(async () => {
    if (!creating || !createName.trim()) {
      setCreating(null);
      return;
    }

    const { parentPath, type } = creating;
    const name = createName.trim();
    const targetPath = parentPath ? `${parentPath}/${name}` : name;

    try {
      if (type === "file") {
        if (window.electronAPI?.fs?.writeFile) {
          await window.electronAPI.fs.writeFile(targetPath, "");
        }
        await editorApi.openFile(targetPath);
      } else {
        if (window.electronAPI?.fs?.createDirectory) {
          await window.electronAPI.fs.createDirectory(targetPath);
        }
      }
    } catch (err) {
      console.error("[Explorer] create error:", err);
    } finally {
      setCreating(null);
      setCreateName("");
      refreshTree();
    }
  }, [creating, createName, editorApi, refreshTree]);

  // ── Delete File/Folder ────────────────────────────────────────────────────
  const deleteEntry = useCallback(
    async (e: React.MouseEvent, entry: FileEntry) => {
      e.stopPropagation();
      const confirmed = window.confirm(`Are you sure you want to delete '${entry.name}'?`);
      if (!confirmed) return;

      try {
        if (window.electronAPI?.fs?.deletePath) {
          await window.electronAPI.fs.deletePath(entry.path);
        }
        if (!entry.isDirectory) {
          editorApi.closeFile(entry.path);
        }
      } catch (err) {
        console.error("[Explorer] delete error:", err);
      } finally {
        refreshTree();
      }
    },
    [editorApi, refreshTree]
  );

  // ── Rename File/Folder ────────────────────────────────────────────────────
  const confirmRename = useCallback(async () => {
    if (!renaming || !renameName.trim() || renameName === renaming.entry.name) {
      setRenaming(null);
      return;
    }

    const oldAbs = renaming.entry.path;
    const parts = oldAbs.replace(/\\/g, "/").split("/");
    parts[parts.length - 1] = renameName.trim();
    const newAbs = parts.join("/");

    await window.electronAPI?.fs?.renamePath(oldAbs, newAbs);
    setRenaming(null);
    refreshTree();
  }, [renaming, renameName, refreshTree]);

  // ── Render tree node with authentic indent guide lines ────────────────────
  function renderNode(entry: FileEntry, depth: number): ReactElement {
    const isOpen = expandedSet.has(entry.path);
    const isActive = editorApi.activeFilePath === entry.path;
    const isRenaming = renaming?.entry.path === entry.path;

    if (entry.isDirectory) {
      return (
        <div key={entry.path} className="relative">
          {/* Guide indent lines for parent levels */}
          {Array.from({ length: depth }).map((_, i) => (
            <span
              key={i}
              className="absolute top-0 bottom-0 w-px bg-[#26262A] pointer-events-none"
              style={{ left: `${i * 12 + 13}px` }}
            />
          ))}

          <div
            className="group relative flex h-[22px] items-center justify-between hover:bg-[#202022] cursor-pointer select-none"
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            onClick={() => toggleDir(entry)}
            title={entry.path}
          >
            <div className="flex items-center gap-[4px] min-w-0 truncate text-[#CCCCCC] flex-1">
              <span className="shrink-0 w-[14px] flex items-center justify-center text-[#888888]">
                {isOpen ? (
                  <ChevronDown className="h-[12px] w-[12px] text-[#C5C5C5]" />
                ) : (
                  <ChevronRight className="h-[12px] w-[12px] text-[#858585]" />
                )}
              </span>

              {/* Tan folder icon matching Screenshot 1 & 3 */}
              <div className="shrink-0 flex items-center justify-center">
                {getFolderIcon(entry.name, isOpen)}
              </div>

              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={confirmRename}
                  className="flex-1 bg-[#1E1E1E] border border-[#007ACC] px-1 py-px text-[12px] text-white outline-none rounded-sm font-mono mx-1"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className={cn(
                    "truncate text-[13px] leading-none font-sans tracking-normal",
                    entry.name === "node_modules" ? "text-[#9E9EA4]" : "text-[#CCCCCC]"
                  )}>
                    {entry.name}
                  </span>
                  {entry.name === "node_modules" && (
                    <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-[#0284C7]/20 text-[#38BDF8] font-mono shrink-0">
                      modules{nodeModulesCount !== null ? ` (${nodeModulesCount})` : ""}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Folder hover actions */}
            <div className="hidden group-hover:flex items-center gap-px shrink-0 pr-1 text-[#8A8A8E]">
              <button
                title="New File…"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!expandedSet.has(entry.path)) {
                    setExpandedSet((prev) => new Set(prev).add(entry.path));
                    if (!entry.childrenLoaded) {
                      const children = await readDir(entry.path);
                      setRootEntries((prev) => attachChildren(prev, entry.path, children));
                    }
                  }
                  setCreating({ parentPath: entry.path, type: "file" });
                  setCreateName("");
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white cursor-pointer"
              >
                <FilePlus className="h-[13px] w-[13px]" />
              </button>
              <button
                title="New Folder…"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!expandedSet.has(entry.path)) {
                    setExpandedSet((prev) => new Set(prev).add(entry.path));
                    if (!entry.childrenLoaded) {
                      const children = await readDir(entry.path);
                      setRootEntries((prev) => attachChildren(prev, entry.path, children));
                    }
                  }
                  setCreating({ parentPath: entry.path, type: "folder" });
                  setCreateName("");
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white cursor-pointer"
              >
                <FolderPlus className="h-[13px] w-[13px]" />
              </button>
              <button
                title="Open in Integrated Terminal"
                onClick={(e) => {
                  e.stopPropagation();
                  if (terminalApi) {
                    terminalApi.cdToDirectory(entry.path);
                  } else if (window.electronAPI?.terminal?.cd) {
                    window.electronAPI.terminal.cd({ dir: entry.path });
                  }
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-[#007ACC] cursor-pointer"
              >
                <Terminal className="h-[13px] w-[13px]" />
              </button>
              <button
                title="Set as Project Workspace"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.electronAPI?.workspace?.openPath) {
                    await window.electronAPI.workspace.openPath(entry.path);
                  }
                  if (terminalApi) {
                    terminalApi.cdToDirectory(entry.path);
                  }
                  if (editorApi?.setWorkspaceRoot) {
                    editorApi.setWorkspaceRoot(entry.path);
                  }
                  setWorkspaceName(entry.name);
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-[#FF6B00] cursor-pointer"
              >
                <FolderOpen className="h-[13px] w-[13px]" />
              </button>
              <button
                title="Rename…"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming({ entry });
                  setRenameName(entry.name);
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white cursor-pointer"
              >
                <PencilIcon />
              </button>
              <button
                title="Delete…"
                onClick={(e) => deleteEntry(e, entry)}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-[#F87171] cursor-pointer"
              >
                <Trash2 className="h-[13px] w-[13px]" />
              </button>
            </div>
          </div>

          {/* Inline creation row inside this folder */}
          {creating?.parentPath === entry.path && (
            <div className="flex items-center gap-1.5 px-2 py-[2px] bg-[#1E1E22]" style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}>
              {creating.type === "file" ? (
                <FilePlus className="h-[13px] w-[13px] shrink-0 text-[#C5C5C5]" />
              ) : (
                <FolderPlus className="h-[13px] w-[13px] shrink-0 text-[#C5C5C5]" />
              )}
              <input
                ref={createInputRef}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") confirmCreate();
                  if (e.key === "Escape") setCreating(null);
                }}
                onBlur={confirmCreate}
                placeholder={creating.type === "file" ? "filename.ext" : "folder-name"}
                className="flex-1 bg-[#121214] border border-[#007ACC] px-1 py-px text-[12px] text-white outline-none rounded-sm font-mono"
              />
            </div>
          )}

          {isOpen && (
            <div>
              {entry.children && entry.children.length > 0 ? (
                entry.children.map((c) => renderNode(c, depth + 1))
              ) : entry.childrenLoaded ? (
                <div className="text-[11px] text-[#606065] italic py-px" style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}>
                  Empty folder
                </div>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    // File node
    return (
      <div key={entry.path} className="relative">
        {/* Guide indent lines for parent levels */}
        {Array.from({ length: depth }).map((_, i) => (
          <span
            key={i}
            className="absolute top-0 bottom-0 w-px bg-[#26262A] pointer-events-none"
            style={{ left: `${i * 12 + 13}px` }}
          />
        ))}

        <div
          className={cn(
            "group relative flex h-[22px] items-center justify-between cursor-pointer select-none transition-colors",
            isActive
              ? "bg-[#005fb8] text-white font-normal"
              : "text-[#CCCCCC] hover:bg-[#202022]"
          )}
          style={{ paddingLeft: `${depth * 12 + 18}px` }}
          onClick={() => !isRenaming && editorApi.openFile(entry.path)}
          title={entry.path}
        >
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") setRenaming(null);
              }}
              onBlur={confirmRename}
              className="flex-1 bg-[#121214] border border-[#007ACC] px-1 py-px text-[12px] text-white outline-none rounded-sm font-mono mx-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div className="flex items-center gap-[6px] min-w-0 truncate flex-1">
                <div className="shrink-0 w-[16px] h-[16px] flex items-center justify-center">
                  {getFileIcon(entry.name)}
                </div>
                <span className={cn(
                  "truncate text-[13px] leading-none font-sans",
                  isActive ? "text-white font-medium" : "text-[#D0D0D0]"
                )}>
                  {entry.name}
                </span>
              </div>
              <div className="hidden group-hover:flex items-center gap-px shrink-0 pr-1 text-[#8A8A8E]">
                <button
                  title="Rename…"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenaming({ entry });
                    setRenameName(entry.name);
                  }}
                  className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white cursor-pointer"
                >
                  <PencilIcon />
                </button>
                <button
                  title="Delete…"
                  onClick={(e) => deleteEntry(e, entry)}
                  className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-[#F87171] cursor-pointer"
                >
                  <Trash2 className="h-[13px] w-[13px]" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#181818] border-r border-[#262626] select-none overflow-hidden font-sans">
      {/* ── Explorer Header (VS Code style: EXPLORER ... ) ── */}
      <div className="flex h-[35px] shrink-0 items-center justify-between px-3 text-[11px] font-semibold tracking-[0.1em] text-[#BBBBBB] uppercase select-none">
        <span>Explorer</span>
        <div className="flex items-center gap-0.5">
          {editorApi.workspaceRoot && (
            <>
              <button
                onClick={() => {
                  setWorkspaceOpen(true);
                  setCreating({ parentPath: "", type: "file" });
                  setCreateName("");
                }}
                className="p-1 rounded text-[#8E8E93] hover:text-white hover:bg-[#2A2A2E] transition-colors cursor-pointer"
                title="New File…"
              >
                <FilePlus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setWorkspaceOpen(true);
                  setCreating({ parentPath: "", type: "folder" });
                  setCreateName("");
                }}
                className="p-1 rounded text-[#8E8E93] hover:text-white hover:bg-[#2A2A2E] transition-colors cursor-pointer"
                title="New Folder…"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={loadRoot}
                className="p-1 rounded text-[#8E8E93] hover:text-white hover:bg-[#2A2A2E] transition-colors cursor-pointer"
                title="Refresh Explorer"
              >
                <RotateCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-[#007ACC]")} />
              </button>
              <button
                onClick={() => setExpandedSet(new Set())}
                className="p-1 rounded text-[#8E8E93] hover:text-white hover:bg-[#2A2A2E] transition-colors cursor-pointer"
                title="Collapse Folders"
              >
                <ChevronsDownUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowNodeModules((v) => !v)}
                className={cn(
                  "p-1 rounded transition-colors cursor-pointer",
                  showNodeModules
                    ? "text-[#38BDF8] bg-[#38BDF8]/15 hover:bg-[#38BDF8]/25"
                    : "text-[#8E8E93] hover:text-white hover:bg-[#2A2A2E]"
                )}
                title={showNodeModules ? "node_modules is visible (Click to hide)" : "node_modules is hidden (Click to show)"}
              >
                <Package className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            onClick={openFolder}
            className="p-1 rounded text-[#8E8E93] hover:text-white hover:bg-[#2A2A2E] transition-colors cursor-pointer"
            title="More Actions / Open Folder…"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!editorApi.workspaceRoot ? (
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col justify-between"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#333333 transparent" }}
        >
          <div>
            {/* Section: v No Folder Opened */}
            <div className="border-b border-[#222225]">
              <div
                onClick={() => setNoFolderSectionOpen((v) => !v)}
                className="flex h-[24px] items-center gap-1.5 px-2 text-[11px] font-bold text-[#CCCCCC] hover:text-white hover:bg-[#202022] cursor-pointer select-none"
              >
                <span className="shrink-0 w-[14px] flex justify-center text-[#808080]">
                  {noFolderSectionOpen ? (
                    <ChevronDown className="h-[12px] w-[12px]" />
                  ) : (
                    <ChevronRight className="h-[12px] w-[12px]" />
                  )}
                </span>
                <span className="uppercase text-[11px] font-bold tracking-wide">No Folder Opened</span>
              </div>

              {noFolderSectionOpen && (
                <div className="px-5 py-3.5 flex flex-col gap-3 text-[12.5px] text-[#A6A6A6]">
                  <div>You have not yet opened a folder.</div>
                  <button
                    onClick={openFolder}
                    className="w-full py-1.5 px-3 bg-[#0078D4] hover:bg-[#006CBE] text-white text-[12.5px] font-medium rounded-[3px] transition-colors cursor-pointer shadow-sm active:scale-[0.99] flex items-center justify-center"
                  >
                    Open Folder
                  </button>

                  <div className="mt-2">You can clone a repository locally.</div>
                  <button
                    onClick={() => {
                      if (onCloneRepository) {
                        onCloneRepository();
                      } else {
                        openFolder();
                      }
                    }}
                    className="w-full py-1.5 px-3 bg-[#0078D4] hover:bg-[#006CBE] text-white text-[12.5px] font-medium rounded-[3px] transition-colors cursor-pointer shadow-sm active:scale-[0.99] flex items-center justify-center"
                  >
                    Clone Repository
                  </button>

                  <div className="text-[11.5px] text-[#808085] leading-relaxed mt-1.5">
                    To learn more about how to use Git and source control in the IDE{" "}
                    <span
                      onClick={() => {
                        if (onOpenDocs) {
                          onOpenDocs();
                        } else {
                          window.open("https://code.visualstudio.com/docs/sourcecontrol/overview", "_blank");
                        }
                      }}
                      className="text-[#0078D4] hover:text-[#2B88D8] hover:underline cursor-pointer"
                    >
                      read our docs
                    </span>.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Accordions: Outline and Timeline */}
          <div className="border-t border-[#222225] mt-auto">
            {/* OUTLINE */}
            <div
              onClick={() => setOutlineOpen((v) => !v)}
              className="flex h-[22px] items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wider text-[#8A8A8E] hover:text-white hover:bg-[#202022] cursor-pointer select-none border-b border-[#222225]"
            >
              <span className="shrink-0 w-[14px] flex justify-center text-[#808080]">
                {outlineOpen ? <ChevronDown className="h-[12px] w-[12px]" /> : <ChevronRight className="h-[12px] w-[12px]" />}
              </span>
              <span className="uppercase text-[10.5px]">Outline</span>
            </div>

            {/* TIMELINE */}
            <div
              onClick={() => setTimelineOpen((v) => !v)}
              className="flex h-[22px] items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wider text-[#8A8A8E] hover:text-white hover:bg-[#202022] cursor-pointer select-none"
            >
              <span className="shrink-0 w-[14px] flex justify-center text-[#808080]">
                {timelineOpen ? <ChevronDown className="h-[12px] w-[12px]" /> : <ChevronRight className="h-[12px] w-[12px]" />}
              </span>
              <span className="uppercase text-[10.5px]">Timeline</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#333333 transparent" }}
        >
        {/* ── 1. OPENED EDITORS Section (Screenshot 2) ── */}
        <div className="border-b border-[#222225]">
          <div
            onClick={() => setOpenedEditorsOpen((v) => !v)}
            className="flex h-[22px] items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wider text-[#A0A0A0] hover:text-white hover:bg-[#202022] cursor-pointer select-none"
          >
            <span className="shrink-0 w-[14px] flex justify-center text-[#808080]">
              {openedEditorsOpen ? <ChevronDown className="h-[12px] w-[12px]" /> : <ChevronRight className="h-[12px] w-[12px]" />}
            </span>
            <span className="uppercase text-[10.5px]">Opened Editors</span>
            {editorApi.openFiles.length > 0 && (
              <span className="text-[10px] text-[#6E6E73] font-mono ml-auto mr-1">
                {editorApi.openFiles.length}
              </span>
            )}
          </div>

          {openedEditorsOpen && (
            <div className="py-0.5">
              {editorApi.openFiles.length > 0 ? (
                editorApi.openFiles.map((file) => {
                  const isActive = editorApi.activeFilePath === file.path;
                  return (
                    <div
                      key={file.path}
                      onClick={() => editorApi.setActiveFilePath(file.path)}
                      className={cn(
                        "group flex h-[22px] items-center justify-between px-5 text-[12px] cursor-pointer transition-colors",
                        isActive ? "bg-[#005fb8] text-white" : "text-[#CCCCCC] hover:bg-[#202022]"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                          {getFileIcon(file.name)}
                        </div>
                        <span className="truncate">{file.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          editorApi.closeFile(file.path);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#333333] text-[#A0A0A0] hover:text-white transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="px-6 py-1 text-[11px] text-[#606065] italic">No open editors</div>
              )}
            </div>
          )}
        </div>

        {/* ── 2. Workspace Folder Section (v THIRD_EYE matching Screenshot 1 & 3) ── */}
        <div className="mt-px">
          <div
            onClick={() => setWorkspaceOpen((v) => !v)}
            className="group/root flex h-[22px] items-center justify-between px-2 text-[11px] font-bold text-[#CCCCCC] hover:bg-[#202022] cursor-pointer select-none"
          >
            <div className="flex items-center gap-[3px] min-w-0 truncate text-[#CCCCCC]">
              <span className="shrink-0 w-[14px] flex justify-center text-[#808080]">
                {workspaceOpen ? (
                  <ChevronDown className="h-[13px] w-[13px]" />
                ) : (
                  <ChevronRight className="h-[13px] w-[13px]" />
                )}
              </span>
              <span className="truncate text-[11.5px] font-bold uppercase tracking-[0.06em] text-white">
                {workspaceName}
              </span>
            </div>

            {/* Actions on root folder */}
            <div className="hidden group-hover/root:flex items-center gap-0.5 text-[#8E8E93] shrink-0 pr-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setWorkspaceOpen(true);
                  setCreating({ parentPath: "", type: "file" });
                  setCreateName("");
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white transition-colors cursor-pointer"
                title="New File…"
              >
                <FilePlus className="h-[13px] w-[13px]" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setWorkspaceOpen(true);
                  setCreating({ parentPath: "", type: "folder" });
                  setCreateName("");
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white transition-colors cursor-pointer"
                title="New Folder…"
              >
                <FolderPlus className="h-[13px] w-[13px]" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadRoot();
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white transition-colors cursor-pointer"
                title="Refresh Explorer"
              >
                <RotateCw className={cn("h-[13px] w-[13px]", isLoading && "animate-spin text-[#007ACC]")} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedSet(new Set());
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white transition-colors cursor-pointer"
                title="Collapse Folders"
              >
                <ChevronsDownUp className="h-[13px] w-[13px]" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openFolder();
                }}
                className="p-[3px] rounded hover:bg-[#2C2C30] hover:text-white transition-colors cursor-pointer"
                title="Switch Workspace Folder…"
              >
                <FolderOpen className="h-[13px] w-[13px]" />
              </button>
              {workspaceName !== "THIRD_EYE" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resetToDefaultWorkspace();
                  }}
                  className="p-[3px] rounded hover:bg-[#2C2C30] text-[#F59E0B] hover:text-amber-300 transition-colors cursor-pointer"
                  title="Switch back to default THIRD_EYE workspace"
                >
                  <RotateCcw className="h-[13px] w-[13px]" />
                </button>
              )}
            </div>
          </div>

          {/* Root-level creation input */}
          {creating?.parentPath === "" && (
            <div className="flex items-center gap-1.5 px-2 py-[2px] bg-[#1E1E22]" style={{ paddingLeft: "24px" }}>
              {creating.type === "file" ? (
                <FilePlus className="h-[13px] w-[13px] shrink-0 text-[#C5C5C5]" />
              ) : (
                <FolderPlus className="h-[13px] w-[13px] shrink-0 text-[#C5C5C5]" />
              )}
              <input
                ref={createInputRef}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") confirmCreate();
                  if (e.key === "Escape") setCreating(null);
                }}
                onBlur={confirmCreate}
                placeholder={creating.type === "file" ? "filename.ext" : "folder-name"}
                className="flex-1 bg-[#121214] border border-[#007ACC] px-1 py-px text-[12px] text-white outline-none rounded-sm font-mono"
              />
            </div>
          )}

          {/* Missing node_modules warning banner when project has package.json but no node_modules on disk */}
          {pkgData && !nodeModulesOnDisk && !isLoading && (
            <div className="mx-2 my-2 p-2.5 rounded bg-[#2D1B00] border border-[#F59E0B]/50 text-[#FCD34D] text-[11px] flex flex-col gap-1.5 shadow-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#F59E0B]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>node_modules not found in project</span>
              </div>
              <p className="text-[10.5px] text-[#D97706] leading-tight">
                Project dependencies are missing on disk. Run package install to resolve module imports and prevent build errors.
              </p>
              <button
                onClick={() => {
                  const cmd = "npm install\n";
                  if (terminalApi?.write) {
                    terminalApi.write(cmd);
                  } else if (window.electronAPI?.terminal?.write) {
                    window.electronAPI.terminal.write("s1", cmd);
                  }
                }}
                className="self-start px-2.5 py-1 rounded bg-[#F59E0B] text-black font-semibold text-[11px] hover:bg-[#FBBF24] transition-colors cursor-pointer"
              >
                Run npm install
              </button>
            </div>
          )}

          {/* File tree */}
          {workspaceOpen && (
            <div className="relative">
              {isLoading && rootEntries.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-[#6A6A6A]">
                  <RotateCw className="h-3.5 w-3.5 animate-spin text-[#007ACC]" />
                  <span>Loading…</span>
                </div>
              ) : rootEntries.length > 0 ? (
                rootEntries.map((e) => renderNode(e, 1))
              ) : (
                <div className="flex flex-col items-center justify-center px-4 py-8 gap-3 text-center">
                  <FolderOpen className="h-10 w-10 text-[#404040]" />
                  <p className="text-[12px] text-[#6A6A6A] leading-relaxed">
                    No files loaded.<br />Open a folder or create a new file above.
                  </p>
                  <button
                    onClick={openFolder}
                    className="px-3 py-1.5 text-[12px] bg-[#007ACC] hover:bg-[#0062A3] text-white rounded transition-colors cursor-pointer font-medium"
                  >
                    Open Folder
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 3. Collapsible Footer Sections (Screenshot 2) ── */}
        <div className="mt-2 border-t border-[#222225]">
          {/* OUTLINE */}
          <div
            onClick={() => setOutlineOpen((v) => !v)}
            className="flex h-[22px] items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wider text-[#8A8A8E] hover:text-white hover:bg-[#202022] cursor-pointer select-none"
          >
            <span className="shrink-0 w-[14px] flex justify-center text-[#808080]">
              {outlineOpen ? <ChevronDown className="h-[12px] w-[12px]" /> : <ChevronRight className="h-[12px] w-[12px]" />}
            </span>
            <span className="uppercase text-[10.5px]">Outline</span>
          </div>

          {/* TIMELINE */}
          <div
            onClick={() => setTimelineOpen((v) => !v)}
            className="flex h-[22px] items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wider text-[#8A8A8E] hover:text-white hover:bg-[#202022] cursor-pointer select-none"
          >
            <span className="shrink-0 w-[14px] flex justify-center text-[#808080]">
              {timelineOpen ? <ChevronDown className="h-[12px] w-[12px]" /> : <ChevronRight className="h-[12px] w-[12px]" />}
            </span>
            <span className="uppercase text-[10.5px]">Timeline</span>
          </div>

          {/* NPM SCRIPTS & DEPENDENCIES */}
          <div
            onClick={() => setScriptsOpen((v) => !v)}
            className="flex h-[22px] items-center justify-between px-2 text-[11px] font-semibold tracking-wider text-[#8A8A8E] hover:text-white hover:bg-[#202022] cursor-pointer select-none"
          >
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 w-[14px] flex justify-center text-[#808080]">
                {scriptsOpen ? <ChevronDown className="h-[12px] w-[12px]" /> : <ChevronRight className="h-[12px] w-[12px]" />}
              </span>
              <span className="uppercase text-[10.5px]">NPM Scripts & Dependencies</span>
            </div>
            {pkgData && (
              <span className="text-[9.5px] text-[#6E6E73] font-mono mr-1">
                {Object.keys(pkgData.dependencies || {}).length + Object.keys(pkgData.devDependencies || {}).length} pkgs
              </span>
            )}
          </div>

          {scriptsOpen && (
            <div className="px-2 py-1.5 bg-[#141416] border-t border-[#222225] flex flex-col gap-2.5 text-[11px]">
              {pkgData ? (
                <>
                  {/* Scripts list */}
                  {pkgData.scripts && Object.keys(pkgData.scripts).length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase font-bold text-[#6E6E73] tracking-wider mb-1 px-1">
                        Scripts
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {Object.entries(pkgData.scripts).map(([name, cmd]) => (
                          <div
                            key={name}
                            className="group flex items-center justify-between px-1.5 py-1 rounded hover:bg-[#1E1E22] text-[#CCCCCC] transition-colors"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-mono text-[#38BDF8] font-medium">{name}</span>
                              <span className="text-[10px] text-[#666666] truncate" title={cmd}>{cmd}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const runCmd = `npm run ${name}\n`;
                                if (terminalApi?.write) {
                                  terminalApi.write(runCmd);
                                } else if (window.electronAPI?.terminal?.write) {
                                  window.electronAPI.terminal.write("s1", runCmd);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[#10B981] hover:bg-[#10B981]/20 transition-all cursor-pointer"
                              title={`Run ${name}`}
                            >
                              <Play className="h-3 w-3 fill-current" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dependencies summary */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#6E6E73] tracking-wider mb-1 px-1">
                      <span>Dependencies</span>
                      <button
                        onClick={() => {
                          const installCmd = "npm install\n";
                          if (terminalApi?.write) {
                            terminalApi.write(installCmd);
                          } else if (window.electronAPI?.terminal?.write) {
                            window.electronAPI.terminal.write("s1", installCmd);
                          }
                        }}
                        className="text-[10px] text-[#38BDF8] hover:underline cursor-pointer"
                      >
                        install all
                      </button>
                    </div>
                    <div className="max-h-[140px] overflow-y-auto pr-1 flex flex-col gap-0.5 font-mono text-[10.5px]">
                      {Object.entries({ ...(pkgData.dependencies || {}), ...(pkgData.devDependencies || {}) }).map(([dep, ver]) => (
                        <div key={dep} className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-[#1E1E22] text-[#AAAAAA]">
                          <span className="truncate text-[#CCCCCC]">{dep}</span>
                          <span className="text-[#666666] shrink-0 text-[9.5px]">{ver}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-2 text-[#666666] italic text-center">
                  No package.json found in active workspace
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )}
  </div>
);
}
