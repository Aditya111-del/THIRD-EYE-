import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Play,
  RotateCcw,
  FileText,
  Clock,
  MoreHorizontal,
  X,
  Plus,
  Mic,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  FileCode,
  Folder,
  FolderPlus,
  Bot,
  Terminal as TerminalIcon,
  Code2,
  Sparkles,
  ExternalLink,
  Key,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Filter,
  Pencil,
  Paperclip,
  Image as ImageIcon,
  Search,
  Zap,
} from "lucide-react";
import type { TerminalApi } from "@/hooks/useTerminalSession";
import type { EditorWorkspaceApi } from "@/hooks/useEditorWorkspace";
import { getActiveTerminalBufferLines } from "@/components/terminal/terminalState";
import { generateSmartTerminalReply } from "@/lib/terminalIntelligence";
import type { ChatMsg } from "@/types/terminal";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { AiMarkdownView } from "./AiMarkdownView";
import { TaskGraphDAGViewer, TaskGraphStepUI } from "./TaskGraphDAGViewer";
import { ToolCallCard, ToolCallCardProps } from "./ToolCallCard";
import { PermissionPromptCard, PermissionRequestPayload } from "./PermissionPromptCard";
import { SidebarDiffReviewCard, FileDiffItem } from "./SidebarDiffReviewCard";
import { ActivityFeedModal, ActivityFeedItem } from "./ActivityFeedModal";
import { ArtifactsModal } from "./ArtifactsModal";
import { AiConnectorModal } from "./AiConnectorModal";
import { ModelSelectionPopover } from "./ModelSelectionPopover";
import {
  AntigravityActionStream,
  AntigravityStreamItem,
  toolCardsToActionStream,
  getFileTypeBadge,
} from "./AntigravityActionStream";
import { useAgentActivityStore } from "@/stores/agentActivityStore";
import type { AgentArtifact } from "@third-eye/shared";
import { Square, Activity, Undo2, Layers, Cpu } from "lucide-react";

/**
 * Antigravity / Third Eye vector icon
 */
export function AntigravityIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" className="stroke-[#0084FF] opacity-80" />
      <polygon points="12,2 15,9 22,12 15,15 12,22 9,15 2,12 9,9" className="fill-[#0084FF]/20 stroke-[#0084FF]" />
      <circle cx="12" cy="12" r="2.5" className="fill-[#0084FF]" />
    </svg>
  );
}

export const ThirdEyeIcon = AntigravityIcon;

/**
 * Minimal Antigravity AI Spark badge
 */
export function AiSparkBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 rounded-md bg-sky-500/10 border border-sky-400/20 flex items-center justify-center shrink-0 select-none text-sky-400 mt-0.5",
        className
      )}
    >
      <Sparkles className="h-3 w-3" />
    </div>
  );
}

export type AgentMode = "autonomous" | "editor" | "terminal";

export interface PlanItem {
  id: string;
  label: string;
  status: "completed" | "in_progress" | "pending";
}

export interface EditedFileItem {
  name: string;
  added: number;
  removed: number;
  path?: string;
}

export interface ToolExecutionTrace {
  id: string;
  label: string;
  type: "tool" | "thought" | "command" | "file";
  duration?: string | undefined;
  command?: string | undefined;
  details?: string | undefined;
  filePath?: string | undefined;
  status?: "running" | "finished" | "failed" | undefined;
}

export interface FileChangeMeta {
  count: number;
  added: number;
  removed: number;
  files: string[];
}

export interface AttachedImage {
  id: string;
  name: string;
  data: string; // base64 data url
  mimeType: string;
  size: number;
}

export interface AttachedDoc {
  id: string;
  name: string;
  extension: string;
  size: number;
  sizeFormatted: string;
  mimeType: string;
  content: string; // text content or base64 data url
  lineCount?: number;
  isPdf?: boolean;
}

export interface ExtendedChatMsg extends ChatMsg {
  id?: string | undefined;
  suggestedCommand?: string | undefined;
  severity?: string | undefined;
  timestamp?: string | undefined;
  isStreaming?: boolean | undefined;
  thoughtDuration?: string | undefined;
  thoughts?: string[] | undefined;
  planItems?: PlanItem[] | undefined;
  toolQuery?: string | undefined;
  toolResults?: string | undefined;
  editedFiles?: EditedFileItem[] | undefined;
  traces?: ToolExecutionTrace[] | undefined;
  fileChanges?: FileChangeMeta | undefined;
  feedback?: "liked" | "disliked" | null | undefined;
  imageThumbnail?: string | undefined;
  images?: AttachedImage[] | undefined;
  docs?: AttachedDoc[] | undefined;
  agentMode?: AgentMode | undefined;
  pendingPermission?: {
    id: string;
    toolName: string;
    command?: string | undefined;
  } | undefined;
  taskGraphSteps?: TaskGraphStepUI[] | undefined;
  toolCallCards?: ToolCallCardProps[] | undefined;
  actionStreamItems?: AntigravityStreamItem[] | undefined;
}

export interface AgentSession {
  id: string;
  name: string;
  dotColor: string;
  status: "active" | "idle";
  messages: ExtendedChatMsg[];
}

/**
 * Plan Card component matching Screenshot 4
 */
