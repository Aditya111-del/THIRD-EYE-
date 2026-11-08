/**
 * CONTEXT ENVELOPE BUILDER (Phase 5 & Multi-Agent Architecture)
 * Strict Budget Policy:
 * 1. System Prompt (15%)
 * 2. Task Graph State / Assigned Task + Criteria (15%)
 * 3. Repo Map + Chunks (35%)
 * 4. Conversation / Task History (25%)
 * 5. Terminal Tails (10%)
 * On overflow: compact history → shrink chunk radius → drop oldest tails.
 * Rule: NEVER silently drop the current task or acceptance criteria.
 */

import fs from 'fs';
import path from 'path';
import { AgentSpec, TaskGraphDAG, TaskGraphStep } from '@third-eye/shared';
import { compactConversationHistory, ConversationTurn } from './compaction';
import { getActiveRunningTasksSummary } from '../tools/runTerminal';
import { SkillManager, SkillDefinition } from '../skills/skillManager';
import { isVisionCapableModel } from '../core/loop';

export interface EnvelopeInputContext {
  workspaceRoot: string;
  sessionId: string;
  model?: string;
  cwd?: string;
  cwdTree?: string;
  directoryTree?: string;
  taskGraph?: TaskGraphDAG;
  currentStep?: TaskGraphStep;
  openTabs?: Array<{ path: string; selection?: string; isDirty?: boolean }>;
  activeFile?: { name?: string; path?: string; content?: string } | null;
  terminalTail?: string;
  recentDiagnostics?: string;
  history?: ConversationTurn[];
  retrievedChunks?: Array<{ path: string; content: string; score?: number }>;
  repoMapSummary?: string;
  userMessage?: string;
  skillManager?: SkillManager;
  matchedSkills?: SkillDefinition[];
  images?: any[];
}

export interface BuiltEnvelope {
  systemPrompt: string;
  messages: ConversationTurn[];
  tokenEstimate: number;
}

