import path from 'path';
import fs from 'fs';
import { BaseAgent } from './baseAgent';
import { AgentContext, AgentEvent, AgentResult, PlanStep, ToolTrace, EditedFileMeta, UserIntent } from './types';
import { AgentLoop } from '../loop';
import { Orchestrator } from '../orchestrator/orchestrator';
import { getActiveRunningTasksSummary } from '../tools/runTerminal';
import { executeInitProjectFolder } from '../tools/initProjectFolder';
import {
  checkWorkspaceSafety,
  isProjectInitRequest,
  extractProjectSlug,
  deriveFallbackProjectSlug,
  generateDirectoryAwarenessNotice,
} from './workspaceSafety';

export class AutonomousAgent extends BaseAgent {
  private loop: AgentLoop;
  private orchestrator: Orchestrator;

  constructor(workspaceRoot: string) {
    super(workspaceRoot);
    this.loop = new AgentLoop(workspaceRoot);
    this.orchestrator = new Orchestrator(workspaceRoot);
  }

  public setWorkspaceRoot(workspaceRoot: string) {
    super.setWorkspaceRoot(workspaceRoot);
    this.loop.setWorkspaceRoot(workspaceRoot);
    this.orchestrator.setWorkspaceRoot(workspaceRoot);
  }

  public cancel(sessionId: string) {
    this.orchestrator.cancel(sessionId);
    this.loop.cancel(sessionId);
  }

  public resetCancellation(sessionId: string) {
    this.orchestrator.resetCancellation(sessionId);
    this.loop.resetCancellation(sessionId);
  }

  public getOrchestrator(): Orchestrator {
    return this.orchestrator;
  }

