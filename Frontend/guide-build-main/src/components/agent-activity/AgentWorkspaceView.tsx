import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Layers,
  Clock,
  Activity,
  Play,
  Pause,
  Square,
  Sparkles,
  Columns,
  RefreshCw,
  FolderOpen,
  FileCode,
  AlertTriangle,
  X,
  Maximize2,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AntigravityAgentWorkspace } from './AntigravityAgentWorkspace';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import { OrchestrationFlowDiagram } from './OrchestrationFlowDiagram';
import {
  useAgentActivityStore,
  type AgentRole,
} from '@/stores/agentActivityStore';

interface AgentWorkspaceViewProps {
  onClose?: () => void;
  isModal?: boolean;
}

export const AgentWorkspaceView: React.FC<AgentWorkspaceViewProps> = ({
  onClose,
  isModal = false,
}) => {
  const {
    agents,
    viewMode,
    setViewMode,
    isExecuting,
    isPaused,
    pauseAgent,
    resumeAgent,
    cancelAgent,
    selectedAgentId,
    setSelectedAgent,
    startTime,
    endTime,
  } = useAgentActivityStore();

  // Elapsed timer calculation
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!startTime) {
      setElapsedSec(0);
      return;
    }
    const interval = setInterval(() => {
      const now = endTime || Date.now();
      setElapsedSec(Math.max(0, Math.floor((now - startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, endTime]);

  const activeAgentsCount = Object.values(agents).filter(
    (a) => a.status !== 'idle' && a.status !== 'completed' && a.status !== 'failed'
  ).length;

  const selectedAgent = selectedAgentId ? agents[selectedAgentId] : null;

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0A0A0E] text-white select-none font-sans overflow-hidden">
      {/* ── Top Header Bar with Live Controls ── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#20222B] bg-[#121319] px-4">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 border border-primary/40 text-primary">
              <Cpu className="h-4 w-4 text-[#FF6B00]" />
            </div>
            <div>
              <h1 className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>Third Eye Agent Canvas</span>
                <span className="rounded bg-primary/20 text-[#FF6B00] px-1.5 py-0.2 text-[9px] uppercase font-mono">
                  Real-time
                </span>
              </h1>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono pl-3 border-l border-white/10">
            {isExecuting ? (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Active ({activeAgentsCount} concurrent)</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#8E92A4]">
                <span className="h-2 w-2 rounded-full bg-slate-500" />
                <span>Ready</span>
              </span>
            )}

            <span className="text-white/20">|</span>
            <span className="text-[#8E92A4]">⏱ {formatTimer(elapsedSec)}</span>
          </div>
        </div>

        {/* Center: View Switcher */}
        <div className="flex items-center rounded-lg bg-[#181922] p-1 border border-white/5">
          <button
            onClick={() => setViewMode('split')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
              viewMode === 'split' ? 'bg-[#252836] text-white shadow' : 'text-[#8E92A4] hover:text-white'
            )}
            title="Split: Radial Graph & Live Timeline"
          >
            <Columns className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Split</span>
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
              viewMode === 'graph' ? 'bg-[#252836] text-white shadow' : 'text-[#8E92A4] hover:text-white'
            )}
            title="Dynamic Agent Graph"
          >
            <Cpu className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Graph</span>
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
              viewMode === 'timeline' ? 'bg-[#252836] text-white shadow' : 'text-[#8E92A4] hover:text-white'
            )}
            title="Live Action Timeline"
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Timeline</span>
          </button>
          <button
            onClick={() => setViewMode('flow')}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
              viewMode === 'flow' ? 'bg-[#252836] text-white shadow' : 'text-[#8E92A4] hover:text-white'
            )}
            title="Orchestration Pipeline Flow"
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Pipeline</span>
          </button>
        </div>

        {/* Right: Runtime Controls & Close */}
        <div className="flex items-center gap-2">
          {/* Pause / Resume Controls */}
          {isExecuting && (
            <>
              {isPaused ? (
                <button
                  onClick={resumeAgent}
                  className="flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white shadow cursor-pointer transition-colors"
                  title="Resume execution"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={pauseAgent}
                  className="flex items-center gap-1 rounded-md bg-amber-600 hover:bg-amber-500 px-2.5 py-1 text-xs font-medium text-white shadow cursor-pointer transition-colors"
                  title="Pause execution"
                >
                  <Pause className="h-3 w-3 fill-current" />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={cancelAgent}
                className="flex items-center gap-1 rounded-md bg-red-600 hover:bg-red-500 px-2.5 py-1 text-xs font-medium text-white shadow cursor-pointer transition-colors"
                title="Cancel task"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Cancel</span>
              </button>
            </>
          )}

          {isModal && onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-[#8E92A4] hover:bg-white/10 hover:text-white transition-colors cursor-pointer ml-1"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* ── Main View Stage ── */}
      <div className="relative flex-1 overflow-hidden flex">
        {viewMode === 'split' ? (
          <>
            {/* Left 60%: Radial Dynamic Agent Graph */}
            <div className="flex-1 h-full min-w-0 relative">
              <AntigravityAgentWorkspace />
            </div>

            {/* Right 40%: Real-Time Live Timeline */}
            <div className="w-[380px] lg:w-[460px] h-full shrink-0 border-l border-[#20222B]">
              <AgentActivityTimeline />
            </div>
          </>
        ) : viewMode === 'graph' ? (
          <div className="h-full w-full">
            <AntigravityAgentWorkspace />
          </div>
        ) : viewMode === 'timeline' ? (
          <div className="h-full w-full">
            <AgentActivityTimeline />
          </div>
        ) : (
          <div className="h-full w-full">
            <OrchestrationFlowDiagram />
          </div>
        )}

        {/* ── Right Inspector Slide-over for Selected Agent ── */}
        {selectedAgent && viewMode === 'graph' && (
          <div className="absolute top-4 right-4 z-40 w-80 rounded-2xl border border-white/10 bg-[#14151E]/95 p-4 backdrop-blur-xl shadow-2xl space-y-3 font-sans">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{selectedAgent.name}</span>
                </h3>
                <span className="font-mono text-[10px] uppercase text-[#8E92A4]">
                  Role: {selectedAgent.role}
                </span>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="p-1 text-[#8E92A4] hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] text-[#8E92A4] uppercase font-mono">Current Activity</span>
                <p className="text-[11.5px] text-[#D8DAE8] mt-0.5 bg-black/40 p-2 rounded-lg border border-white/5">
                  {selectedAgent.currentActivity}
                </p>
              </div>

              {selectedAgent.activeTool && (
                <div>
                  <span className="text-[10px] text-[#8E92A4] uppercase font-mono">Active Tool</span>
                  <div className="text-[11px] font-mono text-[#FBBF24] bg-[#221B10] p-2 rounded-lg border border-[#F59E0B]/30 mt-0.5">
                    {selectedAgent.activeTool.name}
                  </div>
                </div>
              )}

              {selectedAgent.filesTouched.length > 0 && (
                <div>
                  <span className="text-[10px] text-[#8E92A4] uppercase font-mono">
                    Touched Files ({selectedAgent.filesTouched.length})
                  </span>
                  <div className="mt-1 space-y-1 max-h-28 overflow-y-auto pr-1">
                    {selectedAgent.filesTouched.map((f, i) => (
                      <div
                        key={i}
                        className="text-[10.5px] font-mono text-emerald-400 bg-emerald-950/30 p-1.5 rounded truncate border border-emerald-900/40"
                      >
                        {f.split(/[\/\\]/).pop()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedAgent.lastError && (
                <div>
                  <span className="text-[10px] text-red-400 uppercase font-mono">Last Exception</span>
                  <div className="text-[10.5px] font-mono text-red-400 bg-red-950/40 p-2 rounded-lg border border-red-900/60 mt-0.5 break-words">
                    {selectedAgent.lastError}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
