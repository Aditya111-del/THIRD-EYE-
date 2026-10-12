import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
import { DiffViewerModal, FileDiffItem } from "./DiffViewerModal";
import { ActivityFeedModal, ActivityFeedItem } from "./ActivityFeedModal";
import { ArtifactsModal } from "./ArtifactsModal";
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
 * Glowing AI Spark badge matching Screenshot 4
 */
export function AiSparkBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-6 w-6 rounded-[5px] bg-gradient-to-br from-[#1E58FC] via-[#4F46E5] to-[#7C3AED] flex items-center justify-center shadow-[0_0_12px_rgba(79,70,229,0.55)] shrink-0 select-none",
        className
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-white fill-white" />
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
                <div className="h-4 w-4 rounded-[3px] bg-[#0C1E3C] border border-[#007ACC] flex items-center justify-center text-[#38BDF8] shrink-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#38BDF8]" />
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
 * Tool Execution Row matching Screenshot 4
 */
export function ToolExecutionRow({
  query = "'useSession'",
  count = "12 results",
}: {
  query?: string;
  count?: string;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-[6px] bg-[#141519] border border-[#222328] text-xs font-mono my-2 select-none">
      <div className="flex items-center gap-2 text-[#9E9EA8] truncate">
        <Search className="h-3.5 w-3.5 text-[#70707B] shrink-0" />
        <span className="truncate">Searched repo {query}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <span className="text-[#8E8E98]">{count}</span>
        <Check className="h-3.5 w-3.5 text-[#10B981] stroke-[2.5]" />
      </div>
    </div>
  );
}

/**
 * Collapsible Edited Files Card matching Screenshot 5
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
  const [open, setOpen] = useState(true);
  const totalAdded = files.reduce((acc, f) => acc + f.added, 0);
  const totalRemoved = files.reduce((acc, f) => acc + f.removed, 0);

  return (
    <div className="rounded-[8px] bg-[#121316] border border-[#23242A] overflow-hidden my-2 select-none shadow-sm">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-[#18191F] transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2 text-white">
          <Pencil className="h-3.5 w-3.5 text-[#C4C4CC] shrink-0" />
          <span className="font-mono text-[12px]">Edited {files.length} files</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[12px]">
          <span className="text-[#10B981] font-bold">+{totalAdded}</span>
          <span className="text-[#EF4444] font-bold">-{totalRemoved}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-[#888892] transition-transform", !open && "-rotate-90")}
          />
        </div>
      </button>

      {open && (
        <div className="px-3 pb-2.5 pt-1 space-y-1 text-xs font-mono border-t border-[#1D1E24]">
          {files.map((file, idx) => (
            <div
              key={idx}
              onClick={() => onOpenFile?.(file.name)}
              className="flex items-center gap-2 text-[#D0D0D8] py-0.5 hover:text-white cursor-pointer group transition-colors"
              title={`Click to open ${file.name} in Editor`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#0084FF] shrink-0" />
              <span className="text-[#E0E0E6] group-hover:text-[#38BDF8] underline-offset-2 group-hover:underline">
                {file.name}
              </span>
              <span className="text-[#666672]">·</span>
              <span className="text-[#10B981]">+{file.added}</span>
              <span className="text-[#EF4444]">-{file.removed}</span>
            </div>
          ))}
          <div className="pt-1 flex items-center gap-3">
            <button
              onClick={onViewDiff}
              className="text-[#8E8E98] hover:text-[#38BDF8] flex items-center gap-1 text-[11px] font-mono cursor-pointer transition-colors"
            >
              <span>&gt; view diff</span>
            </button>
          </div>
        </div>
      )}
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
    <div className="my-1.5 select-none">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-xs text-[#8E8E98] hover:text-[#C5C5CE] font-mono italic cursor-pointer transition-colors"
      >
        <ChevronRight
          className={cn("h-3 w-3 text-[#6E6E78] transition-transform", open && "rotate-90")}
        />
        <span>Thought for {duration}</span>
      </button>
      {open && (
        <div className="mt-1.5 pl-3 border-l border-[#2B2B32] space-y-1 text-[11px] font-mono text-[#8E8E98]">
          {thoughts.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
        </div>
      )}
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
              className="flex items-center gap-1 rounded bg-[#007ACC] px-2 py-0.5 text-white hover:bg-[#008BE0] transition-colors cursor-pointer font-medium"
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
  "Gemini 3.8 Flash",
  "Gemini 3.8 Pro",
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
  const [selectedModel, setSelectedModel] = useState("Gemini 3.8 Flash");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("autonomous");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string>("");
  const [contextPills, setContextPills] = useState<string[]>([]);

  // Autonomous Multi-Agent State (§6)
  const [activePermissionRequest, setActivePermissionRequest] = useState<PermissionRequestPayload | null>(null);
  const [activeDiffs, setActiveDiffs] = useState<FileDiffItem[] | null>(null);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);
  const [activityFeedItems, setActivityFeedItems] = useState<ActivityFeedItem[]>([]);
  const [lastCheckpointId, setLastCheckpointId] = useState<string | null>(null);
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

  useEffect(() => {
    fetch("http://localhost:4002/api/ai/skills")
      .then((r) => r.json())
      .then((data) => {
        if (data?.skills && Array.isArray(data.skills) && data.skills.length > 0) {
          setAvailableSkills(data.skills);
        }
      })
      .catch(() => {});
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    if (!userPrompt || loading) return;

    const userMsg: ExtendedChatMsg = {
      role: "user",
      text: userPrompt,
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
          ? userPrompt.length > 22
            ? userPrompt.slice(0, 22) + "..."
            : userPrompt
          : s.name;
        return {
          ...s,
          name: newName,
          messages: [...s.messages, userMsg, assistantPlaceholder],
        };
      })
    );

    setInput("");
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
        } catch {}
      }

      const openTabs = (editorApi?.openFiles || []).map((f) => ({ path: f.path, name: f.name }));
      const activeFile = editorApi?.activeFile || null;
      const terminalTail = api.active
        ? (api.active.lines || []).slice(-30).map((l) => l.text).join("\n")
        : "";

      const mappedModel = selectedModel.includes("Pro")
        ? "gemini-pro-latest"
        : selectedModel.includes("GPT")
        ? "gpt-4o"
        : "gemini-3.1-flash-lite-preview";

      const previousTurns = (activeSession?.messages || [])
        .filter((m) => !m.isStreaming && (m.text || m.suggestedCommand || (m.traces && m.traces.length > 0) || (m.toolCallCards && m.toolCallCards.length > 0)))
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
          };
        })
        .filter((m) => m.content && m.content.trim().length > 0);
      const fullMessages = [...previousTurns, { role: "user", content: userPrompt }];

      const response = await fetch("http://localhost:4002/api/ai/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: fullMessages,
          sessionId: activeSessionId,
          workspaceRoot: effectiveWorkspace || currentCwd || "",
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
                    msgs[msgs.length - 1] = {
                      ...last,
                      taskGraphSteps: steps,
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
                  if (last && last.role === "assistant" && last.taskGraphSteps) {
                    const updatedSteps: TaskGraphStepUI[] = last.taskGraphSteps.map((st): TaskGraphStepUI => {
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
                      if (filePath) {
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
                setActiveDiffs((prev) => [
                  ...(prev || []).filter((d) => d.filePath !== targetPath),
                  {
                    filePath: targetPath,
                    originalContent: origContent,
                    modifiedContent: modContent,
                    addedCount: diffObj.addedCount,
                    removedCount: diffObj.removedCount,
                  },
                ]);
              }

              // Embed code live directly into Monaco Editor
              if (targetPath && editorApi) {
                if (modContent) {
                  editorApi.updateContent(targetPath, modContent);
                } else if (window.electronAPI?.fs?.readFile) {
                  window.electronAPI.fs.readFile(targetPath).then((r: any) => {
                    if (r?.success && typeof r.content === "string") {
                      editorApi.updateContent(targetPath, r.content);
                    } else {
                      editorApi.openFile(targetPath);
                    }
                  }).catch(() => {
                    editorApi.openFile(targetPath);
                  });
                } else {
                  editorApi.openFile(targetPath);
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
                  setActiveDiffs((prev) => [
                    ...(prev || []).filter((d) => d.filePath !== filePath),
                    {
                      filePath,
                      originalContent: origContent,
                      modifiedContent: modContent,
                      addedCount: diff.addedCount,
                      removedCount: diff.removedCount,
                    },
                  ]);
                }

                // Live code embedding directly in Monaco Editor
                if (editorApi) {
                  if (modContent) {
                    editorApi.updateContent(filePath, modContent);
                  } else if (window.electronAPI?.fs?.readFile) {
                    window.electronAPI.fs.readFile(filePath).then((r: any) => {
                      if (r?.success && typeof r.content === "string") {
                        editorApi.updateContent(filePath, r.content);
                      }
                    }).catch(() => {});
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
              const summary = eventData.summary || accumulatedText;
              setAgentSessions((prev) =>
                prev.map((s) => {
                  if (s.id !== activeSessionId) return s;
                  const msgs = [...s.messages];
                  const last = msgs[msgs.length - 1];
                  if (last && last.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      text: summary,
                      isStreaming: false,
                    };
                  }
                  return { ...s, messages: msgs };
                })
              );
              setLoading(false);
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
              // Legacy handled
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
              if (eventData.delta) {
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
              setLoading(false);
              return;
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
              setLoading(false);
              return;
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
        setLoading(false);
        return;
      }
    } catch (_streamErr) {
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
    if (editorApi) {
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
    } catch {}
    setActivePermissionRequest(null);
  };

  const handleStopAgent = async () => {
    try {
      await fetch("http://localhost:4002/api/ai/agent/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
    } catch {}
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
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[#181818] border-l border-[#262626] font-sans select-none text-[#D0D0D8]">
      {/* ── 1. Top Header (Minimal & Clean matching Filesystem Sidebar) ── */}
      <div className="relative flex h-[35px] shrink-0 items-center justify-between border-b border-[#262626] bg-[#181818] px-3 select-none">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-medium text-zinc-200 tracking-tight">Agents</span>
          <span className="px-1.5 py-0.2 text-[10px] font-mono font-medium rounded-full bg-white/[0.06] text-zinc-400 border border-white/[0.04]">
            {agentSessions.length}
          </span>
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          {/* Active Skills Button */}
          <button
            onClick={() => setSkillsOpen((p) => !p)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors cursor-pointer",
              skillsOpen ? "text-zinc-100 bg-white/[0.08]" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
            )}
            title="Discovered Agent Skills"
          >
            <Sparkles className="h-3 w-3 text-zinc-400 shrink-0" />
            <span>{availableSkills.length} Skills</span>
          </button>

          {/* Artifacts Button */}
          <button
            onClick={() => setArtifactsModalOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
            title="Open Artifacts"
          >
            <Layers className="h-3.5 w-3.5 text-zinc-400" />
            <span>Artifacts</span>
            {artifacts.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            )}
          </button>

          <div className="h-3.5 w-px bg-white/[0.08] mx-0.5" />

          {/* Filter icon */}
          <button
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer"
            title="Filter agents"
          >
            <Filter className="h-3.5 w-3.5" />
          </button>

          {/* Activity Feed icon */}
          <button
            onClick={() => setActivityFeedOpen(true)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer"
            title="Agent Activity Feed"
          >
            <Activity className="h-3.5 w-3.5" />
          </button>

          {/* Undo Last Checkpoint */}
          <button
            onClick={handleUndoLastAction}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer"
            title="Undo Last Agent Action"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>

          {/* Revert Session Checkpoints */}
          <button
            onClick={handleRevertSession}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer"
            title="Revert All Agent Changes This Session"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Proposed Diffs Review Badge if any */}
          {activeDiffs && activeDiffs.length > 0 && (
            <button
              onClick={() => setDiffModalOpen(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-mono bg-white/[0.05] border border-white/[0.08] text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <FileCode className="h-3 w-3 text-zinc-400" />
              <span>Diffs ({activeDiffs.length})</span>
            </button>
          )}

          {/* New Agent Button (Polished, Single Line, Non-wrapping) */}
          <button
            onClick={handleCreateAgent}
            className="flex items-center gap-1.5 h-[24px] px-2.5 rounded-[5px] bg-[#222228] hover:bg-[#2A2A32] text-[#E0E0E8] hover:text-white border border-[#353540] hover:border-[#484858] text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs ml-1"
            title="Create New Agent"
          >
            <Plus className="h-3.5 w-3.5 text-[#A0A0B0] shrink-0" />
            <span className="whitespace-nowrap leading-none">New Agent</span>
          </button>

          {/* Close icon */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer ml-0.5"
              title="Close panel"
            >
              <X className="h-4 w-4" />
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
            <div className="absolute left-3 right-3 top-full mt-1.5 rounded-lg bg-[#141518]/95 backdrop-blur-md border border-white/[0.08] p-3 shadow-2xl z-50 text-[11.5px] space-y-2 select-text max-h-[70vh] flex flex-col">
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
      <div className="flex items-center border-b border-[#262626] bg-[#181818] px-2 py-1 gap-1 overflow-x-auto scrollbar-none">
        {agentSessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={cn(
                "group flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-mono rounded transition-colors whitespace-nowrap cursor-pointer select-none",
                isActive
                  ? "bg-[#252528] text-white font-medium border border-[#333338] shadow-sm"
                  : "text-[#8E8E98] hover:text-[#D0D0D8] hover:bg-[#202022]"
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
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 scrollbar-thin bg-[#181818]">
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
              <div key={idx} className="w-full select-text my-2.5">
                <div className="w-full rounded-xl bg-[#18181F] border border-white/10 p-3.5 text-[12.5px] text-[#E5E5EB] font-sans leading-relaxed shadow-sm">
                  <AiMarkdownView
                    content={m.text}
                    isStreaming={false}
                    onOpenFile={handleOpenFile}
                  />
                </div>
              </div>
            );
          }

          return (
            <div key={idx} className="space-y-2 select-text">
              {/* Thought reasoning accordion */}
              {m.thoughtDuration && (
                <ThoughtAccordion
                  duration={m.thoughtDuration}
                  thoughts={m.thoughts}
                />
              )}

              {/* Assistant Message with Sparkle icon */}
              <div className="flex items-start gap-2.5">
                <AiSparkBadge />
                <div className="flex-1 min-w-0 pt-0.5 space-y-2">
                  {/* Antigravity Inline Activity Stream (Sub rollable box inside chat response) */}
                  {((m.actionStreamItems && m.actionStreamItems.length > 0) ||
                    (m.toolCallCards && m.toolCallCards.length > 0) ||
                    (m.isStreaming && thinkingStep)) && (
                    <AntigravityActionStream
                      items={
                        m.actionStreamItems && m.actionStreamItems.length > 0
                          ? m.actionStreamItems
                          : toolCardsToActionStream(m.toolCallCards || [])
                      }
                      activeStep={m.isStreaming ? thinkingStep : undefined}
                      isStreaming={m.isStreaming}
                      onOpenFile={handleOpenFile}
                      onViewAllChanges={() => {
                        if (activeDiffs && activeDiffs.length > 0) {
                          setDiffModalOpen(true);
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

                  {/* Autonomous Multi-Agent Task Graph (DAG) (§1 & §6) */}
                  {m.taskGraphSteps && m.taskGraphSteps.length > 0 && (
                    <TaskGraphDAGViewer steps={m.taskGraphSteps} />
                  )}

                  {/* Plan Card if present (legacy) */}
                  {m.planItems && m.planItems.length > 0 && !m.taskGraphSteps && (
                    <PlanCard items={m.planItems} />
                  )}

                  {/* Tool Execution Row if present */}
                  {m.toolQuery && (!m.toolCallCards || m.toolCallCards.length === 0) && (
                    <ToolExecutionRow
                      query={m.toolQuery}
                      count={m.toolResults || "12 results"}
                    />
                  )}

                  {/* Edited Files Card if present */}
                  {m.editedFiles && m.editedFiles.length > 0 && (
                    <EditedFilesCard
                      files={m.editedFiles}
                      onOpenFile={handleOpenFile}
                      onViewDiff={() => {
                        if (activeDiffs && activeDiffs.length > 0) {
                          setDiffModalOpen(true);
                        } else if (editorApi) {
                          editorApi.openFile(m.editedFiles?.[0]?.name || "auth.ts");
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Sticky Permission Approval Prompt Card (§6) */}
        {activePermissionRequest && (
          <PermissionPromptCard
            request={activePermissionRequest}
            onDecision={handlePermissionDecision}
          />
        )}

        {loading && (
          <div className="flex items-center gap-2 py-1 text-[12px] text-[#888888] font-sans">
            <span className="h-2 w-2 rounded-full bg-[#0084FF] animate-ping shrink-0" />
            <span className="text-[#AAAAAA] animate-pulse">
              {thinkingStep || "Thinking..."}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── 4. Bottom Context Pills ── */}
      <div className="px-3 py-1.5 bg-[#181818] border-t border-[#262626] flex items-center gap-1.5 overflow-x-auto scrollbar-none select-none">
        {contextPills.map((pill, idx) => (
          <div
            key={idx}
            className="flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#222226] border border-[#303036] text-[11px] font-mono text-[#D0D0D8] shrink-0 hover:border-[#44444C] transition-colors"
          >
            <span
              onClick={() => handleOpenFile(pill)}
              className="cursor-pointer hover:underline text-[#38BDF8]"
            >
              @{pill}
            </span>
            <button
              onClick={() => handleRemoveContext(idx)}
              className="text-[#7E7E8A] hover:text-white transition-colors cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={handleAddContext}
          className="flex items-center gap-1 px-2 py-0.5 rounded-[4px] border border-dashed border-[#3A3A42] hover:border-[#555562] text-[11px] text-[#8E8E98] hover:text-white transition-colors cursor-pointer shrink-0"
        >
          <Plus className="h-3 w-3" />
          <span>Add context</span>
        </button>
      </div>

      {/* ── 5. Input Container matching Filesystem Sidebar Colors ── */}
      <div className="p-3 bg-[#181818] border-t border-[#262626]">
        <div className="rounded-[8px] bg-[#1E1E22] border border-[#2E2E36] focus-within:border-[#007ACC] transition-all p-3 shadow-md">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, or @ mention a file..."
            rows={2}
            className="w-full bg-transparent text-[13px] text-[#E5E5EB] placeholder:text-[#6A6A76] outline-none resize-none font-sans min-h-[42px] max-h-[140px] leading-relaxed"
          />

          {/* Bottom Toolbar inside Input Card */}
          <div className="flex items-center justify-between pt-2 border-t border-[#282830] mt-1">
            {/* Left Controls: Model Pill | Pencil | Attach */}
            <div className="flex items-center gap-2 text-[11px] text-[#8E8E98] select-none">
              {/* Model Selector Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModelMenuOpen((p) => !p)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#26262C] hover:bg-[#2F2F36] hover:text-white text-[#C0C0C8] border border-[#363640] cursor-pointer transition-colors text-[11px]"
                >
                  <span>{selectedModel}</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>

                {modelMenuOpen && (
                  <div className="absolute bottom-7 left-0 z-50 min-w-[170px] rounded-md bg-[#222228] border border-[#343542] p-1 shadow-2xl text-[11px] text-[#D0D0D8]">
                    {MODEL_OPTIONS.map((m) => (
                      <div
                        key={m}
                        onClick={() => {
                          setSelectedModel(m);
                          setModelMenuOpen(false);
                        }}
                        className={cn(
                          "px-2 py-1.5 rounded hover:bg-[#007ACC] hover:text-white cursor-pointer transition-colors",
                          selectedModel === m && "bg-[#007ACC]/20 text-[#38BDF8]"
                        )}
                      >
                        {m}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit instructions / pencil */}
              <button
                type="button"
                className="p-1 hover:text-white rounded hover:bg-[#282830] transition-colors cursor-pointer text-[#888894]"
                title="Edit instructions"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>

              {/* Paperclip / attach */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1 hover:text-white rounded hover:bg-[#282830] transition-colors cursor-pointer text-[#888894]"
                title="Attach file or screenshot"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Right: Send / Stop button */}
            {loading ? (
              <button
                type="button"
                onClick={handleStopAgent}
                className="p-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer shadow-sm flex items-center justify-center"
                title="Stop generation"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className={cn(
                  "p-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center",
                  input.trim()
                    ? "bg-[#007ACC] hover:bg-[#008BE0] text-white shadow-sm"
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

      {/* ── 6. Modals for Diff Viewer and Activity Feed (§6) ── */}
      {diffModalOpen && activeDiffs && activeDiffs.length > 0 && (
        <DiffViewerModal
          files={activeDiffs}
          onAccept={(path) => {
            const accepted = activeDiffs.find((f) => f.filePath === path);
            if (accepted && editorApi) {
              editorApi.updateContent(path, accepted.modifiedContent);
            }
            setActiveDiffs((p) => {
              const rem = (p || []).filter((f) => f.filePath !== path);
              if (rem.length === 0) setDiffModalOpen(false);
              return rem;
            });
          }}
          onReject={(path) => {
            setActiveDiffs((p) => {
              const rem = (p || []).filter((f) => f.filePath !== path);
              if (rem.length === 0) setDiffModalOpen(false);
              return rem;
            });
          }}
          onAcceptAll={() => {
            if (editorApi && activeDiffs) {
              for (const diff of activeDiffs) {
                editorApi.updateContent(diff.filePath, diff.modifiedContent);
              }
            }
            setActiveDiffs(null);
            setDiffModalOpen(false);
          }}
          onClose={() => setDiffModalOpen(false)}
        />
      )}

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

    </aside>
  );
}