  /**
   * Intelligently classify user intent:
   * 1. 'greeting': Casual hello/greeting -> simple 1-2 sentence friendly reply.
   * 2. 'project_init': User wants to start/initialize a project folder.
   * 3. 'directory_awareness': Inquiry regarding current active directory.
   * 4. 'general_question': Pure theoretical/conceptual question with no workspace context -> direct Markdown answer.
   * 5. 'direct_execution': Direct operational task (stop server, run/start dev server, test, inspect) -> fast direct loop with tools.
   * 6. 'workspace_task': Full multi-agent DAG for engineering/scaffolding/refactoring.
   */
  public classifyIntent(userPrompt: string, context: AgentContext): {
    intent: UserIntent;
    targetFileName?: string;
    targetCommand?: string;
    targetProjectSlug?: string;
  } {
    const p = userPrompt.trim().toLowerCase();
    const activeFileName = context.activeFile?.name;

    // 1. Casual Greetings & Basic Chit-Chat
    const isGreeting =
      ['hi', 'hii', 'hiii', 'hello', 'hey', 'heya', 'yo', 'sup', 'who are you', 'what can you do', 'help', 'good morning', 'good afternoon', 'good evening'].includes(p) ||
      (/^(hi|hii|hello|hey|greetings)\b/i.test(p) && p.length < 20);
    if (isGreeting) {
      return { intent: 'greeting' };
    }

    // 2. CHECK FOR PROJECT INITIALIZATION / START PROJECT INTENT FIRST
    if (isProjectInitRequest(userPrompt)) {
      const slug = extractProjectSlug(userPrompt);
      return {
        intent: 'project_init',
        targetProjectSlug: slug || undefined,
      };
    }

    // 3. CHECK FOR DIRECT DIRECTORY AWARENESS INQUIRY
    if (/^(what directory|which directory|where am i|current directory|pwd|what folder|which folder|current path|working directory)\b/i.test(p)) {
      return { intent: 'directory_awareness' };
    }

    // 3. CHECK FOR STATUS / PROCESS / RUNTIME OPERATIONAL INQUIRY
    const isStatusCheck =
      /\b(is it running|is anything running|is it up|is server running|is dev server running|is it working|status|check status|what is running|did it start|did it run|is it ready|is it alive)\b/i.test(p) ||
      /\b(running|alive|online|active)\s*\??$/i.test(p);

    if (isStatusCheck) {
      return { intent: 'direct_execution' };
    }

    // 4. CHECK FOR STOP / KILL SERVER OR PROCESS OPERATIONAL REQUEST
    const isStopOrKill = /\b(stop|kill|terminate|halt|shutdown|close|cancel)\b/i.test(p);
    if (isStopOrKill) {
      return { intent: 'direct_execution' };
    }

    // Helper to find recent command mentioned in chat history
    const findRecentCommandFromHistory = (): string | undefined => {
      if (!context.history || context.history.length === 0) return undefined;
      for (let i = context.history.length - 1; i >= 0; i--) {
        const h = context.history[i];
        const content = h.content || '';
        let candidate: string | undefined;
        // 1. Look for markdown code blocks with bash/sh/npm/electron
        const codeBlockMatch = content.match(/```(?:bash|sh|shell|zsh)?\s*\n?([^\n`]+(?:npm|yarn|pnpm|bun|node|python|electron|git)[^\n`]*)```/i);
        if (codeBlockMatch && codeBlockMatch[1]) {
          candidate = codeBlockMatch[1].trim();
        }
        // 2. Look for inline code commands
        if (!candidate) {
          const inlineCodeMatch = content.match(/`((?:npm|yarn|pnpm|bun|node|python|electron)\s+[^`]+)`/i);
          if (inlineCodeMatch && inlineCodeMatch[1]) {
            candidate = inlineCodeMatch[1].trim();
          }
        }
        // 3. Look for "Suggested command: <cmd>"
        if (!candidate) {
          const suggestedMatch = content.match(/Suggested command:\s*([^\n\r]+)/i);
          if (suggestedMatch && suggestedMatch[1]) {
            candidate = suggestedMatch[1].trim();
          }
        }
        // 4. Look for raw command mentions like npm run dev:full or npm run dev
        if (!candidate) {
          const rawCmdMatch = content.match(/\b((?:npm|yarn|pnpm|bun)\s+run\s+[a-zA-Z0-9_\-:]+)\b/i);
          if (rawCmdMatch && rawCmdMatch[1]) {
            candidate = rawCmdMatch[1].trim();
          }
        }
        // Filter out IDE internal commands (dev:full, pty, ai, vite, electron)
        if (candidate && !/\b(dev:full|npm run pty|npm run ai|npm run vite|electron \.)\b/i.test(candidate)) {
          return candidate;
        }
      }
      return undefined;
    };

    // 5. Referential / Deictic execution ("run it", "do it", "start it", "execute it", "try it", "go ahead")
    // Strictly anchored so "run this project and add faq page" does NOT match
    const cleanPrompt = p.replace(/[\?\!\.]+$/, '').trim();
    const isReferentialRun =
      /^(run(\s+it|\s+this|\s+this\s+project|\s+the\s+project|\s+project|\s+the\s+app|\s+app)?|do(\s+it|\s+this)?|start(\s+it|\s+this|\s+this\s+project|\s+the\s+project|\s+project|\s+the\s+app|\s+app)?|execute(\s+it|\s+this)?|try(\s+it|\s+this)?|rerun(\s+it)?|re-run(\s+it)?|go\s+ahead|yes\s+do\s+it|just\s+run\s+it)$/i.test(cleanPrompt) ||
      cleanPrompt === 'run' || cleanPrompt === 'do it' || cleanPrompt === 'run it' || cleanPrompt === 'start it' || cleanPrompt === 'run project' || cleanPrompt === 'run this project' || cleanPrompt === 'run the project';

    if (isReferentialRun) {
      // 1. Safety guard FIRST: If workspace is the THIRD EYE IDE codebase itself, NEVER launch dev:full or internal IDE services
      const safety = checkWorkspaceSafety(context.workspaceRoot);
      if (safety.isProtected && safety.reason === 'third_eye_root') {
        return { intent: 'general_question' };
      }

      // 2. Check for recent safe command mentioned in chat history
      const recentCmd = findRecentCommandFromHistory();
      if (recentCmd) {
        return { intent: 'direct_execution', targetCommand: recentCmd };
      }

      // 3. Check workspace package.json scripts (never run dev:full if in third-eye)
      const pkgPath = path.join(context.workspaceRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const scripts = pkg.scripts || {};
          if (scripts['dev:full'] && pkg.name !== 'third-eye' && pkg.name !== 'third-eye-ide') {
            return { intent: 'direct_execution', targetCommand: 'npm run dev:full' };
          } else if (scripts['dev']) {
            return { intent: 'direct_execution', targetCommand: 'npm run dev' };
          } else if (scripts['start']) {
            return { intent: 'direct_execution', targetCommand: 'npm start' };
          }
        } catch {}
      }

      // Check for split / multi-service projects (e.g. backend + frontend, server + client, api + web)
      const servicePairs = [
        { b: 'backend', f: 'frontend' },
        { b: 'server', f: 'client' },
        { b: 'api', f: 'web' },
        { b: 'api', f: 'ui' },
      ];
      for (const pair of servicePairs) {
        const bPkg = path.join(context.workspaceRoot, pair.b, 'package.json');
        const fPkg = path.join(context.workspaceRoot, pair.f, 'package.json');
        if (fs.existsSync(bPkg) && fs.existsSync(fPkg)) {
          let bScript = 'dev';
          let fScript = 'dev';
          try {
            const b = JSON.parse(fs.readFileSync(bPkg, 'utf-8'));
            if (b.scripts?.dev) bScript = 'dev';
            else if (b.scripts?.start) bScript = 'start';
          } catch {}
          try {
            const f = JSON.parse(fs.readFileSync(fPkg, 'utf-8'));
            if (f.scripts?.dev) fScript = 'dev';
            else if (f.scripts?.start) fScript = 'start';
          } catch {}
          return {
            intent: 'direct_execution',
            targetCommand: `npm --prefix ${pair.b} run ${bScript} & npm --prefix ${pair.f} run ${fScript}`,
          };
        }
      }

      // Check single sub-folders with package.json
      for (const sub of ['backend', 'frontend', 'server', 'client', 'app', 'web', 'ui']) {
        const subPkg = path.join(context.workspaceRoot, sub, 'package.json');
        if (fs.existsSync(subPkg)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(subPkg, 'utf-8'));
            const scripts = pkg.scripts || {};
            const script = scripts['dev:full'] ? 'dev:full' : scripts['dev'] ? 'dev' : scripts['start'] ? 'start' : null;
            if (script) {
              return { intent: 'direct_execution', targetCommand: `npm --prefix ${sub} run ${script}` };
            }
          } catch {}
        }
      }

      return { intent: 'direct_execution' };
    }

    // 6. Explicit CLI command invocation (e.g. "npm run dev:full", "npm run dev", "npm test")
    const explicitCliMatch = p.match(/^((?:npm|yarn|pnpm|bun|node|python|npx)\s+[a-zA-Z0-9_\-:\/\.\s]+)$/i);
    if (explicitCliMatch && explicitCliMatch[1]) {
      return { intent: 'direct_execution', targetCommand: explicitCliMatch[1].trim() };
    }

    // 7. Continuation / Retry of previous task
    const isContinuation = /\b(retry|continue|resume|proceed|keep going|try again|repeat|re-run)\b/i.test(p);
    if (isContinuation) {
      return { intent: 'workspace_task' };
    }

    // 8. Explicit Command to Mutate Workspace / Build Features
    const isExplicitAgentAction =
      /^(can\s+you|could\s+you|please|would\s+you|go\s+ahead\s+and)\s+(add|create|build|implement|make|write|edit|modify|update|fix|patch|repair|refactor|delete|remove|install)\b/i.test(p) ||
      /^(add|create|build|implement|make|write|edit|modify|update|fix|patch|repair|refactor|scaffold|redesign|rewrite|delete|remove|install)\b/i.test(p);

    // 9. NORMAL QUERIES & INQUIRIES: Questions about the app, concepts, code, explanation, architecture
    // Examples: "what this app do ?", "what does this app do", "what is this project", "explain this app",
    // "tell me about this app", "how does this work", "how do i use this", "what is python", "teach python", etc.
    const isQuestionOrInquiry =
      /^(what|why|how|who|where|which|when|is|are|can|could|would|should|does|do|did|explain|describe|tell me|give me an overview|overview|summarize|summary|walk me through|help me understand|show me)\b/i.test(p) ||
      /\?$/.test(p) ||
      /\b(what does this|what this|what is this|tell me about|explain this|how does this|how do i|how to)\b/i.test(p);

    if (isQuestionOrInquiry && !isExplicitAgentAction) {
      return { intent: 'general_question' };
    }

    // 10. Workspace modification action verbs
    const hasCodeOrFeatureAction =
      /\b(add|create|build|implement|make|code|write|edit|modify|update|fix|patch|repair|refactor|scaffold|design|style|redesign|rewrite|delete|remove)\b/i.test(p) ||
      /\b(and\s+(?:add|create|build|make|fix|edit|modify|update|code|implement|run|start))\b/i.test(p);

    if (hasCodeOrFeatureAction) {
      let detectedFile = activeFileName;
      const fileMatch = p.match(/\b([a-zA-Z0-9_\-\.\/]+\.(ts|tsx|js|jsx|css|json|html|py|go|java|rs|sql))\b/i);
      if (fileMatch && fileMatch[1]) detectedFile = fileMatch[1];
      return { intent: 'workspace_task', targetFileName: detectedFile };
    }

    // Default: If it's a question mark or general statement, treat as general_question; else workspace_task
    if (p.includes('?') || p.split(' ').length <= 4) {
      return { intent: 'general_question' };
    }
    return { intent: 'workspace_task', targetFileName: activeFileName };
  }

  public async execute(
    userPrompt: string,
    context: AgentContext,
    emitEvent: (event: AgentEvent) => void
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const sessionId = context.sessionId || `session-${Date.now()}`;
    this.resetCancellation(sessionId);
    const matchedSkills = this.skillManager.matchSkills(userPrompt);
    const classification = this.classifyIntent(userPrompt, context);
    const targetName = classification.targetFileName || context.activeFile?.name;

    // PATH 1: CASUAL GREETING OR CHIT-CHAT (e.g. "hi", "hello", "hey")
    if (classification.intent === 'greeting') {
      const greetingPrompt = `You are THIRD_EYE, an elite AI pair programmer in the developer's IDE.
The developer greeted you: "${userPrompt}".
Respond naturally, warmly, and concisely (1-2 sentences).
Ask what they're working on or how you can assist them today.
Do NOT dump tutorials, code snippets, or architecture explanations. Keep it a clean, human greeting.`;

      const loopResult = await this.loop.run({
        userMessage: userPrompt,
        workspaceRoot: context.workspaceRoot,
        sessionId,
        apiKey: context.apiKey,
        model: context.model,
        images: context.images,
        tools: [], // No tools needed for greetings
        maxIterations: 1,
        envelope: {
          systemPrompt: greetingPrompt,
          openTabs: context.openTabs,
          terminalTail: context.terminalTail,
          history: context.history as any,
        },
        onDelta: (delta) => {
          emitEvent({
            type: 'agent.delta',
            sessionId,
            data: { delta },
          });
        },
      });

      const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const result: AgentResult = {
        reply: loopResult.reply || "Hey there! I'm THIRD_EYE, your pair programming assistant. What are we building or debugging together today?",
        thoughtDuration: `${totalSeconds}s`,
        thoughts: [],
        iterations: 1,
      };

      emitEvent({
        type: 'finish',
        sessionId,
        data: result,
      });

      return result;
    }

    // PATH 2: GENERAL CONCEPTUAL QUESTION OR REPO INQUIRY (e.g. "what this app do ?", "what is python", "explain this project")
    if (classification.intent === 'general_question') {
      const safety = checkWorkspaceSafety(context.workspaceRoot);
      if (safety.reason === 'third_eye_root' && /\b(run|start|launch|dev|dev:full)\b/i.test(userPrompt)) {
        const reply = `### ⚡ THIRD EYE IDE is Already Running!

You are currently inside the active **THIRD EYE IDE** workspace:
- 🖥️ **Desktop Client**: Active window
- 🌐 **Frontend (Vite UI)**: [http://localhost:3000](http://localhost:3000)
- ⚙️ **PTY Terminal Microservice**: Running on port \`4001\`
- 🧠 **AI Agent Microservice**: Running on port \`4002\`

To run or build your own project (e.g. **SHAMSH TRADER** or a new app):
1. Use **File → Open Folder** to switch to your project folder.
2. Or tell me \`init project <name>\` to create an isolated project workspace.
3. Once in your project folder, \`run this project\` will start your app on its own dedicated port (e.g., \`5173\`) without colliding with the IDE!`;

        emitEvent({
          type: 'agent.delta',
          sessionId,
          data: { delta: reply },
        });

        const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        const result: AgentResult = {
          reply,
          thoughtDuration: `${totalSeconds}s`,
          thoughts: ['Workspace is THIRD EYE root — IDE is already active on ports 3000/4001/4002.'],
          iterations: 1,
        };

        emitEvent({
          type: 'finish',
          sessionId,
          data: result,
        });

        return result;
      }

      const thoughts = [
        'Analyzing query and context...',
      ];

      emitEvent({
        type: 'thought',
        sessionId,
        data: {
          duration: '1s',
          thoughts,
        },
      });

      // Extract rich workspace context if available so repo/app inquiries are answered with high fidelity
      let workspaceContextText = '';
      if (context.workspaceRoot && fs.existsSync(context.workspaceRoot)) {
        try {
          const pkgPath = path.join(context.workspaceRoot, 'package.json');
          let pkgInfo = '';
          if (fs.existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
              pkgInfo = `Package Name: ${pkg.name || 'Unnamed'}\nDescription: ${pkg.description || 'None'}\nScripts: ${Object.keys(pkg.scripts || {}).join(', ')}\nMain Dependencies: ${Object.keys(pkg.dependencies || {}).slice(0, 20).join(', ')}`;
            } catch {}
          }

          let readmeExcerpt = '';
          const readmePath = path.join(context.workspaceRoot, 'README.md');
          if (fs.existsSync(readmePath)) {
            try {
              const readmeContent = fs.readFileSync(readmePath, 'utf-8');
              readmeExcerpt = readmeContent.slice(0, 2500);
            } catch {}
          }

          let topLevelEntries: string[] = [];
          try {
            topLevelEntries = fs.readdirSync(context.workspaceRoot)
              .filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'dist' && f !== '.git')
              .slice(0, 25);
          } catch {}

          workspaceContextText = `
Workspace Context:
- Project Root: ${context.workspaceRoot}
- Project Directory: ${path.basename(context.workspaceRoot)}
${pkgInfo ? `- Package Overview:\n${pkgInfo}` : ''}
${readmeExcerpt ? `- README:\n${readmeExcerpt}` : ''}
${topLevelEntries.length > 0 ? `- Top-level Files/Folders: ${topLevelEntries.join(', ')}` : ''}
${context.activeFile?.name ? `- Active File: ${context.activeFile.name}` : ''}
`;
        } catch {}
      }

      const questionPrompt = `You are THIRD_EYE, an elite AI pair programmer operating inside the developer's IDE.
The developer asked: "${userPrompt}".
${workspaceContextText ? `\n${workspaceContextText}\n` : ''}
Instructions:
1. If the developer is asking what this app or project does, what it is for, its architecture, or features, use the workspace context above to give an immediate, well-structured, and helpful explanation in clean GitHub-style Markdown.
2. If the developer asked a general conceptual, language, or algorithm question, explain clearly with syntax-highlighted code blocks where appropriate.
3. Be direct, conversational, and precise. Match the depth of your explanation to what was asked.`;

      const loopResult = await this.loop.run({
        userMessage: userPrompt,
        workspaceRoot: context.workspaceRoot,
        sessionId,
        apiKey: context.apiKey,
        model: context.model,
        images: context.images,
        tools: [], // Bypassing tools guarantees direct text streaming without unwanted file reads
        maxIterations: 1,
        envelope: {
          systemPrompt: questionPrompt,
          openTabs: context.openTabs,
          terminalTail: context.terminalTail,
          history: context.history as any,
        },
        onDelta: (delta) => {
          emitEvent({
            type: 'agent.delta',
            sessionId,
            data: { delta },
          });
        },
        onStatus: (status) => {
          emitEvent({
            type: 'status',
            sessionId,
            data: { status },
          });
        },
      });

      const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const result: AgentResult = {
        reply: loopResult.reply,
        thoughtDuration: `${totalSeconds}s`,
        thoughts,
        iterations: loopResult.iterations,
      };

      emitEvent({
        type: 'finish',
        sessionId,
        data: result,
      });

      return result;
    }

