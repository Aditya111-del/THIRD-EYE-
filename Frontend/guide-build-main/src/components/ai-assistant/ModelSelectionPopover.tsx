import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Check,
  ChevronRight,
  AlertTriangle,
  Info,
  Zap,
  Server,
  Key,
  RotateCw,
  ExternalLink,
  Eye,
  EyeOff,
  Cpu,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelOptionItem {
  id: string;
  name: string;
  tag?: string; // e.g. "High", "Thinking", "Medium", "Fast", "Omni"
  provider: "google" | "anthropic" | "openai" | "deepseek" | "local";
  needsKey?: boolean;
  notice?: string;
  contextWindow?: string;
  description?: string;
}

export interface LocalDiscoveredModel {
  name: string;
  provider: "ollama" | "lmstudio" | "local";
  size?: string;
  family?: string;
  endpoint?: string;
}

// Default models matching Screenshot 2 & cloud catalog
const DEFAULT_CLOUD_MODELS: ModelOptionItem[] = [
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra 550B (Free)",
    tag: "Ultra",
    provider: "openai",
    contextWindow: "128K tokens",
    description: "NVIDIA Nemotron 3 Ultra 550B via OpenRouter free tier.",
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    tag: "High",
    provider: "google",
    contextWindow: "1M tokens",
    description: "Ultra-fast response with vision, code execution & tool calling capabilities.",
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash",
    tag: "Fast",
    provider: "google",
    contextWindow: "500K tokens",
    description: "Maximum daily free quota with sub-second response times.",
  },
  {
    id: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    tag: "Thinking",
    provider: "anthropic",
    needsKey: true,
    notice: "External Anthropic API Key required",
    contextWindow: "200K tokens",
    description: "Deep sequential reasoning for complex architecture and algorithm generation.",
  },
  {
    id: "claude-opus-4.6",
    name: "Claude Opus 4.6",
    tag: "Thinking",
    provider: "anthropic",
    needsKey: true,
    notice: "External Anthropic API Key required",
    contextWindow: "200K tokens",
    description: "Maximum capability model for massive codebase synthesis and refactoring.",
  },
  {
    id: "gpt-oss-120b",
    name: "GPT-OSS 120B",
    tag: "Medium",
    provider: "openai",
    needsKey: true,
    notice: "OpenRouter or Custom Endpoint required",
    contextWindow: "128K tokens",
    description: "Open-weight reasoning model running via OpenRouter or vLLM.",
  },
  {
    id: "gpt-4o",
    name: "OpenAI GPT-4o",
    tag: "Omni",
    provider: "openai",
    needsKey: true,
    notice: "OpenAI API Key required",
    contextWindow: "128K tokens",
    description: "Flagship multimodal OpenAI model for vision and diagnostics.",
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    tag: "Thinking",
    provider: "deepseek",
    needsKey: true,
    notice: "DeepSeek / OpenRouter Key required",
    contextWindow: "64K tokens",
    description: "Open reasoning model with chain-of-thought verification.",
  },
];

interface ModelSelectionPopoverProps {
  open: boolean;
  onClose: () => void;
  selectedModel: string;
  onSelectModel: (modelName: string) => void;
  onOpenFullModal?: () => void;
}

