import React, { useEffect, useState } from "react";
import {
  ShieldAlert,
  Check,
  CheckCheck,
  X,
  Clock,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PermissionRequestPayload {
  id: string;
  toolName: string;
  args: any;
  command?: string;
}

interface PermissionPromptCardProps {
  request: PermissionRequestPayload;
  onDecision: (decision: "allow_once" | "allow_session" | "reject") => void;
}

export function PermissionPromptCard({
  request,
  onDecision,
}: PermissionPromptCardProps) {
  const [secondsIdle, setSecondsIdle] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsIdle((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isIdleOver60s = secondsIdle >= 60;

  return (
    <div
      className={cn(
        "rounded-[10px] bg-[#1A1617] border p-3.5 my-3 shadow-2xl font-sans transition-all animate-in fade-in select-none",
        isIdleOver60s
          ? "border-[#EF4444] shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse"
          : "border-[#FF6036]/70 shadow-[0_0_15px_rgba(255,96,54,0.2)]"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-[#381617] border border-[#EF4444]/60 flex items-center justify-center text-[#EF4444] shrink-0">
          <ShieldAlert className="h-4 w-4 stroke-[2.5]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-[12.5px] font-semibold text-white tracking-tight">
              Action Approval Required
            </h4>
            <div className="flex items-center gap-1 text-[10.5px] text-[#A1A1AA] font-mono">
              <Clock className="h-3 w-3" />
              <span>{secondsIdle}s</span>
            </div>
          </div>

          <p className="text-[11.5px] text-[#C4C4CE] mt-0.5 leading-relaxed">
            The agent is requesting permission to execute an operation with elevated risk:
          </p>

          <div className="mt-2 p-2 rounded bg-[#111218] border border-[#2B2C3A] font-mono text-[11px] text-[#38BDF8] overflow-x-auto scrollbar-thin select-text">
            <div className="flex items-center gap-1.5 text-[#9CA3AF] text-[10px]">
              <Terminal className="h-3 w-3" />
              <span>Tool: {request.toolName}</span>
            </div>
            {request.command ? (
              <div className="mt-1 text-[#FCD34D] font-bold">
                $ {request.command}
              </div>
            ) : (
              <div className="mt-1 text-[#D1D5DB]">
                {JSON.stringify(request.args)}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-3 flex items-center justify-end gap-2 text-[11.5px] font-medium">
            <button
              type="button"
              onClick={() => onDecision("reject")}
              className="px-2.5 py-1.5 rounded-md bg-[#22242E] hover:bg-[#2C2E3C] text-[#EF4444] border border-[#3E2428] hover:border-[#EF4444]/60 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reject</span>
            </button>

            <button
              type="button"
              onClick={() => onDecision("allow_once")}
              className="px-2.5 py-1.5 rounded-md bg-[#252838] hover:bg-[#2F3348] text-white border border-[#3E435E] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5 text-[#38BDF8]" />
              <span>Allow Once</span>
            </button>

            <button
              type="button"
              onClick={() => onDecision("allow_session")}
              className="px-3 py-1.5 rounded-md bg-gradient-to-r from-[#FF5E62] to-[#FF9966] text-white font-semibold shadow-[0_0_12px_rgba(255,96,54,0.3)] hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Allow All This Session</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
