import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Play,
  RotateCw,
  ScrollText,
  Cpu,
  Compass,
  Activity,
  Terminal,
  Trash2,
  Wrench,
  ShieldCheck,
  FolderKanban,
  Server,
  Network,
  Folder,
  FileText,
  Zap,
  Search,
  GitBranch,
  Package,
  Lightbulb,
  Rocket,
  Sparkles,
  Info,
  Settings,
  Clock,
  HardDrive,
  Layers,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TerminalApi } from "@/hooks/useTerminalSession";
import type { SalesforceWorkspaceApi } from "@/hooks/useSalesforceWorkspace";
import { mockReply } from "@/hooks/useAiContext";
import { getActiveTerminalBufferLines } from "@/components/terminal/XtermView";
import { generateSmartTerminalReply } from "@/lib/terminalIntelligence";
import type { ChatMsg } from "@/types/terminal";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

/**
 * Industry-grade, high-precision vector mark for THIRD EYE AI
 * Razor-sharp concentric lens geometry with focused aperture
 */
export function ThirdEyeIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12C3.8 7.5 7.6 4.5 12 4.5s8.2 3 10 7.5c-1.8 4.5-5.6 7.5-10 7.5S3.8 16.5 2 12Z" />
      <circle cx="12" cy="12" r="3.5" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const quickPrompts = [
  { label: "What is happening?", desc: "Analyze live terminal output and workspace directories", icon: Activity },
  { label: "/explain", desc: "Diagnose recent output", icon: ScrollText },
  { label: "/fix-error", desc: "Auto-fix detected error", icon: Wrench },
  { label: "/status", desc: "Check shell and directory state", icon: ShieldCheck },
  { label: "/suggest", desc: "Suggest next command", icon: Terminal },
  { label: "/clear", desc: "Clear chat history", icon: Trash2 },
];

interface ExtendedChatMsg extends ChatMsg {
  suggestedCommand?: string | undefined;
  severity?: string | undefined;
  timestamp?: string | undefined;
}

function getCommandSafety(cmd: string): { label: string; cls: string; isDangerous: boolean } {
  const trimmed = cmd.trim().toLowerCase();
  if (
    trimmed.startsWith("rm ") ||
    trimmed.includes("kill") ||
    trimmed.includes("pkill") ||
    trimmed.includes("reboot") ||
    trimmed.includes("shutdown") ||
    trimmed.includes("systemctl stop") ||
    trimmed.includes("systemctl restart butler") ||
    trimmed.includes("iptables -f") ||
    trimmed.includes("drop database")
  ) {
    return {
      label: "HIGH IMPACT",
      cls: "text-orange-400 bg-orange-500/15 border-orange-500/40 font-bold",
      isDangerous: true,
    };
  }
  if (
    trimmed.startsWith("systemctl restart") ||
    trimmed.startsWith("systemctl reload") ||
    trimmed.startsWith("docker restart") ||
    trimmed.startsWith("systemctl start")
  ) {
    return {
      label: "SERVICE RESTART",
      cls: "text-slate-300 bg-white/5 border-white/10 font-medium",
      isDangerous: false,
    };
  }
  return {
    label: "DIAGNOSTIC",
    cls: "text-slate-400 bg-white/5 border-white/5",
    isDangerous: false,
  };
}