export function ModelSelectionPopover({
  open,
  onClose,
  selectedModel,
  onSelectModel,
  onOpenFullModal,
}: ModelSelectionPopoverProps) {
  const [activeTab, setActiveTab] = useState<"default" | "local" | "integration">("default");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Notice popover / tooltip state
  const [activeNotice, setActiveNotice] = useState<{ name: string; notice: string } | null>(null);

  // Local model scanning
  const [isScanning, setIsScanning] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [lmStudioOnline, setLmStudioOnline] = useState<boolean | null>(null);
  const [localModels, setLocalModels] = useState<LocalDiscoveredModel[]>([]);

  // API Key integration state
  const [geminiKey, setGeminiKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState("http://localhost:11434/v1");
  const [hasGeminiSaved, setHasGeminiSaved] = useState(false);
  const [hasOpenAiSaved, setHasOpenAiSaved] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);

  // Test & save state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch backend config & local models
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:4002/api/ai/config");
      if (res.ok) {
        const data = await res.json();
        if (data.hasGeminiKey) setHasGeminiSaved(true);
        if (data.hasOpenAiKey) setHasOpenAiSaved(true);
        if (data.openAiBaseUrl && data.openAiBaseUrl !== "https://api.openai.com/v1") {
          setOpenAiBaseUrl(data.openAiBaseUrl);
        }
      }
    } catch (_) {}
  }, []);

  const scanLocalModels = useCallback(async () => {
    setIsScanning(true);
    try {
      const res = await fetch("http://localhost:4002/api/ai/models/local");
      if (res.ok) {
        const data = await res.json();
        setOllamaOnline(Boolean(data.ollamaOnline));
        setLmStudioOnline(Boolean(data.lmStudioOnline));
        setLocalModels(data.models || []);
      } else {
        setOllamaOnline(false);
      }
    } catch (_) {
      setOllamaOnline(false);
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchConfig();
      scanLocalModels();
    } else {
      setActiveNotice(null);
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [open, fetchConfig, scanLocalModels]);

  // Test connection ping
  const handleTestPing = async (provider: "gemini" | "openai" | "ollama") => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("http://localhost:4002/api/ai/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: provider === "gemini" ? geminiKey : openAiKey,
          baseUrl: openAiBaseUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, latencyMs: data.latencyMs });
      } else {
        setTestResult({ success: false, error: data.error || "Connection failed" });
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || "Failed to reach backend" });
    } finally {
      setIsTesting(false);
    }
  };

  // Save API keys
  const handleSaveKeys = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("http://localhost:4002/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: geminiKey || undefined,
          openAiApiKey: openAiKey || undefined,
          openAiBaseUrl: openAiBaseUrl || undefined,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        if (geminiKey) setHasGeminiSaved(true);
        if (openAiKey) setHasOpenAiSaved(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (_) {}
    setIsSaving(false);
  };

  if (!open) return null;

  return (
    <>
      {/* Invisible backdrop to dismiss click outside */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={popoverRef}
        className={cn(
          "absolute bottom-full mb-2.5 left-0 z-50 w-[310px] sm:w-[340px] rounded-2xl bg-[#181920]/98 backdrop-blur-xl",
          "border-2 border-[#0284C7] shadow-[0_12px_36px_rgba(0,0,0,0.7),0_0_24px_rgba(2,132,199,0.3)]",
          "p-2 text-[12px] text-[#E0E0E6] flex flex-col select-none animate-in fade-in zoom-in-95 duration-150"
        )}
      >
      {/* ── Top Header matching Screenshot 2 ── */}
      <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-white/[0.08]">
        <span className="font-sans font-medium text-[12.5px] text-zinc-300">Model</span>

        {/* 3 Categories: Default | Local | API Keys */}
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/[0.06] text-[10.5px]">
          <button
            type="button"
            onClick={() => setActiveTab("default")}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer",
              activeTab === "default"
                ? "bg-[#0284C7] text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Default
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("local");
              scanLocalModels();
            }}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1",
              activeTab === "local"
                ? "bg-[#0284C7] text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <span>Local</span>
            {ollamaOnline && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("integration")}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1",
              activeTab === "integration"
                ? "bg-[#0284C7] text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Key className="h-2.5 w-2.5" />
            <span>Keys</span>
          </button>
        </div>
      </div>

      {/* ── Notice Overlay / Tooltip if user clicks "Notice ⓘ" ── */}
      {activeNotice && (
        <div className="my-1.5 p-2 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-200 text-[11px] flex items-start justify-between gap-1.5 animate-in fade-in duration-100">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-300">{activeNotice.name}</div>
              <div className="text-[10.5px] text-amber-200/90 leading-tight mt-0.5">{activeNotice.notice}</div>
              <button
                type="button"
                onClick={() => {
                  setActiveNotice(null);
                  setActiveTab("integration");
                }}
                className="mt-1 text-[10px] text-[#38BDF8] hover:underline font-medium cursor-pointer"
              >
                Configure API Key &rarr;
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveNotice(null)}
            className="text-amber-400/80 hover:text-amber-200 p-0.5 rounded"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ── TAB 1: DEFAULT CLOUD MODELS (Matches Screenshot 2) ── */}
      {activeTab === "default" && (
        <div className="py-1 space-y-0.5 max-h-[300px] overflow-y-auto scrollbar-thin pr-0.5">
          {DEFAULT_CLOUD_MODELS.map((item) => {
            const isSelected =
              selectedModel === item.name ||
              (item.id === "gemini-3.8-flash" && selectedModel.includes("3.8 Flash")) ||
              (item.id === "gemini-3.5-flash-lite" && (selectedModel.includes("3.5") || selectedModel.includes("Lite"))) ||
              (item.id === "claude-sonnet-4.6" && selectedModel.includes("Sonnet")) ||
              (item.id === "claude-opus-4.6" && selectedModel.includes("Opus")) ||
              (item.id === "gpt-4o" && selectedModel.includes("4o"));

            return (
              <div
                key={item.id}
                onClick={() => {
                  onSelectModel(item.name);
                  onClose();
                }}
                className={cn(
                  "group px-2.5 py-2 rounded-xl flex items-center justify-between cursor-pointer transition-all",
                  isSelected
                    ? "bg-white/[0.12] text-white font-medium"
                    : "hover:bg-white/[0.06] text-zinc-300 hover:text-white"
                )}
              >
                {/* Left: Model Name & Tag */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate text-[12.5px]">{item.name}</span>
                  {item.tag && (
                    <span
                      className={cn(
                        "text-[10.5px] font-normal px-1 py-0.2 rounded",
                        item.tag === "Thinking"
                          ? "text-purple-300/90 font-mono"
                          : item.tag === "High"
                          ? "text-sky-300 font-mono"
                          : "text-zinc-400 font-mono"
                      )}
                    >
                      ({item.tag})
                    </span>
                  )}
                </div>

                {/* Right: Notice Badge, Chevron, or Active Checkmark */}
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  {item.needsKey && !hasOpenAiSaved && item.provider !== "google" ? (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveNotice({ name: item.name, notice: item.notice || "API key configuration needed." });
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-950/70 border border-amber-600/40 text-amber-300 text-[10px] hover:bg-amber-900/80 transition-colors"
                      title="Configuration Notice"
                    >
                      <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                      <span className="font-sans font-medium">Notice</span>
                      <Info className="h-2.5 w-2.5 text-amber-400 opacity-80" />
                    </div>
                  ) : isSelected ? (
                    <div className="flex items-center gap-1 text-[#38BDF8]">
                      <Check className="h-3.5 w-3.5" />
                      <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                    </div>
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 opacity-30 group-hover:opacity-70 transition-opacity" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB 2: LOCAL RUNNING MODELS (Ollama / LM Studio) ── */}
      {activeTab === "local" && (
        <div className="py-1 space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin pr-0.5">
          {/* Status bar */}
          <div className="p-2 rounded-xl bg-black/40 border border-white/[0.08] flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  ollamaOnline ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-zinc-600"
                )}
              />
              <span className="text-zinc-300 font-mono text-[11px]">
                {ollamaOnline ? "Ollama Online (11434)" : "Ollama Offline"}
              </span>
            </div>
            <button
              type="button"
              onClick={scanLocalModels}
              disabled={isScanning}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Rescan localhost"
            >
              <RotateCw className={cn("h-3 w-3", isScanning && "animate-spin text-[#38BDF8]")} />
            </button>
          </div>

          {/* Model list or empty state */}
          {localModels.length > 0 ? (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold px-1">
                Detected Running Models ({localModels.length})
              </div>
              {localModels.map((m) => {
                const isSelected = selectedModel.includes(m.name);
                return (
                  <div
                    key={m.name}
                    onClick={() => {
                      onSelectModel(`Ollama (${m.name})`);
                      onClose();
                    }}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors",
                      isSelected
                        ? "bg-[#0284C7]/20 border-[#0284C7]/50 text-white"
                        : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[11.5px] truncate text-white">{m.name}</div>
                      <div className="text-[9.5px] text-zinc-400 font-mono">
                        {m.size || "Local Model"} {m.family ? `· ${m.family}` : ""}
                      </div>
                    </div>
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-[#38BDF8] shrink-0" />
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-600/30">
                        Local
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center space-y-2">
              <Server className="h-6 w-6 text-zinc-500 mx-auto" />
              <div className="text-[11.5px] text-zinc-300 font-medium">No Local Ollama Running</div>
              <div className="text-[10.5px] text-zinc-400 leading-relaxed font-sans">
                Run this command in any terminal to start an isolated local model:
              </div>
              <code className="block p-1.5 rounded bg-black/60 border border-white/10 font-mono text-[10.5px] text-emerald-400 select-all">
                ollama run llama3:8b
              </code>
              <button
                type="button"
                onClick={scanLocalModels}
                className="w-full mt-1 py-1 rounded-lg bg-[#0284C7] hover:bg-[#0284C7]/90 text-white text-[11px] font-medium transition-colors cursor-pointer"
              >
                Scan Localhost:11434
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: EXTERNAL API INTEGRATION & KEYS ── */}
      {activeTab === "integration" && (
        <div className="py-1 space-y-2.5 max-h-[300px] overflow-y-auto scrollbar-thin pr-0.5">
          {/* Gemini Key Input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-zinc-300 font-medium">Google Gemini Key</span>
              {hasGeminiSaved && (
                <span className="text-[9.5px] text-emerald-400 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Saved
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showGeminiKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder={hasGeminiSaved ? "Saved in .env (enter to update)" : "AIzaSy..."}
                className="w-full h-7 rounded-lg bg-black/50 border border-white/15 px-2 pr-7 text-[11px] text-white placeholder:text-zinc-600 outline-none focus:border-[#0284C7] font-mono"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey((v) => !v)}
                className="absolute right-1.5 top-1.5 text-zinc-400 hover:text-white"
              >
                {showGeminiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* OpenAI / OpenRouter Key Input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-zinc-300 font-medium">OpenAI / Claude / Router Key</span>
              {hasOpenAiSaved && (
                <span className="text-[9.5px] text-emerald-400 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Saved
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showOpenAiKey ? "text" : "password"}
                value={openAiKey}
                onChange={(e) => setOpenAiKey(e.target.value)}
                placeholder={hasOpenAiSaved ? "Saved in .env (enter to update)" : "sk-..."}
                className="w-full h-7 rounded-lg bg-black/50 border border-white/15 px-2 pr-7 text-[11px] text-white placeholder:text-zinc-600 outline-none focus:border-[#0284C7] font-mono"
              />
              <button
                type="button"
                onClick={() => setShowOpenAiKey((v) => !v)}
                className="absolute right-1.5 top-1.5 text-zinc-400 hover:text-white"
              >
                {showOpenAiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* Custom Base URL */}
          <div className="space-y-1">
            <span className="text-[10.5px] text-zinc-300 font-medium">Custom API Endpoint URL</span>
            <input
              type="text"
              value={openAiBaseUrl}
              onChange={(e) => setOpenAiBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1 or https://openrouter.ai/api/v1"
              className="w-full h-7 rounded-lg bg-black/50 border border-white/15 px-2 text-[11px] text-white placeholder:text-zinc-600 outline-none focus:border-[#0284C7] font-mono"
            />
          </div>

          {/* Ping test status */}
          {testResult && (
            <div
              className={cn(
                "p-1.5 rounded-lg border text-[10.5px] flex items-center gap-1.5 font-mono",
                testResult.success
                  ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/60 border-rose-500/40 text-rose-300"
              )}
            >
              {testResult.success ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span>Connection OK ({testResult.latencyMs}ms)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3 text-rose-400 shrink-0" />
                  <span className="truncate">{testResult.error}</span>
                </>
              )}
            </div>
          )}

          {saveSuccess && (
            <div className="p-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[10.5px] flex items-center gap-1.5 font-mono">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>Keys saved & hot-reloaded!</span>
            </div>
          )}

          {/* Actions: Test Ping & Save */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleTestPing("gemini")}
              disabled={isTesting}
              className="flex-1 h-7 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-[11px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 text-amber-400" />}
              <span>Test Ping</span>
            </button>
            <button
              type="button"
              onClick={handleSaveKeys}
              disabled={isSaving || (!geminiKey && !openAiKey && !openAiBaseUrl)}
              className="flex-1 h-7 rounded-lg bg-[#0284C7] hover:bg-[#0284C7]/90 disabled:opacity-50 text-white text-[11px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-sm"
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              <span>Save Keys</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="pt-2 mt-1 border-t border-white/[0.08] flex items-center justify-between text-[10px] text-zinc-400 px-1">
        <span className="truncate max-w-[170px] font-mono text-[9.5px]">
          Active: <span className="text-white font-medium">{selectedModel}</span>
        </span>
        {onOpenFullModal && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFullModal();
            }}
            className="text-[#38BDF8] hover:underline cursor-pointer flex items-center gap-1 font-medium"
          >
            <span>Full Settings</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
    </>
  );
}
