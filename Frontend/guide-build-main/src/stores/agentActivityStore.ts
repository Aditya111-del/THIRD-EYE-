import { create } from 'zustand';

export type AgentRole =
  | 'orchestrator'
  | 'planner'
  | 'researcher'
  | 'coder'
  | 'runner'
  | 'tester'
  | 'debugger'
  | 'reviewer';

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'exploring'
  | 'delegating'
  | 'coding'
  | 'working'
  | 'executing_tool'
  | 'testing'
  | 'debugging'
  | 'waiting'
  | 'completed'
  | 'failed';

export interface AgentNode {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  currentActivity: string;
  progress: { current: number; total?: number; label?: string } | null;
  activeTool: { name: string; args?: any; startedAt: number } | null;
  lastError: string | null;
  filesTouched: string[];
  isOrchestrator: boolean;
  x: number;
  y: number;
  lastUpdated: number;
}

export interface AgentConnection {
  id: string;
  from: string;
  to: string;
  active: boolean;
  direction: 'outbound' | 'inbound';
  label: string;
  timestamp: number;
}

export interface TimelineEvent {
  id: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  agentRole: AgentRole;
  activityType:
    | 'analyzing_request'
    | 'creating_plan'
    | 'searching_files'
    | 'delegating_subtask'
    | 'reading_file'
    | 'modifying_file'
    | 'executing_command'
    | 'receiving_output'
    | 'error_detected'
    | 'fixing_error'
    | 'running_verification'
    | 'completing_task'
    | 'waiting_permission';
  description: string;
  status: 'active' | 'success' | 'warning' | 'error' | 'info';
  metadata?: {
    tool?: string | undefined;
    file?: string | undefined;
    command?: string | undefined;
    durationMs?: number | undefined;
    error?: string | undefined;
    diffSummary?: string | undefined;
  } | undefined;
}

export type OrchestrationStage =
  | 'request'
  | 'orchestrator'
  | 'planning'
  | 'context'
  | 'delegation'
  | 'tool_exec'
  | 'observation'
  | 'verification'
  | 'completion';

export interface OrchestrationStepState {
  stage: OrchestrationStage;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  timestamp?: number;
  detail?: string;
}

export interface FeedbackLoopState {
  active: boolean;
  stage: 'idle' | 'detected' | 'diagnosis' | 'fix_attempt' | 're_execution' | 'verification';
  errorText?: string;
  diagnosisText?: string;
  fixDescription?: string;
}

export interface TaskGraphStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  dependsOn?: string[];
  workerHint?: AgentRole;
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface AgentActivityState {
  agents: Record<string, AgentNode>;
  connections: AgentConnection[];
  timeline: TimelineEvent[];
  orchestrationFlow: Record<OrchestrationStage, OrchestrationStepState>;
  feedbackLoop: FeedbackLoopState;
  tasks: TaskGraphStep[];
  isPaused: boolean;
  isExecuting: boolean;
  selectedAgentId: string | null;
  activeSessionId: string | null;
  viewMode: 'graph' | 'timeline' | 'flow' | 'split';
  startTime: number | null;
  endTime: number | null;

  // Actions
  processSseEvent: (event: { type: string; data: any; sessionId?: string }) => void;
  setSelectedAgent: (agentId: string | null) => void;
  setViewMode: (mode: 'graph' | 'timeline' | 'flow' | 'split') => void;
  pauseAgent: () => void;
  resumeAgent: () => void;
  cancelAgent: () => void;
  clearHistory: () => void;
  resetToIdle: () => void;
}

const INITIAL_ORCHESTRATION_FLOW: Record<OrchestrationStage, OrchestrationStepState> = {
  request: { stage: 'request', label: 'User Request', status: 'pending' },
  orchestrator: { stage: 'orchestrator', label: 'Main Orchestrator', status: 'pending' },
  planning: { stage: 'planning', label: 'DAG Planning', status: 'pending' },
  context: { stage: 'context', label: 'Context Retrieval', status: 'pending' },
  delegation: { stage: 'delegation', label: 'Agent Delegation', status: 'pending' },
  tool_exec: { stage: 'tool_exec', label: 'Tool Execution', status: 'pending' },
  observation: { stage: 'observation', label: 'Output Observation', status: 'pending' },
  verification: { stage: 'verification', label: 'Verification', status: 'pending' },
  completion: { stage: 'completion', label: 'Completion', status: 'pending' },
};

