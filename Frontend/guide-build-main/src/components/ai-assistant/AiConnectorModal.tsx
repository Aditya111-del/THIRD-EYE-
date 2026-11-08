import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Sparkles,
  Server,
  Key,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Cpu,
  Layers,
  ExternalLink,
  ChevronRight,
  Terminal as TerminalIcon,
  Zap,
  Globe,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface LocalDiscoveredModel {
  name: string;
  provider: "ollama" | "lmstudio" | "local";
  size?: string;
  family?: string;
  endpoint?: string;
}

interface AiConnectorModalProps {
  open: boolean;
  onClose: () => void;
  activeModel: string;
  onSelectModel: (modelName: string) => void;
}

export const CLOUD_DEFAULT_MODELS = [
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra 550B (Free)",
    provider: "OpenRouter",
    badge: "Free Tier",
    badgeColor: "bg-emerald-950/60 text-emerald-400 border-emerald-500/30",
    description: "NVIDIA Nemotron 3 Ultra 550B via OpenRouter free tier with fast inference & tool execution.",
    speed: "Ultra Fast",
    context: "128K tokens",
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "Google Gemini",
    badge: "Recommended",
    badgeColor: "bg-[#FF6B00]/20 text-[#FF9E4A] border-[#FF6B00]/40",
    description: "Ultra-fast response with vision, code execution & tool calling capabilities.",
    speed: "Ultra Fast",
    context: "1M tokens",
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    provider: "Google Gemini",
    badge: "High Quota",
    badgeColor: "bg-emerald-950/60 text-emerald-400 border-emerald-500/30",
    description: "Super efficient lightweight agent with maximum daily free-tier request limits.",
    speed: "Sub-second",
    context: "500K tokens",
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    provider: "Google Gemini",
    badge: "Balanced",
    badgeColor: "bg-blue-950/60 text-blue-400 border-blue-500/30",
    description: "Versatile model fine-tuned for high precision code synthesis and git diffs.",
    speed: "Fast",
    context: "1M tokens",
  },
  {
    id: "gemini-pro-latest",
    name: "Gemini Pro",
    provider: "Google Gemini",
    badge: "Deep Reasoning",
    badgeColor: "bg-purple-950/60 text-purple-400 border-purple-500/30",
    description: "Deep multi-file architecture planner for enterprise refactorings and full builds.",
    speed: "Moderate",
    context: "2M tokens",
  },
  {
    id: "gpt-4o",
    name: "OpenAI GPT-4o",
    provider: "OpenAI",
    badge: "Omni Vision",
    badgeColor: "bg-sky-950/60 text-sky-400 border-sky-500/30",
    description: "Flagship OpenAI model with advanced multimodality, code repair, and function calling.",
    speed: "Fast",
    context: "128K tokens",
  },
  {
    id: "gpt-4o-mini",
    name: "OpenAI GPT-4o Mini",
    provider: "OpenAI",
    badge: "Lightweight",
    badgeColor: "bg-teal-950/60 text-teal-400 border-teal-500/30",
    description: "Fast and cost-effective daily driver for quick bug fixes and explanations.",
    speed: "Very Fast",
    context: "128K tokens",
  },
];