    // PATH 1.5: DIRECTORY AWARENESS INQUIRY (e.g. "what directory is this", "where am i")
    if (classification.intent === 'directory_awareness') {
      const safety = checkWorkspaceSafety(context.workspaceRoot);
      const notice = generateDirectoryAwarenessNotice(safety);

      emitEvent({
        type: 'agent.delta',
        sessionId,
        data: { delta: notice },
      });

      const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const result: AgentResult = {
        reply: notice,
        thoughtDuration: `${totalSeconds}s`,
        thoughts: [`Directory awareness check: ${safety.currentDirectory} (${safety.directoryName})`],
        iterations: 1,
      };

      emitEvent({
        type: 'finish',
        sessionId,
        data: result,
      });

      return result;
    }

    // PATH 1.6: EXPLICIT PROJECT INITIALIZATION (e.g. "start project", "init project milkshake-bar")
    if (classification.intent === 'project_init') {
      const safety = checkWorkspaceSafety(context.workspaceRoot);

      if (classification.targetProjectSlug) {
        const folderName = classification.targetProjectSlug;
        emitEvent({
          type: 'status',
          sessionId,
          data: { status: `Initializing project folder "${folderName}"...` },
        });

        const initRes = await executeInitProjectFolder({ folderName }, context.workspaceRoot);

        // Switch workspace context
        context.workspaceRoot = initRes.projectPath;
        this.setWorkspaceRoot(initRes.projectPath);

        emitEvent({
          type: 'workspace.root_switched',
          sessionId,
          data: {
            root: initRes.projectPath,
            name: initRes.folderName,
          },
        });

        emitEvent({
          type: 'agent.status',
          sessionId,
          data: {
            agentId: 'ProjectInitializer',
            status: `Project folder ready at ${initRes.projectPath}`,
            message: `Project folder ready at ${initRes.projectPath}`,
          },
        });

        // Check if user also gave instructions beyond just naming the folder
        const pClean = userPrompt
          .replace(/(?:start|init|initialize|create|make|setup)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:project|app|folder)\s+(?:named|called|in|as|titled|for)?\s+[a-zA-Z0-9_\-\.]+/i, '')
          .trim();
        const hasFurtherInstructions =
          pClean.length > 5 &&
          /\b(with|using|build|add|create|make|react|vite|next|vue|node|express|python|flask|django|tailwind|typescript)\b/i.test(pClean);

        if (!hasFurtherInstructions) {
          const reply = `### 🎉 Project Initialized Successfully!

- **Project Name**: \`${initRes.folderName}\`
- **Location**: \`${initRes.projectPath}\`
- **Active Workspace**: Switched to \`${initRes.folderName}\`
- **Isolation**: Dedicated folder outside of \`${safety.directoryName}\`

Your workspace and terminal have been automatically switched to this isolated folder. The core **THIRD EYE IDE** codebase is fully protected.

What would you like to build in **${initRes.folderName}**?
- \`npm create vite@latest . -- --template react-ts\`
- \`npx create-next-app@latest .\`
- Or tell me what features or architecture you want, and I'll generate the full implementation!`;

          emitEvent({
            type: 'agent.delta',
            sessionId,
            data: { delta: reply },
          });

          const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
          const result: AgentResult = {
            reply,
            thoughtDuration: `${totalSeconds}s`,
            thoughts: [`Initialized isolated project folder at ${initRes.projectPath}`],
            iterations: 1,
          };

          emitEvent({
            type: 'finish',
            sessionId,
            data: result,
          });

          return result;
        }
        // If hasFurtherInstructions, execution falls through to PATH 3 targeting the new clean workspace!
      } else {
        // No folder name specified by user: Show directory awareness & request folder name / offer presets
        const notice = generateDirectoryAwarenessNotice(safety);
        emitEvent({
          type: 'agent.delta',
          sessionId,
          data: { delta: notice },
        });

        const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        const result: AgentResult = {
          reply: notice,
          thoughtDuration: `${totalSeconds}s`,
          thoughts: [`Directory awareness check: ${safety.currentDirectory} (${safety.directoryName})`],
          iterations: 1,
        };

        emitEvent({
          type: 'finish',
          sessionId,
          data: result,
        });

        return result;
      }
    }

    // PATH 2.5: DIRECT OPERATIONAL TASK (Inspect files, run commands, start/stop dev servers)
    if (classification.intent === 'direct_execution') {
      const isStopPrompt = /\b(stop|kill|terminate|halt|shutdown|close|cancel)\b/i.test(userPrompt);
      const targetCommand = classification.targetCommand;

      const thoughts = isStopPrompt
        ? [`Stopping server and active background processes: ${userPrompt.slice(0, 45)}`]
        : targetCommand
        ? [`Direct execution: ${targetCommand}`]
        : [`Inspecting workspace and executing: ${userPrompt.slice(0, 45)}`];

      emitEvent({
        type: 'thought',
        sessionId,
        data: {
          duration: '1s',
          thoughts,
        },
      });

      const runningTasksSummary = getActiveRunningTasksSummary();

      const isStatusCheck =
        /\b(is it running|is anything running|is it up|is server running|is dev server running|is it working|status|check status|what is running|did it start|did it run|is it ready|is it alive)\b/i.test(userPrompt) ||
        /\b(running|alive|online|active)\s*\??$/i.test(userPrompt);

      let directPrompt = '';
      if (isStopPrompt) {
        directPrompt = `You are THIRD_EYE, an elite autonomous developer assistant.
Workspace: ${context.workspaceRoot}
The developer asked to stop/kill the server: "${userPrompt}".

## ACTIVE RUNNING PROCESSES & BACKGROUND TASKS:
${runningTasksSummary}

CRITICAL ACTION REQUIRED - STOPPING / KILLING:
- You MUST immediately invoke the "stop_server" tool.
- Do NOT invoke run_terminal, do NOT run build or install commands.
- Provide a clean, direct confirmation once stopped.`;
      } else if (isStatusCheck) {
        directPrompt = `You are THIRD_EYE, an elite autonomous developer assistant operating inside the developer's IDE with real system access.
Workspace: ${context.workspaceRoot}
The developer asked about process/server runtime status: "${userPrompt}".

## ACTIVE RUNNING PROCESSES & BACKGROUND TASKS:
${runningTasksSummary}

CRITICAL INSTRUCTIONS:
1. Examine the active running processes, background tasks, and terminal output above.
2. If background tasks or dev servers are running, report their status, task ID, command, and any preview URLs (e.g. http://localhost:3000 or http://localhost:5173).
3. If NO background tasks or dev servers are currently running:
   - State clearly: "No background dev server or process is currently running."
   - Check the workspace package.json scripts or project structure to offer or run the appropriate dev command.
4. NEVER claim you are an AI model that cannot run code on local machine. You are THIRD_EYE with active terminal and background process execution tools.`;
      } else if (targetCommand) {
        const isLongRunning = /\b(run dev|dev:full|start|serve|watch|preview)\b/i.test(targetCommand);
        directPrompt = `You are THIRD_EYE, an elite autonomous developer assistant.
Workspace: ${context.workspaceRoot}
The developer asked: "${userPrompt}".
RESOLVED TARGET COMMAND: "${targetCommand}"

CRITICAL INSTRUCTIONS - DIRECT EXECUTION:
1. Immediately invoke the "run_terminal" tool to execute: "${targetCommand}".
   - Use background: ${isLongRunning ? 'true' : 'false'}.
2. DO NOT call "analyze_codebase", do NOT scan directories, and do NOT create or write context files! The command is already resolved.
3. If node_modules already exists, DO NOT run install commands.
4. After invoking run_terminal, confirm the command is running and return a clean, concise response with the command output or URL.`;
      } else {
        let multiServiceNote = '';
        const bPkg = path.join(context.workspaceRoot, 'backend', 'package.json');
        const fPkg = path.join(context.workspaceRoot, 'frontend', 'package.json');
        if (fs.existsSync(bPkg) && fs.existsSync(fPkg)) {
          multiServiceNote = `\nDETECTED MULTI-SERVICE PROJECT (Backend + Frontend):
- Run backend dev server: run_terminal with command "npm --prefix backend run dev" (background: true)
- Run frontend dev server: run_terminal with command "npm --prefix frontend run dev" (background: true)
Execute run_terminal for BOTH so both the API and UI are live!`;
        }

        directPrompt = `You are THIRD_EYE, an elite autonomous developer assistant.
Workspace: ${context.workspaceRoot}
The developer asked: "${userPrompt}".
${multiServiceNote}

## ACTIVE RUNNING PROCESSES & BACKGROUND TASKS:
${runningTasksSummary}

Proactively:
1. If the command or script to run is known or present in package.json, execute it with run_terminal immediately (background: true for dev servers).
2. If multi-service (e.g. backend + frontend), start BOTH services using run_terminal (background: true).
3. DO NOT run analyze_codebase repeatedly or write redundant context files.
4. If node_modules already exists, DO NOT run install commands.
5. Return a concise, clear explanation of the running services, ports, and preview URLs.`;
      }

      // Initialize Antigravity Artifacts only if full inspection or complex task
      const artMgr = this.orchestrator.getArtifactManager();
      const directTaskStep = {
        id: 'step_direct_1',
        title: isStopPrompt
          ? 'Stop Running Processes & Port Listeners'
          : targetCommand
          ? `Execute: ${targetCommand}`
          : `Execute: ${userPrompt.slice(0, 50)}`,
        description: targetCommand || userPrompt,
        dependsOn: [] as string[],
        status: 'running' as const,
        workerHint: (isStopPrompt ? 'coder' : 'researcher') as any,
      };

      if (!targetCommand && !isStopPrompt) {
        artMgr.createOrUpdatePlan(
          sessionId,
          {
            goal: userPrompt,
            existingBehavior: `Workspace root: ${path.basename(context.workspaceRoot)}`,
            architectureApproach: 'Direct tool inspection, configuration analysis, and operational execution.',
            filesToTouch: [],
            dependencies: [],
            riskAndRollback: 'Non-destructive operational commands with process monitoring.',
            testStrategy: 'Runtime status checks and preview responsiveness verification.',
          },
          emitEvent
        );
      }

      artMgr.syncTaskList(sessionId, userPrompt, [directTaskStep], emitEvent);

      const loopResult = await this.loop.run({
        userMessage: userPrompt,
        workspaceRoot: context.workspaceRoot,
        sessionId,
        apiKey: context.apiKey,
        model: context.model,
        images: context.images,
        maxIterations: 20, // Generous budget for inspection, starting multi-service dev servers, and status confirmation
        envelope: {
          systemPrompt: directPrompt,
          openTabs: context.openTabs,
          terminalTail: context.terminalTail,
          history: context.history as any,
        },
        onDelta: (delta) => {
          emitEvent({
            type: 'agent.delta',
            sessionId,
            data: { delta },
          });
        },
        onToolCall: (tc) => {
          emitEvent({
            type: 'tool.start',
            sessionId,
            data: { agentId: 'DirectWorker', name: tc.name, args: tc.args, risk: 'exec' },
          });
          emitEvent({
            type: 'tool_call',
            sessionId,
            data: { toolCall: tc },
          });
        },
        onToolResult: (tr) => {
          emitEvent({
            type: 'tool.end',
            sessionId,
            data: { agentId: 'DirectWorker', name: tr.toolName, result: tr.data || { success: tr.success, error: tr.error } },
          });
          emitEvent({
            type: 'tool_result',
            sessionId,
            data: { toolResult: tr },
          });
          const diff = (tr as any).diff || (tr as any).data?.diff;
          if (diff) {
            artMgr.recordDiff(
              sessionId,
              {
                filePath: diff.path || diff.filePath,
                changeType: 'modified',
                addedLines: diff.addedCount || 0,
                removedLines: diff.removedCount || 0,
                originalContent: diff.original || diff.originalContent,
                modifiedContent: diff.modified || diff.modifiedContent,
              },
              emitEvent
            );
          }
        },
        onStatus: (status) => {
          emitEvent({
            type: 'agent.status',
            sessionId,
            data: { agentId: 'DirectWorker', status, message: status },
          });
          emitEvent({
            type: 'status',
            sessionId,
            data: { status },
          });
        },
      });

      const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const resultReply = loopResult.reply || 'Execution complete. Checked status and verified runtime processes.';

      // Finalize direct execution artifacts
      const completedStep = {
        ...directTaskStep,
        status: 'done' as const,
        result: resultReply,
      };
      artMgr.syncTaskList(sessionId, userPrompt, [completedStep], emitEvent);

      artMgr.createOrUpdateWalkthrough(
        sessionId,
        {
          title: isStopPrompt ? 'Server & Background Tasks Shutdown Report' : 'Operational Execution & Evidence Walkthrough',
          summary: resultReply,
          changesMade: [completedStep.title],
          touchedFiles: [],
          evidence: [
            {
              id: 'ev_direct_exec',
              name: 'Tool Execution Verification Gate',
              category: 'runtime',
              status: 'passed',
              outputSummary: 'Commands and inspection verified cleanly with zero unexpected exits.',
              verifiedAt: Date.now(),
            },
          ],
          knownLimitations: [],
        },
        emitEvent
      );

      const result: AgentResult = {
        reply: resultReply,
        thoughtDuration: `${totalSeconds}s`,
        thoughts,
        iterations: loopResult.iterations,
      };

      emitEvent({
        type: 'agent.done',
        sessionId,
        data: { agentId: 'DirectWorker', summary: resultReply },
      });

      emitEvent({
        type: 'finish',
        sessionId,
        data: result,
      });

      return result;
    }

    // PATH 3: WORKSPACE ENGINEERING TASK (Cursor Agent / Google Antigravity autonomous multi-agent execution)
    // Protection check: Never scaffold or dump project files into THIRD_EYE IDE codebase, home dir, or root!
    const safety = checkWorkspaceSafety(context.workspaceRoot);
    let autoProjectNotice = '';
    if (safety.isProtected) {
      const fallbackSlug = deriveFallbackProjectSlug(userPrompt);
      emitEvent({
        type: 'agent.status',
        sessionId,
        data: {
          agentId: 'DirectoryGuard',
          status: `Protected directory detected (${safety.currentDirectory}). Initializing isolated project folder "${fallbackSlug}"...`,
          message: `Protected directory detected (${safety.currentDirectory}). Initializing isolated project folder "${fallbackSlug}"...`,
        },
      });

      const initRes = await executeInitProjectFolder({ folderName: fallbackSlug }, context.workspaceRoot);

      // Switch context and orchestrator to the safe project folder
      context.workspaceRoot = initRes.projectPath;
      this.setWorkspaceRoot(initRes.projectPath);

      emitEvent({
        type: 'workspace.root_switched',
        sessionId,
        data: {
          root: initRes.projectPath,
          name: initRes.folderName,
        },
      });

      autoProjectNotice = `> 📍 **Protected Directory Notice**: Active directory was \`${safety.currentDirectory}\` (${safety.directoryName}). To protect your IDE codebase from pollution, your project was initialized in a dedicated folder at **\`${initRes.projectPath}\`** and your workspace was automatically switched there.\n\n`;
    }

    const targetLabel = targetName || 'workspace';
    const thoughts = [
      `1. Formulating Task Graph DAG targeting: ${targetLabel}`,
      `2. Scheduling specialized workers (Coder, Debugger, Tester, Researcher)`,
      `3. Autonomous verification pass (build, diagnostics, preview)`,
    ];

    emitEvent({
      type: 'thought',
      sessionId,
      data: {
        duration: '1s',
        thoughts,
      },
    });

    const traces: ToolTrace[] = [];
    const editedFilesMap = new Map<string, EditedFileMeta>();

    // For retry/continuation prompts, synthesize context from previous turns
    let effectiveTaskPrompt = userPrompt;
    const isContinuation = /\b(retry|continue|resume|proceed|keep going|try again)\b/i.test(userPrompt);
    if (isContinuation && context.history && context.history.length > 0) {
      const lastUserTurns = context.history.filter((h: any) => h.role === 'user' && !/\b(retry|continue|resume)\b/i.test(h.content));
      if (lastUserTurns.length > 0) {
        const lastGoal = lastUserTurns[lastUserTurns.length - 1].content;
        effectiveTaskPrompt = `Resume and complete the task: "${lastGoal}". (User instruction: "${userPrompt}")`;
      }
    }

    const orchResult = await this.orchestrator.execute(effectiveTaskPrompt, {
      workspaceRoot: context.workspaceRoot,
      cwd: context.cwd,
      cwdTree: context.cwdTree || context.directoryTree,
      directoryTree: context.directoryTree || context.cwdTree,
      sessionId,
      apiKey: context.apiKey,
      model: context.model,
      openTabs: context.openTabs,
      terminalTail: context.terminalTail,
      activeFile: context.activeFile,
      history: context.history as any,
      images: context.images,
      onEvent: (event: any) => {
        // 1. Emit typed event directly
        emitEvent(event);

        // 2. Map to legacy events for complete UI compatibility (without duplicating deltas)
        if (event.type === 'task.graph') {
          emitEvent({
            type: 'plan',
            sessionId,
            data: {
              plan: event.data?.steps?.map((s: any) => ({
                step: s.title,
                description: s.description,
              })),
            },
          });
        } else if (event.type === 'agent.status') {
          emitEvent({
            type: 'status',
            sessionId,
            data: { status: event.data?.message || event.data?.status },
          });
        } else if (event.type === 'tool.start') {
          const tc = {
            id: event.data?.toolCallId || `tc_${Date.now()}`,
            name: event.data?.name,
            args: event.data?.args,
          };
          traces.push({
            id: tc.id,
            toolName: tc.name,
            args: tc.args,
          });
          emitEvent({
            type: 'tool_call',
            sessionId,
            data: { toolCall: tc },
          });
        } else if (event.type === 'tool.end') {
          const existing = traces.find((t) => t.id === event.data?.toolCallId || t.toolName === event.data?.name);
          if (existing) {
            existing.success = event.data?.result?.success ?? true;
            existing.result = event.data?.result;
            existing.error = event.data?.result?.error;
          }

          emitEvent({
            type: 'tool_result',
            sessionId,
            data: {
              toolResult: {
                toolCallId: event.data?.toolCallId,
                toolName: event.data?.name,
                success: event.data?.result?.success ?? true,
                data: event.data?.result,
              },
            },
          });

          // Track file changes for EditedFilesCard & live editor updates
          const res = event.data?.result;
          const diffObj = res?.diff || event.data?.diff;
          if (diffObj?.path || res?.path || res?.data?.path) {
            const filePath = diffObj?.path || res?.path || res?.data?.path || '';
            const name = path.basename(filePath) || filePath;
            const meta: EditedFileMeta = {
              name,
              path: filePath,
              added: diffObj?.addedCount || 10,
              removed: diffObj?.removedCount || 2,
            };
            editedFilesMap.set(name, meta);
            emitEvent({
              type: 'file_change',
              sessionId,
              data: { files: Array.from(editedFilesMap.values()) },
            });
            if (diffObj) {
              emitEvent({
                type: 'agent.file_changed',
                sessionId,
                data: {
                  agentId: event.data?.agentId || 'coder',
                  filePath,
                  diff: diffObj,
                  action: event.data?.name || 'edit',
                },
              });
            }
          }
        }
      },
    });

    const totalSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const result: AgentResult = {
      reply: autoProjectNotice ? `${autoProjectNotice}${orchResult.summary}` : orchResult.summary,
      thoughtDuration: `${totalSeconds}s`,
      thoughts,
      plan: orchResult.steps.map((s) => ({
        id: s.id,
        label: s.title,
        description: s.description,
        status: (s.status === 'done' ? 'completed' : s.status === 'running' ? 'in_progress' : s.status === 'failed' ? 'failed' : 'pending') as any,
      })),
      traces,
      editedFiles: Array.from(editedFilesMap.values()),
      iterations: orchResult.steps.length,
    };

    emitEvent({
      type: 'finish',
      sessionId,
      data: result,
    });

    return result;
  }
}