export const DEFAULT_SUBAGENTS: Array<{ id: string; name: string; role: AgentRole; angle: number }> = [
  { id: 'researcher', name: 'Explorer', role: 'researcher', angle: -120 },
  { id: 'coder', name: 'Coder', role: 'coder', angle: -60 },
  { id: 'runner', name: 'Runner', role: 'runner', angle: 0 },
  { id: 'tester', name: 'Tester', role: 'tester', angle: 60 },
  { id: 'debugger', name: 'Debugger', role: 'debugger', angle: 120 },
  { id: 'reviewer', name: 'Reviewer', role: 'reviewer', angle: 180 },
];

function createDefaultAgentNodes(): Record<string, AgentNode> {
  const nodes: Record<string, AgentNode> = {
    orchestrator: {
      id: 'orchestrator',
      name: 'Main Orchestrator',
      role: 'orchestrator',
      status: 'idle',
      currentActivity: 'Standing by for user request',
      progress: null,
      activeTool: null,
      lastError: null,
      filesTouched: [],
      isOrchestrator: true,
      x: 0,
      y: 0,
      lastUpdated: Date.now(),
    },
  };

  const radius = 230;
  DEFAULT_SUBAGENTS.forEach((sub) => {
    const rad = (sub.angle * Math.PI) / 180;
    nodes[sub.id] = {
      id: sub.id,
      name: sub.name,
      role: sub.role,
      status: 'idle',
      currentActivity: 'Ready for assignment',
      progress: null,
      activeTool: null,
      lastError: null,
      filesTouched: [],
      isOrchestrator: false,
      x: Math.round(Math.cos(rad) * radius),
      y: Math.round(Math.sin(rad) * radius),
      lastUpdated: Date.now(),
    };
  });

  return nodes;
}