export function AiConnectorModal({
  open,
  onClose,
  activeModel,
  onSelectModel,
}: AiConnectorModalProps) {
  const [activeTab, setActiveTab] = useState<"models" | "local" | "keys">("models");

  // State from backend / local
  const [geminiKey, setGeminiKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState("http://localhost:11434/v1");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [selectedProvider, setSelectedProvider] = useState<"gemini" | "openai" | "ollama">("gemini");

  const [hasGeminiSaved, setHasGeminiSaved] = useState(false);
  const [hasOpenAiSaved, setHasOpenAiSaved] = useState(false);

  // Password visibility
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);

  // Local model scanning
  const [isScanning, setIsScanning] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [lmStudioOnline, setLmStudioOnline] = useState<boolean | null>(null);
  const [localModels, setLocalModels] = useState<LocalDiscoveredModel[]>([]);

  // Testing & Saving status
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Fetch initial config from backend
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
        if (data.provider) {
          setSelectedProvider(data.provider);
        }
      }
    } catch (_) {}
  }, []);

  // Scan local models
  const scanLocalModels = useCallback(async () => {
    setIsScanning(true);
    try {
      const queryUrl = `http://localhost:4002/api/ai/models/local?ollamaUrl=${encodeURIComponent(ollamaUrl)}`;
      const res = await fetch(queryUrl);
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
  }, [ollamaUrl]);

  useEffect(() => {
    if (open) {
      fetchConfig();
      scanLocalModels();
    }
  }, [open, fetchConfig, scanLocalModels]);

  if (!open) return null;

  // Test connection
  const handleTestConnection = async (targetProvider = selectedProvider) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("http://localhost:4002/api/ai/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: targetProvider,
          apiKey: targetProvider === "gemini" ? geminiKey : openAiKey,
          baseUrl: targetProvider !== "gemini" ? openAiBaseUrl : undefined,
          model: activeModel,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || "Connection failed" });
    } finally {
      setIsTesting(false);
    }
  };

  // Save config
  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const payload: any = {
        provider: selectedProvider,
        model: activeModel,
      };
      if (geminiKey.trim()) payload.geminiKey = geminiKey.trim();
      if (openAiKey.trim()) payload.openAiKey = openAiKey.trim();
      if (openAiBaseUrl.trim()) payload.openAiBaseUrl = openAiBaseUrl.trim();

      const res = await fetch("http://localhost:4002/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage("Configuration saved and active!");
        if (geminiKey.trim()) {
          setHasGeminiSaved(true);
          localStorage.setItem("thirdeye_gemini_key", geminiKey.trim());
        }
        if (openAiKey.trim()) {
          setHasOpenAiSaved(true);
          localStorage.setItem("thirdeye_openai_key", openAiKey.trim());
        }
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage(`Error: ${data.error || "Save failed"}`);
      }
    } catch (err: any) {
      setSaveMessage(`Error: ${err?.message || "Save failed"}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-xl border border-[#422918] bg-gradient-to-b from-[#221B16] via-[#1A1817] to-[#121214] overflow-hidden flex flex-col max-h-[88vh] shadow-2xl shadow-black/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#342419] px-5 py-3.5 bg-[#171310]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#FF6B00] to-[#EA580C] p-0.5 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  THIRD EYE AI Connector & Model Switcher
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#2A1D15] border border-[#FF6B00]/30 text-[#FF9E4A]">
                  Active: {activeModel}
                </span>
              </div>
              <p className="text-[11px] text-[#A69E96] mt-0.5">
                Connect API keys, link local Ollama / LM Studio models, and switch default neural engines.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[#8E877F] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-[#342419] bg-[#141210] px-4 gap-1 text-[12px]">
          <button
            onClick={() => setActiveTab("models")}
            className={cn(
              "px-3.5 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer",
              activeTab === "models"
                ? "border-[#FF6B00] text-white"
                : "border-transparent text-[#8E877F] hover:text-white"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Default Models</span>
          </button>

          <button
            onClick={() => setActiveTab("local")}
            className={cn(
              "px-3.5 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer",
              activeTab === "local"
                ? "border-[#FF6B00] text-white"
                : "border-transparent text-[#8E877F] hover:text-white"
            )}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Local Models (Ollama)</span>
            {ollamaOnline && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("keys")}
            className={cn(
              "px-3.5 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer",
              activeTab === "keys"
                ? "border-[#FF6B00] text-white"
                : "border-transparent text-[#8E877F] hover:text-white"
            )}
          >
            <Key className="h-3.5 w-3.5" />
            <span>API Keys & Endpoints</span>
            {(hasGeminiSaved || hasOpenAiSaved) && (
              <Check className="h-3 w-3 text-emerald-400" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: "#422918 transparent" }}>
          {/* TAB 1: DEFAULT MODELS */}
          {activeTab === "models" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-white tracking-wide uppercase">
                    Curated Cloud AI Engines
                  </h3>
                  <p className="text-[11px] text-[#A69E96]">
                    Select any model to immediately set it as the primary agent intelligence.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#8E877F]">
                  <Globe className="h-3.5 w-3.5 text-[#FF6B00]" />
                  <span>Cloud Ready</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {CLOUD_DEFAULT_MODELS.map((m) => {
                  const isSelected = activeModel === m.id || activeModel.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        onSelectModel(m.id);
                        if (m.provider.includes("Gemini")) {
                          setSelectedProvider("gemini");
                        } else {
                          setSelectedProvider("openai");
                        }
                      }}
                      className={cn(
                        "rounded-lg p-3.5 border transition-all cursor-pointer flex flex-col justify-between gap-2 text-left group",
                        isSelected
                          ? "bg-gradient-to-b from-[#2A1D15] to-[#1E1610] border-[#FF6B00] ring-1 ring-[#FF6B00]/40 shadow-lg shadow-orange-500/10"
                          : "bg-[#161412] hover:bg-[#1D1814] border-[#342419] hover:border-[#FF6B00]/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[13px] text-white group-hover:text-[#FF9E4A] transition-colors">
                              {m.name}
                            </span>
                            <span className={cn("px-1.5 py-0.5 text-[9.5px] rounded border font-mono", m.badgeColor)}>
                              {m.badge}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-[#8E877F] font-mono">{m.provider}</span>
                        </div>
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "bg-[#FF6B00] border-[#FF6B00] text-white"
                              : "border-[#443830] text-transparent group-hover:border-[#FF6B00]/60"
                          )}
                        >
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      </div>

                      <p className="text-[11px] text-[#A69E96] leading-relaxed line-clamp-2">
                        {m.description}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-[#7A726A] font-mono pt-1 border-t border-white/[0.04]">
                        <span>⚡ {m.speed}</span>
                        <span>Context: {m.context}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Discovered Local Models Section inside Catalog */}
              {localModels.length > 0 && (
                <div className="pt-3 border-t border-[#342419] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-white tracking-wide uppercase flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Your Local Installed Models ({localModels.length})</span>
                    </h3>
                    <span className="text-[10.5px] text-emerald-400 font-mono">100% Offline & Private</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {localModels.map((lm) => {
                      const isSelected = activeModel === lm.name;
                      return (
                        <div
                          key={lm.name}
                          onClick={() => {
                            onSelectModel(lm.name);
                            setSelectedProvider("openai");
                            setOpenAiBaseUrl("http://localhost:11434/v1");
                          }}
                          className={cn(
                            "rounded-lg p-3 border transition-all cursor-pointer flex items-center justify-between text-left",
                            isSelected
                              ? "bg-[#1E2818] border-emerald-500 ring-1 ring-emerald-500/40"
                              : "bg-[#141814] hover:bg-[#1A221A] border-[#243324] hover:border-emerald-500/50"
                          )}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[12.5px] text-white font-mono">{lm.name}</span>
                              {lm.size && (
                                <span className="px-1.5 py-0.5 text-[9.5px] rounded bg-emerald-950/80 border border-emerald-600/40 text-emerald-300 font-mono">
                                  {lm.size}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              {lm.provider.toUpperCase()} • Localhost
                            </span>
                          </div>
                          <div
                            className={cn(
                              "h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                              isSelected ? "bg-emerald-500 border-emerald-500 text-black" : "border-zinc-600 text-transparent"
                            )}
                          >
                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LOCAL MODELS (OLLAMA / LM STUDIO) */}
          {activeTab === "local" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-white tracking-wide flex items-center gap-2">
                  <Server className="h-4 w-4 text-[#FF6B00]" />
                  <span>Connect Local Neural Models (Ollama / LM Studio)</span>
                </h3>
                <p className="text-[11.5px] text-[#A69E96] mt-0.5 leading-relaxed">
                  Run high-capability coding models completely offline on your host machine with zero cloud dependencies and maximum privacy.
                </p>
              </div>

              {/* Status Banner */}
              <div
                className={cn(
                  "rounded-lg p-3.5 border flex items-center justify-between",
                  ollamaOnline
                    ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                    : "bg-[#241A14] border-[#4A2D1B] text-[#D4A373]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "h-3 w-3 rounded-full shrink-0",
                      ollamaOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                    )}
                  />
                  <div>
                    <div className="text-[12.5px] font-medium text-white">
                      {ollamaOnline
                        ? `Ollama Service Online • ${localModels.length} models detected`
                        : "Ollama Not Detected on Default Port (11434)"}
                    </div>
                    <div className="text-[11px] opacity-80">
                      {ollamaOnline
                        ? `Ready to stream local inference directly to THIRD EYE.`
                        : `Ensure Ollama is running: run "ollama serve" in your terminal.`}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={scanLocalModels}
                  disabled={isScanning}
                  className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3 w-3", isScanning && "animate-spin")} />
                  <span>Rescan</span>
                </button>
              </div>

              {/* Local Endpoint Config */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#D4C8BE] flex items-center justify-between">
                  <span>Ollama Endpoint URL</span>
                  <span className="text-[10px] text-[#8E877F] font-mono">Default: http://localhost:11434</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="flex-1 rounded-lg border border-[#3E2818] bg-[#141210] px-3 py-2 text-xs text-white font-mono focus:border-[#FF6B00] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={scanLocalModels}
                    disabled={isScanning}
                    className="px-4 py-2 bg-gradient-to-r from-[#FF6B00] to-[#EA580C] hover:from-[#FF7D1A] hover:to-[#F97316] text-white text-xs font-medium rounded-lg transition-all cursor-pointer shadow-sm shadow-orange-500/20 disabled:opacity-50 shrink-0"
                  >
                    {isScanning ? "Scanning..." : "Scan Models"}
                  </button>
                </div>
              </div>

              {/* List of Models */}
              {localModels.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <label className="text-[11px] font-semibold text-white uppercase tracking-wider">
                    Available Models On Host Machine
                  </label>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {localModels.map((lm) => {
                      const isSelected = activeModel === lm.name;
                      return (
                        <div
                          key={lm.name}
                          className={cn(
                            "p-2.5 rounded-lg border flex items-center justify-between transition-colors",
                            isSelected
                              ? "bg-[#1E2818] border-emerald-500/60"
                              : "bg-[#161412] border-[#342419] hover:border-[#FF6B00]/40"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <Cpu className="h-4 w-4 text-emerald-400 shrink-0" />
                            <div>
                              <div className="text-[12px] font-medium text-white font-mono">{lm.name}</div>
                              <div className="text-[10px] text-[#8E877F] font-mono">
                                {lm.provider.toUpperCase()} {lm.size ? `• ${lm.size}` : ""} • {lm.family || "llama"}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectModel(lm.name);
                              setSelectedProvider("openai");
                              setOpenAiBaseUrl("http://localhost:11434/v1");
                            }}
                            className={cn(
                              "px-3 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer",
                              isSelected
                                ? "bg-emerald-500 text-black font-semibold"
                                : "bg-[#2A1D15] hover:bg-[#FF6B00] text-[#D4C8BE] hover:text-white border border-[#422918]"
                            )}
                          >
                            {isSelected ? "Active" : "Use This Model"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[#3E2818] bg-[#161412] p-4 text-center space-y-2">
                  <Cpu className="h-6 w-6 text-[#8E877F] mx-auto opacity-70" />
                  <div className="text-[12px] font-medium text-white">No Local Models Detected Yet</div>
                  <p className="text-[11px] text-[#A69E96] max-w-md mx-auto leading-relaxed">
                    Install Ollama and pull any model of your choice to test offline reasoning:
                  </p>
                  <div className="bg-[#0E0C0A] border border-[#2A1D15] p-2.5 rounded-md font-mono text-[11px] text-emerald-400 inline-block text-left">
                    <div># Pull popular fast coding models:</div>
                    <div className="text-white">ollama run llama3:8b</div>
                    <div className="text-white">ollama run deepseek-r1:14b</div>
                    <div className="text-white">ollama run qwen2.5-coder:7b</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: API KEYS & CUSTOM ENDPOINTS */}
          {activeTab === "keys" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-white tracking-wide flex items-center gap-2">
                  <Key className="h-4 w-4 text-[#FF6B00]" />
                  <span>API Keys & Cloud Endpoints</span>
                </h3>
                <p className="text-[11.5px] text-[#A69E96] mt-0.5 leading-relaxed">
                  Keys are safely stored locally in your workspace <code className="text-[#FF9E4A] bg-[#2A1D15] px-1 py-0.5 rounded font-mono text-[10.5px]">.env</code> file and never sent to external telemetry.
                </p>
              </div>

              {/* 1. Google Gemini */}
              <div className="rounded-lg border border-[#3E2818] bg-[#161412] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#FF6B00]" />
                    <span className="text-[12.5px] font-medium text-white">Google Gemini API Key</span>
                    {hasGeminiSaved && (
                      <span className="px-1.5 py-0.2 text-[9.5px] rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                        Saved
                      </span>
                    )}
                  </div>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[#FF9E4A] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Get free key</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showGeminiKey ? "text" : "password"}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder={hasGeminiSaved ? "•••••••••••••••••••••••• (Key Active in .env)" : "AIzaSy... (Paste Gemini Key)"}
                    className="w-full rounded-lg border border-[#3E2818] bg-[#100E0C] px-3 py-2 pr-10 text-xs text-white font-mono focus:border-[#FF6B00] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey((p) => !p)}
                    className="absolute right-2.5 top-2.5 text-[#8E877F] hover:text-white"
                  >
                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* 2. OpenAI / Compatible */}
              <div className="rounded-lg border border-[#3E2818] bg-[#161412] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-sky-400" />
                    <span className="text-[12.5px] font-medium text-white">OpenAI / OpenRouter / Groq Key</span>
                    {hasOpenAiSaved && (
                      <span className="px-1.5 py-0.2 text-[9.5px] rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                        Saved
                      </span>
                    )}
                  </div>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>OpenAI Dashboard</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showOpenAiKey ? "text" : "password"}
                    value={openAiKey}
                    onChange={(e) => setOpenAiKey(e.target.value)}
                    placeholder={hasOpenAiSaved ? "•••••••••••••••••••••••• (Key Active in .env)" : "sk-... (Paste OpenAI or Custom Key)"}
                    className="w-full rounded-lg border border-[#3E2818] bg-[#100E0C] px-3 py-2 pr-10 text-xs text-white font-mono focus:border-[#FF6B00] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenAiKey((p) => !p)}
                    className="absolute right-2.5 top-2.5 text-[#8E877F] hover:text-white"
                  >
                    {showOpenAiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Base URL Input for Custom Endpoints */}
                <div className="space-y-1 pt-1">
                  <label className="text-[10.5px] font-medium text-[#A69E96]">
                    Custom OpenAI-Compatible Endpoint URL (e.g. OpenRouter, Groq, LM Studio, vLLM)
                  </label>
                  <input
                    type="text"
                    value={openAiBaseUrl}
                    onChange={(e) => setOpenAiBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded-lg border border-[#3E2818] bg-[#100E0C] px-3 py-1.5 text-xs text-white font-mono focus:border-[#FF6B00] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Action Bar */}
        <div className="border-t border-[#342419] p-4 bg-[#171310] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestConnection()}
              disabled={isTesting}
              className="px-3.5 py-2 rounded-lg bg-[#2A1D15] hover:bg-[#38261B] text-[#FF9E4A] border border-[#FF6B00]/40 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              <span>Test Connection</span>
            </button>

            {testResult && (
              <span
                className={cn(
                  "text-[11px] font-medium flex items-center gap-1.5 animate-in fade-in",
                  testResult.success ? "text-emerald-400" : "text-rose-400"
                )}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Connected ({testResult.latencyMs}ms)</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[220px]" title={testResult.error}>
                      {testResult.error || "Failed"}
                    </span>
                  </>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {saveMessage && (
              <span
                className={cn(
                  "text-[11px] font-medium animate-in fade-in",
                  saveMessage.startsWith("Error") ? "text-rose-400" : "text-emerald-400"
                )}
              >
                {saveMessage}
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#FF6B00] to-[#EA580C] hover:from-[#FF7D1A] hover:to-[#F97316] text-white text-xs font-semibold shadow-md shadow-orange-500/25 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 stroke-[3]" />}
              <span>Save & Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
