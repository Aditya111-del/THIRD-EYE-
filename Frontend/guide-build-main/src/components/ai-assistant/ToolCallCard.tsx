import React, { useState } from "react";
import {
  FileText,
  Edit3,
  Terminal,
  Globe,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ChevronDown,
  ChevronRight,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolRisk = "read" | "write" | "exec" | "network";

export interface ToolCallCardProps {
  toolName: string;
  args: any;
  risk?: ToolRisk;
  status?: "running" | "completed" | "failed";
  result?: any;
  error?: string;
  durationMs?: number;
}

export function ToolCallCard({
  toolName,
  args,
  risk = "read",
  status = "completed",
  result,
  error,
  durationMs,
}: ToolCallCardProps) {
  const [openRaw, setOpenRaw] = useState(false);

  // Determine risk styling based on §3 & §6:
  // read = gray, write = amber, exec = red, network = purple
  const getRiskStyle = () => {
    switch (risk) {
      case "write":
        return {
          border: "border-[#F59E0B]/40 hover:border-[#F59E0B]/80",
          badge: "bg-[#F59E0B]/15 text-[#FBBF24] border-[#F59E0B]/30",
          icon: Edit3,
          label: "WRITE",
        };
      case "exec":
        return {
          border: "border-[#EF4444]/40 hover:border-[#EF4444]/80",
          badge: "bg-[#EF4444]/15 text-[#F87171] border-[#EF4444]/30",
          icon: Terminal,
          label: "EXEC",
        };
      case "network":
        return {
          border: "border-[#A855F7]/40 hover:border-[#A855F7]/80",
          badge: "bg-[#A855F7]/15 text-[#C084FC] border-[#A855F7]/30",
          icon: Globe,
          label: "NETWORK",
        };
      case "read":
      default:
        return {
          border: "border-[#4B5563]/40 hover:border-[#6B7280]/60",
          badge: "bg-[#374151]/30 text-[#9CA3AF] border-[#4B5563]/30",
          icon: FileText,
          label: "READ",
        };
    }
  };

  const riskStyle = getRiskStyle();
  const RiskIcon = riskStyle.icon;

  // Pretty print arguments summary
  const getArgsSummary = () => {
    if (!args) return "";
    if (typeof args === "string") return args;
    if (args.command) return args.command;
    if (args.path) return args.path;
    if (args.query) return args.query;
    if (args.url) return args.url;
    try {
      const keys = Object.keys(args);
      if (keys.length === 1 && typeof args[keys[0]!] === "string") {
        return `${args[keys[0]!]}`;
      }
      return JSON.stringify(args).slice(0, 80);
    } catch {
      return "";
    }
  };

  const argsSummary = getArgsSummary();

  return (
    <div
      className={cn(
        "rounded-[8px] bg-[#13141A] border p-2.5 my-2 font-mono text-[11.5px] select-none transition-colors",
        riskStyle.border
      )}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <RiskIcon className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
          <span className="font-semibold text-white tracking-tight truncate">
            {toolName}
          </span>
          {argsSummary && (
            <span className="text-[#8E8E9E] truncate max-w-[200px]" title={argsSummary}>
              {argsSummary}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Duration if available */}
          {durationMs !== undefined && (
            <span className="text-[10px] text-[#71717A]">{durationMs}ms</span>
          )}

          {/* Status Indicator */}
          {status === "running" && (
            <RotateCw className="h-3 w-3 text-[#38BDF8] animate-spin" />
          )}
          {status === "completed" && (
            <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
          )}
          {status === "failed" && (
            <AlertCircle className="h-3 w-3 text-[#EF4444]" />
          )}

          {/* Risk Badge */}
          <span
            className={cn(
              "px-1.5 py-0.2 rounded text-[9.5px] font-bold border",
              riskStyle.badge
            )}
          >
            {riskStyle.label}
          </span>

          {/* Raw toggle button */}
          <button
            type="button"
            onClick={() => setOpenRaw((p) => !p)}
            className="p-0.5 rounded text-[#71717A] hover:text-white hover:bg-[#20222C] cursor-pointer transition-colors"
            title="Inspect raw payload"
          >
            {openRaw ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mt-2 p-2 rounded bg-[#2D1215] border border-[#EF4444]/40 text-[#FCA5A5] text-[11px] leading-relaxed select-text">
          {error}
        </div>
      )}

      {/* Collapsible Raw Arguments & Results */}
      {openRaw && (
        <div className="mt-2 pt-2 border-t border-[#23242E] space-y-1.5 text-[10.5px] text-[#A1A1AA] select-text">
          <div>
            <span className="text-[#6B7280] font-semibold">Arguments:</span>
            <pre className="p-1.5 mt-0.5 rounded bg-[#181922] overflow-x-auto text-[#D4D4D8] scrollbar-thin">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <span className="text-[#6B7280] font-semibold">Observation:</span>
              <pre className="p-1.5 mt-0.5 rounded bg-[#181922] overflow-x-auto text-[#D4D4D8] max-h-48 scrollbar-thin">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
