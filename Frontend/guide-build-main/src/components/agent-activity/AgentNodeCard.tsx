import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Cpu,
  Brain,
  Code2,
  Search,
  Terminal,
  FlaskConical,
  Bug,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Sparkles,
  Loader2,
  FileCode,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentNode, AgentStatus, AgentRole } from '@/stores/agentActivityStore';

interface AgentNodeCardProps {
  node: AgentNode;
  isSelected?: boolean;
  onClick?: () => void;
  scale?: number;
}

const ROLE_ICONS: Record<AgentRole, React.ComponentType<{ className?: string }>> = {
  orchestrator: Cpu,
  planner: Layers,
  researcher: Search,
  coder: Code2,
  runner: Terminal,
  tester: FlaskConical,
  debugger: Bug,
  reviewer: ShieldCheck,
};

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; bg: string; border: string; glow: string; text: string }
> = {
  idle: {
    label: 'Idle',
    color: '#808080',
    bg: 'bg-[#1C1D24]',
    border: 'border-[#2D3139]',
    glow: 'rgba(128, 128, 128, 0.1)',
    text: 'text-[#9095A2]',
  },
  thinking: {
    label: 'Thinking',
    color: '#A855F7',
    bg: 'bg-[#1D162B]',
    border: 'border-[#9333EA]/60',
    glow: 'rgba(168, 85, 247, 0.35)',
    text: 'text-[#C084FC]',
  },
  planning: {
    label: 'Planning',
    color: '#3B82F6',
    bg: 'bg-[#141C2E]',
    border: 'border-[#3B82F6]/60',
    glow: 'rgba(59, 130, 246, 0.35)',
    text: 'text-[#60A5FA]',
  },
  exploring: {
    label: 'Exploring',
    color: '#06B6D4',
    bg: 'bg-[#11242E]',
    border: 'border-[#06B6D4]/60',
    glow: 'rgba(6, 182, 212, 0.35)',
    text: 'text-[#22D3EE]',
  },
  delegating: {
    label: 'Delegating',
    color: '#FF6B00',
    bg: 'bg-[#2A1710]',
    border: 'border-[#FF6B00]/70',
    glow: 'rgba(255, 107, 0, 0.4)',
    text: 'text-[#FFA154]',
  },
  coding: {
    label: 'Coding',
    color: '#10B981',
    bg: 'bg-[#11241C]',
    border: 'border-[#10B981]/60',
    glow: 'rgba(16, 185, 129, 0.35)',
    text: 'text-[#34D399]',
  },
  working: {
    label: 'Working',
    color: '#38BDF8',
    bg: 'bg-[#12202E]',
    border: 'border-[#38BDF8]/60',
    glow: 'rgba(56, 189, 248, 0.35)',
    text: 'text-[#7DD3FC]',
  },
  executing_tool: {
    label: 'Running',
    color: '#F59E0B',
    bg: 'bg-[#261E11]',
    border: 'border-[#F59E0B]/60',
    glow: 'rgba(245, 158, 11, 0.35)',
    text: 'text-[#FBBF24]',
  },
  testing: {
    label: 'Testing',
    color: '#EC4899',
    bg: 'bg-[#26131F]',
    border: 'border-[#EC4899]/60',
    glow: 'rgba(236, 72, 153, 0.35)',
    text: 'text-[#F472B6]',
  },
  debugging: {
    label: 'Debugging',
    color: '#EF4444',
    bg: 'bg-[#2A1416]',
    border: 'border-[#EF4444]/70',
    glow: 'rgba(239, 68, 68, 0.45)',
    text: 'text-[#F87171]',
  },
  waiting: {
    label: 'Waiting',
    color: '#EAB308',
    bg: 'bg-[#211E13]',
    border: 'border-[#EAB308]/60',
    glow: 'rgba(234, 179, 8, 0.35)',
    text: 'text-[#FDE047]',
  },
  completed: {
    label: 'Completed',
    color: '#10B981',
    bg: 'bg-[#11241C]',
    border: 'border-[#10B981]/60',
    glow: 'rgba(16, 185, 129, 0.35)',
    text: 'text-[#34D399]',
  },
  failed: {
    label: 'Failed',
    color: '#EF4444',
    bg: 'bg-[#261315]',
    border: 'border-[#EF4444]/60',
    glow: 'rgba(239, 68, 68, 0.4)',
    text: 'text-[#F87171]',
  },
};

