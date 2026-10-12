import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Search,
  Code2,
  Terminal,
  Bug,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
  ArrowRight,
  Filter,
  Trash2,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAgentActivityStore,
  type TimelineEvent,
  type AgentRole,
} from '@/stores/agentActivityStore';

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  analyzing_request: Cpu,
  creating_plan: Layers,
  searching_files: Search,
  delegating_subtask: ArrowRight,
  reading_file: FileCode,
  modifying_file: Code2,
  executing_command: Terminal,
  receiving_output: Terminal,
  error_detected: Bug,
  fixing_error: Bug,
  running_verification: ShieldCheck,
  completing_task: CheckCircle2,
  waiting_permission: Clock,
};

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  running: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  error: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  info: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
};

export const AgentActivityTimeline: React.FC = () => {
  const { timeline, clearHistory, isExecuting } = useAgentActivityStore();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isHovered, setIsHovered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter events
  const filteredTimeline = timeline.filter((evt) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchText = `${evt.description} ${evt.agentName} ${evt.metadata?.tool || ''}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    if (filter === 'all') return true;
    if (filter === 'code') return evt.activityType === 'modifying_file' || evt.activityType === 'reading_file';
    if (filter === 'terminal') return evt.activityType === 'executing_command' || evt.activityType === 'receiving_output';
    if (filter === 'errors') return evt.activityType === 'error_detected' || evt.activityType === 'fixing_error';
    if (filter === 'plan') return evt.activityType === 'creating_plan' || evt.activityType === 'delegating_subtask';
    return true;
  });

  return (
    <div className="flex h-full w-full flex-col bg-[#121318] text-[#E0E2EC] font-sans select-none border-l border-[#20222B]">
      {/* ── Timeline Header & Filter Controls ── */}
      <div className="flex items-center justify-between border-b border-[#20222B] px-4 py-3 bg-[#0F1015]">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-semibold text-white tracking-tight">
            Live Activity Timeline
          </h2>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono text-[#8E92A4]">
            {filteredTimeline.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {timeline.length > 0 && (
            <button
              onClick={clearHistory}
              className="p-1 rounded text-[#8E92A4] hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
              title="Clear Timeline"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Search & Filter Chips ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#20222B] bg-[#14151B]/60 text-xs">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#707485]" />
          <input
            type="text"
            placeholder="Filter actions, tools, files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-white/5 bg-black/40 pl-7 pr-2 py-1 text-[11px] text-white placeholder-[#606474] focus:outline-none focus:border-primary/60 font-mono"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'code', label: 'Code' },
            { id: 'terminal', label: 'Terminal' },
            { id: 'errors', label: 'Errors' },
            { id: 'plan', label: 'Plan' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
                filter === f.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white/5 text-[#8E92A4] hover:bg-white/10 hover:text-white'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Event Feed Stream ── */}
      <div
        ref={scrollRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex-1 overflow-y-auto p-4 space-y-3 font-sans"
      >
        {filteredTimeline.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-[#707485]">
            <Clock className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs font-medium">No actions recorded yet</p>
            <p className="text-[11px] mt-1 opacity-70">
              When an agent begins execution, actions and tool observations will stream here in real time.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredTimeline.map((evt, idx) => {
              const IconComp = TYPE_ICONS[evt.activityType] || Clock;
              const badge = STATUS_BADGES[evt.status] || STATUS_BADGES['info'] || { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
              const dateObj = new Date(evt.timestamp);
              const timeString = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}:${dateObj.getSeconds().toString().padStart(2, '0')}.${Math.floor(dateObj.getMilliseconds() / 100)}`;

              return (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    'relative rounded-xl border border-white/5 bg-[#171821] p-3 transition-colors hover:border-white/10',
                    evt.status === 'error' && 'border-red-500/30 bg-red-950/20'
                  )}
                >
                  {/* Top Bar: Timestamp, Agent Badge & Status */}
                  <div className="flex items-center justify-between text-[10.5px]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[#707485]">{timeString}</span>
                      <span className="text-white/20">•</span>
                      <span className="font-semibold text-white">{evt.agentName}</span>
                      <span className="rounded bg-black/40 px-1.5 py-0.2 font-mono text-[9px] uppercase text-[#8E92A4]">
                        {evt.agentRole}
                      </span>
                    </div>

                    <div
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-medium border',
                        badge.bg,
                        badge.text,
                        badge.border
                      )}
                    >
                      {evt.status}
                    </div>
                  </div>

                  {/* Body: Activity Description */}
                  <div className="mt-2 flex items-start gap-2.5">
                    <div className="mt-0.5 rounded-lg bg-black/40 p-1.5 text-primary border border-white/5">
                      <IconComp className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#D8DAE8] leading-relaxed break-words">
                        {evt.description}
                      </p>

                      {/* Metadata Chips (Command, File, Tool, Diffs, Latency) */}
                      {evt.metadata && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                          {evt.metadata.tool && (
                            <span className="rounded bg-[#212433] px-2 py-0.5 text-blue-300">
                              tool: {evt.metadata.tool}
                            </span>
                          )}
                          {evt.metadata.command && (
                            <span className="rounded bg-black/60 px-2 py-0.5 text-amber-300 truncate max-w-[280px]">
                              $ {evt.metadata.command}
                            </span>
                          )}
                          {evt.metadata.file && (
                            <span className="rounded bg-[#1B2925] px-2 py-0.5 text-emerald-300 truncate max-w-[280px]">
                              {evt.metadata.file.split(/[\/\\]/).pop()}
                            </span>
                          )}
                          {evt.metadata.diffSummary && (
                            <span className="rounded bg-emerald-950/60 text-emerald-400 px-2 py-0.5 font-bold">
                              {evt.metadata.diffSummary}
                            </span>
                          )}
                          {evt.metadata.durationMs !== undefined && (
                            <span className="text-[#8E92A4]">
                              {evt.metadata.durationMs}ms
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
