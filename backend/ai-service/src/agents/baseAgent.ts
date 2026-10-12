import { AgentContext, AgentEvent, AgentResult, PlanStep, ToolTrace, EditedFileMeta } from './types';
import { ToolRegistry } from '../tools/registry';
import { SkillManager, SkillDefinition } from '../skills/skillManager';

export abstract class BaseAgent {
  protected toolRegistry: ToolRegistry;
  protected skillManager: SkillManager;

  constructor(workspaceRoot: string) {
    this.toolRegistry = new ToolRegistry(workspaceRoot);
    this.skillManager = new SkillManager(workspaceRoot);
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    this.toolRegistry.setWorkspaceRoot(workspaceRoot);
    this.skillManager.setWorkspaceRoot(workspaceRoot);
  }

  public abstract execute(
    userPrompt: string,
    context: AgentContext,
    emitEvent: (event: AgentEvent) => void
  ): Promise<AgentResult>;

  /**
   * Helper to build a comprehensive system prompt combining IDE context and skills
   */
  protected buildSystemPrompt(context: AgentContext, activeSkills: SkillDefinition[]): string {
    const ws = context.workspaceRoot;
    const skillsSection = this.skillManager.formatSkillsPrompt(activeSkills);

    const activeFileSection = context.activeFile?.path
      ? `
ACTIVE EDITOR FILE CONTEXT:
- Active File: ${context.activeFile.path}
- File Name: ${context.activeFile.name}
${context.activeFile.content ? `- Content Preview:\n\`\`\`${context.activeFile.name.split('.').pop() || 'text'}\n${context.activeFile.content.slice(0, 4500)}\n\`\`\`` : ''}
IMPORTANT: The developer currently has "${context.activeFile.name}" open in their Monaco editor. When the developer says "this file", "analyse this", "correct this", "fix this", "check this", or asks to modify/refactor code without naming another file, they are referring DIRECTLY to this active file (${context.activeFile.path}).
`
      : '';

    const openTabsSection = context.openTabs && context.openTabs.length > 0
      ? `
OPEN EDITOR TABS:
${context.openTabs.map((t) => `- ${t.name}: ${t.path}`).join('\n')}
`
      : '';

    const terminalSection = context.terminalTail
      ? `
RECENT TERMINAL OUTPUT:
\`\`\`
${context.terminalTail.slice(-1500)}
\`\`\`
`
      : '';

    return `You are THIRD_EYE, an industry-grade autonomous AI coding agent pair-programming with the user.
Operating in workspace: "${ws}".
You possess full agentic capabilities: you inspect context, formulate plans, execute tools in an autonomous loop, propose atomic file diffs, and verify results.
${activeFileSection}
${openTabsSection}
${terminalSection}

AGENTIC OPERATING RULES:
1. Full Workspace Awareness: You are embedded directly inside the user's IDE. You have full access to the project filesystem and terminal. NEVER ask the developer to paste, attach, or provide files that exist in the workspace! Instead:
   - When asked to "debug this file" or "fix this file", inspect the active editor buffer or use \`readFile\` directly.
   - When asked to debug or inspect a specific file (e.g. "index.ts", "styles.css"), use \`findFiles\` to locate it, and \`readFile\` to inspect it.
   - When asked to compile, debug, or verify, use \`runTerminal\` to run build commands (e.g., \`npx tsc --noEmit\`, \`npm run build\`, test suites).
2. Direct Action & File Editing: When the user asks to "correct", "fix", "refactor", "update", "debug", or "clean up", do NOT just talk about it—execute the \`editFile\` (or \`writeFile\`) tool to apply the fix directly to the file! Every file edit produces an atomic diff for the developer.
3. Comprehensive Explanation: After performing analysis or tool calls, ALWAYS write a full, detailed Markdown response explaining:
   - What issues, anti-patterns, or bugs were detected.
   - Exactly what modifications were applied.
   - Code blocks with syntax highlighting showing the corrected code.
4. Professional Formatting: Format your final response with clean markdown headings (## Analysis, ## Changes Made), bullet points, and code blocks so the developer has complete visibility.
${skillsSection}
`;
  }
}