export const useAgentActivityStore = create<AgentActivityState>((set, get) => ({
  agents: createDefaultAgentNodes(),
  connections: [],
  timeline: [],
  orchestrationFlow: { ...INITIAL_ORCHESTRATION_FLOW },
  feedbackLoop: { active: false, stage: 'idle' },
  tasks: [],
  isPaused: false,
  isExecuting: false,
  selectedAgentId: 'orchestrator',
  activeSessionId: null,
  viewMode: 'split',
  startTime: null,
  endTime: null,

  setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),
  setViewMode: (viewMode) => set({ viewMode }),

  pauseAgent: () => {
    set({ isPaused: true });
    // Also record timeline event
    const now = Date.now();
    set((state) => ({
      timeline: [
        {
          id: `evt-${now}`,
          timestamp: now,
          agentId: 'orchestrator',
          agentName: 'Main Orchestrator',
          agentRole: 'orchestrator',
          activityType: 'waiting_permission',
          description: 'Execution paused by user',
          status: 'warning',
        },
        ...state.timeline,
      ],
    }));
  },

  resumeAgent: () => {
    set({ isPaused: false });
    const now = Date.now();
    set((state) => ({
      timeline: [
        {
          id: `evt-${now}`,
          timestamp: now,
          agentId: 'orchestrator',
          agentName: 'Main Orchestrator',
          agentRole: 'orchestrator',
          activityType: 'analyzing_request',
          description: 'Execution resumed by user',
          status: 'info',
        },
        ...state.timeline,
      ],
    }));
  },

  cancelAgent: () => {
    set({ isExecuting: false, isPaused: false, endTime: Date.now() });
    const now = Date.now();
    set((state) => {
      const updatedAgents = { ...state.agents };
      Object.keys(updatedAgents).forEach((k) => {
        const ag = updatedAgents[k];
        if (ag && ag.status !== 'completed') {
          updatedAgents[k] = { ...ag, status: 'idle', currentActivity: 'Cancelled' };
        }
      });
      return {
        agents: updatedAgents,
        connections: [],
        timeline: [
          {
            id: `evt-${now}`,
            timestamp: now,
            agentId: 'orchestrator',
            agentName: 'Main Orchestrator',
            agentRole: 'orchestrator',
            activityType: 'completing_task',
            description: 'Execution cancelled by user',
            status: 'warning',
          },
          ...state.timeline,
        ],
      };
    });
  },

  clearHistory: () => {
    set({
      timeline: [],
      tasks: [],
      startTime: null,
      endTime: null,
      orchestrationFlow: { ...INITIAL_ORCHESTRATION_FLOW },
      feedbackLoop: { active: false, stage: 'idle' },
      connections: [],
    });
  },

  resetToIdle: () => {
    set({
      agents: createDefaultAgentNodes(),
      connections: [],
      isExecuting: false,
      isPaused: false,
      orchestrationFlow: { ...INITIAL_ORCHESTRATION_FLOW },
      feedbackLoop: { active: false, stage: 'idle' },
    });
  },

  processSseEvent: (event) => {
    const { type, data, sessionId } = event;
    const now = Date.now();

    set((state) => {
      const agents = { ...state.agents };
      let connections = [...state.connections];
      let timeline = [...state.timeline];
      const flow = { ...state.orchestrationFlow };
      let feedback = { ...state.feedbackLoop };
      let tasks = [...state.tasks];
      let isExecuting = state.isExecuting;
      let startTime = state.startTime || now;
      let endTime = state.endTime;

      // Normalize agent ID helper
      const resolveAgentKey = (rawId?: string, role?: string): string => {
        if (!rawId) return 'orchestrator';
        const lower = rawId.toLowerCase();
        if (lower.includes('orchestrator')) return 'orchestrator';
        if (lower.includes('coder')) return 'coder';
        if (lower.includes('researcher') || lower.includes('explorer')) return 'researcher';
        if (lower.includes('runner')) return 'runner';
        if (lower.includes('tester')) return 'tester';
        if (lower.includes('debugger')) return 'debugger';
        if (lower.includes('reviewer')) return 'reviewer';
        if (role) {
          const rLower = role.toLowerCase();
          if (agents[rLower]) return rLower;
        }
        return 'orchestrator';
      };

      // ─────────────────────────────────────────────────────────────
      // 1. Task Graph & Plan Updates
      // ─────────────────────────────────────────────────────────────
      if (type === 'task.graph' || type === 'agent.plan_updated') {
        isExecuting = true;
        flow.request = { ...flow.request, status: 'completed' };
        flow.orchestrator = { ...flow.orchestrator, status: 'completed' };
        flow.planning = { ...flow.planning, status: 'active', timestamp: now, detail: `${data.steps?.length || 0} stages` };

        if (Array.isArray(data.steps)) {
          tasks = data.steps;
        }

        // Orchestrator status -> Planning
        if (agents['orchestrator']) {
          agents['orchestrator'] = {
            ...agents['orchestrator'],
            status: 'planning',
            currentActivity: `Synthesized task graph (${data.steps?.length || 0} DAG steps)`,
            progress: { current: 0, total: data.steps?.length || 0, label: 'DAG Planning' },
            lastUpdated: now,
          };
        }

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: 'orchestrator',
          agentName: 'Main Orchestrator',
          agentRole: 'orchestrator',
          activityType: 'creating_plan',
          description: `Formulated DAG execution plan with ${data.steps?.length || 0} stages`,
          status: 'info',
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 2. Task Step Started / Agent Delegated
      // ─────────────────────────────────────────────────────────────
      else if (type === 'task.update' && data.status === 'running' || type === 'agent.task_started') {
        isExecuting = true;
        flow.planning = { ...flow.planning, status: 'completed' };
        flow.delegation = { ...flow.delegation, status: 'active', timestamp: now };
        flow.tool_exec = { ...flow.tool_exec, status: 'active', timestamp: now };

        const targetKey = resolveAgentKey(data.workerId || data.agentId, data.workerRole);
        const taskTitle = data.title || tasks.find((t) => t.id === data.stepId || t.id === data.taskId)?.title || 'Executing task';

        // Update task status in tasks list
        tasks = tasks.map((t) => (t.id === (data.stepId || data.taskId) ? { ...t, status: 'running' } : t));

        // Connect orchestrator -> worker
        if (targetKey !== 'orchestrator') {
          connections = connections.filter((c) => c.to !== targetKey);
          connections.push({
            id: `conn-orch-${targetKey}-${now}`,
            from: 'orchestrator',
            to: targetKey,
            active: true,
            direction: 'outbound',
            label: taskTitle.slice(0, 30),
            timestamp: now,
          });

          // Orchestrator state -> Delegating
          if (agents['orchestrator']) {
            agents['orchestrator'] = {
              ...agents['orchestrator'],
              status: 'delegating',
              currentActivity: `Delegating "${taskTitle.slice(0, 35)}..." to ${agents[targetKey]?.name || targetKey}`,
              lastUpdated: now,
            };
          }
        }

        // Worker node state
        if (agents[targetKey]) {
          const roleStatusMap: Record<AgentRole, AgentStatus> = {
            orchestrator: 'working',
            planner: 'planning',
            researcher: 'exploring',
            coder: 'coding',
            runner: 'executing_tool',
            tester: 'testing',
            debugger: 'debugging',
            reviewer: 'working',
          };
          const nextStatus = roleStatusMap[agents[targetKey].role] || 'working';

          agents[targetKey] = {
            ...agents[targetKey],
            status: nextStatus,
            currentActivity: taskTitle,
            lastUpdated: now,
          };
        }

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: targetKey,
          agentName: agents[targetKey]?.name || targetKey,
          agentRole: agents[targetKey]?.role || 'coder',
          activityType: 'delegating_subtask',
          description: `Dispatched stage: ${taskTitle}`,
          status: 'active',
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 3. Task Step Completed
      // ─────────────────────────────────────────────────────────────
      else if ((type === 'task.update' && data.status === 'done') || type === 'agent.task_completed') {
        const taskId = data.stepId || data.taskId;
        const resultSummary = data.result || 'Completed';
        tasks = tasks.map((t) => (t.id === taskId ? { ...t, status: 'done', result: resultSummary } : t));

        // Find which worker was assigned
        const task = tasks.find((t) => t.id === taskId);
        const workerKey = resolveAgentKey(data.agentId, task?.workerHint);

        // Reverse connection: worker -> orchestrator (inbound)
        if (workerKey !== 'orchestrator') {
          connections = connections.filter((c) => c.to !== workerKey);
          connections.push({
            id: `conn-ret-${workerKey}-${now}`,
            from: workerKey,
            to: 'orchestrator',
            active: true,
            direction: 'inbound',
            label: 'Result returned',
            timestamp: now,
          });
        }

        if (agents[workerKey]) {
          agents[workerKey] = {
            ...agents[workerKey],
            status: 'completed',
            currentActivity: `Completed: ${task?.title || 'Subtask'}`,
            activeTool: null,
            lastUpdated: now,
          };
        }

        flow.observation = { ...flow.observation, status: 'completed' };

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: workerKey,
          agentName: agents[workerKey]?.name || workerKey,
          agentRole: agents[workerKey]?.role || 'coder',
          activityType: 'completing_task',
          description: `Finished: ${task?.title || 'Step'}`,
          status: 'success',
          metadata: { durationMs: data.durationMs },
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 4. Agent Status Changed / Thinking
      // ─────────────────────────────────────────────────────────────
      else if (type === 'agent.status' || type === 'agent.status_changed' || type === 'agent.thinking') {
        const agentKey = resolveAgentKey(data.agentId, data.role);
        const rawStatus = (data.status || 'thinking').toLowerCase();

        let mappedStatus: AgentStatus = 'working';
        if (rawStatus.includes('think')) mappedStatus = 'thinking';
        else if (rawStatus.includes('plan')) mappedStatus = 'planning';
        else if (rawStatus.includes('wait') || rawStatus.includes('perm')) mappedStatus = 'waiting';
        else if (rawStatus.includes('fail')) mappedStatus = 'failed';
        else if (rawStatus.includes('comp') || rawStatus.includes('done')) mappedStatus = 'completed';
        else if (rawStatus.includes('tool') || rawStatus.includes('exec')) mappedStatus = 'executing_tool';
        else if (rawStatus.includes('explor')) mappedStatus = 'exploring';
        else if (rawStatus.includes('cod')) mappedStatus = 'coding';
        else if (rawStatus.includes('test')) mappedStatus = 'testing';
        else if (rawStatus.includes('debug')) mappedStatus = 'debugging';

        if (agents[agentKey]) {
          agents[agentKey] = {
            ...agents[agentKey],
            status: mappedStatus,
            currentActivity: data.message || data.activity || agents[agentKey].currentActivity,
            lastUpdated: now,
          };
        }

        if (mappedStatus === 'thinking' && agentKey === 'orchestrator') {
          flow.orchestrator = { ...flow.orchestrator, status: 'active', timestamp: now };
        }

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: agentKey,
          agentName: agents[agentKey]?.name || agentKey,
          agentRole: agents[agentKey]?.role || 'orchestrator',
          activityType: mappedStatus === 'thinking' ? 'analyzing_request' : 'delegating_subtask',
          description: data.message || `Status changed to ${mappedStatus}`,
          status: mappedStatus === 'failed' ? 'error' : mappedStatus === 'completed' ? 'success' : 'info',
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 5. Tool Started
      // ─────────────────────────────────────────────────────────────
      else if (type === 'tool.start' || type === 'agent.tool_started') {
        const toolName = data.name || data.tool || 'unknown_tool';
        const agentKey = resolveAgentKey(data.agentId);

        // Map status depending on tool
        let toolStatus: AgentStatus = 'executing_tool';
        let activityDesc = `Executing tool: ${toolName}`;

        if (toolName.includes('read') || toolName.includes('search') || toolName.includes('list') || toolName.includes('fetch')) {
          toolStatus = 'exploring';
          activityDesc = `Searching codebase with ${toolName}`;
          flow.context = { ...flow.context, status: 'active', timestamp: now };
        } else if (toolName.includes('write') || toolName.includes('edit') || toolName.includes('patch')) {
          toolStatus = 'coding';
          activityDesc = `Writing code with ${toolName}: ${data.args?.path || ''}`;
        } else if (toolName.includes('terminal') || toolName.includes('run') || toolName.includes('cmd')) {
          toolStatus = 'executing_tool';
          activityDesc = `Running command: ${data.args?.command || ''}`;
        }

        if (agents[agentKey]) {
          agents[agentKey] = {
            ...agents[agentKey],
            status: toolStatus,
            currentActivity: activityDesc,
            activeTool: { name: toolName, args: data.args, startedAt: now },
            lastUpdated: now,
          };
        }

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: agentKey,
          agentName: agents[agentKey]?.name || agentKey,
          agentRole: agents[agentKey]?.role || 'coder',
          activityType: toolStatus === 'exploring' ? 'searching_files' : toolStatus === 'coding' ? 'modifying_file' : 'executing_command',
          description: activityDesc,
          status: 'active',
          metadata: { tool: toolName, command: data.args?.command, file: data.args?.path },
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 6. Tool Output & File Mutations
      // ─────────────────────────────────────────────────────────────
      else if (type === 'tool.end' || type === 'agent.tool_output') {
        const toolName = data.name || data.tool || '';
        const agentKey = resolveAgentKey(data.agentId);

        if (agents[agentKey]) {
          agents[agentKey] = {
            ...agents[agentKey],
            activeTool: null,
            lastUpdated: now,
          };
        }

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: agentKey,
          agentName: agents[agentKey]?.name || agentKey,
          agentRole: agents[agentKey]?.role || 'coder',
          activityType: 'receiving_output',
          description: `Tool output received (${toolName}) in ${data.durationMs || 0}ms`,
          status: data.success ? 'success' : 'warning',
          metadata: { tool: toolName, durationMs: data.durationMs },
        });
      }

      // File changed event
      else if (type === 'agent.file_changed') {
        const filePath = data.filePath || '';
        const agentKey = resolveAgentKey(data.agentId);

        if (agents[agentKey]) {
          const files = agents[agentKey].filesTouched;
          if (!files.includes(filePath)) {
            agents[agentKey] = {
              ...agents[agentKey],
              filesTouched: [...files, filePath],
              lastUpdated: now,
            };
          }
        }

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: agentKey,
          agentName: agents[agentKey]?.name || agentKey,
          agentRole: agents[agentKey]?.role || 'coder',
          activityType: 'modifying_file',
          description: `File modified: ${filePath.split(/[\/\\]/).pop() || filePath}`,
          status: 'success',
          metadata: { file: filePath, diffSummary: data.diff?.addedCount ? `+${data.diff.addedCount} / -${data.diff.removedCount}` : undefined },
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 7. Error Detected & Hotfix Feedback Loop
      // ─────────────────────────────────────────────────────────────
      else if (type === 'agent.error') {
        const agentKey = resolveAgentKey(data.agentId);
        const errText = data.error || 'Execution failure';

        // Trigger reactive feedback loop
        feedback = {
          active: true,
          stage: 'detected',
          errorText: errText,
          diagnosisText: 'Analyzing stack trace & file AST...',
          fixDescription: 'Dispatching Debugger specialist for automated hotfix',
        };

        if (agents[agentKey]) {
          agents[agentKey] = {
            ...agents[agentKey],
            status: 'failed',
            lastError: errText,
            lastUpdated: now,
          };
        }

        // Point Debugger agent to working
        if (agents['debugger']) {
          agents['debugger'] = {
            ...agents['debugger'],
            status: 'debugging',
            currentActivity: `Investigating blocker: ${errText.slice(0, 45)}...`,
            lastUpdated: now,
          };
          connections.push({
            id: `conn-debug-${now}`,
            from: 'orchestrator',
            to: 'debugger',
            active: true,
            direction: 'outbound',
            label: 'Hotfix dispatch',
            timestamp: now,
          });
        }

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: agentKey,
          agentName: agents[agentKey]?.name || agentKey,
          agentRole: agents[agentKey]?.role || 'debugger',
          activityType: 'error_detected',
          description: `Error detected: ${errText}`,
          status: 'error',
          metadata: { error: errText },
        });
      }

      // ─────────────────────────────────────────────────────────────
      // 8. Verification & Completion
      // ─────────────────────────────────────────────────────────────
      else if (type === 'verification.start') {
        flow.verification = { ...flow.verification, status: 'active', timestamp: now, detail: 'Gated check' };
        if (agents['tester']) {
          agents['tester'] = {
            ...agents['tester'],
            status: 'testing',
            currentActivity: 'Running verification test assertions and health checks',
            lastUpdated: now,
          };
        }
        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: 'tester',
          agentName: 'Tester Agent',
          agentRole: 'tester',
          activityType: 'running_verification',
          description: 'Executing verification suite',
          status: 'active',
        });
      } else if (type === 'verification.result') {
        flow.verification = { ...flow.verification, status: data.passed ? 'completed' : 'error' };
        if (data.passed && feedback.active) {
          feedback = { ...feedback, stage: 'verification', active: false };
        }
      } else if (type === 'agent.done') {
        isExecuting = false;
        endTime = now;
        flow.completion = { ...flow.completion, status: 'completed', timestamp: now };
        if (agents['orchestrator']) {
          agents['orchestrator'] = {
            ...agents['orchestrator'],
            status: 'completed',
            currentActivity: 'All tasks verified and completed',
            activeTool: null,
            lastUpdated: now,
          };
        }
        // Disconnect active links
        connections = connections.map((c) => ({ ...c, active: false }));

        timeline.unshift({
          id: `evt-${now}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: now,
          agentId: 'orchestrator',
          agentName: 'Main Orchestrator',
          agentRole: 'orchestrator',
          activityType: 'completing_task',
          description: 'Entire task workflow successfully verified and completed',
          status: 'success',
        });
      }

      return {
        agents,
        connections,
        timeline: timeline.slice(0, 150), // keep latest 150 events
        orchestrationFlow: flow,
        feedbackLoop: feedback,
        tasks,
        isExecuting,
        startTime,
        endTime,
        activeSessionId: sessionId || state.activeSessionId,
      };
    });
  },
}));