function scanDirectoryTreeSync(targetDir: string, maxDepth = 4, maxEntries = 250): string {
  if (!targetDir || !fs.existsSync(targetDir)) return '';
  const dirName = path.basename(targetDir) || targetDir;
  const entries: string[] = [`${dirName}/`];
  const ignoreDirs = new Set(['.git', 'node_modules', '.output', 'dist', 'build', '.cache', '.next', '.vite']);

  const walk = (cur: string, depth: number, prefix: string) => {
    if (depth > maxDepth || entries.length >= maxEntries) return;
    try {
      const items = fs.readdirSync(cur, { withFileTypes: true });
      const filtered = items.filter((d) => !ignoreDirs.has(d.name) && !d.name.startsWith('.git'));
      filtered.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
      for (let i = 0; i < filtered.length; i++) {
        if (entries.length >= maxEntries) break;
        const item = filtered[i];
        const isLast = i === filtered.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        const full = path.join(cur, item.name);
        if (item.isDirectory()) {
          entries.push(`${prefix}${connector}${item.name}/`);
          walk(full, depth + 1, childPrefix);
        } else {
          entries.push(`${prefix}${connector}${item.name}`);
        }
      }
    } catch {}
  };

  walk(targetDir, 1, '');
  return entries.join('\n');
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

function truncateToTokens(text: string, maxTokens: number): string {
  const current = estimateTokens(text);
  if (current <= maxTokens) return text;
  const maxChars = Math.floor(maxTokens * 3.8);
  return text.slice(0, maxChars) + '\n...[truncated for token budget]';
}

export function loadRolePrompt(role: string): string {
  try {
    const candidates = [
      path.join(__dirname, '..', 'prompts', `${role}.md`),
      path.join(__dirname, '..', '..', 'src', 'prompts', `${role}.md`),
      path.join(process.cwd(), 'src', 'prompts', `${role}.md`),
      path.join(process.cwd(), 'backend', 'ai-service', 'src', 'prompts', `${role}.md`),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    }
  } catch {}
  return `You are an expert ${role} agent for the THIRD_EYE IDE.`;
}

export function buildContextEnvelope(
  agentSpec: AgentSpec,
  context: EnvelopeInputContext,
  totalBudget = 128000
): BuiltEnvelope {
  // Budget breakdown
  const systemBudget = Math.floor(totalBudget * 0.15); // ~19.2k
  const taskBudget = Math.floor(totalBudget * 0.15);   // ~19.2k
  const repoChunksBudget = Math.floor(totalBudget * 0.35); // ~44.8k
  const historyBudget = Math.floor(totalBudget * 0.25); // ~32k
  const terminalBudget = Math.floor(totalBudget * 0.10); // ~12.8k

  // 1. Skill Discovery & Injection
  const sm = context.skillManager || new SkillManager(context.workspaceRoot);
  const candidateQuery = [
    context.userMessage || '',
    context.currentStep?.title || '',
    context.currentStep?.description || '',
    context.taskGraph?.goal || '',
    agentSpec.taskDescription || '',
  ].join(' ');

  let activeMatched = context.matchedSkills || sm.matchSkills(candidateQuery, 3);
  if (
    activeMatched.length === 0 &&
    (candidateQuery.toLowerCase().includes('website') ||
     candidateQuery.toLowerCase().includes('project') ||
     candidateQuery.toLowerCase().includes('app') ||
     candidateQuery.toLowerCase().includes('build') ||
     candidateQuery.toLowerCase().includes('make') ||
     candidateQuery.toLowerCase().includes('create') ||
     candidateQuery.toLowerCase().includes('design'))
  ) {
    const defaultWeb = sm.getSkill('web-app-architecture');
    const defaultDesign = sm.getSkill('frontend-design');
    if (defaultWeb) activeMatched.push(defaultWeb);
    if (defaultDesign) activeMatched.push(defaultDesign);
  }

  const skillsContextText = sm.formatSkillsPrompt(activeMatched);

  // 1b. Role System Prompt
  const baseRolePrompt = loadRolePrompt(agentSpec.role);
  const systemPrompt = truncateToTokens(
    `${baseRolePrompt}
AGENT IDENTIFIER: ${agentSpec.name} (${agentSpec.id})
WORKSPACE ROOT: ${context.workspaceRoot}
CORE ENGINEERING & AESTHETIC DIRECTIVES:
- RECONNAISSANCE FIRST: Always check existing files and structure with list_dir and read_file before modifying code.
- ZERO PLACEHOLDERS & NO EMPTY FILES: Never create empty files or stub functions with "// TODO". Every file must be complete, robust, and production-grade.
- RICH AESTHETICS & MODERN UI: For web/frontend, produce visually stunning modern designs (Tailwind/CSS, curated color palettes, modern fonts like Inter/Outfit, smooth micro-animations, glassmorphism, rich mock data with Unsplash images). Never output raw unstyled HTML.
- Tool errors are observations: self-correct immediately using output messages.
- Verify changes by ensuring zero syntax errors and clean compilation before concluding.

${skillsContextText}`,
    systemBudget
  );

  // 2. Task Graph State & Assigned Task
  let taskSection = '';
  if (agentSpec.role === 'orchestrator' && context.taskGraph) {
    const stepsSummary = context.taskGraph.steps
      .map((s) => `[${s.status.toUpperCase()}] (${s.id}) ${s.title}: ${s.description} (depends on: [${s.dependsOn.join(', ')}], worker: ${s.workerHint})`)
      .join('\n');
    taskSection = `## OVERALL GOAL: ${context.taskGraph.goal}\n## LIVE TASK GRAPH:\n${stepsSummary}`;
  } else if (context.currentStep) {
    taskSection = `## ASSIGNED STEP: (${context.currentStep.id}) ${context.currentStep.title}
DESCRIPTION: ${context.currentStep.description}
ACCEPTANCE CRITERIA:
${(agentSpec.acceptanceCriteria || []).map((c) => `- ${c}`).join('\n') || '- Satisfy all requirements with zero build/test errors'}`;
  } else if (agentSpec.taskDescription) {
    taskSection = `## ASSIGNED TASK: ${agentSpec.taskDescription}`;
  }
  // NEVER silently drop the current task or acceptance criteria!
  const taskBlock = truncateToTokens(taskSection, taskBudget);

  // 3. Repo Map Summary & Retrieved Chunks
  let repoMapText = context.repoMapSummary || '';
  let chunksText = '';
  if (context.retrievedChunks && context.retrievedChunks.length > 0) {
    chunksText = '## RETRIEVED RELEVANT CODE:\n' + context.retrievedChunks
      .map((c) => `--- File: ${c.path} ---\n${c.content}`)
      .join('\n\n');
  }
  const combinedRepoChunks = truncateToTokens(
    `${repoMapText ? `## REPO MAP:\n${repoMapText}\n\n` : ''}${chunksText}`,
    repoChunksBudget
  );

  // 4. Open Tabs & Working State
  let openTabsText = '';
  if (context.openTabs && context.openTabs.length > 0) {
    openTabsText = `## OPEN FILES IN IDE:\n${context.openTabs.map((t) => `- ${t.path}${t.selection ? ` (selected: "${t.selection}")` : ''}`).join('\n')}`;
  }

  // 5. Terminal Tails, Running Processes & Diagnostics
  let terminalText = '';
  if (context.terminalTail) {
    terminalText = `## RECENT TERMINAL OUTPUT:\n${context.terminalTail}`;
  }
  const runningTasks = getActiveRunningTasksSummary();
  if (runningTasks && !runningTasks.startsWith('No active')) {
    terminalText += `\n\n## ACTIVE RUNNING PROCESSES & BACKGROUND TASKS:\n${runningTasks}`;
  }
  if (context.recentDiagnostics) {
    terminalText += `\n\n## ACTIVE DIAGNOSTICS/ERRORS:\n${context.recentDiagnostics}`;
  }
  const terminalBlock = truncateToTokens(terminalText, terminalBudget);

  // 6. History with compaction if over budget
  let historyTurns = context.history ? [...context.history] : [];
  let historyTokens = estimateTokens(historyTurns.map((h) => h.content).join(' '));
  if (historyTokens > historyBudget) {
    historyTurns = compactConversationHistory(historyTurns, 8);
  }

  // Attach images to user turn if provided and model supports vision
  const visionSupported = isVisionCapableModel(context.model);
  if (!visionSupported) {
    historyTurns = historyTurns.map((turn) => {
      if (turn.images && turn.images.length > 0) {
        const { images, ...rest } = turn;
        return rest;
      }
      return turn;
    });
  } else if (context.images && context.images.length > 0) {
    const lastUserIdx = historyTurns.map((t) => t.role).lastIndexOf('user');
    if (lastUserIdx !== -1) {
      historyTurns[lastUserIdx] = {
        ...historyTurns[lastUserIdx],
        images: context.images,
      };
    } else if (context.userMessage) {
      historyTurns.push({
        role: 'user',
        content: context.userMessage,
        images: context.images,
      });
    }
  }

  // 7. Live Project Directory Tree & Manifest
  let dirTree = context.cwdTree || context.directoryTree || '';
  const wsRoot = context.workspaceRoot || context.cwd || '';
  if (!dirTree && wsRoot && fs.existsSync(wsRoot)) {
    try {
      dirTree = scanDirectoryTreeSync(wsRoot, 4, 250);
    } catch (_) {}
  }

  let packageInfoText = '';
  if (wsRoot && fs.existsSync(path.join(wsRoot, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(wsRoot, 'package.json'), 'utf-8'));
      packageInfoText = `Project: ${pkg.name || path.basename(wsRoot)} (v${pkg.version || '1.0.0'})\n` +
        (pkg.description ? `Description: ${pkg.description}\n` : '') +
        (pkg.scripts ? `Scripts: ${Object.keys(pkg.scripts).join(', ')}\n` : '') + '\n';
    } catch (_) {}
  }

  const dirTreeSection = dirTree
    ? `## LIVE PROJECT DIRECTORY TREE & FILES:\n${packageInfoText}${dirTree}\n\n`
    : '';

  // Assemble the messages list
  const messages: ConversationTurn[] = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n${taskBlock}\n\n${dirTreeSection}${combinedRepoChunks}\n\n${openTabsText}\n\n${terminalBlock}`,
    },
    ...historyTurns,
  ];

  const tokenEstimate = estimateTokens(messages.map((m) => m.content).join(' '));

  return {
    systemPrompt,
    messages,
    tokenEstimate,
  };
}
