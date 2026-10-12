import React, { useState } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCw,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Cpu,
  Terminal,
  Search,
  Wrench,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface TaskGraphStepUI {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  status: "pending" | "running" | "done" | "failed";
  workerHint?: "coder" | "debugger" | "tester" | "researcher" | "orchestrator";
  retryCount?: number;
  result?: string;
  error?: string;
}

interface TaskGraphDAGViewerProps {
  steps: TaskGraphStepUI[];
  activeAgentId?: string;
}

export function TaskGraphDAGViewer({ steps, activeAgentId }: TaskGraphDAGViewerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  if (!steps || steps.length === 0) return null;

  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) => s.status === "done").length;
  const runningSteps = steps.filter((s) => s.status === "running").length;
  const failedSteps = steps.filter((s) => s.status === "failed").length;

  const getWorkerBadge = (hint?: string) => {
    switch (hint) {
      case "coder":
        return { label: "Coder", color: "bg-[#007ACC]/20 text-[#38BDF8] border-[#007ACC]/50", icon: Cpu };
      case "debugger":
        return { label: "Debugger", color: "bg-[#EF4444]/20 text-[#F87171] border-[#EF4444]/50", icon: Wrench };
      case "tester":
        return { label: "Tester", color: "bg-[#10B981]/20 text-[#34D399] border-[#10B981]/50", icon: CheckCircle2 };
      case "researcher":
        return { label: "Researcher", color: "bg-[#A855F7]/20 text-[#C084FC] border-[#A855F7]/50", icon: Search };
      default:
        return { label: "Orchestrator", color: "bg-[#F59E0B]/20 text-[#FCD34D] border-[#F59E0B]/50", icon: GitBranch };
    }
  };

  return (
    <div className="rounded-[10px] bg-[#121318] border border-[#22242F] overflow-hidden my-2.5 shadow-md font-sans select-none">
      {/* Header Bar */}
      <div
        onClick={() => setIsExpanded((p) => !p)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#161720] border-b border-[#22242F] cursor-pointer hover:bg-[#1A1C26] transition-colors"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-[#38BDF8]" />
          <span className="text-[12.5px] font-semibold text-white tracking-tight">
            Autonomous Task Graph (DAG)
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#1F212C] text-[#9A9AA8] border border-[#2C2E3C]">
            {completedSteps}/{totalSteps}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {runningSteps > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#38BDF8] font-mono">
              <span className="h-2 w-2 rounded-full bg-[#38BDF8] animate-ping" />
              Running ({runningSteps})
            </span>
          )}
          {failedSteps > 0 && (
            <span className="text-[11px] text-[#EF4444] font-mono font-medium">
              Failed ({failedSteps})
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-[#8A8A9A]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[#8A8A9A]" />
          )}
        </div>
      </div>

      {/* Collapsible Step Graph List */}
      {isExpanded && (
        <div className="p-3 space-y-2 bg-[#121318]">
          {steps.map((step, idx) => {
            const worker = getWorkerBadge(step.workerHint);
            const WorkerIcon = worker.icon;
            const isSelected = selectedStepId === step.id;

            return (
              <div
                key={step.id}
                onClick={() => setSelectedStepId(isSelected ? null : step.id)}
                className={cn(
                  "p-2.5 rounded-[8px] border transition-all cursor-pointer",
                  step.status === "running"
                    ? "bg-[#141A28] border-[#007ACC]/60 shadow-[0_0_12px_rgba(0,122,204,0.15)]"
                    : step.status === "done"
                    ? "bg-[#121815] border-[#10B981]/30 hover:border-[#10B981]/60"
                    : step.status === "failed"
                    ? "bg-[#201416] border-[#EF4444]/50"
                    : "bg-[#15161D] border-[#22242F] opacity-75 hover:opacity-100"
                )}
              >
                {/* Step Row Top */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Status Icon */}
                    {step.status === "done" && (
                      <div className="h-4 w-4 rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center shrink-0">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    )}
                    {step.status === "running" && (
                      <div className="h-4 w-4 rounded-full bg-[#007ACC]/20 text-[#38BDF8] flex items-center justify-center shrink-0 animate-spin">
                        <RotateCw className="h-2.5 w-2.5" />
                      </div>
                    )}
                    {step.status === "failed" && (
                      <div className="h-4 w-4 rounded-full bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-2.5 w-2.5 stroke-[2.5]" />
                      </div>
                    )}
                    {step.status === "pending" && (
                      <div className="h-4 w-4 rounded-full bg-[#2A2B36] text-[#7A7A8A] flex items-center justify-center shrink-0">
                        <Clock className="h-2.5 w-2.5" />
                      </div>
                    )}

                    <span
                      className={cn(
                        "text-[12px] font-medium truncate",
                        step.status === "running"
                          ? "text-[#E0F2FE] font-semibold"
                          : step.status === "done"
                          ? "text-[#D1D5DB]"
                          : step.status === "failed"
                          ? "text-[#FCA5A5]"
                          : "text-[#8E8E9E]"
                      )}
                    >
                      {idx + 1}. {step.title}
                    </span>
                  </div>

                  {/* Worker Tag & Badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {step.retryCount && step.retryCount > 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40">
                        Retry #{step.retryCount}
                      </span>
                    ) : null}

                    <span
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-mono border",
                        worker.color
                      )}
                    >
                      <WorkerIcon className="h-3 w-3" />
                      <span>{worker.label}</span>
                    </span>
                  </div>
                </div>

                {/* Description & Depends On */}
                <div className="mt-1 text-[11px] text-[#8E8E9E] leading-relaxed pl-6">
                  {step.description}
                </div>

                {step.dependsOn && step.dependsOn.length > 0 && (
                  <div className="mt-1.5 pl-6 flex items-center gap-1 text-[10px] text-[#6B6B7C] font-mono">
                    <span>Dependencies:</span>
                    {step.dependsOn.map((dep) => (
                      <span
                        key={dep}
                        className="px-1 rounded bg-[#1D1E28] border border-[#2B2C3A] text-[#9CA3AF]"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded Details / Errors */}
                {isSelected && (step.error || step.result) && (
                  <div className="mt-2.5 pl-6 pt-2 border-t border-[#262836] text-[11px] font-mono">
                    {step.error && (
                      <div className="p-2 rounded bg-[#331114] border border-[#EF4444]/40 text-[#FCA5A5] whitespace-pre-wrap">
                        {step.error}
                      </div>
                    )}
                    {step.result && (
                      <div className="p-2 rounded bg-[#102018] border border-[#10B981]/40 text-[#A7F3D0] whitespace-pre-wrap">
                        {step.result}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