export const AgentNodeCard: React.FC<AgentNodeCardProps> = ({
  node,
  isSelected,
  onClick,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const IconComponent = ROLE_ICONS[node.role] || Brain;
  const statusCfg = STATUS_CONFIG[node.status] || STATUS_CONFIG.idle;
  const isOrchestrator = node.isOrchestrator;
  const isActive = node.status !== 'idle' && node.status !== 'completed' && node.status !== 'failed';

  return (
    <motion.div
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer select-none rounded-2xl transition-all duration-300 font-sans',
        isOrchestrator ? 'w-72 p-4' : 'w-60 p-3.5',
        statusCfg.bg,
        statusCfg.border,
        'border shadow-lg',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-[#0A0A0E]'
      )}
      style={{
        boxShadow: isActive
          ? `0 0 24px ${statusCfg.glow}, 0 4px 12px rgba(0,0,0,0.5)`
          : '0 4px 12px rgba(0,0,0,0.4)',
      }}
      whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
      whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* ── Status-Specific Ambient Glow Particles ── */}
      {isActive && !shouldReduceMotion && (
        <motion.div
          className="pointer-events-none absolute -inset-0.5 rounded-2xl opacity-50 blur-sm"
          style={{ background: statusCfg.color }}
          animate={{
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* ── Exploring Radar Scanner Beam ── */}
      {node.status === 'exploring' && !shouldReduceMotion && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#06B6D4] to-transparent"
          animate={{
            top: ['0%', '100%', '0%'],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      )}

      {/* ── Debugging Warning Pulse ── */}
      {node.status === 'debugging' && !shouldReduceMotion && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-red-500/80"
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0.98, 1.02, 0.98],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* ── Header: Avatar, Name & Live Status Badge ── */}
      <div className="relative z-10 flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          {/* Node Avatar Icon */}
          <div
            className={cn(
              'relative flex shrink-0 items-center justify-center rounded-xl',
              isOrchestrator ? 'h-11 w-11' : 'h-9 w-9',
              'border border-white/10 bg-black/40'
            )}
            style={{ color: statusCfg.color }}
          >
            <IconComponent className={isOrchestrator ? 'h-5 w-5' : 'h-4 w-4'} />

            {/* Micro-sparkle particle on thinking */}
            {node.status === 'thinking' && !shouldReduceMotion && (
              <motion.div
                className="absolute -top-1 -right-1 text-purple-400"
                animate={{ rotate: 360, scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="h-3 w-3" />
              </motion.div>
            )}

            {/* Checkmark ring on completion */}
            {node.status === 'completed' && (
              <div className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 p-0.5 text-black">
                <CheckCircle2 className="h-2.5 w-2.5" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className={cn('truncate font-semibold tracking-tight text-white', isOrchestrator ? 'text-xs' : 'text-[11.5px]')}>
                {node.name}
              </h3>
            </div>
            <p className="truncate text-[10px] text-[#8E92A4] uppercase tracking-wider font-mono">
              {node.role}
            </p>
          </div>
        </div>

        {/* Live Status Pill */}
        <div
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium shrink-0 border border-white/5',
            statusCfg.bg,
            statusCfg.text
          )}
        >
          {isActive ? (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: statusCfg.color }}
            />
          ) : node.status === 'completed' ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          ) : node.status === 'failed' ? (
            <AlertCircle className="h-3 w-3 text-red-400" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          )}
          <span>{statusCfg.label}</span>
        </div>
      </div>

      {/* ── Body: Current Activity & Ticker ── */}
      <div className="relative z-10 mt-2.5 space-y-1.5">
        <div className="rounded-lg bg-black/30 border border-white/5 p-2">
          <p className="text-[11px] text-[#D4D6E2] line-clamp-2 leading-relaxed">
            {node.currentActivity || 'Awaiting assignment'}
          </p>

          {/* Active Tool Badge */}
          {node.activeTool && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono text-[#FBBF24]">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              <span className="truncate">{node.activeTool.name}</span>
            </div>
          )}

          {/* Error detail if failed */}
          {node.lastError && (
            <div className="mt-1.5 text-[10.5px] font-mono text-red-400 bg-red-950/40 border border-red-900/60 rounded p-1.5 truncate">
              {node.lastError}
            </div>
          )}
        </div>

        {/* ── Progress Bar (Rendered only when measurable runtime data exists) ── */}
        {node.progress && node.progress.total && node.progress.total > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9.5px] font-mono text-[#8E92A4]">
              <span>{node.progress.label || 'Progress'}</span>
              <span>
                {node.progress.current} / {node.progress.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, Math.round((node.progress.current / node.progress.total) * 100))}%`,
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Files Touched Badge */}
        {node.filesTouched.length > 0 && (
          <div className="flex items-center gap-1 text-[9.5px] text-[#8E92A4]">
            <FileCode className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">
              {node.filesTouched.length} file{node.filesTouched.length > 1 ? 's' : ''} modified
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};
