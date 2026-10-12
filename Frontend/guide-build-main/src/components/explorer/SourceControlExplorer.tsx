import { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  Check,
  RotateCw,
  Plus,
  Minus,
  Undo2,
  Upload,
  Download,
  GitFork,
  ExternalLink,
  Key,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Github,
  AlertCircle,
  Loader2,
  X,
  Lock,
  Globe,
  GitCommit,
  History,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { EditorWorkspaceApi } from "@/hooks/useEditorWorkspace";
import { getFileIcon } from "@/components/editor/MonacoCodeEditor";
import { cn } from "@/lib/utils";

interface GitFileItem {
  status: string;
  path: string;
  fullPath: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
}

interface GitCommitItem {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  bio?: string | undefined;
  public_repos?: number | undefined;
}

const GITHUB_TOKEN_STORAGE_KEY = "third_eye_github_pat";

export function SourceControlExplorer({ editorApi }: { editorApi: EditorWorkspaceApi }) {
  // Git status state
  const [isRepo, setIsRepo] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [branch, setBranch] = useState("main");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const [upstream, setUpstream] = useState("");
  const [ahead, setAhead] = useState(0);
  const [behind, setBehind] = useState(0);
  const [outgoingCommits, setOutgoingCommits] = useState<GitCommitItem[]>([]);
  const [recentCommits, setRecentCommits] = useState<GitCommitItem[]>([]);
  const [allFiles, setAllFiles] = useState<GitFileItem[]>([]);
  const [stagedFiles, setStagedFiles] = useState<GitFileItem[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitFileItem[]>([]);

  // Section collapse states
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);
  const [outgoingOpen, setOutgoingOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Commit input
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // GitHub user profile state
  const [githubToken, setGithubToken] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) || "";
    }
    return "";
  });
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);

  // Modal dialog states
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [validatingToken, setValidatingToken] = useState(false);
  const [tokenError, setTokenError] = useState("");

  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneAction, setCloneAction] = useState<"clone" | "fork">("clone");
  const [isCloning, setIsCloning] = useState(false);
  const [cloneStatusMsg, setCloneStatusMsg] = useState("");

  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishName, setPublishName] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishPrivate, setPublishPrivate] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Load GitHub User profile if token exists
  const verifyGitHubToken = useCallback(async (token: string) => {
    if (!token.trim() || !window.electronAPI?.github?.getUser) {
      setGithubUser(null);
      return false;
    }
    try {
      const res = await window.electronAPI.github.getUser({ token: token.trim() });
      if (res?.success && res.user) {
        setGithubUser(res.user);
        return true;
      }
      setGithubUser(null);
      return false;
    } catch {
      setGithubUser(null);
      return false;
    }
  }, []);

  useEffect(() => {
    if (githubToken) {
      verifyGitHubToken(githubToken);
    }
  }, [githubToken, verifyGitHubToken]);

  // Load Git status
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.git?.status) {
        const res = await window.electronAPI.git.status();
        if (res.success) {
          setIsRepo(res.isRepo !== false);
          setBranch(res.branch || "main");
          setRemoteUrl(res.remoteUrl || "");
          setRepoName(res.repoName || "");
          setUpstream(res.upstream || "");
          setAhead(res.ahead || 0);
          setBehind(res.behind || 0);
          setOutgoingCommits(res.outgoingCommits || []);
          setRecentCommits(res.recentCommits || []);

          const staged = (res.stagedFiles as GitFileItem[]) || [];
          const unstaged = (res.unstagedFiles as GitFileItem[]) || [];
          const files = (res.files as GitFileItem[]) || [];

          setStagedFiles(staged);
          setUnstagedFiles(unstaged);
          setAllFiles(files);
        } else {
          setIsRepo(false);
        }
      }
    } catch (err) {
      console.error("[SourceControl] loadStatus error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const unsubFs = window.electronAPI?.fs?.onWatchEvent?.(() => loadStatus());
    const unsubRoot = window.electronAPI?.workspace?.onRootChanged?.(() => loadStatus());
    const unsubGit = window.electronAPI?.git?.onStatusChanged?.(() => loadStatus());

    window.addEventListener("focus", loadStatus);

    return () => {
      unsubFs?.();
      unsubRoot?.();
      unsubGit?.();
      window.removeEventListener("focus", loadStatus);
    };
  }, [loadStatus]);

  // Initialize Git Repository
  const handleInitRepo = async () => {
    if (isInitializing || !window.electronAPI?.git?.init) return;
    setIsInitializing(true);
    try {
      const res = await window.electronAPI.git.init();
      if (res.success) {
        await loadStatus();
      } else {
        alert(`Failed to initialize git repository: ${res.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Error initializing repository: ${err?.message || err}`);
    } finally {
      setIsInitializing(false);
    }
  };

  // Stage single file
  const handleStageFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    if (window.electronAPI?.git?.stage) {
      await window.electronAPI.git.stage(filePath);
      await loadStatus();
    }
  };

  // Stage all files
  const handleStageAll = async () => {
    if (window.electronAPI?.git?.stage) {
      await window.electronAPI.git.stage();
      await loadStatus();
    }
  };

  // Unstage single file
  const handleUnstageFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    if (window.electronAPI?.git?.unstage) {
      await window.electronAPI.git.unstage(filePath);
      await loadStatus();
    }
  };

  // Unstage all
  const handleUnstageAll = async () => {
    if (window.electronAPI?.git?.unstage) {
      await window.electronAPI.git.unstage();
      await loadStatus();
    }
  };

  // Discard single file changes
  const handleDiscardFile = async (e: React.MouseEvent, file: GitFileItem) => {
    e.stopPropagation();
    const confirmed = confirm(`Are you sure you want to discard changes in "${file.path}"?`);
    if (!confirmed) return;
    if (window.electronAPI?.git?.discard) {
      await window.electronAPI.git.discard({
        filePath: file.path,
        isUntracked: file.isUntracked,
      });
      await loadStatus();
    }
  };

  // Commit
  const handleCommit = async (shouldPush = false) => {
    if (!commitMsg.trim() || allFiles.length === 0 || committing) return;
    setCommitting(true);
    try {
      if (window.electronAPI?.git?.commit) {
        // If files are already staged, only commit staged files; otherwise stage all and commit
        const hasStaged = stagedFiles.length > 0;
        const res = await window.electronAPI.git.commit({
          message: commitMsg.trim(),
          stageAll: !hasStaged,
        });

        if (res.success) {
          setCommitMsg("");
          await loadStatus();

          if (shouldPush) {
            await handlePush();
          }
        } else {
          alert(`Commit error: ${res.error}`);
        }
      }
    } finally {
      setCommitting(false);
    }
  };

  // Push to GitHub
  const handlePush = async () => {
    if (syncing || !window.electronAPI?.git?.push) return;
    setSyncing(true);
    try {
      const res = await window.electronAPI.git.push({
        branch,
        token: githubToken || undefined,
      });
      if (res.success) {
        await loadStatus();
      } else {
        alert(`Push error: ${res.error || "Failed to push to GitHub remote"}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  // Pull from GitHub
  const handlePull = async () => {
    if (syncing || !window.electronAPI?.git?.pull) return;
    setSyncing(true);
    try {
      const res = await window.electronAPI.git.pull({
        branch,
        token: githubToken || undefined,
      });
      if (res.success) {
        await loadStatus();
      } else {
        alert(`Pull error: ${res.error || "Failed to pull from GitHub remote"}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  // Sync Changes (Pull + Push)
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      if (behind > 0 && window.electronAPI?.git?.pull) {
        await window.electronAPI.git.pull({ branch, token: githubToken || undefined });
      }
      if ((ahead > 0 || behind === 0) && window.electronAPI?.git?.push) {
        await window.electronAPI.git.push({ branch, token: githubToken || undefined });
      }
      await loadStatus();
    } catch (err: any) {
      alert(`Sync error: ${err?.message || err}`);
    } finally {
      setSyncing(false);
    }
  };

  // Fetch
  const handleFetch = async () => {
    if (syncing || !window.electronAPI?.git?.fetch) return;
    setSyncing(true);
    try {
      await window.electronAPI.git.fetch({ token: githubToken || undefined });
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  };

  // Save Token
  const handleSaveToken = async () => {
    if (!tempToken.trim()) {
      localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
      setGithubToken("");
      setGithubUser(null);
      setTokenModalOpen(false);
      return;
    }

    setValidatingToken(true);
    setTokenError("");
    try {
      const isValid = await verifyGitHubToken(tempToken.trim());
      if (isValid) {
        localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, tempToken.trim());
        setGithubToken(tempToken.trim());
        setTokenModalOpen(false);
      } else {
        setTokenError("Invalid token or insufficient permissions. Ensure 'repo' and 'read:user' scopes are selected.");
      }
    } finally {
      setValidatingToken(false);
    }
  };

  // Execute Clone or Fork
  const handleExecuteCloneOrFork = async () => {
    const rawInput = cloneUrl.trim();
    if (!rawInput || isCloning) return;
    setIsCloning(true);
    setCloneStatusMsg("Processing repository request…");

    try {
      if (cloneAction === "fork") {
        if (!githubToken) {
          alert("GitHub Token required to fork. Please connect your GitHub account first.");
          setCloneModalOpen(false);
          setTokenModalOpen(true);
          setIsCloning(false);
          return;
        }

        // Parse owner and repo from URL or string (e.g. facebook/react)
        const match = rawInput.match(/(?:github\.com[:/])?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git|\/|$)/);
        if (!match) {
          alert("Please provide a valid GitHub repo in 'owner/repo' or URL format.");
          setIsCloning(false);
          return;
        }

        const repoOwner = match[1];
        const repoName = match[2];
        if (!repoOwner || !repoName) {
          alert("Please provide a valid GitHub repo in 'owner/repo' or URL format.");
          setIsCloning(false);
          return;
        }
        setCloneStatusMsg(`Forking ${repoOwner}/${repoName} to your GitHub profile…`);

        if (window.electronAPI?.github?.fork) {
          const res = await window.electronAPI.github.fork({
            token: githubToken,
            repoOwner,
            repoName,
          });

          if (res?.success) {
            setCloneModalOpen(false);
            setCloneUrl("");
            await loadStatus();
          } else {
            alert(`Fork failed: ${res?.error || "Unknown error"}`);
          }
        }
      } else {
        // Direct Clone
        let finalUrl = rawInput;
        if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("git@")) {
          finalUrl = `https://github.com/${rawInput}.git`;
        }

        setCloneStatusMsg(`Cloning ${finalUrl} to local workspace…`);
        if (window.electronAPI?.git?.clone) {
          const res = await window.electronAPI.git.clone({
            url: finalUrl,
            token: githubToken || undefined,
          });

          if (res?.success) {
            setCloneModalOpen(false);
            setCloneUrl("");
            await loadStatus();
          } else {
            alert(`Clone failed: ${res?.error || "Unknown error"}`);
          }
        }
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
    } finally {
      setIsCloning(false);
      setCloneStatusMsg("");
    }
  };

  // Publish to GitHub
  const handlePublishToGitHub = async () => {
    if (!publishName.trim() || isPublishing) return;
    if (!githubToken) {
      setPublishModalOpen(false);
      setTokenModalOpen(true);
      return;
    }

    setIsPublishing(true);
    try {
      if (window.electronAPI?.github?.createRepo) {
        const res = await window.electronAPI.github.createRepo({
          token: githubToken,
          name: publishName.trim(),
          description: publishDesc.trim(),
          isPrivate: publishPrivate,
        });

        if (res?.success) {
          setPublishModalOpen(false);
          setPublishName("");
          setPublishDesc("");
          await loadStatus();
          alert(`Successfully published project to ${res.repoUrl}!`);
        } else {
          alert(`Publish failed: ${res?.error || "Unknown error"}`);
        }
      }
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#1E1E1E] border-r border-[#2B2B2B] select-none overflow-hidden font-sans text-[#CCCCCC]">
      {/* ── 1. Top Source Control & GitHub Header ── */}
      <div className="flex h-[36px] shrink-0 items-center justify-between px-3 border-b border-[#2B2B2B] bg-[#181818]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Github className="h-4 w-4 text-white shrink-0" />
          <span className="text-[11.5px] font-semibold tracking-wider text-[#E0E0E0] uppercase truncate">
            Source Control
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 text-[#9E9EA8]">
          <button
            onClick={() => setCloneModalOpen(true)}
            className="p-1 rounded hover:text-white hover:bg-[#2A2A2A] transition-colors cursor-pointer"
            title="Fork or Clone from GitHub"
          >
            <GitFork className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleFetch}
            className="p-1 rounded hover:text-white hover:bg-[#2A2A2A] transition-colors cursor-pointer"
            title="Fetch from Remote"
          >
            <RotateCw className={cn("h-3.5 w-3.5", syncing && "animate-spin text-[#007ACC]")} />
          </button>
          <button
            onClick={() => {
              setTempToken(githubToken);
              setTokenModalOpen(true);
            }}
            className="p-1 rounded hover:text-white hover:bg-[#2A2A2A] transition-colors cursor-pointer"
            title={githubUser ? `Connected as @${githubUser.login}` : "Connect GitHub Account"}
          >
            <Key className={cn("h-3.5 w-3.5", githubUser ? "text-[#10B981]" : "text-[#888888]")} />
          </button>
        </div>
      </div>

      {/* ── Empty State: Not a Git Repository ── */}
      {!isRepo ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 font-sans select-none overflow-y-auto">
          <div className="h-16 w-16 rounded-2xl bg-[#252528] border border-[#333338] flex items-center justify-center text-[#007ACC] shadow-lg">
            <GitBranch className="h-8 w-8" />
          </div>
          <div className="space-y-1.5 max-w-[280px]">
            <h3 className="text-sm font-semibold text-white tracking-wide">
              No Git Repository Found
            </h3>
            <p className="text-xs text-[#8A8A96] leading-relaxed">
              The currently opened workspace is not version controlled. Initialize a repository to track changes, stage files, and push to GitHub.
            </p>
          </div>

          <div className="flex flex-col w-full max-w-[240px] gap-2 pt-2">
            <button
              onClick={handleInitRepo}
              disabled={isInitializing}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#007ACC] hover:bg-[#0062A3] disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              {isInitializing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Initializing Repository…</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Initialize Repository</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setPublishName(
                  (typeof window !== "undefined" && (window as any).__THIRD_EYE_WORKSPACE_ROOT__
                    ? (window as any).__THIRD_EYE_WORKSPACE_ROOT__.split("/").pop()
                    : "my-project") || "my-project"
                );
                setPublishModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#252528] hover:bg-[#303035] text-white border border-[#3A3A42] text-xs font-medium transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-[#10B981]" />
              <span>Publish to GitHub</span>
            </button>

            <button
              onClick={() => setCloneModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded text-[#8A8A96] hover:text-[#38BDF8] text-[11px] transition-colors cursor-pointer mt-1"
            >
              <GitFork className="h-3 w-3" />
              <span>Clone or Fork from GitHub</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── 2. GitHub Connection & Remote Info Pill ── */}
          <div className="px-3 py-2 bg-[#1A1A1A] border-b border-[#282828] space-y-1.5 shrink-0">
            <div className="flex items-center justify-between text-xs">
              {repoName ? (
                <a
                  href={remoteUrl.startsWith("http") ? remoteUrl.replace(/\.git$/, "") : `https://github.com/${repoName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 font-medium text-white hover:text-[#38BDF8] truncate transition-colors group"
                  title={`View ${repoName} on GitHub`}
                >
                  <Github className="h-3.5 w-3.5 shrink-0 text-white" />
                  <span className="truncate">{repoName}</span>
                  <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ) : (
                <div className="flex items-center gap-1.5 text-[#9E9EA8] truncate">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#EAB308]" />
                  <span className="truncate">Local Git Workspace</span>
                </div>
              )}

              {/* GitHub User avatar / Connect Button */}
              {githubUser ? (
                <div
                  onClick={() => {
                    setTempToken(githubToken);
                    setTokenModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#252525] border border-[#353535] text-[11px] hover:border-[#10B981]/50 cursor-pointer transition-colors"
                  title={`Connected as ${githubUser.login} (Click to manage)`}
                >
                  <img
                    src={githubUser.avatar_url}
                    alt={githubUser.login}
                    className="h-3.5 w-3.5 rounded-full"
                  />
                  <span className="font-mono text-[#D0D0D8]">@{githubUser.login}</span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setTempToken(githubToken);
                    setTokenModalOpen(true);
                  }}
                  className="px-2 py-0.5 text-[11px] rounded bg-[#252528] hover:bg-[#303035] text-[#38BDF8] border border-[#38BDF8]/30 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Key className="h-3 w-3" />
                  <span>Connect GitHub</span>
                </button>
              )}
            </div>

            {/* Branch row + Ahead/Behind Counter */}
            <div className="flex items-center justify-between text-[11.5px] text-[#A0A0A0]">
              <div className="flex items-center gap-1.5 font-mono">
                <GitBranch className="h-3.5 w-3.5 text-[#007ACC] shrink-0" />
                <span className="text-white font-medium truncate">{branch}</span>
              </div>

              {/* Sync Stats: Ahead/Behind */}
              {upstream ? (
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className={cn(ahead > 0 ? "text-[#38BDF8] font-bold" : "text-[#777777]")} title="Commits ahead of remote (ready to push)">
                    ↑{ahead}
                  </span>
                  <span className={cn(behind > 0 ? "text-[#F59E0B] font-bold" : "text-[#777777]")} title="Commits behind remote (ready to pull)">
                    ↓{behind}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Sync / Push Button */}
            {upstream ? (
              (ahead > 0 || behind > 0) ? (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="w-full flex items-center justify-center gap-1.5 py-1 rounded bg-[#007ACC] hover:bg-[#0062A3] disabled:opacity-50 text-white text-[11.5px] font-medium transition-all shadow-sm cursor-pointer mt-1"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Syncing with GitHub…</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        Sync Changes {ahead > 0 ? `(↑${ahead} to push)` : ""} {behind > 0 ? `(↓${behind} to pull)` : ""}
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center justify-between pt-0.5 text-[11px] text-[#10B981]">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>In sync with GitHub</span>
                  </div>
                  <button
                    onClick={handleFetch}
                    disabled={syncing}
                    className="text-[#9E9EA8] hover:text-white transition-colors cursor-pointer text-[10.5px]"
                  >
                    Fetch
                  </button>
                </div>
              )
            ) : (
              <button
                onClick={() => {
                  setPublishName(repoName ? repoName.split("/").pop() || "project" : "project");
                  setPublishModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1 rounded bg-[#10B981] hover:bg-[#0D9668] text-white text-[11.5px] font-medium transition-colors cursor-pointer mt-1"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Publish Branch to GitHub</span>
              </button>
            )}
          </div>

          {/* ── 3. Commit Input Box ── */}
          <div className="p-3 border-b border-[#282828] space-y-2 bg-[#1C1C1C] shrink-0">
            <textarea
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message (⌘Enter to commit)"
              rows={2}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  handleCommit();
                }
              }}
              className="w-full bg-[#252526] border border-[#3C3C3C] focus:border-[#007ACC] text-[12px] text-white rounded p-2 outline-none font-sans placeholder:text-[#707070] resize-none"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCommit(false)}
                disabled={!commitMsg.trim() || allFiles.length === 0 || committing}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[#007ACC] hover:bg-[#0062A3] disabled:opacity-40 disabled:hover:bg-[#007ACC] text-white rounded text-[12px] font-medium transition-colors cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{committing ? "Committing…" : `Commit (${allFiles.length})`}</span>
              </button>

              {ahead > 0 && (
                <button
                  onClick={handlePush}
                  disabled={syncing}
                  className="px-2.5 py-1.5 bg-[#2B2B30] hover:bg-[#35353C] text-white rounded text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Push committed changes to GitHub"
                >
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#38BDF8]" /> : <Upload className="h-3.5 w-3.5 text-[#38BDF8]" />}
                  <span>Push (↑{ahead})</span>
                </button>
              )}
            </div>
          </div>

          {/* ── 4. File Lists (Outgoing Commits + Staged Changes + Working Changes + Commit History) ── */}
          <div className="flex-1 overflow-y-auto font-sans" style={{ scrollbarWidth: "thin", scrollbarColor: "#424242 transparent" }}>
            {/* Outgoing Commits Section (Tracks pushes directly) */}
            {ahead > 0 && outgoingCommits.length > 0 && (
              <div className="border-b border-[#282828] bg-[#161B22]">
                <div
                  onClick={() => setOutgoingOpen((p) => !p)}
                  className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8] bg-[#1A2333] hover:bg-[#1E2B3E] cursor-pointer"
                >
                  <div className="flex items-center gap-1">
                    {outgoingOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>Outgoing Commits</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-[#38BDF8] text-[#0F172A] px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                      {outgoingCommits.length} ↑
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePush();
                      }}
                      disabled={syncing}
                      className="px-2 py-0.5 rounded bg-[#007ACC] hover:bg-[#0062A3] text-white text-[10px] font-semibold transition-colors flex items-center gap-1"
                      title="Push outgoing commits to GitHub"
                    >
                      <Upload className="h-2.5 w-2.5" />
                      <span>Push</span>
                    </button>
                  </div>
                </div>

                {outgoingOpen && (
                  <div className="py-1 divide-y divide-[#20293A]">
                    {outgoingCommits.map((c, idx) => (
                      <div key={idx} className="px-3 py-1.5 text-[11.5px] hover:bg-[#1C2536] transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[#38BDF8] text-[10.5px] bg-[#0E1726] px-1.5 py-0.5 rounded border border-[#38BDF8]/30 font-semibold">
                            {c.hash}
                          </span>
                          <span className="text-[10px] text-[#78849E] truncate">{c.date}</span>
                        </div>
                        <div className="text-white text-[12px] truncate mt-0.5 font-medium">{c.message}</div>
                        <div className="text-[10px] text-[#7C88A2] mt-0.5">{c.author}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Staged Changes Section */}
            {stagedFiles.length > 0 && (
              <div className="border-b border-[#282828]">
                <div
                  onClick={() => setStagedOpen((p) => !p)}
                  className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A0A0A0] bg-[#1E1E1E] hover:bg-[#252525] cursor-pointer"
                >
                  <div className="flex items-center gap-1">
                    {stagedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>Staged Changes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-[#10B981] text-white px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                      {stagedFiles.length}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnstageAll();
                      }}
                      className="p-0.5 rounded hover:text-white hover:bg-[#333333] transition-colors"
                      title="Unstage all changes"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {stagedOpen && (
                  <div className="py-0.5">
                    {stagedFiles.map((file, idx) => {
                      const fileName = file.path.split("/").pop() || file.path;
                      return (
                        <div
                          key={idx}
                          onClick={() => editorApi.openFile(file.fullPath || file.path)}
                          className="group flex items-center justify-between px-3 py-1 hover:bg-[#2A2D2E] cursor-pointer text-[12px] text-[#CCCCCC] transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="shrink-0">{getFileIcon(fileName)}</span>
                            <span className="truncate">{fileName}</span>
                            <span className="text-[10px] text-[#666666] truncate font-mono">{file.path}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-bold font-mono px-1 rounded text-[#10B981]">
                              {file.status}
                            </span>
                            <button
                              onClick={(e) => handleUnstageFile(e, file.path)}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:text-white hover:bg-[#3C3C3C] transition-opacity"
                              title="Unstage change"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Working Changes Section */}
            <div>
              <div
                onClick={() => setChangesOpen((p) => !p)}
                className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A0A0A0] bg-[#1E1E1E] hover:bg-[#252525] cursor-pointer"
              >
                <div className="flex items-center gap-1">
                  {changesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span>Changes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-[#007ACC] text-white px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                    {unstagedFiles.length}
                  </span>
                  {unstagedFiles.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStageAll();
                      }}
                      className="p-0.5 rounded hover:text-white hover:bg-[#333333] transition-colors"
                      title="Stage all changes"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {changesOpen && (
                unstagedFiles.length === 0 ? (
                  <div className="p-6 text-center text-[12px] text-[#6A6A6A]">
                    No unstaged changes in workspace.
                  </div>
                ) : (
                  <div className="py-0.5">
                    {unstagedFiles.map((file, idx) => {
                      const fileName = file.path.split("/").pop() || file.path;
                      const isModified = file.status.includes("M");
                      const isUntracked = file.status.includes("?");

                      return (
                        <div
                          key={idx}
                          onClick={() => editorApi.openFile(file.fullPath || file.path)}
                          className="group flex items-center justify-between px-3 py-1 hover:bg-[#2A2D2E] cursor-pointer text-[12px] text-[#CCCCCC] transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="shrink-0">{getFileIcon(fileName)}</span>
                            <span className="truncate">{fileName}</span>
                            <span className="text-[10px] text-[#666666] truncate font-mono">{file.path}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={cn(
                                "text-[11px] font-bold font-mono px-1 rounded",
                                isModified ? "text-[#E5C07B]" : isUntracked ? "text-[#98C379]" : "text-[#E06C75]"
                              )}
                            >
                              {isModified ? "M" : isUntracked ? "U" : file.status}
                            </span>
                            <button
                              onClick={(e) => handleDiscardFile(e, file)}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:text-[#EF4444] hover:bg-[#3C3C3C] transition-opacity"
                              title="Discard changes"
                            >
                              <Undo2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => handleStageFile(e, file.path)}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:text-[#10B981] hover:bg-[#3C3C3C] transition-opacity"
                              title="Stage change"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>

            {/* Commit History Section */}
            {recentCommits.length > 0 && (
              <div className="border-t border-[#282828] mt-2">
                <div
                  onClick={() => setHistoryOpen((p) => !p)}
                  className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#8A8A96] bg-[#1A1A1D] hover:bg-[#222226] cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    {historyOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <History className="h-3 w-3" />
                    <span>Recent Commits</span>
                  </div>
                  <span className="text-[10px] text-[#656575]">{recentCommits.length}</span>
                </div>

                {historyOpen && (
                  <div className="py-1 divide-y divide-[#26262B]">
                    {recentCommits.map((c, idx) => (
                      <div key={idx} className="px-3 py-1.5 text-[11.5px] hover:bg-[#222226] transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[#A0A0B0] text-[10.5px] bg-[#1E1E22] px-1 rounded border border-white/5">
                            {c.hash}
                          </span>
                          <span className="text-[10px] text-[#6A6A78] truncate">{c.date}</span>
                        </div>
                        <div className="text-[#D0D0D8] text-[11.5px] truncate mt-0.5">{c.message}</div>
                        <div className="text-[10px] text-[#6A6A78]">{c.author}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Modal 1: Fork or Clone from GitHub ── */}
      {cloneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-xl bg-[#1A1A1E] border border-[#2D2D35] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#2C2C34]">
              <div className="flex items-center gap-2">
                <GitFork className="h-4 w-4 text-[#0084FF]" />
                <h3 className="text-[14px] font-semibold text-white">GitHub Repository Importer</h3>
              </div>
              <button
                onClick={() => !isCloning && setCloneModalOpen(false)}
                className="text-[#888894] hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Toggle Fork vs Clone */}
            <div className="flex rounded-lg bg-[#121215] p-1 border border-[#26262E]">
              <button
                type="button"
                onClick={() => setCloneAction("clone")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer",
                  cloneAction === "clone" ? "bg-[#252530] text-white shadow-sm" : "text-[#888894] hover:text-white"
                )}
              >
                Clone Repository
              </button>
              <button
                type="button"
                onClick={() => setCloneAction("fork")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                  cloneAction === "fork" ? "bg-[#252530] text-[#38BDF8] shadow-sm font-semibold" : "text-[#888894] hover:text-white"
                )}
              >
                <GitFork className="h-3 w-3" />
                <span>Fork & Clone</span>
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11.5px] font-medium text-[#C0C0CB]">
                {cloneAction === "fork" ? "Source Repository to Fork" : "Repository URL or Owner/Repo"}
              </label>
              <input
                type="text"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="e.g. facebook/react or https://github.com/..."
                className="w-full bg-[#121215] border border-[#2F2F38] focus:border-[#0084FF] rounded-lg px-3 py-2 text-xs text-white outline-none font-mono placeholder:text-[#656570]"
              />
              <p className="text-[11px] text-[#808090] leading-relaxed">
                {cloneAction === "fork"
                  ? "THIRD EYE will fork this repo to your GitHub account via API, clone it locally, configure upstream, and open it automatically."
                  : "Clones the repository directly to your Downloads directory and switches the active workspace."}
              </p>
            </div>

            {cloneStatusMsg && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#0084FF]/10 border border-[#0084FF]/30 text-xs text-[#38BDF8]">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>{cloneStatusMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#26262E]">
              <button
                onClick={() => setCloneModalOpen(false)}
                disabled={isCloning}
                className="px-3 py-1.5 text-xs text-[#90909A] hover:text-white rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteCloneOrFork}
                disabled={!cloneUrl.trim() || isCloning}
                className="px-4 py-1.5 text-xs bg-[#007ACC] hover:bg-[#0062A3] disabled:opacity-50 text-white rounded font-medium transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isCloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitFork className="h-3.5 w-3.5" />}
                <span>{cloneAction === "fork" ? "Fork & Clone" : "Clone Repository"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: GitHub Account / Token Settings ── */}
      {tokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-xl bg-[#1A1A1E] border border-[#2D2D35] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#2C2C34]">
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4 text-white" />
                <h3 className="text-[14px] font-semibold text-white">GitHub Account Integration</h3>
              </div>
              <button
                onClick={() => setTokenModalOpen(false)}
                className="text-[#888894] hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {githubUser ? (
              <div className="p-3 rounded-lg bg-[#141418] border border-[#282830] flex items-center gap-3">
                <img
                  src={githubUser.avatar_url}
                  alt={githubUser.login}
                  className="h-10 w-10 rounded-full border border-white/20"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{githubUser.name}</div>
                  <div className="text-[11px] font-mono text-[#8E8E98] truncate">@{githubUser.login}</div>
                  <div className="text-[10px] text-[#10B981] flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Authenticated & Active</span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-[11.5px] font-medium text-[#C0C0CB]">
                GitHub Personal Access Token (PAT)
              </label>
              <input
                type="password"
                value={tempToken}
                onChange={(e) => setTempToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-[#121215] border border-[#2F2F38] focus:border-[#0084FF] rounded-lg px-3 py-2 text-xs text-white outline-none font-mono"
              />
              <p className="text-[11px] text-[#808090] leading-relaxed">
                Tokens enable authenticated pushing, 1-click forking, and private repository access without terminal prompts.
              </p>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:user"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[#38BDF8] hover:underline"
              >
                <span>Generate token on GitHub (with 'repo' & 'read:user' scopes)</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>

            {tokenError && (
              <div className="p-2.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#EF4444] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{tokenError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#26262E]">
              {githubToken && (
                <button
                  onClick={() => {
                    localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
                    setGithubToken("");
                    setGithubUser(null);
                    setTokenModalOpen(false);
                  }}
                  className="px-3 py-1.5 text-xs text-[#EF4444] hover:bg-[#EF4444]/10 rounded transition-colors cursor-pointer mr-auto"
                >
                  Disconnect
                </button>
              )}
              <button
                onClick={() => setTokenModalOpen(false)}
                className="px-3 py-1.5 text-xs text-[#90909A] hover:text-white rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToken}
                disabled={validatingToken}
                className="px-4 py-1.5 text-xs bg-[#007ACC] hover:bg-[#0062A3] disabled:opacity-50 text-white rounded font-medium transition-all cursor-pointer flex items-center gap-1.5"
              >
                {validatingToken && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Token</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 3: Publish to GitHub ── */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-xl bg-[#1A1A1E] border border-[#2D2D35] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#2C2C34]">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-[#10B981]" />
                <h3 className="text-[14px] font-semibold text-white">Publish Project to GitHub</h3>
              </div>
              <button
                onClick={() => setPublishModalOpen(false)}
                className="text-[#888894] hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11.5px] font-medium text-[#C0C0CB] block mb-1">
                  Repository Name
                </label>
                <input
                  type="text"
                  value={publishName}
                  onChange={(e) => setPublishName(e.target.value)}
                  placeholder="e.g. my-awesome-project"
                  className="w-full bg-[#121215] border border-[#2F2F38] focus:border-[#10B981] rounded-lg px-3 py-2 text-xs text-white outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-[11.5px] font-medium text-[#C0C0CB] block mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                  placeholder="Short repository description"
                  className="w-full bg-[#121215] border border-[#2F2F38] focus:border-[#10B981] rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-[#C0C0CB]">Visibility</span>
                <div className="flex rounded-md bg-[#121215] p-0.5 border border-[#282830]">
                  <button
                    type="button"
                    onClick={() => setPublishPrivate(false)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1",
                      !publishPrivate ? "bg-[#252530] text-white font-medium" : "text-[#777782]"
                    )}
                  >
                    <Globe className="h-3 w-3" />
                    <span>Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishPrivate(true)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1",
                      publishPrivate ? "bg-[#252530] text-white font-medium" : "text-[#777782]"
                    )}
                  >
                    <Lock className="h-3 w-3" />
                    <span>Private</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#26262E]">
              <button
                onClick={() => setPublishModalOpen(false)}
                disabled={isPublishing}
                className="px-3 py-1.5 text-xs text-[#90909A] hover:text-white rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePublishToGitHub}
                disabled={!publishName.trim() || isPublishing}
                className="px-4 py-1.5 text-xs bg-[#10B981] hover:bg-[#0D9668] disabled:opacity-50 text-white rounded font-medium transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                <span>Publish to GitHub</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
