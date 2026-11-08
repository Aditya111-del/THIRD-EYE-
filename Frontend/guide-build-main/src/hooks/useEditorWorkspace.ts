import { useState, useCallback, useEffect, useRef } from "react";
import { fileModelService, type PendingDiff, type FileModel } from "@/editor/fileModels";

export interface EditorFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: string;
  cursorPosition?: { lineNumber: number; column: number } | undefined;
  pendingDiff?: PendingDiff | null | undefined;
  isDiffMode?: boolean | undefined;
  diffOriginal?: string | undefined;
  diffModified?: string | undefined;
  addedCount?: number | undefined;
  removedCount?: number | undefined;
}

export function isPathMatch(pathA: string, pathB: string): boolean {
  if (!pathA || !pathB) return false;
  if (pathA === pathB) return true;
  const normA = pathA.replace(/\\/g, "/").trim().replace(/^['"`]|['"`]$/g, "");
  const normB = pathB.replace(/\\/g, "/").trim().replace(/^['"`]|['"`]$/g, "");
  if (normA === normB) return true;
  if (normA.endsWith("/" + normB) || normB.endsWith("/" + normA)) return true;
  // Only compare bare filenames if one of the inputs lacks directory separators
  if (!normA.includes("/") || !normB.includes("/")) {
    const nameA = normA.split("/").pop();
    const nameB = normB.split("/").pop();
    if (nameA && nameB && nameA === nameB) return true;
  }
  return false;
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
      return "json";
    case "html":
    case "htm":
      return "html";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "md":
    case "markdown":
      return "markdown";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "bat":
    case "cmd":
      return "bat";
    case "ps1":
      return "powershell";
    case "yaml":
    case "yml":
      return "yaml";
    case "xml":
    case "svg":
      return "xml";
    case "env":
    case "example":
      return "ini";
    case "sql":
      return "sql";
    case "py":
      return "python";
    default:
      return "plaintext";
  }
}

export function useEditorWorkspace() {
  const [openFiles, setOpenFiles] = useState<EditorFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<{ lineNumber: number; column: number }>({
    lineNumber: 1,
    column: 1,
  });
  const [workspaceRoot, setWorkspaceRootState] = useState<string>(() => {
    if (typeof window !== "undefined" && (window as any).__THIRD_EYE_WORKSPACE_ROOT__) {
      return (window as any).__THIRD_EYE_WORKSPACE_ROOT__;
    }
    return "";
  });

  const workspaceRootRef = useRef("");
  workspaceRootRef.current = workspaceRoot;

  const setWorkspaceRoot = useCallback((root: string) => {
    const nextRoot = root || "";
    if (workspaceRootRef.current === nextRoot) return;
    workspaceRootRef.current = nextRoot;
    setWorkspaceRootState(nextRoot);
    if (typeof window !== "undefined") {
      (window as any).__THIRD_EYE_WORKSPACE_ROOT__ = nextRoot;
    }
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (window.electronAPI?.fs?.getWorkspaceRoot) {
      window.electronAPI.fs.getWorkspaceRoot().then((root: string) => {
        setWorkspaceRoot(root || "");
      });
    }
    if (window.electronAPI?.workspace?.onRootChanged) {
      unsub = window.electronAPI.workspace.onRootChanged((data: { root: string; name: string }) => {
        setWorkspaceRoot(data?.root || "");
      });
    }
    return () => {
      unsub?.();
    };
  }, [setWorkspaceRoot]);

  const activeFile = openFiles.find((f) => isPathMatch(f.path, activeFilePath)) || openFiles[0] || null;

  // Open a file from filesystem path (supports relative and absolute paths)
  const openFile = useCallback(async (filePath: string, initialContent?: string) => {
    if (!filePath) return;
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    const name = cleanPath.split("/").pop() || cleanPath.split("\\").pop() || cleanPath;

    // If already open, switch active and update content if provided or reload from disk
    const existing = openFiles.find((f) => isPathMatch(f.path, cleanPath));
    if (existing) {
      if (initialContent !== undefined) {
        setOpenFiles((prev) =>
          prev.map((f) =>
            isPathMatch(f.path, existing.path)
              ? { ...f, content: initialContent, originalContent: initialContent, isDirty: false }
              : f
          )
        );
        fileModelService.updateContent(existing.path, initialContent);
      } else if (!existing.isDirty && window.electronAPI?.fs?.readFile) {
        try {
          const res = await window.electronAPI.fs.readFile(cleanPath);
          if (res?.success && typeof res.content === "string") {
            setOpenFiles((prev) =>
              prev.map((f) =>
                isPathMatch(f.path, existing.path)
                  ? { ...f, content: res.content, originalContent: res.content, isDirty: false }
                  : f
              )
            );
            fileModelService.updateContent(existing.path, res.content);
          }
        } catch {
          // ignore error
        }
      }
      setActiveFilePath(existing.path);
      return;
    }

    const language = getLanguageFromFilename(name);
    let content = initialContent ?? "";
    let actualPath = cleanPath;

    if (content === "" && window.electronAPI?.fs?.readFile) {
      try {
        const res = await window.electronAPI.fs.readFile(cleanPath);
        if (res?.success) {
          content = res.content;
          if (res.path) {
            actualPath = res.path;
          }
        }
      } catch (err) {
        console.warn(`[useEditorWorkspace] Could not read file ${cleanPath}:`, err);
      }
    }

    const existingCanonical = openFiles.find((f) => isPathMatch(f.path, actualPath));
    if (existingCanonical) {
      if (content) {
        setOpenFiles((prev) =>
          prev.map((f) =>
            isPathMatch(f.path, actualPath)
              ? { ...f, content, originalContent: content, isDirty: false }
              : f
          )
        );
        fileModelService.updateContent(actualPath, content);
      }
      setActiveFilePath(actualPath);
      return;
    }

    const newFile: EditorFile = {
      path: actualPath,
      name,
      content,
      originalContent: content,
      isDirty: false,
      language,
    };

    setOpenFiles((prev) => (prev.some((f) => isPathMatch(f.path, actualPath)) ? prev : [...prev, newFile]));
    setActiveFilePath(actualPath);
  }, [openFiles]);

  // Create new file and open in editor
  const createFile = useCallback(async (filePath: string, initialContent = "") => {
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    if (window.electronAPI?.fs?.writeFile) {
      await window.electronAPI.fs.writeFile(cleanPath, initialContent);
    }
    await openFile(cleanPath, initialContent);
    return true;
  }, [openFile]);

  // Update content of file and activate in Monaco (synced with in-memory model service)
  const updateContent = useCallback((filePath: string, newContent: string, markDirty?: boolean) => {
    if (!filePath) return;
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    const targetName = cleanPath.split("/").pop() || cleanPath.split("\\").pop() || cleanPath;

    fileModelService.updateContent(cleanPath, newContent);
    setOpenFiles((prev) => {
      let matched = false;
      const updated = prev.map((f) => {
        if (!isPathMatch(f.path, cleanPath)) return f;
        matched = true;
        const isDirty = markDirty !== undefined ? markDirty : (newContent !== f.originalContent);
        return {
          ...f,
          content: newContent,
          isDirty,
        };
      });

      if (!matched && cleanPath) {
        const isDirty = markDirty ?? false;
        const newFile: EditorFile = {
          path: cleanPath,
          name: targetName,
          content: newContent,
          originalContent: newContent,
          isDirty,
          language: getLanguageFromFilename(targetName),
        };
        setActiveFilePath(cleanPath);
        return [...updated, newFile];
      }

      const matchedCanonical = prev.find((f) => isPathMatch(f.path, cleanPath))?.path || cleanPath;
      setActiveFilePath(matchedCanonical);

      return updated;
    });
  }, []);

  // Save file to disk through in-memory model service
  const saveFile = useCallback(async (filePath?: string) => {
    const targetPath = filePath || activeFilePath;
    const file = openFiles.find((f) => isPathMatch(f.path, targetPath));
    if (!file) return false;

    setIsSaving(true);
    try {
      const diskPath = file.path || targetPath;
      if (window.electronAPI?.fs?.writeFile) {
        await window.electronAPI.fs.writeFile(diskPath, file.content);
      }
      const success = await fileModelService.saveModel(diskPath);
      if (success || window.electronAPI?.fs?.writeFile) {
        setOpenFiles((prev) =>
          prev.map((f) =>
            isPathMatch(f.path, targetPath)
              ? { ...f, originalContent: f.content, isDirty: false }
              : f
          )
        );
        setIsSaving(false);
        return true;
      }
    } catch (err) {
      console.error(`[useEditorWorkspace] Failed to save file ${targetPath}:`, err);
    }
    setIsSaving(false);
    return false;
  }, [activeFilePath, openFiles]);

  // Open file in Monaco Diff Tab mode
  const openDiffTab = useCallback(async (
    filePath: string,
    originalContent?: string,
    modifiedContent?: string,
    addedCount?: number,
    removedCount?: number
  ) => {
    if (!filePath) return;
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    const name = cleanPath.split("/").pop() || cleanPath.split("\\").pop() || cleanPath;
    const language = getLanguageFromFilename(name);

    let orig = originalContent;
    let mod = modifiedContent;

    if (orig === undefined) {
      const existing = openFiles.find((f) => isPathMatch(f.path, cleanPath));
      if (existing) {
        orig = existing.originalContent || existing.content;
      } else if (window.electronAPI?.fs?.readFile) {
        try {
          const res = await window.electronAPI.fs.readFile(cleanPath);
          if (res?.success && typeof res.content === "string") {
            orig = res.content;
          }
        } catch (err) {
          console.warn("[useEditorWorkspace] Could not read original content:", err);
        }
      }
    }
    if (orig === undefined) orig = "";
    if (mod === undefined) mod = orig;

    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => isPathMatch(f.path, cleanPath));
      if (idx !== -1) {
        const existing = prev[idx]!;
        const updated = [...prev];
        updated[idx] = {
          ...existing,
          isDiffMode: true,
          diffOriginal: orig,
          diffModified: mod,
          content: mod ?? existing.content,
          originalContent: orig ?? existing.originalContent,
          addedCount: addedCount ?? existing.addedCount,
          removedCount: removedCount ?? existing.removedCount,
        };
        setActiveFilePath(existing.path);
        return updated;
      } else {
        const newFile: EditorFile = {
          path: cleanPath,
          name,
          content: mod,
          originalContent: orig,
          isDirty: false,
          language,
          isDiffMode: true,
          diffOriginal: orig,
          diffModified: mod,
          addedCount,
          removedCount,
        };
        setActiveFilePath(cleanPath);
        return [...prev, newFile];
      }
    });
  }, [openFiles]);

  // Exit Diff Mode and switch back to regular file editor
  const exitDiffMode = useCallback((filePath: string) => {
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    setOpenFiles((prev) =>
      prev.map((f) => (isPathMatch(f.path, cleanPath) ? { ...f, isDiffMode: false } : f))
    );
  }, []);

  // Propose AI Diff (Hard Constraint 5)
  const proposeDiff = useCallback((filePath: string, modifiedContent: string, turnId?: string) => {
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    const diff = fileModelService.proposeAgentDiff(cleanPath, modifiedContent, turnId);
    setOpenFiles((prev) =>
      prev.map((f) => (isPathMatch(f.path, cleanPath) ? { ...f, pendingDiff: diff } : f))
    );
    return diff;
  }, []);

  // Accept pending diff (applies content, writes to disk, exits diff mode)
  const acceptDiff = useCallback(async (filePath: string) => {
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    const file = openFiles.find((f) => isPathMatch(f.path, cleanPath));
    const contentToSave = file?.diffModified ?? file?.content ?? "";
    const targetPath = file?.path || cleanPath;

    if (window.electronAPI?.fs?.writeFile && targetPath) {
      try {
        await window.electronAPI.fs.writeFile(targetPath, contentToSave);
      } catch (err) {
        console.error(`[useEditorWorkspace] Failed to write accepted file ${targetPath}:`, err);
      }
    }

    fileModelService.acceptPendingDiff(targetPath);
    fileModelService.updateContent(targetPath, contentToSave);

    setOpenFiles((prev) =>
      prev.map((f) =>
        isPathMatch(f.path, targetPath)
          ? {
              ...f,
              content: contentToSave,
              originalContent: contentToSave,
              isDirty: false,
              isDiffMode: false,
              diffOriginal: undefined,
              diffModified: undefined,
              pendingDiff: null,
            }
          : f
      )
    );
    return true;
  }, [openFiles]);

  // Reject pending diff (reverts content, writes original to disk, exits diff mode)
  const rejectDiff = useCallback(async (filePath: string) => {
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    const file = openFiles.find((f) => isPathMatch(f.path, cleanPath));
    const revertContent = file?.diffOriginal ?? file?.originalContent ?? "";
    const targetPath = file?.path || cleanPath;

    if (window.electronAPI?.fs?.writeFile && targetPath && revertContent) {
      try {
        await window.electronAPI.fs.writeFile(targetPath, revertContent);
      } catch (err) {
        console.error(`[useEditorWorkspace] Failed to revert file ${targetPath}:`, err);
      }
    }

    fileModelService.rejectPendingDiff(targetPath);
    fileModelService.updateContent(targetPath, revertContent);

    setOpenFiles((prev) =>
      prev.map((f) =>
        isPathMatch(f.path, targetPath)
          ? {
              ...f,
              content: revertContent,
              originalContent: revertContent,
              isDirty: false,
              isDiffMode: false,
              diffOriginal: undefined,
              diffModified: undefined,
              pendingDiff: null,
            }
          : f
      )
    );
    return true;
  }, [openFiles]);

  // Batch accept all pending diffs
  const acceptAllDiffs = useCallback(async () => {
    const diffFiles = openFiles.filter((f) => f.isDiffMode || f.pendingDiff);
    for (const f of diffFiles) {
      await acceptDiff(f.path);
    }
  }, [openFiles, acceptDiff]);

  // Batch reject all pending diffs
  const rejectAllDiffs = useCallback(async () => {
    const diffFiles = openFiles.filter((f) => f.isDiffMode || f.pendingDiff);
    for (const f of diffFiles) {
      await rejectDiff(f.path);
    }
  }, [openFiles, rejectDiff]);

  // Sync with fileModelService registry for external watch events and diff changes
  useEffect(() => {
    return fileModelService.subscribeToRegistry((models) => {
      setOpenFiles((prev) =>
        prev.map((f) => {
          const m = models.find((mod) => isPathMatch(mod.uri, f.path));
          if (!m) return f;
          return {
            ...f,
            content: f.isDiffMode && f.diffModified ? f.content : m.content,
            originalContent: m.originalContent,
            isDirty: f.isDiffMode ? f.isDirty : m.isDirty,
            pendingDiff: m.pendingDiff,
          };
        })
      );
    });
  }, []);

  // Active file's pending diff
  const activePendingDiff = activeFile?.pendingDiff || null;

  // Close file tab
  const closeFile = useCallback((filePath: string) => {
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => isPathMatch(f.path, cleanPath));
      const filtered = prev.filter((f) => !isPathMatch(f.path, cleanPath));
      if (isPathMatch(activeFilePath, cleanPath)) {
        if (filtered.length > 0) {
          const nextIdx = Math.max(0, idx - 1);
          setActiveFilePath(filtered[nextIdx]?.path || "");
        } else {
          setActiveFilePath("");
        }
      }
      return filtered;
    });
  }, [activeFilePath]);

  // Close other files
  const closeOthers = useCallback((filePath: string) => {
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    setOpenFiles((prev) => prev.filter((f) => isPathMatch(f.path, cleanPath)));
    setActiveFilePath(filePath);
  }, []);

  // Close all files
  const closeAll = useCallback(() => {
    setOpenFiles([]);
    setActiveFilePath("");
  }, []);

  // Save shortcut: Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveFile]);

  return {
    openFiles,
    activeFile,
    activeFilePath,
    isSaving,
    pendingDiff: activePendingDiff,
    openFile,
    createFile,
    updateContent,
    saveFile,
    proposeDiff,
    openDiffTab,
    exitDiffMode,
    acceptDiff,
    rejectDiff,
    acceptAllDiffs,
    rejectAllDiffs,
    closeFile,
    closeOthers,
    closeAll,
    setActiveFilePath,
    workspaceRoot,
    setWorkspaceRoot,
    cursorPosition,
    setCursorPosition,
  };
}

export type EditorWorkspaceApi = ReturnType<typeof useEditorWorkspace>;
