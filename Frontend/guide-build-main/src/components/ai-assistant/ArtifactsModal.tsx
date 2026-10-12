import React, { useState } from "react";
import {
  X,
  ListTodo,
  FileCode,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ExternalLink,
  MessageSquare,
  Send,
  Eye,
  Check,
  Sparkles,
  Bot,
  User,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react";
import type {
  AgentArtifact,
  ArtifactType,
  TaskListArtifactData,
  ImplementationPlanArtifactData,
  CodeDiffsArtifactData,
  WalkthroughArtifactData,
  VerificationEvidenceItem,
  ArtifactFeedbackItem,
} from "@third-eye/shared";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { AiMarkdownView } from "./AiMarkdownView";

interface ArtifactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  artifacts: AgentArtifact[];
  sessionId: string;
  onRefresh?: () => void;
  onViewDiff?: (filePath: string, original: string, modified: string) => void;
}

export function ArtifactsModal({
  isOpen,
  onClose,
  artifacts,
  sessionId,
  onRefresh,
  onViewDiff,
}: ArtifactsModalProps) {
  const [selectedType, setSelectedType] = useState<ArtifactType>("task_list");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter or pick active artifact for selected type
  const currentArtifact = artifacts.find((a) => a.type === selectedType) || artifacts[0];

  const handleCopy = (id: string, text: string) => {
    copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendFeedback = async () => {
    if (!feedbackInput.trim() || !currentArtifact) return;
    setSubmittingFeedback(true);
    try {
      await fetch("http://localhost:4002/api/ai/agent/artifacts/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          artifactId: currentArtifact.id,
          comment: feedbackInput.trim(),
          author: "user",
        }),
      });
      setFeedbackInput("");
      onRefresh?.();
    } catch (e) {
      console.error("Failed to submit artifact feedback:", e);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "passed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Passed
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            Running
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            Failed
          </span>
        );
      case "blocked":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Blocked
          </span>
        );
      case "executed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <ShieldCheck className="w-3 h-3 text-purple-400" />
            Executed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/50">
            <Clock className="w-3 h-3 text-zinc-400" />
            Planned
          </span>
        );
    }
  };

  const navItems: { type: ArtifactType; label: string; icon: React.ReactNode }[] = [
    { type: "task_list", label: "Task List", icon: <ListTodo className="w-4 h-4" /> },
    { type: "implementation_plan", label: "Implementation Plan", icon: <Layers className="w-4 h-4" /> },
    { type: "code_diffs", label: "Code Diffs", icon: <FileCode className="w-4 h-4" /> },
    { type: "walkthrough", label: "Walkthrough & Evidence", icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl h-[86vh] bg-[#121316] border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-[#16171a]">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#1E58FC] to-[#7C3AED] flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
                  Third Eye Reviewable Artifacts
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Third Eye Architecture
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Evidence-backed deliverables, execution tasks, unified diffs, and architectural plan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 rounded-md border border-zinc-700/50 transition-colors"
              title="Refresh artifacts"
            >
              Sync Live
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 pb-2 border-b border-zinc-800/60 bg-[#141518]">
          {navItems.map((item) => {
            const hasArtifact = artifacts.some((a) => a.type === item.type);
            const isSelected = selectedType === item.type;
            return (
              <button
                key={item.type}
                onClick={() => setSelectedType(item.type)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                  isSelected
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
                {hasArtifact && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {!currentArtifact ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Clock className="w-10 h-10 text-zinc-600 mb-3 animate-pulse" />
              <h3 className="text-sm font-medium text-zinc-300">Artifact will be published upon execution</h3>
              <p className="text-xs text-zinc-500 max-w-sm mt-1">
                The Orchestrator generates this artifact automatically during the task lifecycle.
              </p>
            </div>
          ) : (
            <>
              {/* Artifact Header Info */}
              <div className="bg-[#18191d] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{currentArtifact.title}</h3>
                  {currentArtifact.description && (
                    <p className="text-xs text-zinc-400 mt-0.5">{currentArtifact.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-zinc-500">
                    Updated {new Date(currentArtifact.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* 1. TASK LIST VIEW */}
              {currentArtifact.type === "task_list" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {((currentArtifact.data as TaskListArtifactData)?.items || []).map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className={cn(
                          "p-3.5 rounded-xl border transition-all",
                          item.status === "passed"
                            ? "bg-emerald-950/10 border-emerald-900/30"
                            : item.status === "running"
                            ? "bg-blue-950/15 border-blue-800/40"
                            : item.status === "failed"
                            ? "bg-rose-950/15 border-rose-900/40"
                            : "bg-[#16171a] border-zinc-800/80"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 font-mono text-[11px] text-zinc-500">
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-semibold text-zinc-100">{item.title}</h4>
                                {item.workerRole && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                                    {item.workerRole}
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                              {item.result && (
                                <div className="mt-2 text-[11px] bg-zinc-900/90 border border-zinc-800 rounded p-2 text-zinc-300 font-mono">
                                  {item.result}
                                </div>
                              )}
                              {item.error && (
                                <div className="mt-2 text-[11px] bg-rose-950/30 border border-rose-900/40 rounded p-2 text-rose-300 font-mono">
                                  {item.error}
                                </div>
                              )}
                            </div>
                          </div>
                          <div>{renderStatusBadge(item.status)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. IMPLEMENTATION PLAN VIEW */}
              {currentArtifact.type === "implementation_plan" && (
                <div className="space-y-4">
                  {(() => {
                    const plan = currentArtifact.data as ImplementationPlanArtifactData;
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#16171a] border border-zinc-800/80 rounded-xl p-4 space-y-3">
                          <div>
                            <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                              Architectural Approach
                            </span>
                            <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                              {plan?.architectureApproach || "Standard multi-agent execution pipeline."}
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                              Existing Behavior & Scope
                            </span>
                            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                              {plan?.existingBehavior || "Workspace scoped."}
                            </p>
                          </div>
                        </div>

                        <div className="bg-[#16171a] border border-zinc-800/80 rounded-xl p-4 space-y-3">
                          <div>
                            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                              Test & Verification Strategy
                            </span>
                            <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                              {plan?.testStrategy || "Static checks, compilation build verification, runtime localhost health checks."}
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                              Risk & Rollback Strategy
                            </span>
                            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                              {plan?.riskAndRollback || "Checkpoints created before modifications. Single-writer file locks enforce concurrency safety."}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 3. CODE DIFFS VIEW */}
              {currentArtifact.type === "code_diffs" && (
                <div className="space-y-3">
                  {(() => {
                    const diffData = currentArtifact.data as CodeDiffsArtifactData;
                    const diffs = diffData?.diffs || [];
                    if (diffs.length === 0) {
                      return (
                        <div className="text-center py-12 text-zinc-500 text-xs">
                          No file modifications recorded in this session yet.
                        </div>
                      );
                    }
                    return diffs.map((diff, idx) => (
                      <div
                        key={idx}
                        className="bg-[#16171a] border border-zinc-800/80 rounded-xl p-3.5 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
                          <div>
                            <div className="text-xs font-mono font-medium text-zinc-200">
                              {diff.filePath}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-emerald-400 font-mono">
                                +{diff.addedLines}
                              </span>
                              <span className="text-[11px] text-rose-400 font-mono">
                                -{diff.removedLines}
                              </span>
                              <span className="text-[10px] text-zinc-500 uppercase">
                                {diff.changeType}
                              </span>
                            </div>
                          </div>
                        </div>

                        {onViewDiff && diff.originalContent && diff.modifiedContent && (
                          <button
                            onClick={() =>
                              onViewDiff(
                                diff.filePath,
                                diff.originalContent || "",
                                diff.modifiedContent || ""
                              )
                            }
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg transition-colors border border-zinc-700/50"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Diff</span>
                          </button>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* 4. WALKTHROUGH & VERIFICATION EVIDENCE VIEW */}
              {currentArtifact.type === "walkthrough" && (
                <div className="space-y-5">
                  {(() => {
                    const wt = currentArtifact.data as WalkthroughArtifactData;
                    return (
                      <>
                        {/* Summary */}
                        <div className="bg-[#16171a] border border-zinc-800/80 rounded-xl p-4">
                          <h4 className="text-xs font-semibold text-zinc-200 mb-2">
                            Deliverable Summary
                          </h4>
                          <AiMarkdownView content={wt?.summary || "Execution in progress..."} />
                        </div>

                        {/* Evidence Checklist */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Tool-Backed Verification Evidence Gate</span>
                          </h4>
                          <div className="grid grid-cols-1 gap-2">
                            {(wt?.evidence || []).map((ev, idx) => (
                              <div
                                key={ev.id || idx}
                                className={cn(
                                  "p-3 rounded-xl border flex items-center justify-between",
                                  ev.status === "passed"
                                    ? "bg-emerald-950/15 border-emerald-900/30"
                                    : ev.status === "failed"
                                    ? "bg-rose-950/15 border-rose-900/30"
                                    : "bg-[#16171a] border-zinc-800/80"
                                )}
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-zinc-200">{ev.name}</span>
                                    {ev.command && (
                                      <code className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                                        {ev.command}
                                      </code>
                                    )}
                                  </div>
                                  {ev.outputSummary && (
                                    <p className="text-[11px] text-zinc-400 mt-1">{ev.outputSummary}</p>
                                  )}
                                  {ev.url && (
                                    <a
                                      href={ev.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline mt-1"
                                    >
                                      <span>{ev.url}</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                <div>{renderStatusBadge(ev.status)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Feedback History & Comment Box (Section 6.6 Artifact Feedback) */}
              <div className="bg-[#16171a] border border-zinc-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span>Artifact Feedback & Revision Comments</span>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {currentArtifact.feedback?.length || 0} comment(s)
                  </span>
                </div>

                {/* Feedback List */}
                {currentArtifact.feedback && currentArtifact.feedback.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {currentArtifact.feedback.map((fb) => (
                      <div
                        key={fb.id}
                        className={cn(
                          "p-2.5 rounded-lg text-xs leading-relaxed border",
                          fb.author === "user"
                            ? "bg-indigo-950/20 border-indigo-900/30 text-indigo-200"
                            : "bg-zinc-900 border-zinc-800 text-zinc-300"
                        )}
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                          <span className="font-semibold uppercase tracking-wider">
                            {fb.author}
                          </span>
                          <span>{new Date(fb.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p>{fb.comment}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment Input */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={feedbackInput}
                    onChange={(e) => setFeedbackInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendFeedback();
                      }
                    }}
                    placeholder={`Comment on ${currentArtifact.title}... (e.g. "keep the existing navigation", "modify step 2")`}
                    className="flex-1 px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSendFeedback}
                    disabled={!feedbackInput.trim() || submittingFeedback}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {submittingFeedback ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Comment</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