function CodeBlock({ code, lang, onRun }: { code: string; lang?: string | undefined; onRun: (c: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [confirmingDangerous, setConfirmingDangerous] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const safety = getCommandSafety(code);

  const handleRunClick = () => {
    if (safety.isDangerous && !confirmingDangerous) {
      setConfirmingDangerous(true);
      return;
    }
    onRun(code);
    setConfirmingDangerous(false);
  };

  return (
    <div className="my-2.5 overflow-hidden rounded-md border border-[#303030] bg-[#181818] min-w-0 max-w-full">
      <div className="flex items-center justify-between border-b border-[#303030] bg-[#202020] px-3 py-1.5 text-[11px] text-[#808080] select-none gap-2 min-w-0 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#707070]">
            {lang || "command"}
          </span>
          <span className={cn("px-1.5 py-0.2 rounded border text-[9.5px] font-mono shrink-0", safety.cls)}>
            {safety.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] hover:bg-[#2A2A2A] hover:text-[#E0E0E0] transition-colors cursor-pointer"
            title="Copy command to clipboard"
          >
            {copied ? <Check className="h-3 w-3 text-[#FF6B00]" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          {confirmingDangerous ? (
            <div className="flex items-center gap-1 bg-[#202020] px-1.5 py-0.5 rounded border border-[#FF6B00]/50">
              <span className="text-[10px] text-[#FF6B00] font-semibold font-mono">Run?</span>
              <button
                onClick={handleRunClick}
                className="px-1.5 py-0.2 rounded bg-[#FF6B00] hover:bg-orange-600 text-white text-[10px] font-bold cursor-pointer"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmingDangerous(false)}
                className="px-1 py-0.2 rounded hover:bg-[#2A2A2A] text-[#808080] text-[10px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleRunClick}
              className={cn(
                "flex items-center gap-1 rounded border px-2 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer",
                safety.isDangerous
                  ? "bg-[#2A1810] border-[#FF6B00]/40 text-[#FF6B00] hover:bg-[#351E14]"
                  : "bg-[#252525] border-[#303030] text-[#E0E0E0] hover:bg-[#FF6B00] hover:text-white hover:border-[#FF6B00]"
              )}
              title="Run command in active terminal"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              <span>Run</span>
            </button>
          )}
        </div>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-[#E0E0E0] max-w-full whitespace-pre-wrap sm:whitespace-pre break-words">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderWithVectorIcons(text: string): React.ReactNode {
  // Regex matching system emojis (with optional variation selectors) and custom bracket tags
  const regex = /([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\uFE0F?|\[dir\]|\[file\])/gu;
  const parts = text.split(regex);
  if (parts.length === 1) return text;

  return parts.map((part, idx) => {
    const norm = part.replace(/\uFE0F/g, "");
    switch (norm) {
      case "📁":
      case "📂":
      case "🗂":
      case "🗃":
      case "[dir]":
        return <Folder key={idx} className="h-3.5 w-3.5 text-[#FF6B00] inline-block mr-1 align-text-bottom shrink-0" />;
      case "📄":
      case "📝":
      case "📋":
      case "📜":
      case "📑":
      case "[file]":
        return <FileText key={idx} className="h-3.5 w-3.5 text-[#94A3B8] inline-block mr-1 align-text-bottom shrink-0" />;
      case "⚡":
        return <Zap key={idx} className="h-3.5 w-3.5 text-[#FF6B00] inline-block mr-1 align-text-bottom shrink-0" />;
      case "⚠️":
      case "🚨":
      case "❗":
        return <AlertTriangle key={idx} className="h-3.5 w-3.5 text-[#F59E0B] inline-block mr-1 align-text-bottom shrink-0" />;
      case "🔍":
      case "🔎":
        return <Search key={idx} className="h-3.5 w-3.5 text-[#FF6B00] inline-block mr-1 align-text-bottom shrink-0" />;
      case "🛠":
      case "🔧":
      case "🔨":
        return <Wrench key={idx} className="h-3.5 w-3.5 text-[#FF6B00] inline-block mr-1 align-text-bottom shrink-0" />;
      case "📦":
        return <Package key={idx} className="h-3.5 w-3.5 text-[#38BDF8] inline-block mr-1 align-text-bottom shrink-0" />;
      case "🌿":
      case "🌱":
        return <GitBranch key={idx} className="h-3.5 w-3.5 text-[#10B981] inline-block mr-1 align-text-bottom shrink-0" />;
      case "💡":
        return <Lightbulb key={idx} className="h-3.5 w-3.5 text-[#FACC15] inline-block mr-1 align-text-bottom shrink-0" />;
      case "🛡":
        return <ShieldCheck key={idx} className="h-3.5 w-3.5 text-[#10B981] inline-block mr-1 align-text-bottom shrink-0" />;
      case "💻":
      case "🖥":
        return <Terminal key={idx} className="h-3.5 w-3.5 text-[#FF6B00] inline-block mr-1 align-text-bottom shrink-0" />;
      case "🚀":
        return <Rocket key={idx} className="h-3.5 w-3.5 text-[#A855F7] inline-block mr-1 align-text-bottom shrink-0" />;
      case "✨":
      case "⭐":
        return <Sparkles key={idx} className="h-3.5 w-3.5 text-[#FACC15] inline-block mr-1 align-text-bottom shrink-0" />;
      case "ℹ":
        return <Info key={idx} className="h-3.5 w-3.5 text-[#38BDF8] inline-block mr-1 align-text-bottom shrink-0" />;
      case "⚙":
        return <Settings key={idx} className="h-3.5 w-3.5 text-[#94A3B8] inline-block mr-1 align-text-bottom shrink-0" />;
      case "⏱":
      case "⏳":
      case "⏰":
        return <Clock key={idx} className="h-3.5 w-3.5 text-[#94A3B8] inline-block mr-1 align-text-bottom shrink-0" />;
      case "💾":
      case "💿":
        return <HardDrive key={idx} className="h-3.5 w-3.5 text-[#94A3B8] inline-block mr-1 align-text-bottom shrink-0" />;
      case "🟢":
      case "✅":
      case "✔":
        return <CheckCircle2 key={idx} className="h-3.5 w-3.5 text-[#10B981] inline-block mr-1 align-text-bottom shrink-0" />;
      case "🔴":
      case "❌":
      case "✖":
        return <AlertTriangle key={idx} className="h-3.5 w-3.5 text-[#EF4444] inline-block mr-1 align-text-bottom shrink-0" />;
      case "🟡":
        return <span key={idx} className="inline-block h-2 w-2 rounded-full bg-[#F59E0B] mr-1 align-middle shrink-0" />;
      default:
        // Do not display raw system emojis under any circumstances
        if (/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(norm)) {
          return null;
        }
        return part;
    }
  });
}

function renderInline(str: string, onRun: (cmd: string) => void) {
  const tokens = str.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, i) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      let code = token.slice(1, -1).trim();
      let isDir = false;
      let isFile = false;

      if (
        code.startsWith("📁") ||
        code.startsWith("📂") ||
        code.startsWith("[dir]") ||
        code.endsWith("/")
      ) {
        code = code.replace(/^([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\uFE0F?|\[dir\])\s*/u, "");
        isDir = true;
      } else if (
        code.startsWith("📄") ||
        code.startsWith("📝") ||
        code.startsWith("[file]")
      ) {
        code = code.replace(/^([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\uFE0F?|\[file\])\s*/u, "");
        isFile = true;
      }

      // Completely scrub any residual system emojis from code pill
      const displayCode = code.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\uFE0F?/gu, "").trim();

      return (
        <code
          key={i}
          onClick={() => onRun(displayCode)}
          className="mx-0.5 rounded border border-[#303030] bg-[#14151C] px-1.5 py-0.5 font-mono text-[11px] text-[#FF6B00] hover:bg-[#1C1E28] hover:border-[#FF6B00]/40 transition-colors cursor-pointer inline-flex items-center gap-1.5 align-middle select-text"
          title="Click to execute in active terminal"
        >
          {isDir && <Folder className="h-3 w-3 text-[#FF6B00] shrink-0" />}
          {isFile && <FileText className="h-3 w-3 text-[#94A3B8] shrink-0" />}
          <span>{displayCode}</span>
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {renderWithVectorIcons(token.slice(2, -2))}
        </strong>
      );
    }
    return <span key={i}>{renderWithVectorIcons(token)}</span>;
  });
}

function FormattedMessage({ text, onRun }: { text: string; onRun: (cmd: string) => void }) {
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-[12.5px] leading-relaxed font-sans min-w-0 max-w-full break-words">
      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).trim().split("\n");
          const firstLine = lines[0]?.trim() ?? "";
          let lang = "sh";
          let codeLines = lines;
          if (/^[a-zA-Z0-9_-]+$/.test(firstLine)) {
            lang = firstLine;
            codeLines = lines.slice(1);
          }
          const code = codeLines.join("\n").trim();
          return <CodeBlock key={index} code={code} lang={lang} onRun={onRun} />;
        }

        const lines = part.split("\n");
        return (
          <div key={index} className="space-y-1.5 min-w-0">
            {lines.map((line, lIndex) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIndex} className="h-1" />;

              // Horizontal divider lines (---, ***, ___)
              if (/^[-*_]{3,}$/.test(trimmed)) {
                return <div key={lIndex} className="my-2 border-t border-[#262626]" />;
              }

              // Markdown headings: match any level of hashes (# up to ######)
              const headingMatch = trimmed.match(/^(#{1,6})\s*(.+)$/);
              if (headingMatch) {
                const level = headingMatch[1].length;
                // Strip all leading # marks so no raw # ever leaks to the UI
                const headingText = headingMatch[2].replace(/^#+\s*/, "").trim();

                if (level === 1) {
                  return (
                    <h2 key={lIndex} className="pt-2 pb-0.5 font-bold text-[14px] text-[#F3F4F6] tracking-tight flex items-center gap-2 min-w-0">
                      <span className="h-4 w-1.5 rounded-sm bg-[#FF6B00] shrink-0" />
                      <span className="break-words min-w-0">{renderInline(headingText, onRun)}</span>
                    </h2>
                  );
                }

                if (level === 2) {
                  return (
                    <h3 key={lIndex} className="pt-1.5 pb-0.5 font-semibold text-[13.5px] text-[#E5E7EB] tracking-tight flex items-center gap-2 min-w-0">
                      <span className="h-3.5 w-1 rounded-sm bg-[#FF6B00] shrink-0" />
                      <span className="break-words min-w-0">{renderInline(headingText, onRun)}</span>
                    </h3>
                  );
                }

                if (level === 3) {
                  return (
                    <h4 key={lIndex} className="pt-1.5 pb-0.5 font-semibold text-[13px] text-[#E0E0E0] tracking-tight flex items-center gap-2 min-w-0">
                      <span className="h-3.5 w-1 rounded-sm bg-[#FF6B00]/90 shrink-0" />
                      <span className="break-words min-w-0">{renderInline(headingText, onRun)}</span>
                    </h4>
                  );
                }

                // Level 4, 5, 6 (e.g. #### 1. Assistant & Session Overview)
                return (
                  <h5 key={lIndex} className="pt-1.5 pb-0.5 font-semibold text-[12.5px] text-[#E0E0E0] tracking-tight flex items-center gap-2 min-w-0">
                    <span className="h-3 w-1 rounded-sm bg-[#FF6B00]/70 shrink-0" />
                    <span className="break-words min-w-0">{renderInline(headingText, onRun)}</span>
                  </h5>
                );
              }

              // Callout / quote banner (| or >)
              if (trimmed.startsWith("| ") || trimmed.startsWith("> ") || trimmed === "|" || trimmed === ">") {
                const quoteText = trimmed.replace(/^[>|]\s*/, "").trim();
                if (!quoteText) return <div key={lIndex} className="h-1" />;
                return (
                  <div key={lIndex} className="my-1.5 pl-2.5 py-0.5 border-l-2 border-[#FF6B00] text-[#E0E0E0] font-semibold text-[12.5px] tracking-tight min-w-0">
                    {renderInline(quoteText, onRun)}
                  </div>
                );
              }

              // Bullet points (- or * or •)
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
                return (
                  <div key={lIndex} className="flex items-start gap-2 pl-2 text-[#808080] text-[12px] min-w-0">
                    <span className="text-[#FF6B00] mt-1 text-[10px] shrink-0">&bull;</span>
                    <span className="flex-1 min-w-0 break-words text-[#D4D4D4]">{renderInline(trimmed.replace(/^[-*•]\s+/, ""), onRun)}</span>
                  </div>
                );
              }

              // Numbered lists (e.g. 1. Item)
              const numMatch = trimmed.match(/^(\d+\.)\s+(.*)$/);
              if (numMatch) {
                return (
                  <div key={lIndex} className="flex items-start gap-2 pl-2 text-[#E0E0E0] text-[12px] min-w-0">
                    <span className="font-mono text-[#FF6B00] text-[11px] font-semibold shrink-0">{numMatch[1]}</span>
                    <span className="flex-1 min-w-0 break-words text-[#D4D4D4]">{renderInline(numMatch[2], onRun)}</span>
                  </div>
                );
              }

              return (
                <p key={lIndex} className="text-[#E0E0E0]/90 text-[12.5px] leading-relaxed break-words min-w-0">
                  {renderInline(line, onRun)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function AiSidecar({
  api,
  sfApi,
}: {
  api: TerminalApi;
  sfApi?: SalesforceWorkspaceApi;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string>("auto");

  // Dynamically resolve target session based on user selection or active tab
  const targetSession = selectedSessionId === "all"
    ? null
    : selectedSessionId === "auto"
    ? api.active
    : api.sessions.find((x) => x.id === selectedSessionId) || api.active;

  const isTargetRemote = targetSession
    ? targetSession.protocol === "ssh" || Boolean(targetSession.ip) || (targetSession.title || "").toLowerCase().includes("ssh")
    : api.sessions.some((x) => x.protocol === "ssh" || Boolean(x.ip));

  const s = targetSession || api.active;
  const [msgs, setMsgs] = useState<ExtendedChatMsg[]>([
    {
      role: "assistant",
      text: "Hi! I'm your AI assistant for THIRD EYE. I have real-time visibility across all your terminal tabs, local workspace files, and remote SSH sessions.\n\nFeel free to ask what's running, paste errors for a quick diagnosis, or ask for command recommendations anytime—just like you'd ask Claude or ChatGPT!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, loading, thinkingStep]);

  const handleRunCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    const firstLine = trimmed.split("\n")[0] ?? trimmed;
    api.execute(firstLine);
  };

  const ask = async (text: string) => {
    if (!text.trim() || loading) return;
    const userPrompt = text.trim();

    if (userPrompt === "/clear") {
      setMsgs([]);
      setQ("");
      return;
    }

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMsgs((m) => [...m, { role: "user", text: userPrompt, timestamp: nowTime }]);
    setQ("");
    setLoading(true);
    setThinkingStep("Ingesting multi-session telemetry...");

    // Ingest live buffer directly from the visible Xterm grid first, with session lines fallback
    const liveXtermLines = getActiveTerminalBufferLines(300);
    const sessionLines = targetSession
      ? (targetSession.lines || []).slice(-300).map((l) => l.text)
      : api.sessions.flatMap((sess) => (sess.lines || []).slice(-100).map((l) => l.text));

    let targetLines = liveXtermLines.filter((l) => l.trim().length > 0);
    if (targetLines.length === 0 || (sessionLines.length > targetLines.length && targetLines.length < 5)) {
      targetLines = sessionLines;
    }

    // Instant conversational dialogue short-circuit (Claude/ChatGPT style)
    const isGreetingQuery =
      /^(?:hi|hello|hey|greetings|howdy|good\s+(?:morning|afternoon|evening)|yo|sup|who are you|what can you do)[\s!.?]*$/i.test(userPrompt) ||
      userPrompt.toLowerCase() === "hi" ||
      userPrompt.toLowerCase() === "hello" ||
      userPrompt.toLowerCase() === "hey";

    const isHumanDialogueQuery =
      isGreetingQuery ||
      /^(?:thanks|thank you|thx|cheers|appreciate it|good job|nice work|awesome|great|perfect|cool|ok|okay|got it|sounds good)[\s!.?]*$/i.test(userPrompt) ||
      /^(?:how are you|how's it going|how are things|whats up|what's up)[\s!.?]*$/i.test(userPrompt) ||
      userPrompt.toLowerCase().includes("same conversation") ||
      userPrompt.toLowerCase().includes("human answer") ||
      userPrompt.toLowerCase().includes("human + tech") ||
      userPrompt.toLowerCase().includes("human plus tech") ||
      userPrompt.toLowerCase().includes("fabricate") ||
      userPrompt.toLowerCase().includes("like i do with you") ||
      userPrompt.toLowerCase().includes("be more human");

    if (isHumanDialogueQuery) {
      setTimeout(() => {
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: generateSmartTerminalReply({
              query: userPrompt,
              lines: targetLines,
              session: targetSession || s,
              sessions: api.sessions,
            }),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        setLoading(false);
        setThinkingStep("");
      }, 150);
      return;
    }

    const allSessionsData = api.sessions.map((sess, idx) => {
      const isTarget = targetSession ? sess.id === targetSession.id : true;
      const isRemote = sess.protocol === "ssh" || Boolean(sess.ip) || (sess.title || "").toLowerCase().includes("ssh");
      return {
        id: sess.id,
        ptyId: sess.ptyId || sess.id,
        title: sess.title || `Terminal ${idx + 1}`,
        protocol: sess.protocol,
        isRemote,
        ip: sess.ip,
        user: sess.user,
        cwd: sess.cwd,
        shellType: sess.shellType,
        isFocused: sess.id === api.activeId,
        isTarget,
        lastError: sess.lastError,
        recentLines: (sess.lines || []).slice(-200).map((l) => l.text),
      };
    });

    const isElectron = typeof window !== "undefined" && Boolean(window.electronAPI);

    if (isElectron && window.electronAPI) {
      try {
        const terminalId = targetSession?.ptyId || targetSession?.id || api.active?.ptyId || api.active?.id || "term";
        const currentCwd = targetSession?.cwd || api.active?.cwd || "C:\\Users\\aditya.s.ctr\\Desktop\\THIRD EYE";
        const ticketMeta = sfApi?.activeTicket
          ? `[Active Salesforce Case: ${sfApi.activeTicket.ticketNumber} | Priority: ${sfApi.activeTicket.priority} | Site: ${sfApi.activeTicket.siteName} (${sfApi.activeTicket.primaryIp}) | Subject: ${sfApi.activeTicket.subject} | Description: ${sfApi.activeTicket.description}]`
          : "";

        const multiTabOverview = api.sessions.map((sess, idx) => {
          const isRem = sess.protocol === "ssh" || Boolean(sess.ip) || (sess.title || "").toLowerCase().includes("ssh");
          const focusTag = sess.id === api.activeId ? " [ACTIVE FOCUSED TAB]" : "";
          const targetTag = sess.id === targetSession?.id ? " [PRIMARY ANALYSIS TARGET]" : "";
          const recentSnippet = (sess.lines || []).slice(-35).map((l) => l.text).join('\n') || "(empty prompt ready)";
          return `--- Tab #${idx + 1}: "${sess.title}" (${isRem ? `Remote VM: ${sess.user || 'root'}@${sess.ip || 'SSH'}` : `Local Workstation: ${sess.shellType || 'cmd'}`})${focusTag}${targetTag} ---\nHost/Path: ${sess.cwd}\nRecent buffer snippet:\n${recentSnippet}`;
        }).join('\n\n');

        const targetDetails = targetSession
          ? (isTargetRemote
              ? `[Active Target: Remote Linux VM (${targetSession.user || 'root'}@${targetSession.ip || 'remote-node'}) via SSH | Remote Path: ${targetSession.cwd}${targetSession.lastError ? ` | Active Error: ${targetSession.lastError}` : ""}]`
              : `[Active Target: Local Workstation (${targetSession.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt'}) | Local Directory: ${targetSession.cwd}${targetSession.lastError ? ` | Active Error: ${targetSession.lastError}` : ""}]`)
          : `[Active Target: Entire Workspace (${api.sessions.length} Open Terminal Tabs)]`;

        const targetBufferSnippet = targetLines.length > 0
          ? `\n\n--- Live Terminal Output & Logs (${targetSession?.title || 'Active Tab'} - ${targetLines.length} lines) ---\n` + targetLines.slice(-250).join('\n') + `\n--- End Live Terminal Output ---`
          : `\n\n--- Live Terminal Output ---\n(Session ready, prompt initialized)\n--- End Live Terminal Output ---`;

        const promptWithContext = `${ticketMeta ? ticketMeta + "\n" : ""}${targetDetails}\n\nAll Workspace Terminal Tabs (${api.sessions.length} open sessions):\n${multiTabOverview}${targetBufferSnippet}\n\nUser Question:\n${userPrompt}`;

        setTimeout(() => setThinkingStep("Analyzing terminal & workspace..."), 300);

        const isExplicitDiagnosticCmd = userPrompt === "/fix-error" || userPrompt.startsWith("/diagnose-raw");

        if (isExplicitDiagnosticCmd) {
          const analysis = await window.electronAPI.ai.analyze({
            terminalId,
            customPrompt: promptWithContext,
            cwd: currentCwd,
            recentLines: targetLines,
            sessions: allSessionsData,
          });

          let replyText = analysis?.explanation || "Here is what happened in your terminal.";
          if (analysis?.root_cause && !analysis.explanation?.toLowerCase().includes(analysis.root_cause.toLowerCase())) {
            replyText = `**Issue:** ${analysis.root_cause}\n\n${analysis.explanation}`;
          }
          if (analysis?.suggested_command) {
            replyText += `\n\n**Suggested Fix:**\n\`\`\`sh\n${analysis.suggested_command}\n\`\`\``;
          }

          setMsgs((m) => [
            ...m,
            {
              role: "assistant",
              text: replyText,
              suggestedCommand: analysis?.suggested_command || undefined,
              severity: analysis?.severity || undefined,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        } else {
          // Send all conversational interactions through ai.chat with full message history and terminal log context
          const history = msgs.slice(-10).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.text,
          }));

          const res = await window.electronAPI.ai.chat({
            terminalId,
            messages: [...history, { role: "user", content: promptWithContext }],
            cwd: currentCwd,
            recentLines: targetLines,
            sessions: allSessionsData,
          });

          let replyText = res?.reply || "No response received from AI engine.";

          // Intercept and replace any rigid legacy fallback or accidental blind assertions from background services
          const isRoboticTemplate =
            /Looking at your terminal|Normal (?:remote )?execution|Recommended Action|Suggested Next Step|\*\*Issue:\*\*\s*Normal|Issue:\s*Normal|doskey|does not report any fatal errors|ran cleanly/i.test(replyText);

          // Also intercept if terminal has Git Push Protection errors but backend failed to address it
          const allBufferText = targetLines.join("\n");
          const hasGitPushProtectionError = /Push cannot contain secrets|GH013|Repository rule violations|unblock-secret/i.test(allBufferText);
          const missedPushError = hasGitPushProtectionError && !/push protection|secret/i.test(replyText);

          // Also intercept specific conversational queries like "which command did i run" if backend didn't answer properly
          const isAskingCommand = /which command|what command|what did i run|what did i type|last command/i.test(userPrompt);
          const failedToAnswerCommand = isAskingCommand && !/You ran|executed|command was|No command has been/i.test(replyText);
          const isAiAuthOrError = /AI API Key Rejected|AI Authentication Error|API key invalid/i.test(replyText);

          if (!isAiAuthOrError && (isRoboticTemplate || missedPushError || failedToAnswerCommand || replyText.trim() === "")) {
            replyText = generateSmartTerminalReply({
              query: userPrompt,
              lines: targetLines,
              session: targetSession || s,
              sessions: api.sessions,
            });
          }

          setMsgs((m) => [
            ...m,
            {
              role: "assistant",
              text: replyText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: `I ran into an issue analyzing the terminal: ${errMsg}\n\nYou can still execute terminal commands or try your request again.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } finally {
        setLoading(false);
        setThinkingStep("");
      }
    } else {
      // Browser preview fallback
      setTimeout(() => {
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: generateSmartTerminalReply({
              query: userPrompt,
              lines: targetLines,
              session: targetSession || s,
              sessions: api.sessions,
            }),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        setLoading(false);
        setThinkingStep("");
      }, 300);
    }
  };

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[#0A0A0A] border-l border-[#262626] font-sans select-none">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#242424] px-3 bg-[#0D0D0D] min-w-0">
        <div className="flex items-center gap-2 text-[#E0E0E0] font-sans min-w-0">
          <div className="grid h-5.5 w-5.5 shrink-0 place-items-center rounded bg-[#2A1810] border border-[#FF6B00]/40 text-[#FF6B00]">
            <ThirdEyeIcon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold tracking-tight text-[#E0E0E0] flex items-center gap-1.5 truncate">
              <span>THIRD EYE AI</span>
              <span className="rounded bg-[#181818] border border-[#2A2A2A] px-1.5 py-0.2 text-[9.5px] font-mono text-[#808080]">
                Agent
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#808080] font-sans shrink-0">
          <Cpu className="h-3 w-3 text-[#FF6B00]" />
          <span>Gemini 3.8 Flash</span>
        </div>
      </div>

      {/* Multi-Tab Session Scope Switcher */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#121212] border-b border-[#242424] text-[10.5px] font-sans select-none min-w-0 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
          <Layers className="h-3 w-3 text-[#FF6B00] shrink-0" />
          <span className="text-[#888888] font-medium shrink-0">Scope:</span>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="bg-[#1C1C1C] text-[#E0E0E0] border border-[#2E2E2E] rounded px-1.5 py-0.5 text-[10px] font-mono outline-none truncate cursor-pointer hover:border-[#FF6B00]/40 transition-colors"
            title="Select target terminal session for AI analysis"
          >
            <option value="auto">Auto: Focused Tab ({api.active?.title || 'Terminal'})</option>
            <option value="all">All Terminals ({api.sessions.length} Tabs Aggregate)</option>
            {api.sessions.map((sess, idx) => {
              const isRem = sess.protocol === "ssh" || Boolean(sess.ip) || (sess.title || "").toLowerCase().includes("ssh");
              return (
                <option key={sess.id} value={sess.id}>
                  Tab {idx + 1}: {isRem ? `[Remote VM] ${sess.title}` : `[Local] ${sess.title}`}
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isTargetRemote ? (
            <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-[#0E2433] border border-[#38BDF8]/40 text-[#38BDF8] text-[9.5px] font-mono font-semibold" title="Remote VM SSH Session">
              <Server className="h-2.5 w-2.5 shrink-0" />
              <span>VM SSH</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-[#1C1814] border border-[#FF6B00]/30 text-[#FF6B00] text-[9.5px] font-mono font-semibold" title="Local Workstation Shell">
              <Terminal className="h-2.5 w-2.5 shrink-0" />
              <span>{targetSession?.shellType === "powershell" ? "PS" : "CMD"}</span>
            </span>
          )}
        </div>
      </div>

      {/* Live Terminal Telemetry Sync Status Pill */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#0E0E0E] border-b border-[#1E1E1E] text-[10px] font-mono select-none min-w-0">
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse shrink-0" />
          <span className="text-[#888888] font-medium shrink-0">Target:</span>
          <span className="text-[#C0C0C0] truncate font-semibold" title={targetSession?.cwd || "Workspace"}>
            {isTargetRemote && targetSession
              ? `${targetSession.user || 'root'}@${targetSession.ip || 'remote'}:${targetSession.cwd || '~'}`
              : (targetSession?.cwd ? (targetSession.cwd.split('\\').pop() || targetSession.cwd) : "Ready")}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-[#777777]">
          <span>{targetSession?.lines ? `${targetSession.lines.length} lines` : "0 lines"}</span>
          <span className="text-[#444444]">|</span>
          <span className="text-[#A0A0A0]">{api.sessions.length} tabs open</span>
        </div>
      </div>

      {/* Main chat / context area (Deep Black Background) */}
      <div className="flex-1 min-w-0 w-full space-y-2.5 overflow-y-auto overflow-x-hidden p-3 bg-[#0A0A0A]">
        {/* Active Salesforce Ticket Banner */}
        {sfApi?.activeTicket && (
          <div className="rounded-lg border border-[#262626] bg-[#141414] p-3 text-xs space-y-2 select-text min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                <FolderKanban className="h-3.5 w-3.5 text-[#FF6B00] shrink-0" />
                <span className="font-mono font-bold text-[#E0E0E0] text-[11.5px] truncate">
                  {sfApi.activeTicket.ticketNumber}
                </span>
                <span className="rounded bg-[#2A1810] border border-[#FF6B00]/30 px-1.5 py-0.2 text-[9.5px] font-mono text-[#FF6B00] font-semibold shrink-0">
                  {sfApi.activeTicket.priority}
                </span>
              </div>
              <span className="text-[10px] text-[#FF6B00] font-mono shrink-0 bg-[#0A0A0A] px-1.5 py-0.5 rounded border border-[#262626]">
                {sfApi.activeTicket.primaryIp}
              </span>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#E0E0E0] line-clamp-1 break-words">
                {sfApi.activeTicket.subject}
              </p>
              {sfApi.activeTicket.description && (
                <p className="text-[11px] text-[#808080] mt-0.5 leading-relaxed line-clamp-2 break-words">
                  {sfApi.activeTicket.description}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-[#262626] text-[10.5px] gap-2 min-w-0 flex-wrap">
              <span className="text-[#808080] truncate min-w-0 flex-1">
                Site: <span className="text-[#E0E0E0]">{sfApi.activeTicket.siteName}</span>
              </span>
              <button
                onClick={() =>
                  ask(
                    `/explain Diagnose Salesforce ticket ${sfApi.activeTicket?.ticketNumber}: "${sfApi.activeTicket?.subject}". Symptom: ${sfApi.activeTicket?.description || 'N/A'}. Suggest troubleshooting steps and exact commands for host ${sfApi.activeTicket?.primaryIp}.`
                  )
                }
                disabled={loading}
                className="rounded bg-[#2A1810] hover:bg-[#351E14] border border-[#FF6B00]/30 px-2 py-0.5 text-[10.5px] font-medium text-[#FF6B00] transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Activity className="h-3 w-3" />
                <span>Diagnose Ticket</span>
              </button>
            </div>
          </div>
        )}

        {/* Incident Notification Card */}
        {s?.lastError && (
          <div className="rounded-lg border border-[#FF6B00]/40 bg-[#1A0E08] p-3 min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FF6B00] truncate">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Incident Detected
              </div>
              <button
                onClick={() => api.dismissError()}
                className="text-[11px] text-[#808080] hover:text-[#E0E0E0] cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
            <p className="mt-1.5 font-mono text-xs text-[#FF6B00] bg-[#0A0A0A] p-2 rounded border border-[#FF6B00]/30 break-all max-w-full">
              {s.lastError}
            </p>
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <Button
                size="sm"
                className="h-6.5 text-xs px-2.5 bg-[#FF6B00] hover:bg-orange-600 text-white font-medium gap-1.5 cursor-pointer shrink-0"
                onClick={() => ask("/fix-error")}
                disabled={loading}
              >
                <Wrench className="h-3 w-3" /> Auto-Fix Error
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6.5 text-xs px-2.5 gap-1.5 border-[#2A2A2A] bg-[#141414] hover:bg-[#1E1E1E] text-[#E0E0E0] cursor-pointer shrink-0"
                onClick={() => ask("/explain")}
                disabled={loading}
              >
                <ScrollText className="h-3 w-3" /> Diagnose
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6.5 text-xs px-2 text-[#808080] hover:text-[#E0E0E0] cursor-pointer shrink-0"
                onClick={() => api.killAndRestart()}
              >
                <RotateCw className="h-3 w-3 mr-1" /> Restart Shell
              </Button>
            </div>
          </div>
        )}

        {/* Live Session Telemetry Card */}
        <div className="rounded-lg fabric-card p-3 space-y-2 min-w-0">
          <div className="flex items-center justify-between min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#808080] flex items-center gap-1.5 truncate">
              {isTargetRemote ? (
                <Server className="h-3 w-3 text-[#38BDF8] shrink-0" />
              ) : (
                <Terminal className="h-3 w-3 text-[#FF6B00] shrink-0" />
              )}
              {isTargetRemote ? "Remote VM Telemetry" : "Active Terminal Context"}
            </span>
            <span className={cn(
              "px-1.5 py-0.2 rounded font-mono text-[9px] font-bold uppercase shrink-0",
              isTargetRemote
                ? "bg-[#0E2433] text-[#38BDF8] border border-[#38BDF8]/40"
                : "fabric-tag text-[#FF6B00]"
            )}>
              {isTargetRemote ? "REMOTE SSH" : "LIVE LOCAL"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] min-w-0">
            <div className="rounded-md fabric-tag p-2 min-w-0">
              <div className="text-[9.5px] uppercase tracking-wider text-[#707070]">
                {isTargetRemote ? "Remote Host" : "Shell"}
              </div>
              <div className="font-mono text-[#E0E0E0] font-medium truncate mt-0.5">
                {isTargetRemote
                  ? `${targetSession?.user || 'root'}@${targetSession?.ip || 'remote-node'}`
                  : (targetSession?.shellType === "powershell" ? "powershell.exe" : "cmd.exe")}
              </div>
            </div>
            <div className="rounded-md fabric-tag p-2 min-w-0">
              <div className="text-[9.5px] uppercase tracking-wider text-[#707070]">
                {isTargetRemote ? "Remote Path" : "Directory"}
              </div>
              <div className="font-mono text-[#E0E0E0] font-medium truncate mt-0.5" title={targetSession?.cwd}>
                {targetSession?.cwd
                  ? (isTargetRemote ? targetSession.cwd : (targetSession.cwd.split("\\").pop() || targetSession.cwd))
                  : (isTargetRemote ? "~" : "C:\\Users")}
              </div>
            </div>
          </div>
          {api.sessions.length > 1 && (
            <div className="pt-1.5 border-t border-[#222222] flex items-center justify-between text-[10px] text-[#808080]">
              <span className="truncate">Open Tabs ({api.sessions.length}):</span>
              <div className="flex items-center gap-1 font-mono shrink-0">
                {api.sessions.map((sess, i) => (
                  <button
                    key={sess.id}
                    onClick={() => {
                      api.setActiveId(sess.id);
                      setSelectedSessionId(sess.id);
                    }}
                    className={cn(
                      "px-1.5 py-0.2 rounded border text-[9px] transition-colors cursor-pointer",
                      sess.id === (targetSession?.id || api.activeId)
                        ? "bg-[#FF6B00]/20 border-[#FF6B00]/50 text-[#FF6B00] font-bold"
                        : "bg-[#181818] border-[#2A2A2A] text-[#888888] hover:text-[#E0E0E0]"
                    )}
                    title={`Switch focus & AI target to Tab ${i + 1}: ${sess.title}`}
                  >
                    Tab {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Messages Stream */}
        <div className="space-y-2.5 min-w-0">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg transition-colors p-3 min-w-0 max-w-full break-words overflow-hidden ai-message-fade",
                m.role === "user"
                  ? "ml-4 fabric-tag text-[#E0E0E0]"
                  : "fabric-card text-[#E0E0E0]"
              )}
            >
              <div className="flex items-center justify-between mb-1.5 text-[10.5px] text-[#808080] min-w-0">
                <span className="flex items-center gap-1.5 font-medium truncate">
                  {m.role === "user" ? (
                    <span className="text-[#E0E0E0] font-semibold">You</span>
                  ) : (
                    <span className="text-[#FF6B00] flex items-center gap-1.5 font-semibold">
                      <ThirdEyeIcon className="h-3.5 w-3.5 shrink-0 text-[#FF6B00]" />
                      <span>THIRD EYE AI</span>
                      <span className="rounded bg-[#181818] border border-[#282828] px-1 py-0.2 text-[9px] font-mono font-normal text-[#808080]">
                        AGENT
                      </span>
                    </span>
                  )}
                </span>
                {m.timestamp && <span className="font-mono text-[9.5px] text-[#707070] shrink-0">{m.timestamp}</span>}
              </div>

              <FormattedMessage text={m.text} onRun={handleRunCommand} />

              {m.suggestedCommand && (
                <div className="mt-2 rounded-md fabric-tag p-2.5 font-mono text-[11.5px] min-w-0">
                  <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-[#FF6B00] font-sans">
                    Recommended Fix
                  </div>
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-[#FF6B00] truncate font-mono font-medium min-w-0 flex-1">{m.suggestedCommand}</span>
                    <Button
                      size="sm"
                      className="h-6 gap-1 bg-[#FF6B00] hover:bg-orange-600 text-white px-2.5 text-[11px] shrink-0 font-medium cursor-pointer fabric-btn"
                      onClick={() => {
                        if (m.suggestedCommand) handleRunCommand(m.suggestedCommand);
                      }}
                    >
                      <Play className="h-2.5 w-2.5 fill-current" /> Run Now
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 rounded-lg fabric-card p-3 text-xs text-[#808080] min-w-0 ai-message-fade">
              <Activity className="h-3.5 w-3.5 animate-pulse text-[#FF6B00] shrink-0" />
              <span className="animate-pulse text-[#E0E0E0] truncate">{thinkingStep || "Analyzing telemetry..."}</span>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input area & Quick actions */}
      <div className="shrink-0 border-t border-[#1C1C1C] p-2.5 bg-[#101010] w-full min-w-0">
        {/* Quick action slash pills */}
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar w-full min-w-0">
          {quickPrompts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => ask(item.label)}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-md fabric-card px-2.5 py-1 text-[11px] font-sans font-medium text-[#808080] hover:text-[#E0E0E0] transition-all cursor-pointer shrink-0"
                title={item.desc}
              >
                <Icon className="h-3 w-3 text-[#FF6B00]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Input box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          className="flex items-center gap-2 rounded-xl border border-[#2A2A2A] bg-[#181818] px-3 py-1.5 focus-within:border-[#383838] transition-colors w-full min-w-0"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={loading}
            placeholder="Ask THIRD EYE AI, /explain, /fix-error..."
            className="min-w-0 flex-1 bg-transparent text-xs text-[#E0E0E0] outline-none placeholder:text-[#606060] border-none p-0 font-sans"
          />
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#FF6B00] hover:bg-orange-600 text-white disabled:opacity-25 transition-all cursor-pointer"
            aria-label="Send prompt"
            title="Send to THIRD EYE AI"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </form>
        <div className="mt-1 flex items-center justify-between text-[10px] text-[#606060] px-1 font-mono min-w-0 gap-1">
          <span className="truncate">Enter to send</span>
          <span className="truncate">Context: 150 terminal lines linked</span>
        </div>
      </div>
    </aside>
  );
}
