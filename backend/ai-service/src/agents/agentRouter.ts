import { AutonomousAgent } from './autonomousAgent';
import { EditorAgent } from './editorAgent';
import { TerminalAgent } from './terminalAgent';
import { AgentContext, AgentEvent, AgentResult, AgentRole } from './types';
import { SkillManager } from '../skills/skillManager';

export class AgentRouter {
  private autonomousAgent: AutonomousAgent;
  private editorAgent: EditorAgent;
  private terminalAgent: TerminalAgent;
  private skillManager: SkillManager;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.autonomousAgent = new AutonomousAgent(workspaceRoot);
    this.editorAgent = new EditorAgent(workspaceRoot);
    this.terminalAgent = new TerminalAgent(workspaceRoot);
    this.skillManager = new SkillManager(workspaceRoot);
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.autonomousAgent.setWorkspaceRoot(workspaceRoot);
    this.editorAgent.setWorkspaceRoot(workspaceRoot);
    this.terminalAgent.setWorkspaceRoot(workspaceRoot);
    this.skillManager.setWorkspaceRoot(workspaceRoot);
  }

  public getSkillManager(): SkillManager {
    return this.skillManager;
  }

  public getAutonomousAgent(): AutonomousAgent {
    return this.autonomousAgent;
  }

  /**
   * Determine best agent role based on explicit preference or prompt heuristics
   */
  public resolveRole(prompt: string, requestedMode?: AgentRole): AgentRole {
    const p = prompt.trim().toLowerCase();
    const isEducationalOrInquiry =
      /^(teach|learn|how to learn|guide|tutorial|what is|what are|what does|how does|why does|why is|explain|compare|pros and cons|difference between|tell me about|can you explain|show me an example of)\b/i.test(p) ||
      /\b(teach me|how do i learn|explain how|what is the difference|can you teach)\b/i.test(p);
    
    const isGreeting = ['hi', 'hii', 'hiii', 'hello', 'hey', 'heya', 'yo', 'sup', 'who are you', 'what can you do', 'help'].includes(p);

    if (isEducationalOrInquiry || isGreeting) {
      return 'autonomous';
    }

    if (requestedMode && ['autonomous', 'editor', 'terminal'].includes(requestedMode)) {
      return requestedMode;
    }

    if (p.includes('terminal') || p.includes('bash') || p.includes('run command') || p.includes('diagnose error')) {
      return 'terminal';
    }
    if (p.includes('inline') || p.includes('refactor buffer') || p.includes('editor') || p.includes('replace in file')) {
      return 'editor';
    }

    return 'autonomous';
  }

  /**
   * Dispatches task to selected agent
   */
  public async execute(
    userPrompt: string,
    context: AgentContext,
    emitEvent: (event: AgentEvent) => void
  ): Promise<AgentResult> {
    const role = this.resolveRole(userPrompt, context.agentMode);
    context.agentMode = role;

    switch (role) {
      case 'editor':
        return this.editorAgent.execute(userPrompt, context, emitEvent);
      case 'terminal':
        return this.terminalAgent.execute(userPrompt, context, emitEvent);
      case 'autonomous':
      default:
        return this.autonomousAgent.execute(userPrompt, context, emitEvent);
    }
  }
}