export function PlanCard({ items }: { items: PlanItem[] }) {
  return (
    <div className="rounded-[8px] bg-[#121316] border border-[#23242A] p-3 my-2 space-y-2 select-none shadow-sm">
      <div className="text-[12px] font-medium text-[#D0D0D5]">Plan</div>
      <div className="space-y-1.5 font-sans">
        {items.map((item) => {
          if (item.status === "completed") {
            return (
              <div key={item.id} className="flex items-center gap-2 text-[12px] text-[#C4C4CD]">
                <div className="h-4 w-4 rounded-[3px] bg-[#0E281E] border border-[#10B981]/80 flex items-center justify-center text-[#10B981] shrink-0">
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                </div>
                <span className="leading-tight">{item.label}</span>
              </div>
            );
          }
          if (item.status === "in_progress") {
            return (
              <div key={item.id} className="flex items-center gap-2 text-[12px] text-white">
                <div className="h-4 w-4 rounded-[3px] bg-[#2A170A] border border-[#FF6B00] flex items-center justify-center text-[#FF9E4A] shrink-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#FF9E4A]" />
                </div>
                <span className="font-medium leading-tight">{item.label}</span>
              </div>
            );
          }
          return (
            <div key={item.id} className="flex items-center gap-2 text-[12px] text-[#71717A]">
              <div className="h-4 w-4 rounded-[3px] border border-[#3F3F46] flex items-center justify-center shrink-0">
                <div className="h-1 w-1 rounded-full bg-[#52525B]" />
              </div>
              <span className="leading-tight">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Minimal inline Tool Execution Row
 */
export function ToolExecutionRow({
  query = "'useSession'",
  count = "12 results",
}: {
  query?: string;
  count?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-[11.5px] font-sans select-none my-1">
      <Search className="h-3.5 w-3.5 text-sky-400 shrink-0" />
      <span className="text-zinc-500 font-sans">Searched repo</span>
      <span className="font-mono text-zinc-200 truncate max-w-[200px]">{query}</span>
      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/[0.06] text-zinc-400 ml-auto shrink-0">
        {count}
      </span>
    </div>
  );
}

/**
 * Minimal inline Edited Files Indicator
 */
export function EditedFilesCard({
  files,
  onViewDiff,
  onOpenFile,
}: {
  files: EditedFileItem[];
  onViewDiff?: () => void;
  onOpenFile?: (fileName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const totalAdded = files.reduce((acc, f) => acc + f.added, 0);
  const totalRemoved = files.reduce((acc, f) => acc + f.removed, 0);

  return (
    <div className="my-1.5 font-sans select-none">
      <div className="flex items-center gap-1.5 text-[11.5px] leading-snug">
        <span className="text-emerald-400/90 font-medium shrink-0">✓</span>
        <span className="text-zinc-400 font-sans tracking-tight">
          Modified {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <span className="font-mono text-[10.5px] text-emerald-400 font-medium">+{totalAdded}</span>
        <span className="font-mono text-[10.5px] text-rose-400 font-medium">-{totalRemoved}</span>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer group text-[11px] font-sans ml-1"
          title={open ? "Collapse details" : "Expand details"}
        >
          <span>({files.length} {files.length === 1 ? "file" : "files"})</span>
          <ChevronDown
            className={cn(
              "w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden space-y-1 pt-1.5 pb-0.5 border-l border-white/[0.08] ml-1.5 pl-2.5 my-1"
          >
            {files.map((file, idx) => (
              <div
                key={idx}
                onClick={() => onOpenFile?.(file.name)}
                className="flex items-center gap-2 py-0.5 text-[11.5px] leading-snug text-zinc-300 hover:text-white cursor-pointer group transition-colors"
                title={`Click to open ${file.name} in Editor`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="font-mono text-zinc-200 group-hover:text-white group-hover:underline truncate max-w-[220px]">
                  {file.name}
                </span>
                <div className="flex items-center gap-1 font-mono text-[10.5px] shrink-0 ml-auto">
                  <span className="text-emerald-400">+{file.added}</span>
                  <span className="text-rose-400">-{file.removed}</span>
                </div>
              </div>
            ))}
            {onViewDiff && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onViewDiff}
                  className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px] font-mono cursor-pointer transition-colors"
                >
                  <span>&gt; view diff</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Thought reasoning accordion matching Screenshot 4
 */
export function ThoughtAccordion({
  duration = "1s",
  thoughts = [],
}: {
  duration?: string | undefined;
  thoughts?: string[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (!thoughts || thoughts.length === 0) return null;
  return (
    <div className="my-1 select-none">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-xs text-[#8E8E98] hover:text-[#C5C5CE] font-mono italic cursor-pointer transition-colors group py-0.5"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 text-[#6E6E78] group-hover:text-[#A0A0AA] transition-transform duration-200",
            open && "rotate-90"
          )}
        />
        <span>Thought for {duration}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden mt-1 pl-3 border-l border-white/[0.08] space-y-1 text-[11px] font-mono text-[#8E8E98]"
          >
            {thoughts.map((t, i) => (
              <div key={i}>{t}</div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CodeBlock({
  code,
  lang,
  onRun,
  onApplyToEditor,
}: {
  code: string;
  lang?: string | undefined;
  onRun: (c: string) => void;
  onApplyToEditor?: ((code: string) => void) | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExecutable =
    lang === "sh" ||
    lang === "bash" ||
    lang === "zsh" ||
    lang === "cmd" ||
    lang === "powershell" ||
    !lang;

  return (
    <div className="my-2 overflow-hidden rounded-[6px] border border-[#2B2B32] bg-[#111215] font-mono text-[12px] shadow-sm select-text">
      <div className="flex h-[28px] items-center justify-between border-b border-[#23242A] bg-[#16171B] px-2.5 text-[11px] text-[#80808C] select-none">
        <span className="font-semibold uppercase tracking-wider text-[#A0A0AA]">{lang || "code"}</span>
        <div className="flex items-center gap-1">
          {onApplyToEditor && (
            <button
              onClick={() => {
                onApplyToEditor(code);
                setApplied(true);
                setTimeout(() => setApplied(false), 2000);
              }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#25262C] text-[#38BDF8] hover:text-white transition-colors cursor-pointer"
              title="Apply directly into active Monaco Editor"
            >
              {applied ? <Check className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
              <span>{applied ? "Applied" : "Apply to Editor"}</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#25262C] hover:text-white transition-colors cursor-pointer"
            title="Copy code"
          >
            {copied ? <Check className="h-3 w-3 text-[#10B981]" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          {isExecutable && (
            <button
              onClick={() => onRun(code)}
              className="flex items-center gap-1 rounded bg-[#FF6B00] px-2 py-0.5 text-white hover:bg-[#FF852E] transition-colors cursor-pointer font-medium"
              title="Run in Integrated Terminal"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              <span>Run</span>
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto p-3 text-[#E0E0E8] leading-relaxed scrollbar-thin">
        <pre>{code}</pre>
      </div>
    </div>
  );
}

const MODEL_OPTIONS = [
  "Gemini 3.5 Flash",
  "Gemini Flash Lite",
  "Gemini 3.8 Flash",
  "Gemini 3.6 Flash",
  "Gemini 3.8 Pro",
  "Ollama (gemma4:12b)",
  "Ollama (qwen3.6:27b)",
  "Claude 3.5 Sonnet",
  "GPT-4o",
];

export function AiSidecar({
  api,
  editorApi,
  onClose,
}: {
  api: TerminalApi;
  editorApi?: EditorWorkspaceApi;
  onClose?: () => void;
}) {
  const [selectedModel, setSelectedModel] = useState("Nemotron 3 Ultra 550B (Free)");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("autonomous");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string>("");
  const [contextPills, setContextPills] = useState<string[]>([]);
  const [runningTasks, setRunningTasks] = useState<Array<{ id: string; command: string; onKill?: () => void }>>([]);
  const [tasksDockExpanded, setTasksDockExpanded] = useState<boolean>(true);

  // Autonomous Multi-Agent State (§6)
  const [activePermissionRequest, setActivePermissionRequest] = useState<PermissionRequestPayload | null>(null);
  const [activeDiffs, setActiveDiffs] = useState<FileDiffItem[] | null>(null);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);
  const [activityFeedItems, setActivityFeedItems] = useState<ActivityFeedItem[]>([]);
  const [lastCheckpointId, setLastCheckpointId] = useState<string | null>(null);

  const handleOpenFileDiff = (file: FileDiffItem) => {
    if ((editorApi as any)?.openDiffTab) {
      (editorApi as any).openDiffTab(
        file.filePath,
        file.originalContent,
        file.modifiedContent,
        file.addedCount,
        file.removedCount
      );
    } else if (editorApi?.openFile) {
      editorApi.openFile(file.filePath);
    }
  };

  const handleAcceptDiff = (filePath: string) => {
    if ((editorApi as any)?.acceptDiff) {
      (editorApi as any).acceptDiff(filePath);
    }
    setActiveDiffs((prev) => {
      const rem = (prev || []).filter((f) => f.filePath !== filePath);
      return rem.length > 0 ? rem : null;
    });
  };

  const handleRejectDiff = (filePath: string) => {
    if ((editorApi as any)?.rejectDiff) {
      (editorApi as any).rejectDiff(filePath);
    }
    setActiveDiffs((prev) => {
      const rem = (prev || []).filter((f) => f.filePath !== filePath);
      return rem.length > 0 ? rem : null;
    });
  };

  const handleAcceptAllDiffs = () => {
    if ((editorApi as any)?.acceptAllDiffs) {
      (editorApi as any).acceptAllDiffs();
    } else if ((editorApi as any)?.acceptDiff && activeDiffs) {
      for (const d of activeDiffs) {
        (editorApi as any).acceptDiff(d.filePath);
      }
    }
    setActiveDiffs(null);
  };

  const handleRejectAllDiffs = () => {
    if ((editorApi as any)?.rejectAllDiffs) {
      (editorApi as any).rejectAllDiffs();
    } else if ((editorApi as any)?.rejectDiff && activeDiffs) {
      for (const d of activeDiffs) {
        (editorApi as any).rejectDiff(d.filePath);
      }
    }
    setActiveDiffs(null);
  };
  // Discovered Agent Skills (from /skills/*/SKILL.md)
  const [availableSkills, setAvailableSkills] = useState<Array<{
    id: string;
    name: string;
    description: string;
    tools?: string[];
  }>>([
    { id: "code-refactoring", name: "code-refactoring", description: "Atomic refactoring across codebase", tools: ["searchCode", "editFile"] },
    { id: "debugging-diagnostics", name: "debugging-diagnostics", description: "Diagnose terminal errors & stack traces", tools: ["runTerminal", "editFile"] },
    { id: "e2e-testing", name: "e2e-testing", description: "Author and execute robust E2E test suites", tools: ["writeFile", "runTerminal"] },
    { id: "python-development", name: "python-development", description: "Python engineering & script execution", tools: ["readFile", "runTerminal"] },
  ]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  useEffect(() => {
    fetch("http://localhost:4002/api/ai/skills")
      .then((r) => r.json())
      .then((data) => {
        if (data?.skills && Array.isArray(data.skills) && data.skills.length > 0) {
          setAvailableSkills(data.skills);
        }
      })
      .catch(() => { });

    fetch("http://localhost:4002/api/ai/config")
      .then((r) => r.json())
      .then((data) => {
        if (data?.openAiModel && data.openAiModel.includes("nemotron")) {
          setSelectedModel("Nemotron 3 Ultra 550B (Free)");
        }
      })
      .catch(() => { });
  }, []);

  // Dynamically synchronize active background tasks from backend
  useEffect(() => {
    let isMounted = true;
    const syncTasks = async () => {
      try {
        const res = await fetch("http://localhost:4002/api/ai/tasks");
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        if (data.success && Array.isArray(data.tasks)) {
          const activeOnly = data.tasks
            .filter((t: { status?: string }) => t.status === "running")
            .map((t: { taskId?: string; id?: string; command?: string }) => ({
              id: t.taskId || t.id || `task-${Date.now()}`,
              command: t.command || "background process",
              onKill: async () => {
                const targetId = t.taskId || t.id;
                if (!targetId) return;
                try {
                  await fetch("http://localhost:4002/api/ai/tasks/kill", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ taskId: targetId }),
                  });
                  setRunningTasks((prev) => prev.filter((item) => item.id !== targetId));
                } catch { }
              },
            }));
          setRunningTasks(activeOnly);
        }
      } catch {
        // Backend service offline or unreachable
      }
    };

    syncTasks();
    const interval = setInterval(syncTasks, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Multi-Agent Sessions
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([
    {
      id: "agent-1",
      name: "Workspace Agent",
      dotColor: "bg-[#10B981]",
      status: "idle",
      messages: [],
    },
  ]);

  const [activeSessionId, setActiveSessionId] = useState<string>("agent-1");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedDocs, setAttachedDocs] = useState<AttachedDoc[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [aiConnectorOpen, setAiConnectorOpen] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocBadgeColor = (ext: string): { bg: string; text: string; border: string } => {
    const e = ext.toLowerCase();
    if (e === "pdf") return { bg: "bg-rose-950/70", text: "text-rose-400", border: "border-rose-600/40" };
    if (["ts", "tsx"].includes(e)) return { bg: "bg-blue-950/70", text: "text-blue-400", border: "border-blue-600/40" };
    if (["js", "jsx"].includes(e)) return { bg: "bg-amber-950/70", text: "text-amber-400", border: "border-amber-600/40" };
    if (["py"].includes(e)) return { bg: "bg-emerald-950/70", text: "text-emerald-400", border: "border-emerald-600/40" };
    if (["json", "csv", "sql", "yaml", "yml"].includes(e)) return { bg: "bg-orange-950/70", text: "text-orange-400", border: "border-orange-600/40" };
    return { bg: "bg-purple-950/70", text: "text-purple-300", border: "border-purple-600/40" };
  };

  const processImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setAttachedImages((prev) => [
          ...prev,
          {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name || "Screenshot",
            data: result,
            mimeType: file.type || "image/png",
            size: file.size,
          },
        ]);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const processDocFile = useCallback((file: File) => {
    const name = file.name;
    const parts = name.split(".");
    const extension = parts.length > 1 ? parts.pop()!.toLowerCase() : "txt";
    const isPdf = extension === "pdf" || file.type === "application/pdf";
    const size = file.size;
    const sizeFormatted = formatFileSize(size);

    if (isPdf) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          setAttachedDocs((prev) => [
            ...prev,
            {
              id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name,
              extension: "pdf",
              size,
              sizeFormatted,
              mimeType: "application/pdf",
              content: result,
              isPdf: true,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || "";
        const lines = text.split("\n").length;
        setAttachedDocs((prev) => [
          ...prev,
          {
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            extension,
            size,
            sizeFormatted,
            mimeType: file.type || "text/plain",
            content: text,
            lineCount: lines,
            isPdf: false,
          },
        ]);
      };
      reader.readAsText(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(processImageFile);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [processImageFile]);

  const handleDocSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(processDocFile);
    if (docInputRef.current) {
      docInputRef.current.value = "";
    }
  }, [processDocFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          processImageFile(file);
        }
      }
    }
  }, [processImageFile]);

  const handleRemoveImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handleRemoveDoc = useCallback((id: string) => {
    setAttachedDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((f) => {
        if (f.type.startsWith("image/")) {
          processImageFile(f);
        } else {
          processDocFile(f);
        }
      });
    }
  }, [processImageFile, processDocFile]);

  // Reviewable Artifacts State (§6 of Architecture)
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [artifactsModalOpen, setArtifactsModalOpen] = useState(false);
  const isAgentWorking = useAgentActivityStore((s) => s.isExecuting);

  const fetchArtifacts = useCallback(async (sessId: string) => {
    if (!sessId) return;
    try {
      const res = await fetch(`http://localhost:4002/api/ai/agent/artifacts?sessionId=${sessId}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.artifacts && Array.isArray(data.artifacts)) {
          setArtifacts(data.artifacts);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch artifacts:", err);
    }
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      fetchArtifacts(activeSessionId);
    }
  }, [activeSessionId, fetchArtifacts]);

  const activeSession = useMemo(
    () => agentSessions.find((s) => s.id === activeSessionId) || agentSessions[0],
    [agentSessions, activeSessionId]
  );

  const handleCloseAgentTab = (e: React.MouseEvent, idToClose: string) => {
    e.stopPropagation();
    if (agentSessions.length <= 1) {
      setAgentSessions([
        {
          id: "agent-1",
          name: "Workspace Agent",
          dotColor: "bg-[#10B981]",
          status: "active",
          messages: [],
        },
      ]);
      setActiveSessionId("agent-1");
      return;
    }
    const nextSessions = agentSessions.filter((s) => s.id !== idToClose);
    setAgentSessions(nextSessions);
    if (activeSessionId === idToClose && nextSessions[0]) {
      setActiveSessionId(nextSessions[0].id);
    }
  };

  const handleCreateAgent = () => {
    const newId = `agent-${Date.now()}`;
    const newSession: AgentSession = {
      id: newId,
      name: `Agent task #${agentSessions.length + 1}`,
      dotColor: "bg-[#A855F7]",
      status: "active",
      messages: [],
    };
    setAgentSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newId);
  };

  const handleSend = async (overridePrompt?: string) => {
    const userPrompt = (overridePrompt || input).trim();
    const imagesToSend = overridePrompt ? [] : [...attachedImages];
    const docsToSend = overridePrompt ? [] : [...attachedDocs];
    if ((!userPrompt && imagesToSend.length === 0 && docsToSend.length === 0) || loading) return;

    let displayLabel = userPrompt;
    if (!displayLabel) {
      if (imagesToSend[0]) {
        displayLabel = `Image (${imagesToSend[0].name})`;
      } else if (docsToSend[0]) {
        displayLabel = `Doc (${docsToSend[0].name})`;
      } else {
        displayLabel = "Task";
      }
    }

    const userMsg: ExtendedChatMsg = {
      role: "user",
      text: userPrompt || (imagesToSend.length > 0 ? "Attached image" : docsToSend.length > 0 ? `Attached ${docsToSend.length} document(s)` : ""),
      images: imagesToSend.length > 0 ? imagesToSend : undefined,
      docs: docsToSend.length > 0 ? docsToSend : undefined,
      timestamp: "Just now",
    };

    const assistantPlaceholder: ExtendedChatMsg = {
      role: "assistant",
      text: "",
      isStreaming: true,
      thoughtDuration: undefined,
      thoughts: undefined,
    };

    setAgentSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const isFirstMessage = s.messages.length === 0;
        const newName = isFirstMessage
          ? displayLabel.length > 22
            ? displayLabel.slice(0, 22) + "..."
            : displayLabel
          : s.name;
        return {
          ...s,
          name: newName,
          messages: [...s.messages, userMsg, assistantPlaceholder],
        };
      })
    );

    setInput("");
    if (!overridePrompt) {
      setAttachedImages([]);
      setAttachedDocs([]);
    }
    setLoading(true);
    setThinkingStep("Thinking...");

    // 1. Try real-time Autonomous Agent streaming
    try {
      const currentCwd = api.active?.cwd || "";
      let effectiveWorkspace =
        api.workspaceRoot ||
        editorApi?.workspaceRoot ||
        currentCwd ||
        (typeof window !== "undefined" && (window as any).__THIRD_EYE_WORKSPACE_ROOT__) ||
        "";

      if (!effectiveWorkspace && window.electronAPI?.fs?.getWorkspaceRoot) {
        try {
          effectiveWorkspace = (await window.electronAPI.fs.getWorkspaceRoot()) || "";
        } catch { }
      }

      let cwdTree = "";
      const scanTarget = effectiveWorkspace || currentCwd;
      if (scanTarget && window.electronAPI?.fs?.scanTree) {
        try {
          const scanRes = await window.electronAPI.fs.scanTree(scanTarget, { maxDepth: 4, maxEntries: 300 });
          if (scanRes?.success && scanRes.treeString) {
            cwdTree = scanRes.treeString;
          }
        } catch (_) { }
      }

      const openTabs = (editorApi?.openFiles || []).map((f) => ({ path: f.path, name: f.name }));
      const activeFile = editorApi?.activeFile || null;
      const terminalTail = api.active
        ? (api.active.lines || []).slice(-30).map((l) => l.text).join("\n")
        : "";

      let mappedModel = selectedModel;
      if (selectedModel.includes("nemotron") || selectedModel.includes("Nemotron")) {
        mappedModel = "nvidia/nemotron-3-ultra-550b-a55b:free";
      } else if (selectedModel.includes("gemma4") || selectedModel.includes("Gemma")) {
        mappedModel = "gemma4:12b";
      } else if (selectedModel.includes("qwen")) {
        mappedModel = "qwen3.6:27b";
      } else if (selectedModel.includes("3.8 Flash") || selectedModel === "Gemini 3.8 Flash") {
        mappedModel = "gemini-3.8-flash";
      } else if (selectedModel.includes("3.5") || selectedModel.includes("Lite") || selectedModel === "Gemini 3.5 Flash") {
        mappedModel = "gemini-3.5-flash-lite";
      } else if (selectedModel.includes("3.6")) {
        mappedModel = "gemini-3.6-flash";
      } else if (selectedModel.includes("Sonnet")) {
        mappedModel = "claude-sonnet-4.6";
      } else if (selectedModel.includes("Opus")) {
        mappedModel = "claude-opus-4.6";
      } else if (selectedModel.includes("GPT-OSS") || selectedModel.includes("120B")) {
        mappedModel = "gpt-oss-120b";
      } else if (selectedModel.includes("DeepSeek") || selectedModel.includes("R1")) {
        mappedModel = "deepseek-r1";
      } else if (selectedModel.includes("Pro")) {
        mappedModel = "gemini-pro-latest";
      } else if (selectedModel.includes("GPT") || selectedModel.includes("4o")) {
        mappedModel = "gpt-4o";
      } else if (selectedModel.includes("Ollama (")) {
        const match = selectedModel.match(/\(([^)]+)\)/);
        if (match && match[1]) mappedModel = match[1];
      }

      const previousTurns = (activeSession?.messages || [])
        .filter((m) => !m.isStreaming && (m.text || m.suggestedCommand || (m.traces && m.traces.length > 0) || (m.toolCallCards && m.toolCallCards.length > 0) || (m.images && m.images.length > 0) || (m.docs && m.docs.length > 0)))
        .map((m) => {
          let content = m.text || "";
          if (!content && m.suggestedCommand) {
            content = `Suggested command: ${m.suggestedCommand}`;
          }
          if (m.traces && m.traces.length > 0) {
            const executed = m.traces
              .filter((t) => t.command)
              .map((t) => `Executed command: ${t.command} (status: ${t.status || "finished"})`)
              .join("\n");
            if (executed) {
              content = content ? `${content}\n${executed}` : executed;
            }
          }
          if (!content && m.toolCallCards && m.toolCallCards.length > 0) {
            const executedTools = m.toolCallCards
              .map((tc) => `Tool ${tc.toolName}: ${typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args)}`)
              .join("\n");
            if (executedTools) {
              content = executedTools;
            }
          }
          return {
            role: m.role === "assistant" ? "assistant" : "user",
            content: content || (m.role === "assistant" ? "Action completed." : ""),
            images: m.images ? m.images.map((img) => ({
              data: img.data,
              mimeType: img.mimeType,
              name: img.name,
            })) : undefined,
          };
        })
        .filter((m) => (m.content && m.content.trim().length > 0) || (m.images && m.images.length > 0));

      let promptWithDocs = userPrompt;
      if (docsToSend.length > 0) {
        const docTextBlocks = docsToSend
          .filter((d) => !d.isPdf)
          .map((d) => `--- Attached Document: ${d.name} (${d.sizeFormatted}, ${d.lineCount || 1} lines) ---\n${d.content}\n--- End of ${d.name} ---`)
          .join("\n\n");
        if (docTextBlocks) {
          promptWithDocs = promptWithDocs ? `${promptWithDocs}\n\n${docTextBlocks}` : `Please analyze the attached document(s):\n\n${docTextBlocks}`;
        }
      }

      const activeUserTurnImages = imagesToSend.map((img) => ({
        data: img.data,
        mimeType: img.mimeType,
        name: img.name,
      }));

      // Add PDF documents into multimodal inlineData
      for (const d of docsToSend.filter((d) => d.isPdf)) {
        activeUserTurnImages.push({
          data: d.content,
          mimeType: "application/pdf",
          name: d.name,
        });
      }

      const fullMessages = [
        ...previousTurns,
        {
          role: "user",
          content: promptWithDocs || (activeUserTurnImages.length > 0 ? "Attached document/image" : ""),
          images: activeUserTurnImages.length > 0 ? activeUserTurnImages : undefined,
        },
      ];

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch("http://localhost:4002/api/ai/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: fullMessages,
          images: activeUserTurnImages.length > 0 ? activeUserTurnImages : undefined,
          sessionId: activeSessionId,
          workspaceRoot: effectiveWorkspace || currentCwd || "",
          cwd: currentCwd || effectiveWorkspace || "",
          cwdTree,
          openTabs,
          activeFile,
          terminalTail,
          agentMode,
          model: mappedModel,
        }),
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const block of parts) {
            if (!block.trim()) continue;
            const eventMatch = block.match(/^event:\s*([^\r\n]+)/m);
            const dataMatch = block.match(/^data:\s*([\s\S]+)$/m);
            if (!eventMatch || !eventMatch[1] || !dataMatch || !dataMatch[1]) continue;

            const eventType = eventMatch[1].trim();
            let eventData: any = {};
            try {
              eventData = JSON.parse(dataMatch[1].trim());
            } catch {
              continue;
            }

            // Real-time synchronization to Antigravity Agent Activity Interface
            useAgentActivityStore.getState().processSseEvent({
              type: eventType,
              data: eventData,
              sessionId: activeSessionId,
            });

            if (eventType === "task.graph") {
              const steps: TaskGraphStepUI[] = eventData.steps || [];
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    const stream: AntigravityStreamItem[] = [...(last.actionStreamItems || [])];
                    for (const st of steps) {
                      if (!stream.some((it) => it.id === `task-${st.id}`)) {
                        stream.push({
                          id: `task-${st.id}`,
                          type: "terminal",
                          command: `Checked task ${st.title}`,
                          status: st.status === "running" ? "running" : st.status === "done" ? "completed" : "pending",
                          timestamp: Date.now(),
                        } as any);
                      }
                    }
                    msgs[msgs.length - 1] = {
                      ...last,
                      taskGraphSteps: steps,
                      actionStreamItems: stream,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
              setActivityFeedItems((prev) => [
                {
                  id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  timestamp: Date.now(),
                  agentId: "Orchestrator",
                  type: "thought",
                  title: `Formulated Task Graph (${steps.length} atomic steps)`,
                  detail: steps.map((st) => `${st.id}: ${st.title}`).join("\n"),
                },
                ...prev,
              ]);
            } else if (eventType === "task.update") {
              const { stepId, status, error, result } = eventData;
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    const stream: AntigravityStreamItem[] = [...(last.actionStreamItems || [])];
                    const existingIdx = stream.findIndex((it) => it.id === `task-${stepId}`);
                    const stepObj = (last.taskGraphSteps || []).find((st) => st.id === stepId);
                    const title = stepObj?.title || `Task ${stepId}`;

                    if (status === "done") {
                      if (existingIdx !== -1) {
                        stream[existingIdx] = {
                          ...stream[existingIdx],
                          status: "completed",
                          command: `${title} finished`,
                        } as any;
                      } else {
                        stream.push({
                          id: `task-${stepId}-done`,
                          type: "terminal",
                          command: `${title} finished`,
                          status: "completed",
                          timestamp: Date.now(),
                        } as any);
                      }
                    } else if (status === "running") {
                      if (existingIdx !== -1) {
                        stream[existingIdx] = {
                          ...stream[existingIdx],
                          status: "running",
                          command: `Checked task ${title}`,
                        } as any;
                      } else {
                        stream.push({
                          id: `task-${stepId}`,
                          type: "terminal",
                          command: `Checked task ${title}`,
                          status: "running",
                          timestamp: Date.now(),
                        } as any);
                      }
                      setThinkingStep(`Checked task ${title}`);
                    }

                    const updatedSteps: TaskGraphStepUI[] = (last.taskGraphSteps || []).map((st): TaskGraphStepUI => {
                      if (st.id !== stepId) return st;
                      const nextRetry = status === "pending" && error ? (st.retryCount || 0) + 1 : (st.retryCount ?? 0);
                      const updated: TaskGraphStepUI = {
                        ...st,
                        status,
                        retryCount: nextRetry,
                      };
                      if (error || st.error) updated.error = error || st.error;
                      if (result || st.result) updated.result = result || st.result;
                      return updated;
                    });
                    msgs[msgs.length - 1] = {
                      ...last,
                      taskGraphSteps: updatedSteps,
                      actionStreamItems: stream,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
            } else if (eventType === "agent.status") {
              const { agentId, status, message } = eventData;
              const displayMsg = message || status;
              setThinkingStep(displayMsg);
              setActivityFeedItems((prev) => [
                {
                  id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  timestamp: Date.now(),
                  agentId: agentId || "Agent",
                  type: "thought",
                  title: displayMsg,
                },
                ...prev,
              ]);
            } else if (eventType === "workspace.root_switched" || eventType === "workspace.rootChanged") {
              const newRoot = eventData.root || eventData.folderPath;
              if (newRoot) {
                if (window.electronAPI?.workspace?.openPath) {
                  window.electronAPI.workspace.openPath(newRoot);
                }
                if (window.electronAPI?.terminal?.cd) {
                  window.electronAPI.terminal.cd({ dir: newRoot });
                }
                if (editorApi?.setWorkspaceRoot) {
                  editorApi.setWorkspaceRoot(newRoot);
                }
                if (typeof window !== "undefined") {
                  (window as any).__THIRD_EYE_WORKSPACE_ROOT__ = newRoot;
                }
                setActivityFeedItems((prev) => [
                  {
                    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    timestamp: Date.now(),
                    agentId: "DirectoryGuard",
                    type: "thought",
                    title: `Switched Workspace Context to: ${newRoot}`,
                    detail: `Protected directory avoided. Switched workspace to ${newRoot}`,
                  },
                  ...prev,
                ]);
              }
            } else if (eventType === "tool.start") {
              const { agentId, name, args, risk } = eventData;
              setThinkingStep(`[${risk?.toUpperCase() || "TOOL"}] ${name}...`);
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    const cards = last.toolCallCards || [];
                    const newCard: ToolCallCardProps = {
                      toolName: name,
                      args,
                      risk: risk || "read",
                      status: "running",
                    };

                    // Live Antigravity stream tracking
                    const toolLower = (name || "").toLowerCase();
                    const stream: AntigravityStreamItem[] = [...(last.actionStreamItems || [])];

                    const isSearch =
                      toolLower.includes("search") ||
                      toolLower.includes("grep") ||
                      toolLower.includes("find") ||
                      toolLower === "searchcode";

                    const isRead =
                      !isSearch &&
                      (risk === "read" ||
                        toolLower.includes("read") ||
                        toolLower.includes("view") ||
                        toolLower.includes("analyze") ||
                        toolLower.includes("list"));

                    const isExec =
                      risk === "exec" ||
                      toolLower.includes("terminal") ||
                      toolLower.includes("command") ||
                      toolLower.includes("exec");

                    const isWrite =
                      risk === "write" ||
                      toolLower.includes("write") ||
                      toolLower.includes("edit") ||
                      toolLower.includes("diff") ||
                      toolLower.includes("patch") ||
                      toolLower.includes("replace") ||
                      toolLower.includes("create");

                    if (isSearch) {
                      const query =
                        args?.query ||
                        args?.pattern ||
                        args?.Query ||
                        args?.path ||
                        name;
                      stream.push({
                        id: `search-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        type: "search",
                        query: typeof query === "string" ? query : JSON.stringify(query),
                        status: "running",
                        timestamp: Date.now(),
                      });
                    } else if (isWrite) {
                      const target =
                        args?.path ||
                        args?.filePath ||
                        args?.AbsolutePath ||
                        args?.TargetFile ||
                        args?.file_path ||
                        args?.target_file ||
                        "";
                      const fileName = target ? target.split("/").pop() || target : "file";
                      stream.push({
                        id: `edit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        type: "file",
                        subType: "editing",
                        filePath: target,
                        fileName,
                        fileType: getFileTypeBadge(target).type,
                        status: "running",
                        timestamp: Date.now(),
                      });
                    } else if (isRead) {
                      const target =
                        args?.path ||
                        args?.filePath ||
                        args?.AbsolutePath ||
                        args?.TargetFile ||
                        (name === "analyze_codebase" ? "workspace" : "");
                      const fileName = target
                        ? target.split("/").pop() || target
                        : (name === "analyze_codebase" ? "workspace" : "file");
                      const start = args?.startLine || args?.StartLine;
                      const end = args?.endLine || args?.EndLine;
                      const lineRange = start && end ? `#L${start}-${end}` : args?.lineRange;

                      stream.push({
                        id: `an-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        type: "analyzed",
                        filePath: target,
                        fileName,
                        fileType: getFileTypeBadge(target).type,
                        lineRange,
                        status: "running",
                        timestamp: Date.now(),
                      });
                    } else if (isExec) {
                      const cmd =
                        args?.command ||
                        args?.CommandLine ||
                        (typeof args === "string" ? args : name);
                      stream.push({
                        id: `term-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        type: "terminal",
                        command: cmd || name,
                        status: "running",
                        timestamp: Date.now(),
                      });
                    }

                    msgs[msgs.length - 1] = {
                      ...last,
                      toolCallCards: [...cards, newCard],
                      actionStreamItems: stream,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
              setActivityFeedItems((prev) => [
                {
                  id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  timestamp: Date.now(),
                  agentId: agentId || "Worker",
                  type: "tool_call",
                  title: `Invoked ${name}`,
                  detail: typeof args === "string" ? args : JSON.stringify(args, null, 2),
                  risk,
                },
                ...prev,
              ]);
            } else if (eventType === "tool.end") {
              const { agentId, name, result, durationMs } = eventData;
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    const cards = (last.toolCallCards || []).map((c) =>
                      c.toolName === name && c.status === "running"
                        ? { ...c, status: (result?.success ?? true) ? ("completed" as const) : ("failed" as const), result, durationMs }
                        : c
                    );

                    const toolLower = (name || "").toLowerCase();
                    const stream: AntigravityStreamItem[] = [...(last.actionStreamItems || [])];

                    // If search tool, update last running search item
                    if (toolLower.includes("search") || toolLower.includes("grep") || toolLower.includes("find")) {
                      const lastSearchIdx = stream.map((it) => it.type).lastIndexOf("search");
                      if (lastSearchIdx !== -1) {
                        const sItem = stream[lastSearchIdx] as any;
                        let count = 0;
                        if (Array.isArray(result)) count = result.length;
                        else if (Array.isArray(result?.matches)) count = result.matches.length;
                        else if (Array.isArray(result?.data)) count = result.data.length;
                        else if (typeof result?.totalResults === "number") count = result.totalResults;
                        else if (typeof result?.count === "number") count = result.count;
                        else if (result?.success) count = 1;
                        stream[lastSearchIdx] = {
                          ...sItem,
                          status: "completed",
                          resultCount: count,
                        };
                      }
                    }

                    // If read / analyze tool, update last running analyzed item
                    if (toolLower.includes("read") || toolLower.includes("view") || toolLower.includes("analyze")) {
                      const lastAnalyzedIdx = stream.map((it) => it.type).lastIndexOf("analyzed");
                      if (lastAnalyzedIdx !== -1) {
                        const aItem = stream[lastAnalyzedIdx] as any;
                        const start = result?.startLine || aItem.lineRange;
                        const end = result?.endLine;
                        const lineRange = start && end ? `#L${start}-${end}` : aItem.lineRange;
                        stream[lastAnalyzedIdx] = {
                          ...aItem,
                          status: (result?.success ?? true) ? "completed" : "failed",
                          lineRange: lineRange || aItem.lineRange,
                        };
                      }
                    }

                    // If terminal tool, update last running terminal item
                    if (toolLower.includes("terminal") || toolLower.includes("command") || toolLower.includes("exec")) {
                      const lastTermIdx = stream.map((it) => it.type).lastIndexOf("terminal");
                      if (lastTermIdx !== -1) {
                        const termItem = stream[lastTermIdx] as any;
                        stream[lastTermIdx] = {
                          ...termItem,
                          status: (result?.success ?? true) ? "completed" : "failed",
                          output: typeof result === "string" ? result : result?.output,
                        };
                      }
                    }

                    const isWrite =
                      cards.find((c) => c.toolName === name)?.risk === "write" ||
                      toolLower.includes("write") ||
                      toolLower.includes("edit") ||
                      toolLower.includes("replace") ||
                      toolLower.includes("diff") ||
                      !!result?.diff;

                    if (isWrite) {
                      const filePath =
                        result?.diff?.path || result?.path || result?.filePath || "";
                      const lastEditIdx = stream.findIndex(
                        (it) => it.type === "file" && (it as any).subType === "editing" && it.status === "running"
                      );
                      if (lastEditIdx !== -1) {
                        const existing = stream[lastEditIdx] as any;
                        stream[lastEditIdx] = {
                          ...existing,
                          filePath: filePath || existing.filePath,
                          fileName: (filePath || existing.filePath)?.split("/").pop() || existing.fileName,
                          status: (result?.success ?? true) ? "completed" : "failed",
                          subType: (result?.success ?? true) ? "modified" : "failed",
                          addedCount: result?.diff?.addedCount ?? existing.addedCount ?? 0,
                          removedCount: result?.diff?.removedCount ?? existing.removedCount ?? 0,
                        };
                      } else if (filePath) {
                        const fileName = filePath.split("/").pop() || filePath;
                        const typeInfo = getFileTypeBadge(filePath);
                        stream.push({
                          id: `edit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                          type: "edited",
                          filePath,
                          fileName,
                          fileType: typeInfo.type,
                          addedCount: result?.diff?.addedCount ?? 0,
                          removedCount: result?.diff?.removedCount ?? 0,
                          timestamp: Date.now(),
                        });
                      }
                    }

                    msgs[msgs.length - 1] = {
                      ...last,
                      toolCallCards: cards,
                      actionStreamItems: stream,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
              const diffObj = result?.diff;
              const targetPath =
                diffObj?.path ||
                result?.path ||
                result?.filePath ||
                "";
              const origContent =
                diffObj?.originalContent ||
                diffObj?.original ||
                "";
              const modContent =
                diffObj?.modifiedContent ||
                diffObj?.modified ||
                result?.content ||
                "";

              if (diffObj && targetPath) {
                const diffItem: FileDiffItem = {
                  filePath: targetPath,
                  originalContent: origContent,
                  modifiedContent: modContent,
                  addedCount: diffObj.addedCount,
                  removedCount: diffObj.removedCount,
                };
                setActiveDiffs((prev) => [
                  ...(prev || []).filter((d) => d.filePath !== targetPath),
                  diffItem,
                ]);

                // Automatically open directly inside Monaco Diff Tab
                if ((editorApi as any)?.openDiffTab) {
                  (editorApi as any).openDiffTab(
                    targetPath,
                    origContent,
                    modContent,
                    diffObj.addedCount,
                    diffObj.removedCount
                  );
                } else if (editorApi) {
                  if (modContent) {
                    editorApi.updateContent(targetPath, modContent);
                  } else {
                    editorApi.openFile(targetPath);
                  }
                }
              }
            } else if (eventType === "agent.file_changed") {
              const { filePath, diff } = eventData;
              if (filePath) {
                const fileName = filePath.split("/").pop() || filePath;
                const typeInfo = getFileTypeBadge(filePath);
                setAgentSessions((prev) =>
                  prev.map((s) => {
                    if (s.id !== activeSessionId) return s;
                    const msgs = [...s.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === "assistant") {
                      const stream: AntigravityStreamItem[] = [...(last.actionStreamItems || [])];
                      stream.push({
                        id: `edit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        type: "edited",
                        filePath,
                        fileName,
                        fileType: typeInfo.type,
                        addedCount: diff?.addedCount ?? 0,
                        removedCount: diff?.removedCount ?? 0,
                        timestamp: Date.now(),
                      });
                      msgs[msgs.length - 1] = {
                        ...last,
                        actionStreamItems: stream,
                      };
                    }
                    return { ...s, messages: msgs };
                  })
                );

                const origContent = diff?.originalContent || diff?.original || "";
                const modContent = diff?.modifiedContent || diff?.modified || "";
                if (diff) {
                  const diffItem: FileDiffItem = {
                    filePath,
                    originalContent: origContent,
                    modifiedContent: modContent,
                    addedCount: diff.addedCount,
                    removedCount: diff.removedCount,
                  };
                  setActiveDiffs((prev) => [
                    ...(prev || []).filter((d) => d.filePath !== filePath),
                    diffItem,
                  ]);

                  // Automatically open directly inside Monaco Diff Tab
                  if ((editorApi as any)?.openDiffTab) {
                    (editorApi as any).openDiffTab(
                      filePath,
                      origContent,
                      modContent,
                      diff.addedCount,
                      diff.removedCount
                    );
                  } else if (editorApi) {
                    if (modContent) {
                      editorApi.updateContent(filePath, modContent);
                    }
                  }
                }
              }
            } else if (eventType === "checkpoint.created") {
              setLastCheckpointId(eventData.id);
              setActivityFeedItems((prev) => [
                {
                  id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  timestamp: Date.now(),
                  agentId: "CheckpointStore",
                  type: "checkpoint",
                  title: `Created snapshot checkpoint: ${eventData.id}`,
                  detail: eventData.description,
                },
                ...prev,
              ]);
            } else if (eventType === "permission.request") {
              setActivePermissionRequest({
                id: eventData.id || `perm_${Date.now()}`,
                toolName: eventData.toolName,
                args: eventData.args,
                command: eventData.command,
              });
            } else if (eventType === "artifact.created" || eventType === "artifact.updated") {
              const art: AgentArtifact = eventData.artifact;
              if (art && art.id) {
                setArtifacts((prev) => {
                  const filtered = prev.filter((a) => a.id !== art.id);
                  return [...filtered, art];
                });
                setActivityFeedItems((prev) => [
                  {
                    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    timestamp: Date.now(),
                    agentId: "ArtifactService",
                    type: "thought",
                    title: `Artifact ${eventType === "artifact.created" ? "Published" : "Updated"}: ${art.title}`,
                    detail: art.description,
                  },
                  ...prev,
                ]);
              }
            } else if (eventType === "agent.delta") {
              if (eventData.delta) {
                accumulatedText += eventData.delta;
                setThinkingStep("");
                setAgentSessions((prev) =>
                  prev.map((s) => {
                    if (s.id !== activeSessionId) return s;
                    const msgs = [...s.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === "assistant") {
                      msgs[msgs.length - 1] = {
                        ...last,
                        text: accumulatedText,
                        isStreaming: true,
                      };
                    }
                    return { ...s, messages: msgs };
                  })
                );
              }
            } else if (eventType === "agent.done") {
              const isSupervisorDone =
                !eventData.agentId ||
                eventData.agentId === "orchestrator" ||
                eventData.agentId === "autonomous";

              if (isSupervisorDone) {
                const summary = eventData.summary || accumulatedText;
                setAgentSessions((prev) =>
                  prev.map((s) => {
                    if (s.id !== activeSessionId) return s;
                    const msgs = [...s.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === "assistant") {
                      msgs[msgs.length - 1] = {
                        ...last,
                        text: summary || last.text,
                        isStreaming: false,
                      };
                    }
                    return { ...s, messages: msgs };
                  })
                );
                setLoading(false);
              }
            } else if (eventType === "thought") {
              const thoughts = eventData.thoughts || [];
              if (thoughts[0]) setThinkingStep(thoughts[0]);
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      thoughtDuration: eventData.duration || "2s",
                      thoughts: thoughts.length > 0 ? thoughts : last.thoughts,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
            } else if (eventType === "plan") {
              const plan = eventData.plan || [];
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      planItems: plan,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
            } else if (eventType === "tool_call") {
              const tc = eventData.toolCall;
              const name = tc?.name || "tool";
              setThinkingStep(`Executing: ${name}...`);
            } else if (eventType === "tool_result") {
              setThinkingStep("Synthesizing answer...");
            } else if (eventType === "file_change") {
              const files = eventData.files || [];
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      editedFiles: files,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );

              if (files.length > 0 && editorApi) {
                const target = files[files.length - 1];
                if (target?.path) {
                  if (window.electronAPI?.fs?.readFile) {
                    window.electronAPI.fs.readFile(target.path).then((r: any) => {
                      if (r?.success && typeof r.content === "string") {
                        editorApi.updateContent(target.path, r.content);
                      } else {
                        editorApi.openFile(target.path);
                      }
                    }).catch(() => {
                      editorApi.openFile(target.path);
                    });
                  } else {
                    editorApi.openFile(target.path);
                  }
                }
              }
            } else if (eventType === "delta") {
              if (eventData.delta && !accumulatedText.endsWith(eventData.delta)) {
                accumulatedText += eventData.delta;
                setAgentSessions((prev) =>
                  prev.map((s) => {
                    if (s.id !== activeSessionId) return s;
                    const msgs = [...s.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === "assistant") {
                      msgs[msgs.length - 1] = {
                        ...last,
                        text: accumulatedText,
                        isStreaming: true,
                      };
                    }
                    return { ...s, messages: msgs };
                  })
                );
              }
            } else if (eventType === "error") {
              const errMsg = eventData.error || "An error occurred during agent execution.";
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      text: `⚠️ **Agent Notice**: ${errMsg}`,
                      isStreaming: false,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
              setThinkingStep("");
              setLoading(false);
              break;
            } else if (eventType === "finish") {
              const finalReply = eventData.reply || accumulatedText;
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      text: finalReply || last.text || "Task complete.",
                      isStreaming: false,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
              setThinkingStep("");
              setLoading(false);
              break;
            }
          }
        }

        // Stream completed
        setAgentSessions((prev) =>
          prev.map((s) => {
            if (s.id !== activeSessionId) return s;
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === "assistant") {
              const p = userPrompt.trim().toLowerCase();
              const isGreeting =
                ['hi', 'hii', 'hiii', 'hello', 'hey', 'heya'].includes(p) ||
                (/^(hi|hii|hello|hey)\b/i.test(p) && p.length < 20);
              const fallbackText = isGreeting
                ? "Hello! I am **THIRD_EYE**, your autonomous coding assistant. How can I help you today?"
                : "Request completed. Ready for your next command.";
              msgs[msgs.length - 1] = {
                ...last,
                text: accumulatedText || last.text || fallbackText,
                isStreaming: false,
              };
            }
            return { ...s, messages: msgs };
          })
        );
        setThinkingStep("");
        setLoading(false);
        return;
      }
    } catch (_streamErr: any) {
      if (_streamErr?.name === "AbortError") {
        setLoading(false);
        setThinkingStep("");
        return;
      }
      // Fall through to electron / local fallback
    }

    // Fallback: Electron IPC or Local Intelligence
    const isElectron = typeof window !== "undefined" && Boolean(window.electronAPI);
    if (isElectron && window.electronAPI?.ai?.chat) {
      try {
        const terminalId = api.active?.ptyId || api.active?.id || "term";
        const currentCwd =
          api.workspaceRoot ||
          editorApi?.workspaceRoot ||
          api.active?.cwd ||
          (typeof window !== "undefined" && (window as any).__THIRD_EYE_WORKSPACE_ROOT__) ||
          "";

        const res = await window.electronAPI.ai.chat({
          terminalId,
          messages: [{ role: "user", content: userPrompt }],
          cwd: currentCwd,
          activeFile: editorApi?.activeFile || null,
          model: selectedModel,
        });

        const reply = res?.reply || "Done executing request.";
        setAgentSessions((prev) =>
          prev.map((s) => {
            if (s.id !== activeSessionId) return s;
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                text: reply,
                isStreaming: false,
                thoughtDuration: "3s",
              };
            }
            return { ...s, messages: msgs };
          })
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setAgentSessions((prev) =>
          prev.map((s) => {
            if (s.id !== activeSessionId) return s;
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                text: `Action completed with note: ${msg}`,
                isStreaming: false,
              };
            }
            return { ...s, messages: msgs };
          })
        );
      } finally {
        setThinkingStep("");
        setLoading(false);
      }
    } else {
      setTimeout(() => {
        const reply = generateSmartTerminalReply({
          query: userPrompt,
          lines: api.active ? (api.active.lines || []).map((l) => l.text) : [],
          session: api.active ?? null,
          sessions: api.sessions,
        });

        setAgentSessions((prev) =>
          prev.map((s) => {
            if (s.id !== activeSessionId) return s;
            const msgs = [...s.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                text: reply,
                isStreaming: false,
                thoughtDuration: "2s",
              };
            }
            return { ...s, messages: msgs };
          })
        );
        setThinkingStep("");
        setLoading(false);
      }, 350);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRunCommand = (cmd: string) => {
    if (api.active) {
      api.execute(cmd);
    } else {
      api.createTerminal("cmd");
      setTimeout(() => api.execute(cmd), 300);
    }
  };

  const handleOpenFile = (filename: string) => {
    const diffMatch = activeDiffs?.find(
      (d) =>
        d.filePath === filename ||
        d.filePath.endsWith("/" + filename) ||
        filename.endsWith("/" + d.filePath)
    );
    if (diffMatch && (editorApi as any)?.openDiffTab) {
      handleOpenFileDiff(diffMatch);
    } else if (editorApi) {
      editorApi.openFile(filename);
    }
  };

  const handleAddContext = () => {
    const activeName = editorApi?.activeFile?.name;
    if (activeName && !contextPills.includes(activeName)) {
      setContextPills((prev) => [...prev, activeName]);
    } else {
      const candidates = ["package.json", "tsconfig.json", "src/index.ts", "src/App.tsx"];
      const nextCandidate = candidates.find((c) => !contextPills.includes(c)) || `context-${contextPills.length + 1}.ts`;
      setContextPills((prev) => [...prev, nextCandidate]);
    }
  };

  const handleRemoveContext = (idx: number) => {
    setContextPills((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePermissionDecision = async (decision: "allow_once" | "allow_session" | "reject") => {
    if (!activePermissionRequest) return;
    try {
      await fetch("http://localhost:4002/api/ai/agent/permission_decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: activePermissionRequest.id,
          decision,
          command: activePermissionRequest.command,
        }),
      });
    } catch { }
    setActivePermissionRequest(null);
  };

  const handleStopAgent = async () => {
    // 1. Immediately abort active stream reader in browser
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. Tell backend to halt all running workers and loops
    try {
      await fetch("http://localhost:4002/api/ai/agent/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
    } catch { }

    // 3. Mark the message as paused/stopped by user
    setAgentSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = {
            ...last,
            text: last.text ? `${last.text}\n\n*[Execution stopped by user]*` : "*[Execution stopped by user]*",
            isStreaming: false,
          };
        }
        return { ...s, messages: msgs };
      })
    );

    setLoading(false);
    setThinkingStep("");
  };

  const handleUndoLastAction = async () => {
    try {
      const res = await fetch("http://localhost:4002/api/ai/agent/checkpoints");
      const cps = await res.json();
      if (!Array.isArray(cps) || cps.length === 0) {
        alert("No snapshot checkpoints recorded for rollback.");
        return;
      }
      const latest = cps[0];
      const revRes = await fetch("http://localhost:4002/api/ai/agent/revert_checkpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId: latest.id }),
      });
      if (revRes.ok) {
        const data = await revRes.json();
        alert(`Successfully reverted ${data.revertedFiles?.length || 0} files.`);
      }
    } catch (err: any) {
      alert(`Undo failed: ${err.message}`);
    }
  };

  const handleRevertSession = async () => {
    if (!confirm("Revert all workspace files modified during this session?")) return;
    try {
      const res = await fetch("http://localhost:4002/api/ai/agent/revert_session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Reverted ${data.revertedFiles?.length || 0} modified files across the session.`);
      }
    } catch (err: any) {
      alert(`Session revert failed: ${err.message}`);
    }
  };

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[#101114] border-l border-white/[0.06] font-sans select-none text-[#D0D0D8]">
      {/* ── 1. Top Header (Minimal & Clean matching Filesystem Sidebar) ── */}
      <div className="relative flex h-[35px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#101114] px-2.5 select-none overflow-hidden">
        {/* Left: Agents label + count */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12.5px] font-medium text-zinc-200 tracking-tight">Agents</span>
          <span className="px-1.5 py-0.2 text-[10px] font-mono font-medium rounded-full bg-white/[0.06] text-zinc-400 border border-white/[0.04]">
            {agentSessions.length}
          </span>
        </div>

        {/* Right: Action buttons — always fit without clipping */}
        <div className="flex items-center gap-0.5 text-zinc-400 min-w-0 shrink-0">
          {/* Skills (icon-only to save space) */}
          <button
            onClick={() => setSkillsOpen((p) => !p)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-1 rounded text-[11px] transition-colors cursor-pointer shrink-0",
              skillsOpen ? "text-zinc-100 bg-white/[0.08]" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
            )}
            title={`${availableSkills.length} Skills`}
          >
            <Sparkles className="h-3 w-3 text-zinc-400 shrink-0" />
            <span className="hidden [@media(min-width:380px)]:inline text-[10.5px]">{availableSkills.length}</span>
          </button>

          {/* Artifacts (icon-only) */}
          <button
            onClick={() => setArtifactsModalOpen(true)}
            className="relative flex items-center gap-1 px-1.5 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0"
            title="Open Artifacts"
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            {artifacts.length > 0 && (
              <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-zinc-400" />
            )}
          </button>

          <div className="h-3.5 w-px bg-white/[0.08] mx-0.5 shrink-0" />

          {/* Diffs badge (only when there are diffs) */}
          {activeDiffs && activeDiffs.length > 0 && (
            <button
              onClick={() => setDiffModalOpen(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.05] border border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              title="Review proposed diffs"
            >
              <FileCode className="h-3 w-3 text-zinc-400" />
              <span>{activeDiffs.length}</span>
            </button>
          )}

          {/* More actions dropdown (Filter / Activity / Undo / Revert) */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMoreMenuOpen((p) => !p)}
              className={cn(
                "p-1 rounded transition-colors cursor-pointer shrink-0",
                moreMenuOpen ? "text-zinc-100 bg-white/[0.08]" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
              )}
              title="More actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>

            {moreMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-[7px] bg-[#1A1B22] border border-[#2E2E38] shadow-2xl p-1 text-[12px]">
                  <button
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-white/[0.05] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Filter agents"
                    onClick={() => setMoreMenuOpen(false)}
                  >
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    <span>Filter Agents</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-white/[0.05] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Agent Activity Feed"
                    onClick={() => { setActivityFeedOpen(true); setMoreMenuOpen(false); }}
                  >
                    <Activity className="h-3.5 w-3.5 shrink-0" />
                    <span>Activity Feed</span>
                  </button>
                  <div className="my-1 h-px bg-white/[0.06]" />
                  <button
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-white/[0.05] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Undo Last Agent Action"
                    onClick={() => { handleUndoLastAction(); setMoreMenuOpen(false); }}
                  >
                    <Undo2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Undo Last Action</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-rose-500/10 text-zinc-300 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Revert All Agent Changes This Session"
                    onClick={() => { handleRevertSession(); setMoreMenuOpen(false); }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    <span>Revert Session</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* New Agent Button — always visible, shrink-0 */}
          <button
            onClick={handleCreateAgent}
            className="flex items-center gap-1 h-[22px] pl-1.5 pr-2 rounded-[5px] bg-[#222228] hover:bg-[#2A2A32] text-[#E0E0E8] hover:text-white border border-[#353540] hover:border-[#484858] text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs ml-0.5"
            title="Create New Agent"
          >
            <Plus className="h-3 w-3 text-[#A0A0B0] shrink-0" />
            <span className="whitespace-nowrap leading-none hidden [@media(min-width:340px)]:inline">New Agent</span>
          </button>

          {/* Close icon — pinned far right, always visible */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0"
              title="Close panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Bounded Skills Dropdown (Never overflows sidecar bounds) */}
        {skillsOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setSkillsOpen(false)}
            />
            <div className="absolute left-2 right-2 top-full mt-1.5 rounded-lg bg-[#141518]/95 backdrop-blur-md border border-white/[0.08] p-3 shadow-2xl z-50 text-[11.5px] space-y-2 select-text max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06] text-zinc-200 font-medium shrink-0">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Loaded Skills</span>
                </div>
                <span className="text-[10px] text-zinc-400 bg-white/[0.06] px-1.5 py-0.5 rounded font-mono">
                  SKILL.md
                </span>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin flex-1 pr-0.5">
                {availableSkills.map((sk) => (
                  <div key={sk.id} className="p-2 rounded bg-white/[0.03] border border-white/[0.05] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-200 font-medium text-[11px]">{sk.name}</span>
                      {sk.tools && sk.tools.length > 0 && (
                        <span className="text-[9.5px] text-zinc-500 font-mono">{sk.tools.length} tools</span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-zinc-400 line-clamp-2 leading-tight">
                      {sk.description}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-zinc-500 leading-tight pt-1 border-t border-white/[0.06] shrink-0">
                Drop any folder with a <code className="text-zinc-300">SKILL.md</code> in <code className="text-zinc-300">skills/</code> to expand capabilities.
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── 2. Multi-Agent Session Tabs ── */}
      <div className="flex items-center border-b border-white/[0.06] bg-[#101114] px-2 py-1 gap-1 overflow-x-auto scrollbar-none">
        {agentSessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={cn(
                "group flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans rounded-md transition-colors whitespace-nowrap cursor-pointer select-none",
                isActive
                  ? "bg-white/[0.08] text-white font-medium border border-white/[0.08]"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", session.dotColor)} />
              <span className="truncate max-w-[130px]">{session.name}</span>
              {agentSessions.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => handleCloseAgentTab(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-white p-0.5 rounded transition-opacity cursor-pointer"
                  title="Close session"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 3. Messages Body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 scrollbar-thin bg-[#101114]">
        {(!activeSession || activeSession.messages.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
            <div className="h-10 w-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
              <Bot className="h-5 w-5 text-zinc-400" />
            </div>
            <h3 className="text-[13.5px] font-semibold text-white tracking-wide">THIRD_EYE Workspace Agent</h3>
            <p className="text-[12px] text-[#8E8E98] max-w-[320px] mt-1 leading-relaxed">
              Ask questions, inspect codebase files, run terminal commands, or let the agent autonomously solve issues.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-[360px]">
              <button
                type="button"
                onClick={() => handleSend("What files are in this project?")}
                className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-[5px] bg-[#1E1E22] border border-[#2E2E36] text-[#CCCCCC] hover:text-white hover:border-[#38BDF8]/60 transition-colors cursor-pointer"
              >
                <Folder className="h-3 w-3 text-[#38BDF8]" />
                <span>Explore workspace</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend("Check build and type errors")}
                className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-[5px] bg-[#1E1E22] border border-[#2E2E36] text-[#CCCCCC] hover:text-white hover:border-[#10B981]/60 transition-colors cursor-pointer"
              >
                <Zap className="h-3 w-3 text-[#10B981]" />
                <span>Check build</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend("Debug active file")}
                className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-[5px] bg-[#1E1E22] border border-[#2E2E36] text-[#CCCCCC] hover:text-white hover:border-[#FF7A45]/60 transition-colors cursor-pointer"
              >
                <Search className="h-3 w-3 text-[#FF7A45]" />
                <span>Debug active file</span>
              </button>
            </div>
          </div>
        )}
        {activeSession?.messages.map((m, idx) => {
          if (m.role === "user") {
            return (
              <motion.div
                key={m.id || `user-${idx}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="w-full select-text my-2"
              >
                <div className="w-full rounded-lg bg-white/[0.035] border border-white/[0.06] px-3.5 py-2.5 text-[12.5px] text-zinc-200 font-sans leading-relaxed">
                  {m.images && m.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2.5">
                      {m.images.map((img, imgIdx) => (
                        <div
                          key={img.id || imgIdx}
                          className="relative rounded-lg overflow-hidden border border-white/15 bg-black/40 group max-w-[220px]"
                        >
                          <img
                            src={img.data}
                            alt={img.name || `Attached image ${imgIdx + 1}`}
                            className="max-h-44 w-auto object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(img.data, "_blank")}
                            title="Click to view full size"
                          />
                          {img.name && (
                            <div className="px-2 py-1 text-[10.5px] text-zinc-400 bg-black/60 truncate max-w-[220px]">
                              {img.name}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {m.docs && m.docs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2.5">
                      {m.docs.map((doc, docIdx) => {
                        const colors = getDocBadgeColor(doc.extension);
                        return (
                          <div
                            key={doc.id || docIdx}
                            className={cn(
                              "rounded-lg border p-2 bg-black/50 flex items-center gap-2.5 max-w-[280px] shadow-sm select-none",
                              colors.border
                            )}
                          >
                            <div className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0", colors.bg, colors.text)}>
                              {doc.extension}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-[11px] text-zinc-200 truncate font-medium" title={doc.name}>
                                {doc.name}
                              </div>
                              <div className="text-[10px] text-zinc-400">
                                {doc.isPdf ? "PDF Document" : `${doc.lineCount || 1} lines`} · {doc.sizeFormatted}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {m.text && (
                    <AiMarkdownView
                      content={m.text}
                      isStreaming={false}
                      onOpenFile={handleOpenFile}
                    />
                  )}
                </div>
              </motion.div>
            );
          }

          return (
            <motion.div
              key={m.id || `asst-${idx}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-2 select-text my-2"
            >
              {/* Assistant Message with Sparkle icon */}
              <div className="flex items-start gap-2.5">
                <AiSparkBadge />
                <div className="flex-1 min-w-0 pt-0.5 space-y-2">
                  {/* Antigravity Inline Activity Stream */}
                  {((m.actionStreamItems && m.actionStreamItems.length > 0) ||
                    (m.toolCallCards && m.toolCallCards.length > 0) ||
                    (m.isStreaming && thinkingStep && !m.text) ||
                    m.thoughtDuration) && (
                      <AntigravityActionStream
                        items={
                          m.actionStreamItems && m.actionStreamItems.length > 0
                            ? m.actionStreamItems
                            : toolCardsToActionStream(m.toolCallCards || [])
                        }
                        activeStep={m.isStreaming && !m.text ? thinkingStep : undefined}
                        duration={m.thoughtDuration || (m.isStreaming ? "Working..." : undefined)}
                        thoughts={m.thoughts}
                        isStreaming={m.isStreaming}
                        onOpenFile={handleOpenFile}
                        onViewAllChanges={() => {
                          if (activeDiffs && activeDiffs.length > 0 && activeDiffs[0]) {
                            handleOpenFileDiff(activeDiffs[0]);
                          } else {
                            const files =
                              m.actionStreamItems
                                ?.filter((it) => it.type === "edited")
                                .map((it) => (it as any).filePath) || [];
                            if (files.length > 0) {
                              handleOpenFile(files[0]!);
                            }
                          }
                        }}
                        totalUniqueFilesCount={
                          activeDiffs && activeDiffs.length > 0
                            ? activeDiffs.length
                            : m.actionStreamItems?.filter((it) => it.type === "edited").length
                        }
                      />
                    )}

                  {m.text ? (
                    <AiMarkdownView
                      content={m.text}
                      isStreaming={m.isStreaming}
                      onRun={handleRunCommand}
                      onApplyToEditor={(code) => {
                        if (editorApi) {
                          const targetPath =
                            editorApi.activeFilePath ||
                            (editorApi.activeFile ? editorApi.activeFile.path : "");
                          if (targetPath) {
                            editorApi.updateContent(targetPath, code);
                          }
                        }
                      }}
                      onOpenFile={handleOpenFile}
                    />
                  ) : null}

                  {/* Per-File Diff Card against each file in AI side bar */}
                  {activeDiffs && activeDiffs.length > 0 ? (
                    <SidebarDiffReviewCard
                      files={activeDiffs}
                      onOpenFileDiff={handleOpenFileDiff}
                      onAcceptFile={handleAcceptDiff}
                      onRejectFile={handleRejectDiff}
                      onAcceptAll={handleAcceptAllDiffs}
                      onRejectAll={handleRejectAllDiffs}
                    />
                  ) : m.editedFiles && m.editedFiles.length > 0 ? (
                    <EditedFilesCard
                      files={m.editedFiles}
                      onOpenFile={handleOpenFile}
                      onViewDiff={() => {
                        if (m.editedFiles && m.editedFiles[0]) {
                          handleOpenFile(m.editedFiles[0].name);
                        }
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Sticky Permission Approval Prompt Card (§6) */}
        {activePermissionRequest && (
          <PermissionPromptCard
            request={activePermissionRequest}
            onDecision={handlePermissionDecision}
          />
        )}

        {/* Fallback bottom loader (only shown when no assistant message is actively streaming) */}
        {loading && !activeSession?.messages.some((m) => m.role === "assistant" && m.isStreaming) && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 py-1 text-[12px] font-sans"
          >
            <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400 thinking-dot-glow" />
            </span>
            <span className="thinking-text-shimmer text-[12px] truncate">
              {thinkingStep || "Thinking..."}
            </span>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── 4. Bottom Context Pills ── */}
      <div className="px-3 py-1.5 bg-[#0e0f12] border-t border-white/[0.06] flex items-center gap-1.5 overflow-x-auto scrollbar-none select-none">
        {contextPills.map((pill, idx) => (
          <div
            key={idx}
            className="flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-white/[0.04] border border-white/[0.06] text-[11px] font-mono text-zinc-300 shrink-0 hover:border-white/[0.12] transition-colors"
          >
            <span
              onClick={() => handleOpenFile(pill)}
              className="cursor-pointer hover:underline text-sky-400"
            >
              @{pill}
            </span>
            <button
              onClick={() => handleRemoveContext(idx)}
              className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={handleAddContext}
          className="flex items-center gap-1 px-2 py-0.5 rounded-[4px] border border-dashed border-white/[0.08] hover:border-white/[0.16] text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="h-3 w-3" />
          <span>Add context</span>
        </button>
      </div>

      {/* ── Sticky Per-File Diff Review Section in AI Sidebar ── */}
      {activeDiffs && activeDiffs.length > 0 && (
        <div className="px-3 pt-2 pb-1 bg-[#101114] border-t border-white/[0.06]">
          <SidebarDiffReviewCard
            files={activeDiffs}
            onOpenFileDiff={handleOpenFileDiff}
            onAcceptFile={handleAcceptDiff}
            onRejectFile={handleRejectDiff}
            onAcceptAll={handleAcceptAllDiffs}
            onRejectAll={handleRejectAllDiffs}
            compact={true}
          />
        </div>
      )}

      {/* ── 4b. Background Running Tasks Dock (Matching Antigravity Screenshots 1-5) ── */}
      {runningTasks.length > 0 && (
        <div className="mx-3 mb-1.5 rounded-lg bg-[#141518]/90 border border-white/[0.08] overflow-hidden text-[12px] select-none shadow-sm">
          <button
            type="button"
            onClick={() => setTasksDockExpanded((p) => !p)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-300 hover:text-white cursor-pointer font-sans transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="font-medium text-[11.5px]">
                {runningTasks.length} task{runningTasks.length === 1 ? "" : "s"} running
              </span>
            </div>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-zinc-500 transition-transform duration-200",
                !tasksDockExpanded && "-rotate-90"
              )}
            />
          </button>
          {tasksDockExpanded && (
            <div className="px-3 pb-2 pt-0.5 border-t border-white/[0.06] space-y-1 font-mono text-[11px] text-zinc-400">
              {runningTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-zinc-500 font-bold">&gt;-</span>
                    <span className="truncate text-zinc-300">{t.command}</span>
                  </div>
                  {t.onKill && (
                    <button
                      type="button"
                      onClick={() => t.onKill?.()}
                      className="text-[10px] text-rose-400/80 hover:text-rose-300 font-sans px-1.5 py-0.5 rounded hover:bg-rose-500/10 transition-colors ml-2 shrink-0 cursor-pointer"
                    >
                      Stop
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 5. Input Container (Antigravity Minimalism) ── */}
      <div className="p-3 bg-[#0e0f12] border-t border-white/[0.06]">
        {/* Hidden File Input for images */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          multiple
          className="hidden"
        />

        {/* Hidden File Input for documents & code */}
        <input
          type="file"
          ref={docInputRef}
          onChange={handleDocSelect}
          accept=".pdf,.txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.scss,.yaml,.yml,.toml,.xml,.sh,.bash,.sql,.env,.log,.rs,.go,.java,.c,.cpp,.h"
          multiple
          className="hidden"
        />

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "rounded-xl bg-[#141518] border transition-all p-3 shadow-sm",
            isDraggingOver
              ? "border-sky-500/60 ring-2 ring-sky-500/20 bg-[#161820]"
              : "border-white/[0.08] focus-within:border-white/[0.18] focus-within:ring-1 focus-within:ring-white/[0.06]"
          )}
        >
          {/* Attached Files & Documents Thumbnail / Badge Preview Strip */}
          {(attachedImages.length > 0 || attachedDocs.length > 0) && (
            <div className="flex flex-wrap gap-2 pb-2 mb-2 border-b border-white/[0.06]">
              {attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative group rounded-md overflow-hidden border border-white/[0.1] bg-black/50 flex items-center gap-1.5 pr-2 pl-1 py-1 text-[11px] text-zinc-300"
                >
                  <img
                    src={img.data}
                    alt={img.name}
                    className="h-7 w-7 object-cover rounded shadow-inner"
                  />
                  <span className="truncate max-w-[110px] font-mono text-[10.5px]">{img.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(img.id)}
                    className="text-zinc-400 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors ml-0.5 cursor-pointer"
                    title="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {attachedDocs.map((doc) => {
                const colors = getDocBadgeColor(doc.extension);
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "relative group rounded-md border bg-black/60 flex items-center gap-1.5 pr-2 pl-2 py-1 text-[11px] text-[#D0D0D5]",
                      colors.border
                    )}
                  >
                    <span className={cn("px-1 py-0.5 rounded text-[9px] font-mono font-bold uppercase", colors.bg, colors.text)}>
                      {doc.extension}
                    </span>
                    <span className="truncate max-w-[120px] font-mono text-[10.5px]" title={doc.name}>
                      {doc.name}
                    </span>
                    <span className="text-[9.5px] text-zinc-500 font-mono">({doc.sizeFormatted})</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc(doc.id)}
                      className="text-zinc-400 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors ml-0.5 cursor-pointer"
                      title="Remove document"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              attachedImages.length > 0 || attachedDocs.length > 0
                ? "Describe what you want the AI to do with the attached file(s)..."
                : "Ask anything, attach code/docs/images, paste screenshot (Cmd+V)..."
            }
            rows={2}
            className="w-full bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none resize-none font-sans min-h-[42px] max-h-[140px] leading-relaxed"
          />

          {/* Bottom Toolbar inside Input Card */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-1 gap-2">
            {/* Left Controls: Model Pill | Pencil | Image | Attach */}
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 select-none min-w-0">
              {/* Model Selector Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModelMenuOpen((p) => !p)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] transition-all cursor-pointer text-[11px] font-sans font-medium select-none shrink-0",
                    modelMenuOpen
                      ? "bg-white/[0.08] text-white border border-white/[0.16] shadow-sm"
                      : "bg-white/[0.04] hover:bg-white/[0.07] text-zinc-300 hover:text-white border border-white/[0.06]"
                  )}
                  title="Select AI Model, Local Ollama, or API Integration"
                >
                  <span className="truncate max-w-[135px]">{selectedModel}</span>
                  {modelMenuOpen ? (
                    <ChevronUp className="h-3 w-3 opacity-90 text-sky-400" />
                  ) : (
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  )}
                </button>

                <ModelSelectionPopover
                  open={modelMenuOpen}
                  onClose={() => setModelMenuOpen(false)}
                  selectedModel={selectedModel}
                  onSelectModel={(modelName) => {
                    setSelectedModel(modelName);
                    setModelMenuOpen(false);
                  }}
                  onOpenFullModal={() => {
                    setModelMenuOpen(false);
                    setAiConnectorOpen(true);
                  }}
                />
              </div>

              {/* Image upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1 hover:text-white rounded hover:bg-[#28221D] transition-colors cursor-pointer text-[#8E877F]"
                title="Upload image or screenshot"
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </button>

              {/* Paperclip / attach documents & code */}
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="p-1 hover:text-white rounded hover:bg-[#28221D] transition-colors cursor-pointer text-[#8E877F]"
                title="Attach documents (.pdf, .txt, .md, .json, .csv, code files)"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Right: Send / Stop button — always shrink-0 so it's never clipped */}
            {loading ? (
              <button
                type="button"
                onClick={handleStopAgent}
                className="p-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer shadow-sm flex items-center justify-center shrink-0"
                title="Stop generation"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() && attachedImages.length === 0 && attachedDocs.length === 0}
                className={cn(
                  "p-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center shrink-0",
                  input.trim() || attachedImages.length > 0 || attachedDocs.length > 0
                    ? "bg-gradient-to-r from-[#FF6B00] to-[#EA580C] hover:from-[#FF7D1A] hover:to-[#F97316] text-white shadow-sm shadow-orange-500/25"
                    : "text-[#555562] cursor-not-allowed"
                )}
                title="Send (Enter)"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {activityFeedOpen && (
        <ActivityFeedModal
          items={activityFeedItems}
          onClose={() => setActivityFeedOpen(false)}
        />
      )}

      {artifactsModalOpen && (
        <ArtifactsModal
          isOpen={artifactsModalOpen}
          onClose={() => setArtifactsModalOpen(false)}
          artifacts={artifacts}
          sessionId={activeSessionId}
          onRefresh={() => fetchArtifacts(activeSessionId)}
          onViewDiff={(filePath, orig, mod) => {
            setActiveDiffs([
              {
                filePath,
                originalContent: orig,
                modifiedContent: mod,
              },
            ]);
            setDiffModalOpen(true);
            setArtifactsModalOpen(false);
          }}
        />
      )}

      {/* AI Connector & Local Model / API Key Modal */}
      <AiConnectorModal
        open={aiConnectorOpen}
        onClose={() => setAiConnectorOpen(false)}
        activeModel={selectedModel}
        onSelectModel={(modelName) => {
          setSelectedModel(modelName);
        }}
      />

    </aside>
  );
}
