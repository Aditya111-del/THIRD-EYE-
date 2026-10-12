import React, { useState } from "react";
import {
  Activity,
  Filter,
  X,
  Search,
  Cpu,
  Terminal,
  Globe,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { ToolRisk } from "./ToolCallCard";

export interface ActivityFeedItem {
  id: string;
  timestamp: number;
  agentId: string;
  type: "thought" | "tool_call" | "tool_result" | "terminal" | "checkpoint" | "error";
  title: string;
  detail?: string | undefined;
  risk?: ToolRisk | undefined;
}

interface ActivityFeedModalProps {
  items: ActivityFeedItem[];
  onClose: () => void;
}

export function ActivityFeedModal({ items, onClose }: ActivityFeedModalProps) {
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = items.filter((item) => {
    if (filterRisk !== "all" && item.risk !== filterRisk) return false;
    if (filterAgent !== "all" && !item.agentId.toLowerCase().includes(filterAgent.toLowerCase())) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.detail && item.detail.toLowerCase().includes(q)) ||
        item.agentId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none">
      <div className="flex flex-col w-[90vw] max-w-4xl h-[78vh] rounded-xl bg-[#13141B] border border-[#272836] shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#22232E] bg-[#161720] px-4">
          <div className="flex items-center gap-2 text-white font-semibold text-[13px]">
            <Activity className="h-4 w-4 text-[#38BDF8]" />
            <span>Agent Activity Feed ({items.length} events)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#252733] text-[#8E8E9E] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#171822] border-b border-[#22232E] text-[11.5px] font-mono">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#1C1D26] border border-[#2B2C3A] text-white">
              <Search className="h-3 w-3 text-[#7E7E8E]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter events..."
                className="bg-transparent outline-none w-36 text-[#E0E0EA] placeholder:text-[#6A6A78]"
              />
            </div>

            {/* Risk filter */}
            <div className="flex items-center gap-1">
              <span className="text-[#7A7A8A]">Risk:</span>
              {(["all", "read", "write", "exec", "network"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFilterRisk(r)}
                  className={`px-1.5 py-0.5 rounded uppercase text-[10px] cursor-pointer transition-colors ${
                    filterRisk === r
                      ? "bg-[#007ACC] text-white font-bold"
                      : "text-[#8E8E9E] hover:text-white hover:bg-[#222430]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[10.5px] text-[#71717A]">
            Showing {filteredItems.length} of {items.length}
          </div>
        </div>

        {/* Activity list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#121318] scrollbar-thin">
          {filteredItems.length === 0 ? (
            <div className="text-center text-[#71717A] py-12 text-xs">
              No matching activity events recorded.
            </div>
          ) : (
            filteredItems.map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded-[8px] bg-[#171821] border border-[#232431] flex items-start justify-between gap-3 font-mono text-[11px]"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-[#20222E] text-[#38BDF8] text-[10px] font-bold">
                      {ev.agentId}
                    </span>
                    <span className="text-white font-medium truncate">{ev.title}</span>
                  </div>
                  {ev.detail && (
                    <div className="text-[#9CA3AF] text-[10.5px] whitespace-pre-wrap pl-1 max-h-24 overflow-y-auto scrollbar-thin">
                      {ev.detail}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-[#64748B]">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  {ev.risk && (
                    <span
                      className={`px-1 py-0.2 rounded text-[9px] uppercase font-bold border ${
                        ev.risk === "exec"
                          ? "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/40"
                          : ev.risk === "write"
                          ? "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40"
                          : ev.risk === "network"
                          ? "bg-[#A855F7]/20 text-[#A855F7] border-[#A855F7]/40"
                          : "bg-[#374151]/30 text-[#9CA3AF] border-[#4B5563]/40"
                      }`}
                    >
                      {ev.risk}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
