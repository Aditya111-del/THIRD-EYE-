import { useState, useCallback, useEffect, useRef } from "react";
import { fileModelService, type PendingDiff, type FileModel } from "@/editor/fileModels";

export interface EditorFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: string;
  cursorPosition?: { lineNumber: number; column: number };
  pendingDiff?: PendingDiff | null;
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

  const activeFile = openFiles.find((f) => f.path === activeFilePath) || openFiles[0] || null;

  // Open a file from filesystem path (supports relative and absolute paths)
  const openFile = useCallback(async (filePath: string, initialContent?: string) => {
    if (!filePath) return;
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    const name = cleanPath.split("/").pop() || cleanPath.split("\\").pop() || cleanPath;

    // If already open, switch active and update content if provided or reload from disk
    const existing = openFiles.find(
      (f) =>
        f.path === cleanPath ||
        f.path.endsWith("/" + cleanPath) ||
        cleanPath.endsWith("/" + f.path) ||
        f.name === name
    );
    if (existing) {
      if (initialContent !== undefined) {
        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === existing.path
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
                f.path === existing.path
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
        if (res.success) {
          content = res.content;
          if (res.path) {
            actualPath = res.path;
          }
        }
      } catch (err) {
        console.warn(`[useEditorWorkspace] Could not read file ${cleanPath}:`, err);
      }
    }

    const existingCanonical = openFiles.find((f) => f.path === actualPath);
    if (existingCanonical) {
      if (content) {
        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === actualPath
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

    setOpenFiles((prev) => (prev.some((f) => f.path === actualPath) ? prev : [...prev, newFile]));
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
  const updateContent = useCallback((filePath: string, newContent: string) => {
    if (!filePath) return;
    const cleanPath = filePath.trim().replace(/^['"`]|['"`]$/g, "");
    const targetName = cleanPath.split("/").pop() || cleanPath.split("\\").pop() || cleanPath;

    fileModelService.updateContent(cleanPath, newContent);
    setOpenFiles((prev) => {
      let matched = false;
      const updated = prev.map((f) => {
        const fName = f.name || f.path.split("/").pop() || f.path.split("\\").pop() || f.path;
        const isMatch =
          f.path === cleanPath ||
          f.path.endsWith("/" + cleanPath) ||
          cleanPath.endsWith("/" + f.path) ||
          fName === targetName;

        if (!isMatch) return f;
        matched = true;
        return {
          ...f,
          content: newContent,
          originalContent: newContent,
          isDirty: false,
        };
      });

      if (!matched && cleanPath) {
        const newFile: EditorFile = {
          path: cleanPath,
          name: targetName,
          content: newContent,
          originalContent: newContent,
          isDirty: false,
          language: getLanguageFromFilename(targetName),
        };
        setActiveFilePath(cleanPath);
        return [...updated, newFile];
      }

      // Activate the updated file tab in Monaco
      const matchedCanonical = prev.find(
        (f) =>
          f.path === cleanPath ||
          f.path.endsWith("/" + cleanPath) ||
          cleanPath.endsWith("/" + f.path) ||
          (f.name || f.path.split("/").pop()) === targetName
      )?.path || cleanPath;
      setActiveFilePath(matchedCanonical);

      return updated;
    });
  }, []);

  // Save file to disk through in-memory model service
  const saveFile = useCallback(async (filePath?: string) => {
    const targetPath = filePath || activeFilePath;
    const file = openFiles.find((f) => f.path === targetPath);
    if (!file) return false;

    setIsSaving(true);
    try {
      const success = await fileModelService.saveModel(targetPath);
      if (success) {
        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === targetPath
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

  // Propose AI Diff (Hard Constraint 5)
  const proposeDiff = useCallback((filePath: string, modifiedContent: string, turnId?: string) => {
    const diff = fileModelService.proposeAgentDiff(filePath, modifiedContent, turnId);
    setOpenFiles((prev) =>
      prev.map((f) => (f.path === filePath ? { ...f, pendingDiff: diff } : f))
    );
    return diff;
  }, []);

  // Accept pending diff
  const acceptDiff = useCallback((filePath: string) => {
    const success = fileModelService.acceptPendingDiff(filePath);
    if (success) {
      const model = fileModelService.getModel(filePath);
      if (model) {
        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === filePath
              ? {
                  ...f,
                  content: model.content,
                  isDirty: true,
                  pendingDiff: null,
                }
              : f
          )
        );
      }
    }
    return success;
  }, []);

  // Reject pending diff
  const rejectDiff = useCallback((filePath: string) => {
    const success = fileModelService.rejectPendingDiff(filePath);
    if (success) {
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === filePath ? { ...f, pendingDiff: null } : f))
      );
    }
    return success;
  }, []);

  // Sync with fileModelService registry for external watch events and diff changes
  useEffect(() => {
    return fileModelService.subscribeToRegistry((models) => {
      setOpenFiles((prev) =>
        prev.map((f) => {
          const m = models.find((mod) => mod.uri === f.path);
          if (!m) return f;
          return {
            ...f,
            content: m.content,
            originalContent: m.originalContent,
            isDirty: m.isDirty,
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
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === filePath);
      const filtered = prev.filter((f) => f.path !== filePath);
      if (activeFilePath === filePath) {
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
    setOpenFiles((prev) => prev.filter((f) => f.path === filePath));
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
    acceptDiff,
    rejectDiff,
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

