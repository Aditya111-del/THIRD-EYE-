import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  MessageSquare,
  Cpu,
  Layers,
  Search,
  ArrowRight,
  Terminal,
  Eye,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Wrench,
  Stethoscope,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAgentActivityStore,
  type OrchestrationStage,
} from '@/stores/agentActivityStore';

interface FlowStepDef {
  stage: OrchestrationStage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const FLOW_STEPS: FlowStepDef[] = [
  {
    stage: 'request',
    label: 'User Request',
    icon: MessageSquare,
    description: 'Prompt submitted & parsed',
  },
  {
    stage: 'orchestrator',
    label: 'Main Orchestrator',
    icon: Cpu,
    description: 'Context evaluated',
  },
  {
    stage: 'planning',
    label: 'DAG Planning',
    icon: Layers,
    description: 'Decomposed to atomic task graph',
  },
  {
    stage: 'context',
    label: 'Context Retrieval',
    icon: Search,
    description: 'AST symbols & file map indexed',
  },
  {
    stage: 'delegation',
    label: 'Agent Delegation',
    icon: ArrowRight,
    description: 'Specialist subagent dispatched',
  },
  {
    stage: 'tool_exec',
    label: 'Tool Execution',
    icon: Terminal,
    description: 'Files modified, commands run',
  },
  {
    stage: 'observation',
    label: 'Output Observation',
    icon: Eye,
    description: 'Results evaluated for correctness',
  },
  {
    stage: 'verification',
    label: 'Verification',
    icon: ShieldCheck,
    description: 'Quality assertions & tests gated',
  },
  {
    stage: 'completion',
    label: 'Completion',
    icon: CheckCircle2,
    description: 'Verified walkthrough artifact',
  },
];

export const OrchestrationFlowDiagram: React.FC = () => {
  const { orchestrationFlow, feedbackLoop } = useAgentActivityStore();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex h-full w-full flex-col bg-[#0F1015] p-5 select-none font-sans overflow-y-auto">
      {/* ── Title & Legend ── */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Agent Orchestration Flow
          </h2>
          <p className="text-[11px] text-[#8E92A4] mt-0.5">
            Real-time visual pipeline updating with live agent execution lifecycle
          </p>
        </div>

        {feedbackLoop.active && (
          <div className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-3 py-1 text-xs text-red-400 font-semibold animate-pulse">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Active Hotfix Feedback Loop</span>
          </div>
        )}
      </div>

      {/* ── Primary Orchestration Pipeline ── */}
      <div className="relative flex flex-col md:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-[#14151D] border border-white/5 shadow-xl">
        {FLOW_STEPS.map((step, idx) => {
          const stepState = orchestrationFlow[step.stage];
          const isCompleted = stepState.status === 'completed';
          const isActive = stepState.status === 'active';
          const isError = stepState.status === 'error';
          const IconComp = step.icon;

          return (
            <React.Fragment key={step.stage}>
              {/* Step Card */}
              <div className="flex flex-col items-center text-center relative z-10 flex-1 min-w-[90px]">
                <motion.div
                  className={cn(
                    'relative flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-300',
                    isCompleted && 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400 shadow-md shadow-emerald-500/10',
                    isActive && 'bg-primary/20 border-primary text-primary shadow-lg shadow-primary/25',
                    isError && 'bg-red-950/40 border-red-500/60 text-red-400 shadow-md shadow-red-500/20',
                    !isCompleted && !isActive && !isError && 'bg-[#1C1E2A] border-white/5 text-[#707485]'
                  )}
                  animate={
                    isActive && !shouldReduceMotion
                      ? { scale: [1, 1.06, 1], boxShadow: ['0 0 0px #FF6B00', '0 0 16px #FF6B00', '0 0 0px #FF6B00'] }
                      : {}
                  }
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <IconComp className="h-5 w-5" />

                  {/* Top Status Dot */}
                  <span
                    className={cn(
                      'absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-[#14151D]',
                      isCompleted && 'bg-emerald-500',
                      isActive && 'bg-primary animate-pulse',
                      isError && 'bg-red-500',
                      !isCompleted && !isActive && !isError && 'bg-[#3A3D4C]'
                    )}
                  />
                </motion.div>

                <h4
                  className={cn(
                    'mt-2 text-[11px] font-semibold tracking-tight transition-colors',
                    isCompleted && 'text-emerald-400',
                    isActive && 'text-primary',
                    isError && 'text-red-400',
                    !isCompleted && !isActive && !isError && 'text-[#8E92A4]'
                  )}
                >
                  {step.label}
                </h4>

                <p className="text-[9.5px] text-[#707485] mt-0.5 line-clamp-1 max-w-[100px]">
                  {step.description}
                </p>
              </div>

              {/* Connecting Connector Arrow between steps */}
              {idx < FLOW_STEPS.length - 1 && (
                <div className="hidden md:flex items-center justify-center shrink-0 w-6">
                  <div
                    className={cn(
                      'h-0.5 w-full transition-all duration-300',
                      isCompleted ? 'bg-emerald-500/60' : isActive ? 'bg-primary/60' : 'bg-white/10'
                    )}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Error Detected & Self-Healing Feedback Loop ── */}
      <div className="mt-6 rounded-2xl bg-[#14151D] border border-white/5 p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className={cn('h-4 w-4', feedbackLoop.active ? 'text-red-400 animate-spin' : 'text-[#707485]')} />
            <h3 className="text-xs font-semibold text-white">
              Autonomous Self-Healing Feedback Loop
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[#8E92A4]">
            Error Detected → Diagnosis → Fix Attempt → Re-execution → Verification
          </span>
        </div>

        {/* Feedback loop step cards */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {[
            {
              id: 'detected',
              title: 'Error Detected',
              icon: AlertTriangle,
              desc: feedbackLoop.errorText || 'Monitoring runtime for exceptions or test regressions',
              activeColor: 'text-red-400 border-red-500/40 bg-red-950/20',
            },
            {
              id: 'diagnosis',
              title: 'Diagnosis',
              icon: Stethoscope,
              desc: feedbackLoop.diagnosisText || 'Static analysis, AST trace, and build logs',
              activeColor: 'text-amber-400 border-amber-500/40 bg-amber-950/20',
            },
            {
              id: 'fix_attempt',
              title: 'Fix Attempt',
              icon: Wrench,
              desc: feedbackLoop.fixDescription || 'Debugger specialist generates targeted patch',
              activeColor: 'text-blue-400 border-blue-500/40 bg-blue-950/20',
            },
            {
              id: 're_execution',
              title: 'Re-execution',
              icon: RefreshCw,
              desc: 'Re-running blocked task step in isolated sandbox',
              activeColor: 'text-purple-400 border-purple-500/40 bg-purple-950/20',
            },
            {
              id: 'verification',
              title: 'Verification',
              icon: ShieldCheck,
              desc: 'Assertion tests confirm regression resolved',
              activeColor: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20',
            },
          ].map((loopStep) => {
            const isLoopActive = feedbackLoop.active && feedbackLoop.stage === loopStep.id;
            const LoopIcon = loopStep.icon;

            return (
              <div
                key={loopStep.id}
                className={cn(
                  'rounded-xl border p-3 transition-all',
                  isLoopActive
                    ? loopStep.activeColor
                    : 'border-white/5 bg-[#181A24] text-[#8E92A4]'
                )}
              >
                <div className="flex items-center gap-2">
                  <LoopIcon className={cn('h-4 w-4', isLoopActive ? 'text-current' : 'text-[#707485]')} />
                  <span className="text-[11px] font-semibold text-white">{loopStep.title}</span>
                </div>
                <p className="mt-1 text-[10px] text-[#A0A4B6] leading-relaxed">
                  {loopStep.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
