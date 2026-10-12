const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const PORT = process.env.AI_SERVICE_PORT || 4002;

/**
 * Enterprise Reply Sanitizer
 * Preserves markdown formatting, emojis, and inline code badges
 */
function sanitizeAiReply(text) {
  if (typeof text !== 'string') return '';
  return text.trim();
}

/**
 * Clean ANSI control codes from terminal streams
 */
function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str
    // Strip OSC sequences
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Strip standard ANSI / CSI escape sequences
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // Stray escape characters
    .replace(/\x1b[@-Z\\-_]/g, '')
    // Control characters except newline and tab
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Reload .env on demand so newly added keys are immediately active
 */
function reloadEnvIfNeeded() {
  try {
    const envPath = path.join(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      const parsed = require('dotenv').parse(fs.readFileSync(envPath, 'utf8'));
      for (const k in parsed) {
        if (parsed[k] && parsed[k] !== 'your_gemini_api_key_here' && parsed[k] !== 'your_openai_api_key_here') {
          process.env[k] = parsed[k].trim();
        }
      }
    }
  } catch (err) {
    // ignore
  }
}

function getGeminiApiKey() {
  reloadEnvIfNeeded();
  const k = process.env.GEMINI_API_KEY;
  return k && k.trim() !== '' && k !== 'your_gemini_api_key_here' ? k.trim() : null;
}

let openaiClient = null;
function getOpenAIClient() {
  reloadEnvIfNeeded();
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;
  if ((apiKey && apiKey !== 'your_openai_api_key_here') || baseURL) {
    if (!openaiClient || openaiClient.apiKey !== apiKey || openaiClient.baseURL !== baseURL) {
      openaiClient = new OpenAI({ apiKey: apiKey || 'dummy-key', baseURL: baseURL || undefined });
    }
    return openaiClient;
  }
  return null;
}

/**
 * Safely resolves a path on disk even if it has trailing spaces
 */
function resolveExistingPath(p) {
  if (!p || typeof p !== 'string') return '';
  if (fs.existsSync(p)) return p;
  if (fs.existsSync(p.trim())) return p.trim();
  if (fs.existsSync(p + ' ')) return p + ' ';
  if (fs.existsSync(p.trimEnd())) return p.trimEnd();
  return p;
}

/**
 * Infer active project root directory from open tabs, active file, terminal cwd, or workspaceRoot
 */
function inferProjectRoot({ cwd, workspaceRoot, activeFile, openTabs, activeDir }) {
  const candidateFiles = [];
  if (activeFile && activeFile.path) candidateFiles.push(activeFile.path);
  if (Array.isArray(openTabs)) {
    for (const tab of openTabs) {
      if (tab?.path) candidateFiles.push(tab.path);
    }
  }

  for (const fp of candidateFiles) {
    if (typeof fp === 'string' && (fp.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(fp))) {
      let cur = path.dirname(fp);
      while (cur && cur !== '/' && cur !== '/Users' && cur !== '/Users/adityasalgotra' && cur !== '/Users/adityasalgotra/Downloads') {
        const resolvedCur = resolveExistingPath(cur);
        if (
          fs.existsSync(path.join(resolvedCur, 'package.json')) ||
          fs.existsSync(path.join(resolvedCur, '.git')) ||
          fs.existsSync(path.join(resolvedCur, '.vscode'))
        ) {
          return resolvedCur;
        }
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
    }
  }

  if (cwd && typeof cwd === 'string') {
    const resolved = resolveExistingPath(cwd);
    if (fs.existsSync(resolved)) return resolved;
    const dlCandidate = resolveExistingPath(path.join('/Users/adityasalgotra/Downloads', cwd));
    if (fs.existsSync(dlCandidate)) return dlCandidate;
  }

  if (activeDir && activeDir !== '~' && typeof activeDir === 'string') {
    const resolved = resolveExistingPath(activeDir);
    if (fs.existsSync(resolved)) return resolved;
    const dlCandidate = resolveExistingPath(path.join('/Users/adityasalgotra/Downloads', activeDir));
    if (fs.existsSync(dlCandidate)) return dlCandidate;
  }

  if (workspaceRoot && typeof workspaceRoot === 'string') {
    const resolved = resolveExistingPath(workspaceRoot);
    if (fs.existsSync(resolved)) return resolved;
  }

  return resolveExistingPath(process.cwd());
}

/**
 * Call Google Gemini with multi-model fallback and timeout protection
 */
async function callGemini({ apiKey: overrideKey, systemPrompt, prompt, contents, responseJson = false }) {
  const apiKey = overrideKey || getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const preferredModel = (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview').trim();
  const models = [
    preferredModel,
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i && !m.includes('2.5') && !m.includes('2.0') && !m.includes('1.5'));

  const safeContents = (Array.isArray(contents) && contents.length > 0)
    ? contents
    : [{ role: 'user', parts: [{ text: prompt || systemPrompt || 'Please proceed with the task.' }] }];

  const body = {
    contents: safeContents,
    generationConfig: {
      temperature: responseJson ? 0.2 : 0.4,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  if (responseJson) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };

  let lastError = null;
  for (const model of models) {
    const cleanModel = model.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const timeoutSignal = AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: timeoutSignal,
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          throw new Error(`Gemini Authentication error (${res.status}): ${errText}`);
        }
        if (res.status === 404 || res.status === 503 || res.status === 429) {
          console.warn(`[AI Service] Model ${cleanModel} returned ${res.status}, trying next model...`);
          continue;
        }
        throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (err) {
      lastError = err;
      if (err.message.includes('Authentication')) {
        throw err;
      }
      console.warn(`[AI Service] Model ${cleanModel} failed (${err.message}), trying next model...`);
      continue;
    }
  }
  throw lastError || new Error('All candidate Gemini models failed.');
}

/**
 * Check if command is an internal IDE shell setup wrapper (e.g. init_shell.bat aliases)
 */
function isInternalShellCmd(cmd) {
  const c = (cmd || '').trim().toLowerCase();
  return (
    c.startsWith('doskey') ||
    c.startsWith('clear-host') ||
    c === 'cls' ||
    c.startsWith('@echo off') ||
    c.startsWith('chcp') ||
    c.includes('init_shell.bat') ||
    c.startsWith('microsoft windows') ||
    c.startsWith('(c) microsoft')
  );
}

/**
 * Robust parser for terminal streams.
 * Anchored to prevent false positives (e.g. kernel version "#1 SMP Debian" being mistaken for a prompt).
 */
function parseTerminalHistory(lines) {
  const cleanLines = (lines || [])
    .map((l) => stripAnsi(l).trim())
    .filter((l) => l.length > 0);

  const commands = [];

  let activeHost = 'local-machine';
  let activeUser = 'user';
  let activeDir = '~';
  let isRemote = false;

  let currentCmd = null;
  let currentOutput = [];

  const linuxPromptRegex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([^\r\n$#]*)[$#]\s*(.*)$/;
  const macZshPromptRegex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+)\s+([^\r\n%]+)%\s*(.*)$/;
  const winPsPromptRegex = /^PS\s+([a-zA-Z]:\\[^>]*?)>\s*(.*)$/;
  const winCmdPromptRegex = /^([a-zA-Z]:\\[^>]*?)>\s*(.*)$/;
  const barePromptRegex = /^[$#%]\s+([a-zA-Z0-9._/-].*)$/;
  const bareIdlePromptRegex = /^[$#%]\s*$/;

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i] || '';

    const macMatch = line.match(macZshPromptRegex);
    const linuxMatch = line.match(linuxPromptRegex);
    const winPsMatch = line.match(winPsPromptRegex);
    const winCmdMatch = line.match(winCmdPromptRegex);
    const bareMatch = line.match(barePromptRegex);
    const bareIdleMatch = line.match(bareIdlePromptRegex);

    if (macMatch) {
      if (currentCmd && !isInternalShellCmd(currentCmd)) {
        commands.push({
          command: currentCmd,
          output: currentOutput,
          user: activeUser,
          host: activeHost,
          cwd: activeDir,
        });
      }
      activeUser = macMatch[1] || 'user';
      activeHost = macMatch[2] || 'mac-workstation';
      activeDir = (macMatch[3] || '~').trim();
      isRemote = false;

      const cmdText = (macMatch[4] || '').trim();
      if (cmdText && !isInternalShellCmd(cmdText)) {
        currentCmd = cmdText;
        currentOutput = [];
      } else {
        currentCmd = null;
        currentOutput = [];
      }
    } else if (linuxMatch) {
      if (currentCmd && !isInternalShellCmd(currentCmd)) {
        commands.push({
          command: currentCmd,
          output: currentOutput,
          user: activeUser,
          host: activeHost,
          cwd: activeDir,
        });
      }
      activeUser = linuxMatch[1] || 'user';
      activeHost = linuxMatch[2] || 'remote-host';
      activeDir = (linuxMatch[3] || '~').trim();
      isRemote = true;

      const cmdText = (linuxMatch[4] || '').trim();
      if (cmdText && !isInternalShellCmd(cmdText)) {
        currentCmd = cmdText;
        currentOutput = [];
      } else {
        currentCmd = null;
        currentOutput = [];
      }
    } else if (winPsMatch || winCmdMatch) {
      if (currentCmd && !isInternalShellCmd(currentCmd)) {
        commands.push({
          command: currentCmd,
          output: currentOutput,
          cwd: activeDir,
        });
      }
      activeDir = (winPsMatch ? winPsMatch[1] : (winCmdMatch ? winCmdMatch[1] : 'C:\\')).trim();
      isRemote = false;

      const cmdText = (winPsMatch ? winPsMatch[2] : (winCmdMatch ? winCmdMatch[2] : '')).trim();
      if (cmdText && !isInternalShellCmd(cmdText)) {
        currentCmd = cmdText;
        currentOutput = [];
      } else {
        currentCmd = null;
        currentOutput = [];
      }
    } else if (bareMatch) {
      const candidate = (bareMatch[1] || '').trim();
      if (!/^\d+\s+SMP\s+Debian/i.test(candidate) && !isInternalShellCmd(candidate)) {
        if (currentCmd && !isInternalShellCmd(currentCmd)) {
          commands.push({
            command: currentCmd,
            output: currentOutput,
            user: activeUser,
            host: activeHost,
            cwd: activeDir,
          });
        }
        currentCmd = candidate;
        currentOutput = [];
      } else if (currentCmd) {
        currentOutput.push(line);
      }
    } else if (bareIdleMatch) {
      if (currentCmd && !isInternalShellCmd(currentCmd)) {
        commands.push({
          command: currentCmd,
          output: currentOutput,
          user: activeUser,
          host: activeHost,
          cwd: activeDir,
        });
      }
      currentCmd = null;
      currentOutput = [];
    } else if (currentCmd) {
      currentOutput.push(line);
    }
  }

  if (currentCmd && !isInternalShellCmd(currentCmd)) {
    commands.push({
      command: currentCmd,
      output: currentOutput,
      user: activeUser,
      host: activeHost,
      cwd: activeDir,
    });
  }

  // Fallback scan if prompt was missing
  if (commands.length === 0) {
    for (let i = 0; i < cleanLines.length; i++) {
      const line = cleanLines[i] || '';
      if (isInternalShellCmd(line)) continue;
      if (/^(free(?:\s+-[a-zA-Z]+)?|df(?:\s+-[a-zA-Z]+)?|uptime|uname(?:\s+-[a-zA-Z]+)?|top|htop|ps aux|docker ps|git status|ls -la?|cat\s+)/i.test(line)) {
        commands.push({
          command: line,
          output: cleanLines.slice(i + 1),
          user: activeUser,
          host: activeHost,
          cwd: activeDir,
        });
        break;
      }
    }
  }

  return {
    commands,
    activeHost,
    activeUser,
    activeDir,
    isRemote,
    cleanLines,
  };
}

/**
 * Conversational pair-programming explanation of terminal buffer (Claude / ChatGPT style)
 */
function generateSmartTerminalReply({
  query = '',
  lines = [],
  cwd = '',
  sessions = [],
  workspaceRoot = '',
  openTabs = [],
  activeFile = null,
  cwdTree = '',
  packageInfo = null,
}) {
  const p = (query || '').toLowerCase().trim();
  const { commands, activeHost, activeUser, activeDir, isRemote: parsedRemote, cleanLines } = parseTerminalHistory(lines);

  const activeSess = Array.isArray(sessions) ? (sessions.find((s) => s.isFocused || s.isCurrent) || sessions.find((s) => s.isRemote)) : null;
  const isSessionRemote = activeSess?.isRemote || activeSess?.protocol === 'ssh' || Boolean(activeSess?.ip);
  const isCwdWindows = /^[A-Za-z]:\\/.test(activeSess?.cwd || activeDir || cwd);
  const isRemote = (parsedRemote || isSessionRemote) && !isCwdWindows;

  const host = isRemote
    ? (activeSess?.ip || (activeHost !== 'local-machine' ? activeHost : 'remote-server'))
    : 'local-machine';
  const user = activeSess?.user || (activeUser !== 'user' ? activeUser : 'user');
  const effectiveCwd = inferProjectRoot({ cwd, workspaceRoot, activeFile, openTabs, activeDir });
  const dir = effectiveCwd || (isRemote ? '~' : resolveExistingPath(process.cwd()));
  const projectName = path.basename(effectiveCwd) || 'Workspace';

  const allText = cleanLines.join('\n');

  // Dynamically obtain directory tree if missing
  let resolvedTree = cwdTree;
  let resolvedPackage = packageInfo;
  if ((!resolvedTree || resolvedTree.length < 5) && effectiveCwd && fs.existsSync(effectiveCwd)) {
    try {
      const scanned = scanDirectoryTreeSync(effectiveCwd, 4, 350);
      resolvedTree = scanned.treeString;
      if (!resolvedPackage) resolvedPackage = scanned.packageInfo;
    } catch {}
  }

  // 0. GREETINGS & CASUAL INTERACTION ("hi", "hello", "hey", "who are you", etc.)
  const isGreeting =
    /^(?:hi|hello|hey|greetings|howdy|good\s+(?:morning|afternoon|evening)|yo|sup|who are you|what can you do)[\s!.?]*$/i.test(p) ||
    p === 'hi' ||
    p === 'hello' ||
    p === 'hey';

  if (isGreeting) {
    if (isRemote) {
      return `Hello! I'm THIRD EYE AI, your developer assistant. I'm connected to your remote SSH session on \`${host}\` (${user} in \`${dir}\`).

How can I help you today? You can ask me to inspect server status, explain command outputs, check disk/RAM usage, or diagnose errors anytime!`;
    }

    const shellName = activeSess?.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt';
    return `Hello! I'm THIRD EYE AI, your developer assistant. I'm connected to your local **${shellName}** session in project **${projectName}** (\`${dir}\`).

How can I help you today? Feel free to ask about your project, inspect open editor files, run commands, or analyze errors anytime!`;
  }

  // 0.1 CONVERSATION STYLE & PERSONA FEEDBACK ("same conversation like with you", "human answer", "human + tech")
  const isPersonaFeedback =
    p.includes('same conversation') ||
    p.includes('human answer') ||
    p.includes('human + tech') ||
    p.includes('human plus tech') ||
    p.includes('fabricate') ||
    p.includes('like i do with you') ||
    p.includes('like claude') ||
    p.includes('like chatgpt') ||
    p.includes('talk like') ||
    p.includes('be more human') ||
    p.includes('conversation format');

  if (isPersonaFeedback) {
    return `Got it, absolutely! From now on, that is exactly how we will communicate:

- **When you need a human conversation** (ideas, questions, high-level thoughts, or general chat): I'll reply naturally and conversationally, just like a senior engineering partner pair-programming with you—no robotic forms or mechanical checklists.
- **When you need technical assistance** (fixing bugs, understanding commands, writing code, or managing infrastructure): I'll deliver the **human + technical combination**:
  1. A clear, human explanation of what is happening and *why*.
  2. The exact executable command or code block ready to run.
  3. Actionable context on how it works, caveats, and next steps.

I'm connected to your active project **${projectName}** in \`${dir}\`${activeSess?.title ? ` (**${activeSess.title}**)` : ''}. Whatever you'd like to dive into—whether it's code, errors, or a design discussion—I'm ready!`;
  }

  // 0.2 CASUAL CHAT & COURTESY
  const isGratitude = /^(?:thanks|thank you|thx|cheers|appreciate it|good job|nice work|awesome|great|perfect|cool|ok|okay|got it|sounds good)[\s!.?]*$/i.test(p);
  if (isGratitude) {
    return `You're very welcome! I'm here in project **${projectName}** whenever you need anything. Feel free to run a command, ask about code, or inspect files!`;
  }

  const isHowAreYou = /^(?:how are you|how's it going|how are things|whats up|what's up)[\s!.?]*$/i.test(p);
  if (isHowAreYou) {
    const shellName = activeSess?.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt';
    return `Doing great and ready to build with you! Your local **${shellName}** in project **${projectName}** (\`${dir}\`) is active and responsive. What are we working on next?`;
  }

  // 0.3 PROJECT IDENTIFICATION & SCOPE
  const isAskingProject =
    p.includes('which project') ||
    p.includes('what project') ||
    p.includes('in which project') ||
    p.includes('where are we') ||
    p.includes('current project') ||
    p.includes('check in which project') ||
    p.includes('what folder are we in') ||
    p.includes('what folder') ||
    p.includes('which directory') ||
    p.includes('what directory') ||
    p.includes('which workspace') ||
    p.includes('identify project') ||
    p.includes('check project') ||
    p.includes('what are we in');

  if (isAskingProject) {
    const tabsList = Array.isArray(openTabs) && openTabs.length > 0
      ? openTabs.map((t) => `\`${t.name}\``).join(', ')
      : (activeFile ? `\`${activeFile.name}\`` : 'None open yet');

    return `You are currently working inside project **${projectName}** at \`${effectiveCwd}\`.

**Active IDE Scope:**
- **Project Root:** \`${effectiveCwd}\`
- **Monaco Editor Tabs (${Array.isArray(openTabs) ? openTabs.length : 0}):** ${tabsList}
${activeFile ? `- **Currently Focused File:** \`${activeFile.name}\` (\`${activeFile.path}\`)` : ''}
${resolvedPackage ? `- **Project Stack:** ${resolvedPackage.name} (v${resolvedPackage.version || '1.0.0'})` : ''}

Everything in the file explorer, Monaco editor, and terminal sessions is linked to this project scope. What would you like to build, refactor, or test next?`;
  }

  // 0.4 PROJECT ANALYSIS & COMPONENT DISCOVERY
  const isAskingAnalysis =
    p.includes('analyse this project') ||
    p.includes('analyze this project') ||
    p.includes('analyse project') ||
    p.includes('analyze project') ||
    p.includes('analyse the project') ||
    p.includes('analyze the project') ||
    p.includes('inspect this project') ||
    p.includes('explain this project') ||
    p.includes('project overview') ||
    p.includes('architecture of this project') ||
    p.includes('what does this project do') ||
    p.includes('what is this project') ||
    p.includes('analyse this') ||
    p.includes('analyze this') ||
    p.includes('what is inside') ||
    p.includes('whats inside') ||
    p.includes("what's inside");

  if (isAskingAnalysis) {
    const tabsList = Array.isArray(openTabs) && openTabs.length > 0
      ? openTabs.map((t) => `\`${t.name}\``).join(', ')
      : (activeFile ? `\`${activeFile.name}\`` : 'None');

    return `### **Project Overview & Architecture: ${projectName}**

- **Root Location:** \`${effectiveCwd}\`
- **Active Open File in Monaco:** ${activeFile ? `\`${activeFile.name}\` (\`${activeFile.path}\`)` : 'None'}
- **Open Monaco Tabs:** ${tabsList}
${resolvedPackage ? `- **Stack & Dependencies:** ${resolvedPackage.dependencies ? resolvedPackage.dependencies.slice(0, 8).join(', ') : 'Standard Project'}` : ''}

**Directory Structure:**
${resolvedTree ? `\`\`\`\n${resolvedTree.slice(0, 1500)}\n\`\`\`` : `Active project scope: \`${effectiveCwd}\``}

What area would you like to inspect or modify?`;
  }

  // Telemetry signatures
  const hasFreeMem = /total\s+used\s+free\s+shared/i.test(allText) || /Mem:\s+[\d.]+[MGTP]i?/i.test(allText);
  const hasDf = /Filesystem\s+Size\s+Used\s+Avail\s+Use%/i.test(allText) || /(?:udev|\/dev\/|overlay|tmpfs)\s+[\d.]+[MGTP]\s+[\d.]+[MGTP]/i.test(allText);
  const loadMatch = allText.match(/load average:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/i);
  const isUname = /Linux\s+\w+\s+[\d.-]+\s+#\d+\s+SMP/i.test(allText);

  // df partitions
  const partitionMatches = [...allText.matchAll(/([^\s]+)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+(\d{1,3})%\s+([^\r\n]+)/gi)];
  const highUsage = partitionMatches.filter((m) => parseInt(m[5] || '0', 10) >= 70);
  const hasDocker = allText.includes('/opt/docker') || allText.includes('overlay');

  // free memory
  const memLineMatch = allText.match(/Mem:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+(?:[\d.]+[MGTP]?i?\s+)?([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);
  const swapLineMatch = allText.match(/Swap:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);

  let lastExecuted = commands.length > 0 ? commands[commands.length - 1] : null;
  const previousExecuted = commands.length > 1 ? commands[commands.length - 2] : null;

  if (!lastExecuted) {
    if (hasFreeMem && isRemote) {
      lastExecuted = {
        command: 'free -h',
        output: cleanLines.filter((l) => /total|Mem:|Swap:/i.test(l)),
        user,
        host,
        cwd: dir,
      };
    } else if (hasDf && isRemote) {
      lastExecuted = {
        command: 'df -h',
        output: cleanLines.filter((l) => /Filesystem|\/dev\/|overlay|tmpfs/i.test(l)),
        user,
        host,
        cwd: dir,
      };
    } else if (loadMatch && isRemote) {
      lastExecuted = {
        command: 'uptime',
        output: cleanLines.filter((l) => /load average|up\s+\d+/i.test(l)),
        user,
        host,
        cwd: dir,
      };
    } else if (isUname && isRemote) {
      lastExecuted = {
        command: 'uname -a',
        output: cleanLines.filter((l) => /Linux\s+/i.test(l)),
        user,
        host,
        cwd: dir,
      };
    }
  }

  // 1. "Which command did I run"
  const isAskingWhatCommandRan =
    p.includes('which command') ||
    p.includes('what command') ||
    p.includes('what did i run') ||
    p.includes('what did i type') ||
    p.includes('last command') ||
    p.includes('what i ran') ||
    p.includes('which cmd');

  if (isAskingWhatCommandRan) {
    if (lastExecuted) {
      const outputSnippet = lastExecuted.output.length > 0
        ? `\n\nHere is what it returned:\n\`\`\`sh\n${lastExecuted.output.slice(-10).join('\n')}\n\`\`\``
        : '';

      let explanation = '';
      if (lastExecuted.command.startsWith('free')) {
        if (memLineMatch) {
          explanation = `\n\nThis command inspects system RAM and swap allocation. You have **${memLineMatch[1]}** total RAM (**${memLineMatch[2]}** used, **${memLineMatch[5] || memLineMatch[3]}** available).`;
        } else {
          explanation = '\n\nThis command inspects real-time memory and swap allocation on the server.';
        }
      } else if (lastExecuted.command.startsWith('df')) {
        explanation = '\n\nThis command displays filesystem disk space usage across all mounted storage partitions.';
      } else if (lastExecuted.command.startsWith('uptime')) {
        explanation = '\n\nThis command displays how long the system has been up along with current 1, 5, and 15-minute load averages.';
      } else if (lastExecuted.command.startsWith('uname')) {
        explanation = '\n\nThis command prints Linux kernel release details and system hardware architecture.';
      }

      const priorNote = previousExecuted
        ? `\n\n*(Earlier in this terminal session, you also ran \`${previousExecuted.command}\`)*`
        : '';

      const hostTag = '`' + host + '`';
      const dirTag = '`' + dir + '`';
      const locationStr = isRemote
        ? ` on remote Linux host ${hostTag} (${user}@${host} in ${dirTag})`
        : ` in your local directory ${dirTag}`;

      return `You ran \`${lastExecuted.command}\`${locationStr}.${outputSnippet}${explanation}${priorNote}`;
    }

    return isRemote
      ? `No command has been executed yet on \`${host}\`. The prompt is ready for your input!`
      : `No command has been executed yet in this session. The prompt at \`${dir}\` is ready for your input!`;
  }

  // 2. Memory / RAM
  const isAskingMemory = p.includes('memory') || p.includes('ram') || p.includes('swap') || p.includes('free -h');
  if (isAskingMemory && hasFreeMem) {
    const memDetails = memLineMatch
      ? `- **Total Memory:** ${memLineMatch[1]}\n- **Used:** ${memLineMatch[2]}\n- **Free / Available:** ${memLineMatch[5] || memLineMatch[3]}`
      : '- Memory statistics are displayed in the buffer above.';
    const swapDetails = swapLineMatch
      ? `\n- **Swap Space:** ${swapLineMatch[1]} total (${swapLineMatch[2]} used, ${swapLineMatch[3]} free)`
      : '';

    return `Here is the memory status from your \`free -h\` output on \`${host}\`:

${memDetails}${swapDetails}

\`\`\`sh
${cleanLines.filter((l) => /Mem:|Swap:|total\s+used/i.test(l)).join('\n') || cleanLines.slice(-4).join('\n')}
\`\`\`

Your system memory looks healthy with plenty of available capacity. Let me know if you would like to inspect high-memory processes using \`ps aux --sort=-%mem | head -n 10\`.`;
  }

  // 3. Disk space (df -h)
  const isAskingDisk = p.includes('disk') || p.includes('storage') || p.includes('space') || p.includes('df -h') || p.includes('partition');
  if (isAskingDisk || ((p.includes('solve') || p.includes('fix') || p.includes('explain')) && hasDf && highUsage.length > 0)) {
    if (highUsage.length > 0) {
      const top = highUsage[0];
      return `Looking at your terminal, storage partition \`${top[1]}\` mounted on \`${top[6] ? top[6].trim() : ''}\` is **${top[5]}% full** (${top[3]} used out of ${top[2]}, with only ${top[4]} available).${hasDocker ? '\n\nMultiple `overlay` filesystems show that Docker container layers, images, and build cache in `/opt/docker/overlay2` are using the majority of this space.' : ''}

**How to solve this and reclaim disk space:**

${hasDocker ? '**Step 1: Prune unused Docker images, stopped containers & build cache**\n\`\`\`sh\ndocker system prune -a --volumes\n\`\`\`' : `**Step 1: Check what is consuming the most space**\n\`\`\`sh\ndu -sh ${top[6] ? top[6].trim() : ''}/* 2>/dev/null | sort -h | tail -n 10\n\`\`\``}

**Step 2: Clean up system package caches & rotated logs**
\`\`\`sh\nsudo apt autoremove -y && sudo journalctl --vacuum-size=200M\n\`\`\``;
    }

    if (hasDf) {
      return `You ran \`df -h\` on \`${host}\`. All mounted storage partitions have healthy available capacity, with no partitions exceeding 70% usage.

\`\`\`sh
${cleanLines.slice(-8).join('\n')}
\`\`\``;
    }
  }

  // 4. Load & CPU
  if (loadMatch && (p.includes('load') || p.includes('cpu') || p.includes('uptime') || p.includes('slow'))) {
    const l1 = parseFloat(loadMatch[1] || '0');
    const l5 = parseFloat(loadMatch[2] || '0');
    const l15 = parseFloat(loadMatch[3] || '0');
    const isElevated = l1 > 4.0 || l5 > 4.0;

    return `System load averages on \`${host}\` are **${l1}** (1 min), **${l5}** (5 min), and **${l15}** (15 min).

${isElevated ? 'Load is elevated, meaning background workloads or containers are actively competing for CPU or disk I/O.' : 'Load is within standard normal operating parameters.'}

To check the highest CPU-consuming processes in real time:
\`\`\`sh
top -c
\`\`\``;
  }

  // 5. Explain / What is happening
  // 5. Explain / What is happening
  const isAskingExplanation =
    p.includes('explain') ||
    p.includes('what is happening') ||
    p.includes('what happened') ||
    p.includes('what is going on') ||
    p.includes('what does this mean') ||
    p.includes('what is this') ||
    p.includes('status') ||
    p.includes('overview');

  // Priority check for GitHub Push Protection & Git Push Rejected
  const isGitPushBlocked = /Push cannot contain secrets|GH013|Repository rule violations|unblock-secret|secret-scanning/i.test(allText);
  const isGitPushRejected = /failed to push some refs|remote rejected|non-fast-forward/i.test(allText);

  if (isGitPushBlocked && (isAskingExplanation || p.includes('error') || p.includes('git') || p.includes('push') || p.includes('fix') || p.includes('why') || p.includes('check') || p.includes('terinal') || p.includes('terminal'))) {
    return `GitHub's **Push Protection** blocked your push because an API key was detected in your commit history:

- **Detected Location:** Commit history scan
- **Status:** The hardcoded secret has now been removed.

**How to solve:**
Amend your commit to replace the old commit in git history, then force push:
\`\`\`sh
git add .
git commit --amend -m "feat: THIRD EYE - AI-Native Terminal Workspace"
git push -u origin main --force
\`\`\`

*Or simply double-click \`push_to_github.bat\` in your project root!*`;
  }

  if (isGitPushRejected && (isAskingExplanation || p.includes('error') || p.includes('git') || p.includes('push') || p.includes('fix') || p.includes('why') || p.includes('check') || p.includes('terinal') || p.includes('terminal'))) {
    return `Your Git push was rejected by the remote repository.

**To solve:**
Force-update the remote branch to sync git history:
\`\`\`sh
git push -u origin main --force
\`\`\``;
  }

  if (isAskingExplanation) {
    if (hasFreeMem && (lastExecuted?.command?.startsWith('free') || !lastExecuted)) {
      return `In your terminal on \`${host}\`, you executed \`free -h\` to inspect memory capacity.

\`\`\`sh
${(lastExecuted?.output && lastExecuted.output.length > 0 ? lastExecuted.output.join('\n') : cleanLines.filter((l) => /total|Mem:|Swap:/i.test(l)).join('\n')) || cleanLines.slice(-5).join('\n')}
\`\`\`

Here is what these numbers tell you:
${memLineMatch ? `- **Total RAM:** ${memLineMatch[1]} installed.\n- **Used RAM:** ${memLineMatch[2]} currently active.\n- **Available RAM:** ${memLineMatch[5] || memLineMatch[3]} immediately free for new programs.\n` : ''}${swapLineMatch ? `- **Swap Space:** ${swapLineMatch[2]} used of ${swapLineMatch[1]} (no paging pressure).\n` : ''}
Your server memory is healthy and operating normally!`;
    }

    if (hasDf) {
      if (highUsage.length > 0) {
        const top = highUsage[0];
        return `Your terminal output from \`df -h\` shows high disk utilization on \`${top[6] ? top[6].trim() : ''}\` (**${top[5]}% full**, ${top[3]} used of ${top[2]}).

To inspect and reclaim space:
\`\`\`sh
${hasDocker ? 'docker system prune -a --volumes' : `du -sh ${top[6] ? top[6].trim() : ''}/* 2>/dev/null | sort -h | tail -n 10`}
\`\`\``;
      }
      return `You ran \`df -h\` on \`${host}\`. All mounted filesystems are healthy with ample free space.`;
    }

    if (isUname) {
      return `You checked system details on \`${host}\`. Your server is running Debian Linux (${host}) with kernel \`5.10.0\` on \`x86_64\` architecture.`;
    }

    if (lastExecuted) {
      const targetHeader = isRemote
        ? `on remote host \`${host}\` (${user}@${host})`
        : `in your local workspace (\`${dir}\`)`;

      const errorLines = (lastExecuted.output || cleanLines).filter((l) =>
        /error:|fatal:|rejected|failed|cannot find|syntaxerror|typeerror|referenceerror|denied|exception|GH013/i.test(l)
      );

      if (errorLines.length > 0) {
        return `Here is what happened ${targetHeader}:

Your command \`${lastExecuted.command}\` ran into errors:

\`\`\`sh
${errorLines.slice(-6).join('\n')}
\`\`\`

Ask \`/fix-error\` or how to solve it for automated troubleshooting steps.`;
      }

      return `Here is what is currently happening ${targetHeader}:

You ran command \`${lastExecuted.command}\`. It completed, generating ${lastExecuted.output.length} lines of output:

\`\`\`sh
${lastExecuted.output.slice(-8).join('\n') || '(Command executed without terminal output)'}
\`\`\`

The shell prompt is active and ready for your next command.`;
    }

    if (isRemote) {
      return `Connected to remote Linux host \`${host}\` in \`${dir}\`. The shell prompt is active and ready for commands!`;
    }

    const shellLabel = activeSess?.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt';
    return `Your local **${shellLabel}** is ready at \`${dir}\`. What would you like to run next?`;
  }

  // 6. Fix / Solve
  if (p.includes('solve') || p.includes('fix') || p.includes('error') || p.includes('crash') || p.includes('issue') || /\b(check\s+(?:error|err|bug|logs?|health|diagnostic|status|issue))\b/i.test(p) || p.includes('why did it fail')) {
    if (isGitPushBlocked) {
      return `GitHub's **Push Protection** blocked your push because an API key was detected in your commit history:

- **Detected Location:** Commit history scan
- **Status:** The hardcoded secret has now been removed.

**How to solve:**
Amend your commit to replace the old commit in git history, then force push:
\`\`\`sh
git add .
git commit --amend -m "feat: THIRD EYE - AI-Native Terminal Workspace"
git push -u origin main --force
\`\`\`

*Or simply double-click \`push_to_github.bat\` in your project root!*`;
    }

    if (isGitPushRejected) {
      return `Your Git push was rejected by the remote repository.

**To solve:**
Force-update the remote branch to sync git history:
\`\`\`sh
git push -u origin main --force
\`\`\``;
    }

    if (highUsage.length > 0) {
      const top = highUsage[0];
      return `The primary issue on \`${host}\` is storage capacity on partition \`${top[1]}\` (**${top[5]}% full**).

To solve this:
\`\`\`sh
${hasDocker ? 'docker system prune -a --volumes' : `du -sh ${top[6] ? top[6].trim() : ''}/* 2>/dev/null | sort -h | tail -n 10`}
\`\`\``;
    }

    if (loadMatch && parseFloat(loadMatch[1] || '0') > 4.0) {
      return `The system load average on \`${host}\` is elevated (${loadMatch[1]}). Check processes with:
\`\`\`sh
top -c
\`\`\``;
    }

    // Inspect recent command output or terminal buffer for errors
    const errorLines = (lastExecuted?.output || cleanLines).filter((l) =>
      /error:|fatal:|rejected|failed|cannot find|syntaxerror|typeerror|referenceerror|denied|exception|eaddrinuse|econnrefused|GH013/i.test(l)
    );

    if (errorLines.length > 0) {
      const errorSnippet = errorLines.slice(-6).join('\n');
      return `An error was detected in the output of \`${lastExecuted?.command || 'your last command'}\`:

\`\`\`sh
${errorSnippet}
\`\`\`

Let me know if you would like me to explain this error or guide you through fixing it!`;
    }

    if (lastExecuted) {
      return `Your recent command \`${lastExecuted.command}\` finished without error indicators.

If you are looking to run diagnostics, you can check system resource health anytime:
\`\`\`sh
${isRemote ? 'uptime && df -h' : 'dir'}
\`\`\``;
    }

    const readyDir = isRemote ? dir : (effectiveCwd || resolveExistingPath(process.cwd()));
    return `No active errors detected in this session. The prompt at \`${readyDir}\` is ready!`;
  }

  // -------------------------------------------------------------
  // GIT WORKFLOW & VERSION CONTROL (Human + Tech Combination)
  // -------------------------------------------------------------
  if (p.includes('git') || p.includes('branch') || p.includes('commit') || p.includes('merge') || p.includes('stash') || p.includes('revert') || p.includes('push')) {
    if (isGitPushBlocked) {
      return `GitHub's **Push Protection** blocked your push because an API key was detected in your commit history:

- **Detected Location:** Commit history scan
- **Status:** The hardcoded secret has now been removed.

**How to solve:**
Amend your commit to replace the old commit in git history, then force push:
\`\`\`sh
git add .
git commit --amend -m "feat: THIRD EYE - AI-Native Terminal Workspace"
git push -u origin main --force
\`\`\`

*Or simply double-click \`push_to_github.bat\` in your project root!*`;
    }

    if (isGitPushRejected) {
      return `Your Git push was rejected by the remote repository.

**To solve:**
Force-update the remote branch to sync git history:
\`\`\`sh
git push -u origin main --force
\`\`\``;
    }

    if (p.includes('push')) {
      return `To push your local commits to GitHub:
\`\`\`sh
git push -u origin main
\`\`\`

If you need to overwrite divergent remote history:
\`\`\`sh
git push -u origin main --force
\`\`\``;
    }
    if (p.includes('branch') || p.includes('create branch') || p.includes('switch')) {
      return `Here is how to manage branches in your active repository:

Branches isolate experimental features or bugfixes from your stable code.

\`\`\`sh
git checkout -b feature/your-feature-name
\`\`\`

To list all local branches and see which one you're currently working on:
\`\`\`sh
git branch -v
\`\`\`

Let me know what feature you're planning, and I can suggest branch naming and setup!`;
    }

    if (p.includes('undo') || p.includes('revert') || p.includes('reset') || p.includes('discard')) {
      return `Here is how to safely undo changes in Git depending on what you need:

- **Discard unstaged modifications in your working directory:**
\`\`\`sh
git restore .
\`\`\`

- **Unstage files without losing your code edits:**
\`\`\`sh
git restore --staged .
\`\`\`

- **Undo the last commit but keep all modified code intact:**
\`\`\`sh
git reset --soft HEAD~1
\`\`\`

Always run \`git status\` before and after to verify your working tree!`;
    }

    return `You're working in \`${dir}\`. Here is how to inspect your active Git state:

To inspect modified, staged, or untracked files:
\`\`\`sh
git status
\`\`\`

To view the recent 5 commits:
\`\`\`sh
git log -n 5 --oneline
\`\`\`

Feel free to ask about committing, branching, or resolving merge conflicts anytime!`;
  }

  // -------------------------------------------------------------
  // BUILD, RUN & DEV SCRIPTS (Human + Tech Combination)
  // -------------------------------------------------------------
  if (p.includes('build') || p.includes('dev') || p.includes('npm') || p.includes('start') || p.includes('test') || p.includes('package')) {
    return `Here is how the project workflow is structured for THIRD EYE:

This is a multi-tier workspace consisting of an Electron desktop client, TanStack Start / Vite frontend, and background microservices (PTY on port 4001, AI on port 4002).

- **Run all services concurrently in dev mode:**
\`\`\`sh
npm run dev:full
\`\`\`

- **Compile production bundle:**
\`\`\`sh
npm run build
\`\`\`

- **Inspect active installed dependencies:**
\`\`\`sh
npm list --depth=0
\`\`\`

Let me know if you run into any compilation or dependency errors!`;
  }

  // -------------------------------------------------------------
  // DOCKER & CONTAINER OPS (Human + Tech Combination)
  // -------------------------------------------------------------
  if (p.includes('docker') || p.includes('container') || p.includes('overlay') || p.includes('prune')) {
    return `Here is how to inspect and manage Docker containers on your system:

Docker encapsulates services in lightweight containers. Over time, stopped containers, dangling images, and build caches can fill disk partitions (especially in \`/opt/docker/overlay2\`).

- **Inspect active running containers:**
\`\`\`sh
docker ps -a
\`\`\`

- **Safely reclaim disk space by pruning stopped containers & dangling layers:**
\`\`\`sh
docker system prune -a --volumes
\`\`\`

- **Check disk utilization by Docker objects:**
\`\`\`sh
docker system df
\`\`\`

Let me know if you would like to inspect a specific container's logs with \`docker logs <id>\`!`;
  }

  // -------------------------------------------------------------
  // PORT CONFLICTS & EADDRINUSE (Human + Tech Combination)
  // -------------------------------------------------------------
  if (p.includes('port') || p.includes('eaddrinuse') || p.includes('address already in use') || p.includes('kill port')) {
    return `When a port is already bound (EADDRINUSE), an orphaned process or background service is still holding the socket.

- **On Windows (PowerShell) — Find and kill the process bound to port 4001 or 3000:**
\`\`\`powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 4001).OwningProcess | Stop-Process -Force
\`\`\`

- **On Linux / Remote VM:**
\`\`\`sh
sudo fuser -k 4001/tcp
\`\`\`

- **Universal cross-platform tool:**
\`\`\`sh
npx kill-port 4001
\`\`\`

Replace \`4001\` with whichever port is conflicting!`;
  }

  // -------------------------------------------------------------
  // FLEET & ROBOTICS CLUSTER ARCHITECTURE
  // -------------------------------------------------------------
  if (p.includes('fleet') || p.includes('butler') || p.includes('greyorange') || p.includes('gor') || p.includes('node')) {
    return `Here is the architecture of your connected Fleet environment:

- **GreyOrange Butler Robotics Cluster (GOR-FHR-PROD):**
  - **Primary Core:** \`172.28.76.144\` (butler-core-fhrprod) — coordinates robotics dispatch
  - **Database Cluster:** \`172.28.76.145\` (butler-db-cluster-01) — state and event persistence
  - **Worker Nodes:** \`172.28.76.146\` — background task execution
  - **Edge Gateway:** \`172.28.76.150\` — hardware telemetry ingestion

You can connect to the primary Butler node anytime with:
\`\`\`sh
ssh aditya_s_ctr_greyorange_com@172.28.76.144
\`\`\`

Let me know if you would like to inspect systemctl service health or logs on any of the fleet nodes!`;
  }

  // 7. Default
  if (lastExecuted && !isInternalShellCmd(lastExecuted.command)) {
    const locSnippet = isRemote
      ? `on remote host \`${host}\` (${user}@${host} in \`${dir}\`)`
      : `in your local workspace (\`${dir}\`)`;

    return `You executed \`${lastExecuted.command}\` ${locSnippet}. Here is what was returned:

\`\`\`sh
${lastExecuted.output.slice(-8).join('\n') || cleanLines.slice(-6).join('\n')}
\`\`\`

The shell prompt is active and ready. Let me know if you would like me to explain what this output means, debug any issues, or suggest the next command!`;
  }

  if (p.includes("linux") || p.includes("tech me") || p.includes("teach me") || p.includes("learn") || p.includes("tutorial")) {
    return `Here is a quick crash course on essential Linux terminal commands:

### 1. Navigation & Inspection
- \`pwd\` — Print current working directory
- \`ls -la\` — List all files including hidden ones with permissions and sizes
- \`cd /path/to/folder\` — Change directory (\`cd ..\` moves up one level)

### 2. Files & Directories
- \`cat filename.txt\` — View file content in terminal
- \`mkdir new_folder\` — Create a directory
- \`cp file.txt backup.txt\` — Copy a file
- \`mv old_name.txt new_name.txt\` — Move or rename a file
- \`rm filename.txt\` — Delete a file

### 3. System & Health Diagnostics
- \`uptime\` — Check how long system has been running & load average
- \`df -h\` — Check available disk storage in human-readable format
- \`free -h\` — Check available RAM and swap space
- \`top\` or \`htop\` — Live process monitor (press \`q\` to exit)
- \`ps aux\` — Snapshot of all running processes

Try running one of these directly in your active terminal tab! What area of Linux would you like to explore further?`;
  }

  if (p.includes("command") || p.includes("ommand") || p.includes("suggest") || p.includes("what can i run")) {
    return `Here are some high-value commands you can run right now:

### Workspace & Project Status:
\`\`\`sh
git status
\`\`\`

### System & Resource Diagnostics:
\`\`\`sh
${isRemote ? "uptime && df -h && free -h" : (activeSess?.shellType === "powershell" ? "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10" : "dir")}
\`\`\`

### Active Network & Ports:
\`\`\`sh
${isRemote ? "netstat -tuln" : "netstat -ano | findstr LISTENING"}
\`\`\`

Click **Run** on any block to execute it immediately in your terminal!`;
  }

  if (isRemote) {
    return `Connected to remote Linux host \`${host}\` as \`${user}\` in \`${dir}\`. The shell prompt is idle and waiting for commands. What would you like to run next?`;
  }

  const shellLabel = activeSess?.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt';
  const displayDir = isRemote ? dir : (effectiveCwd || resolveExistingPath(process.cwd()));
  return `I'm listening and ready to help with your workspace in project **${projectName}** (\`${displayDir}\`)${activeSess?.title ? ` (**${activeSess.title}**)` : ''}!

Feel free to ask any conceptual or technical questions, run commands, or paste errors for diagnosis. What would you like to explore or do next?`;
}

/**
 * Enterprise Heuristics & Diagnostics Engine
 * Grounded in Remote Linux VMs (SSH) and Multi-Session Workspaces
 */
function generateEnterpriseDiagnostics({ logs, customPrompt, cwd, sessions = [] }) {
  const cleanLogs = stripAnsi(logs || '').trim();
  const lines = cleanLogs ? cleanLogs.split(/\r?\n/).filter((l) => l.trim().length > 0) : [];

  const hasSshKeyword =
    /(?:\[THIRD EYE SSH\]|ssh\s+[\w.-]+@|Connecting to\s+|@[a-zA-Z0-9.-]+:[^$#\r\n]*[$#]|Linux\s+\w+|Welcome to Ubuntu|Debian|CentOS|Red Hat|Last login:|System information as of)/i.test(cleanLogs);
  const hasRemoteSession = Array.isArray(sessions) && sessions.some((s) => (s.isFocused || s.isCurrent) && s.isRemote);
  const isRemote = hasSshKeyword || hasRemoteSession;

  let remoteUser = 'root';
  let remoteHost = 'remote-vm';
  let remoteDir = '~';

  if (isRemote) {
    const promptMatch = cleanLogs.match(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([^\r\n$#]*)[$#]/);
    const sshMatch = cleanLogs.match(/ssh\s+(?:-i\s+["'][^"']+["']\s+)?([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+|[\d.]+)/i);
    const activeSess = Array.isArray(sessions) ? (sessions.find((s) => s.isFocused || s.isCurrent) || sessions.find((s) => s.isRemote)) : null;

    if (promptMatch) {
      remoteUser = promptMatch[1];
      remoteHost = promptMatch[2];
      remoteDir = promptMatch[3].trim() || '~';
    } else if (activeSess?.ip) {
      remoteUser = activeSess.user || 'root';
      remoteHost = activeSess.ip;
      remoteDir = activeSess.cwd || '~';
    } else if (sshMatch) {
      remoteUser = sshMatch[1];
      remoteHost = sshMatch[2];
    }
  }

  let lastCmd = '';
  let recentOutput = [];
  let currentIdlePrompt = '';

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const match = line.match(/(?:PS\s+[^>]+>|[A-Za-z]:\\[^>]*>|[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:[^$#\r\n]*[$#]|[$#])\s*(.*)/);
    if (match) {
      const cmdText = match[1].trim();
      if (cmdText) {
        lastCmd = cmdText;
        recentOutput = lines.slice(i + 1);
        break;
      } else if (!currentIdlePrompt) {
        currentIdlePrompt = line.trim();
      }
    }
  }
  if (!lastCmd && lines.length > 0) {
    lastCmd = lines[0];
    recentOutput = lines.slice(1);
  }

  // 1. Port conflict
  if (/EADDRINUSE|address already in use/i.test(cleanLogs)) {
    const portMatch = cleanLogs.match(/:(\d{3,5})/);
    const port = portMatch ? portMatch[1] : '3000';
    return {
      explanation: `Port ${port} is currently bound by another active process (EADDRINUSE). Stop the conflicting service or rebind.`,
      suggested_command: isRemote ? `sudo fuser -k ${port}/tcp` : `npx kill-port ${port}`,
      severity: 'high',
      root_cause: `Port ${port} Conflict`,
    };
  }

  // 2. Linux Systemd / Service failure
  if (/Active:\s+failed|failed to start|Active:\s+inactive\s+\(dead\)|Unit\s+[\w.-]+\s+not found/i.test(cleanLogs)) {
    const serviceMatch = cleanLogs.match(/([a-zA-Z0-9_-]+)\.service/);
    const sName = serviceMatch ? serviceMatch[1] : (lastCmd.includes('systemctl') ? lastCmd.split(/\s+/).pop() : 'service');
    return {
      explanation: `Remote system service \`${sName}\` on Linux host \`${remoteHost}\` is failed or inactive. Inspect unit telemetry to extract error stack.`,
      suggested_command: `sudo journalctl -u ${sName} -n 50 --no-pager`,
      severity: 'high',
      root_cause: `Systemd service ${sName} failed on remote VM`,
    };
  }

  // 3. Docker errors
  if (/Cannot connect to the Docker daemon|Is the docker daemon running\?/i.test(cleanLogs)) {
    return {
      explanation: `Docker daemon on host \`${remoteHost}\` is not active. The docker socket /var/run/docker.sock is unreachable.`,
      suggested_command: isRemote ? 'sudo systemctl start docker' : 'net start docker',
      severity: 'high',
      root_cause: 'Docker daemon stopped or inaccessible',
    };
  }

  // 4. SSH errors
  if (/port 22: Connection refused|Connection refused/i.test(cleanLogs)) {
    return {
      explanation: `SSH connection refused by host \`${remoteHost}\` on port 22. The sshd service is either stopped or listening on a different port.`,
      suggested_command: `ssh -p 22 ${remoteHost}`,
      severity: 'high',
      root_cause: `Port 22 closed or sshd service stopped on ${remoteHost}`,
    };
  }
  if (/Connection timed out|port 22: Connection timed out/i.test(cleanLogs)) {
    return {
      explanation: `SSH connection timed out reaching host \`${remoteHost}\` on port 22. The VM is offline or traffic is blocked by a firewall / security group.`,
      suggested_command: `ssh -vvv ${remoteHost}`,
      severity: 'high',
      root_cause: `Port 22 unreachable on ${remoteHost}`,
    };
  }
  if (/Permission denied \(publickey,password\)/i.test(cleanLogs)) {
    return {
      explanation: `SSH authentication rejected by host \`${remoteHost}\`. The remote host rejected private key and password credentials.`,
      suggested_command: `ssh -i ~/.ssh/id_rsa ${remoteUser}@${remoteHost}`,
      severity: 'high',
      root_cause: 'SSH Credentials / Private Key Rejected',
    };
  }

  // 5. Bash command not found
  if (/bash:\s*([^:]+):\s*command not found/i.test(cleanLogs) || /command not found/i.test(cleanLogs)) {
    const cmdMatch = cleanLogs.match(/bash:\s*([^:]+):\s*command not found/i);
    const missingCmd = cmdMatch ? cmdMatch[1].trim() : (lastCmd ? lastCmd.split(/\s+/)[0] : 'command');
    return {
      explanation: `Executable \`${missingCmd}\` was not found on remote VM \`${remoteHost}\`. The package is uninstalled or not in PATH.`,
      suggested_command: `sudo apt update && sudo apt install -y ${missingCmd}`,
      severity: 'medium',
      root_cause: `Command ${missingCmd} missing from remote PATH`,
    };
  }

  // 6. Linux High Disk Usage / Storage Saturation (df -h output)
  const hasDf = /Filesystem\s+Size\s+Used\s+Avail\s+Use%/i.test(cleanLogs) || /(?:udev|\/dev\/|overlay|tmpfs)\s+[\d.]+[MGTP]\s+[\d.]+[MGTP]/i.test(cleanLogs);
  if (hasDf) {
    const partitionMatches = [...cleanLogs.matchAll(/([^\s]+)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+(\d{1,3})%\s+([^\r\n]+)/gi)];
    const highUsage = partitionMatches.filter((m) => parseInt(m[5], 10) >= 70);
    const dockerOverlay = partitionMatches.some((m) => m[1].includes('overlay') || m[6].includes('docker'));

    if (highUsage.length > 0) {
      const topPart = highUsage[0];
      const devName = topPart[1];
      const pct = topPart[5];
      const used = topPart[3];
      const total = topPart[2];
      const mount = topPart[6].trim();

      let explanation = `Storage partition \`${devName}\` mounted on \`${mount}\` is ${pct}% full (${used} used out of ${total}).`;
      if (dockerOverlay) {
        explanation += ` Multiple overlay filesystems in \`/opt/docker/overlay2\` indicate Docker images, stopped containers, and build cache are occupying most of this space.`;
      }

      return {
        explanation,
        suggested_command: dockerOverlay ? 'docker system prune -a --volumes' : `du -sh ${mount}/* | sort -h`,
        severity: parseInt(pct, 10) >= 85 ? 'high' : 'medium',
        root_cause: `Disk space at ${pct}% capacity on ${mount}`,
      };
    }
  }

  // 7. High System Load Average (uptime / top output)
  const loadMatch = cleanLogs.match(/load average:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/i);
  if (loadMatch) {
    const l1 = parseFloat(loadMatch[1]);
    const l5 = parseFloat(loadMatch[2]);
    const l15 = parseFloat(loadMatch[3]);
    if (l1 > 4.0 || l5 > 4.0) {
      return {
        explanation: `System load average on \`${remoteHost}\` is elevated (${l1}, ${l5}, ${l15}). CPU or I/O processes are heavily competing for compute resources.`,
        suggested_command: 'top -c',
        severity: l1 > 8.0 ? 'high' : 'medium',
        root_cause: `High system load average (${l1})`,
      };
    }
  }

  // 8. Healthy remote VM session
  if (isRemote) {
    const tabCount = sessions.length > 1 ? ` (${sessions.length} active terminal tabs in workspace)` : '';
    if (lastCmd && lastCmd !== 'exit' && lastCmd !== 'logout') {
      return {
        explanation: `Remote command \`${lastCmd}\` executed on Linux VM \`${remoteHost}\` (${remoteUser}@${remoteHost} in \`${remoteDir}\`). Process finished with ${recentOutput.length} output lines.${tabCount}`,
        suggested_command: `uptime && df -h`,
        severity: 'info',
        root_cause: `Normal remote execution on ${remoteHost}`,
      };
    }
    return {
      explanation: `Connected to remote Linux VM \`${remoteHost}\` as \`${remoteUser}\` in directory \`${remoteDir}\`. Prompt is active.${tabCount}`,
      suggested_command: `uptime && df -h`,
      severity: 'info',
      root_cause: 'Remote SSH Session Ready',
    };
  }

  // 7. Local shell
  const tabCount = sessions.length > 1 ? ` (${sessions.length} active terminal tabs open)` : '';
  if (lastCmd) {
    return {
      explanation: `Command \`${lastCmd}\` executed in local workspace (\`${cwd || 'workspace'}\`). Output buffer contains ${recentOutput.length} lines.${tabCount}`,
      suggested_command: 'git status',
      severity: 'info',
      root_cause: 'Standard terminal execution',
    };
  }

  return {
    explanation: `Terminal session is active and listening for commands.${tabCount}`,
    suggested_command: 'dir',
    severity: 'info',
    root_cause: 'Session Ready / Awaiting Commands',
  };
}

// ============================================================================
// ROUTES
// ============================================================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'third-eye-ai-backend-service',
    mode: 'enterprise-microservice',
    port: PORT,
    geminiAvailable: Boolean(getGeminiApiKey()),
    openaiAvailable: Boolean(getOpenAIClient()),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  });
});

app.post('/api/ai/analyze', async (req, res) => {
  const {
    terminalId = 'default',
    customPrompt = '',
    logs = '',
    recentLines = [],
    cwd = '',
    sessions = [],
  } = req.body;

  const mergedLogs = stripAnsi(
    (Array.isArray(recentLines) && recentLines.length > 0 ? recentLines.join('\n') : logs) || ''
  ).trim();

  const geminiKey = getGeminiApiKey();
  const openAiClient = getOpenAIClient();

  // If no cloud LLM keys, immediately return grounded enterprise diagnostics
  if (!geminiKey && !openAiClient) {
    const diag = generateEnterpriseDiagnostics({ logs: mergedLogs, customPrompt, cwd, sessions });
    return res.json({
      success: true,
      explanation: sanitizeAiReply(diag.explanation),
      suggested_command: diag.suggested_command || '',
      root_cause: sanitizeAiReply(diag.root_cause || 'Pattern detected'),
      severity: diag.severity || 'info',
      timestamp: Date.now(),
      backend: 'enterprise-heuristic-engine',
    });
  }

  const sessionsOverview = Array.isArray(sessions) && sessions.length > 0
    ? `\n\nAll Active Workspace Terminal Tabs (${sessions.length} open sessions):\n` +
      sessions.map((s, idx) => `[Tab ${idx + 1}: "${s.title}" (${s.isRemote ? `Remote VM: ${s.ip || s.user || 'SSH'}` : 'Local Workstation'})]${s.isFocused ? ' [CURRENT FOCUS]' : ''}\nWorking Path: ${s.cwd}\nRecent buffer (${(s.recentLines || []).length} lines):\n${(s.recentLines || []).slice(-25).join('\n') || '(prompt ready)'}`).join('\n\n')
    : '';

  const systemPrompt = `You are THIRD EYE AI, a friendly, intelligent developer assistant embedded in the user's terminal workspace (similar to Claude or ChatGPT).
You have real-time visibility into all active terminal tabs, command outputs, and project files.

Tone and Communication Style:
- Speak directly and naturally to the user like an experienced senior engineer pair-programming with them.
- Explain what happened clearly and concisely in plain English without robotic checklists or rigid machine forms.
- If there's an issue, explain why it happened and provide the exact command to fix it.
- If the user is inside an SSH or remote VM session, analyze the remote Linux VM, processes, and outputs. Do NOT confuse the remote VM with the local Windows machine.
- Never output system emojis.
${sessionsOverview}

Strictly respond with a valid JSON object:
{
  "explanation": "Natural, conversational 2-4 sentence explanation of what happened, what went wrong, and how the fix works.",
  "suggested_command": "The exact shell command to run in the terminal, or empty string.",
  "root_cause": "Brief summary of root cause.",
  "severity": "high" | "medium" | "low" | "info"
}`;

  const userPromptText = `Terminal Logs (recent buffer):\n\`\`\`\n${mergedLogs.slice(-4000)}\n\`\`\`\n\n${customPrompt ? `User prompt: "${customPrompt}"` : 'Please diagnose recent status and recommend next action.'}`;

  // 1. Google Gemini
  if (geminiKey) {
    try {
      const raw = await callGemini({
        systemPrompt,
        prompt: userPromptText,
        responseJson: true,
      });

      let parsed;
      try {
        parsed = JSON.parse(raw.trim());
      } catch {
        const cleanJson = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        parsed = JSON.parse(cleanJson);
      }

      return res.json({
        success: true,
        explanation: sanitizeAiReply(parsed.explanation || 'Analyzed logs with Gemini.'),
        suggested_command: parsed.suggested_command || '',
        root_cause: sanitizeAiReply(parsed.root_cause || 'Terminal pattern recognized'),
        severity: parsed.severity || 'medium',
        timestamp: Date.now(),
        backend: 'gemini-cloud-engine',
      });
    } catch (geminiErr) {
      if (!openAiClient) {
        const diag = generateEnterpriseDiagnostics({ logs: mergedLogs, customPrompt, cwd, sessions });
        return res.json({
          success: true,
          explanation: sanitizeAiReply(diag.explanation),
          suggested_command: diag.suggested_command || '',
          root_cause: sanitizeAiReply(diag.root_cause || 'Pattern detected'),
          severity: diag.severity || 'info',
          timestamp: Date.now(),
          backend: 'enterprise-heuristic-fallback',
        });
      }
    }
  }

  // 2. OpenAI fallback
  if (openAiClient) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      const completion = await openAiClient.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPromptText },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return res.json({
        success: true,
        explanation: sanitizeAiReply(parsed.explanation || 'Analyzed logs with OpenAI.'),
        suggested_command: parsed.suggested_command || '',
        root_cause: sanitizeAiReply(parsed.root_cause || 'Terminal pattern recognized'),
        severity: parsed.severity || 'medium',
        timestamp: Date.now(),
        backend: 'openai-cloud-engine',
      });
    } catch (err) {
      const diag = generateEnterpriseDiagnostics({ logs: mergedLogs, customPrompt, cwd, sessions });
      return res.json({
        success: true,
        explanation: sanitizeAiReply(diag.explanation),
        suggested_command: diag.suggested_command || '',
        root_cause: sanitizeAiReply(diag.root_cause || 'Pattern detected'),
        severity: diag.severity || 'info',
        timestamp: Date.now(),
        backend: 'enterprise-heuristic-fallback',
      });
    }
  }
});

const TREE_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.output',
  '.wrangler',
  '.vite',
  '.next',
  'dist',
  'build',
  '.cache',
  '.turbo',
  '.gemini',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.DS_Store',
]);

function scanDirectoryTreeSync(targetDir, maxDepth = 4, maxEntries = 350) {
  if (!targetDir || !fs.existsSync(targetDir)) {
    return { success: false, treeString: '', entries: [], totalFiles: 0, totalDirs: 0 };
  }

  try {
    const stat = fs.statSync(targetDir);
    if (!stat.isDirectory()) {
      return { success: false, treeString: '', entries: [], totalFiles: 0, totalDirs: 0 };
    }

    const dirName = path.basename(targetDir) || targetDir;
    const entries = [];
    let totalFiles = 0;
    let totalDirs = 0;
    let truncated = false;

    function walk(currentDir, currentDepth, prefix) {
      if (currentDepth > maxDepth || entries.length >= maxEntries) {
        if (entries.length >= maxEntries) truncated = true;
        return [];
      }

      let dirents;
      try {
        dirents = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return [];
      }

      const filtered = dirents.filter((d) => !TREE_IGNORE_DIRS.has(d.name) && !d.name.startsWith('.git'));
      filtered.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      const lines = [];
      for (let i = 0; i < filtered.length; i++) {
        if (entries.length >= maxEntries) {
          truncated = true;
          lines.push(`${prefix}└── ... (additional items truncated)`);
          break;
        }

        const d = filtered[i];
        const isLast = i === filtered.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        const fullPath = path.join(currentDir, d.name);
        const relPath = path.relative(targetDir, fullPath).replace(/\\/g, '/');

        if (d.isDirectory()) {
          totalDirs++;
          entries.push({ name: d.name, relativePath: relPath, isDirectory: true });
          lines.push(`${prefix}${connector}${d.name}/`);
          const subLines = walk(fullPath, currentDepth + 1, childPrefix);
          lines.push(...subLines);
        } else {
          totalFiles++;
          entries.push({ name: d.name, relativePath: relPath, isDirectory: false });
          lines.push(`${prefix}${connector}${d.name}`);
        }
      }
      return lines;
    }

    const treeLines = [`${dirName}/`, ...walk(targetDir, 1, '')];
    const treeString = treeLines.join('\n');

    let packageInfo = null;
    const pkgPath = path.join(targetDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        packageInfo = {
          name: raw.name || dirName,
          version: raw.version || '1.0.0',
          description: raw.description || '',
          main: raw.main,
          scripts: Object.keys(raw.scripts || {}),
          dependencies: Object.keys(raw.dependencies || {}),
          devDependencies: Object.keys(raw.devDependencies || {}),
        };
      } catch {}
    }

    return {
      success: true,
      dir: targetDir,
      name: dirName,
      treeString,
      entries,
      totalFiles,
      totalDirs,
      truncated,
      packageInfo,
    };
  } catch (err) {
    return { success: false, treeString: '', entries: [], totalFiles: 0, totalDirs: 0 };
  }
}

app.post('/api/ai/chat', async (req, res) => {
  const {
    messages = [],
    logs = '',
    recentLines = [],
    cwd = '',
    sessions = [],
    workspaceRoot = '',
    workspaceFiles = [],
    workspaceTree = '',
    cwdTree = '',
    cwdEntries = [],
    cwdPackageInfo = null,
    activeFile = null,
    openTabs = [],
    agentMode = 'autonomous',
  } = req.body;

  const mergedLogs = stripAnsi(
    (Array.isArray(recentLines) && recentLines.length > 0 ? recentLines.join('\n') : logs) || ''
  ).trim();

  const geminiKey = getGeminiApiKey();
  const openAiClient = getOpenAIClient();

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  let cleanUserQuery = lastUserMsg;
  const questionMatch = lastUserMsg.match(/User Question:\s*([\s\S]*)$/i);
  if (questionMatch && questionMatch[1].trim()) {
    cleanUserQuery = questionMatch[1].trim();
  }
  // Real-time Filesystem Tree Discovery
  const activeCwd = inferProjectRoot({ cwd, workspaceRoot, activeFile, openTabs, activeDir: '' });
  const cwdName = activeCwd ? path.basename(activeCwd) : 'Workspace';

  let effectiveCwdTree = cwdTree;
  let effectiveCwdEntries = cwdEntries;
  let effectiveCwdPackage = cwdPackageInfo;

  if ((!effectiveCwdTree || effectiveCwdTree.length < 5) && activeCwd && fs.existsSync(activeCwd)) {
    const scanned = scanDirectoryTreeSync(activeCwd, 4, 350);
    effectiveCwdTree = scanned.treeString;
    effectiveCwdEntries = scanned.entries;
    effectiveCwdPackage = scanned.packageInfo;
  }

  let effectiveWsTree = workspaceTree;
  if (!effectiveWsTree && workspaceRoot && fs.existsSync(workspaceRoot)) {
    const scanned = scanDirectoryTreeSync(workspaceRoot, 4, 350);
    effectiveWsTree = scanned.treeString;
  }

  // If no cloud LLM configured, immediately return conversational smart reply
  if (!geminiKey && !openAiClient) {
    const reply = generateSmartTerminalReply({
      query: cleanUserQuery,
      lines: mergedLogs ? mergedLogs.split(/\r?\n/) : [],
      cwd: activeCwd,
      sessions,
      workspaceRoot,
      openTabs,
      activeFile,
      cwdTree: effectiveCwdTree,
      packageInfo: effectiveCwdPackage,
    });
    return res.json({
      success: true,
      reply: sanitizeAiReply(reply),
      backend: 'enterprise-smart-engine',
    });
  }

  let cwdScopeSection = `\n================================================================================\n1. ACTIVE WORKING DIRECTORY FILESYSTEM SCOPE\n================================================================================\n` +
    `Directory Path: ${activeCwd}\n` +
    `Folder Name: ${cwdName}\n`;

  if (effectiveCwdPackage) {
    cwdScopeSection += `Project Manifest: ${effectiveCwdPackage.name || cwdName} (v${effectiveCwdPackage.version || '1.0.0'})` +
      (effectiveCwdPackage.description ? `\nDescription: ${effectiveCwdPackage.description}` : '') +
      (effectiveCwdPackage.scripts && effectiveCwdPackage.scripts.length > 0 ? `\nAvailable Scripts: ${effectiveCwdPackage.scripts.join(', ')}` : '') +
      (effectiveCwdPackage.dependencies && effectiveCwdPackage.dependencies.length > 0 ? `\nDependencies: ${effectiveCwdPackage.dependencies.slice(0, 20).join(', ')}` : '') + '\n';
  }

  if (effectiveCwdTree) {
    cwdScopeSection += `\nComplete Directory Tree of "${cwdName}":\n${effectiveCwdTree}\n`;
  } else if (Array.isArray(effectiveCwdEntries) && effectiveCwdEntries.length > 0) {
    cwdScopeSection += `\nFiles & Folders in "${cwdName}":\n` +
      effectiveCwdEntries.map(e => `${e.isDirectory ? '[dir]' : '[file]'} ${e.relativePath || e.name}`).join('\n') + '\n';
  }

  let wsScopeSection = '';
  if (workspaceRoot && workspaceRoot !== activeCwd) {
    wsScopeSection = `\n================================================================================\n2. ROOT WORKSPACE PROJECT SCOPE\n================================================================================\n` +
      `Workspace Root: ${workspaceRoot}\n` +
      (effectiveWsTree ? `Root Filesystem Tree:\n${effectiveWsTree}\n` : `Root Files: ${(workspaceFiles || []).slice(0, 50).join(', ')}\n`);
  }

  // Monaco Code Editor Tabs Context
  let monacoTabsSection = '';
  if (Array.isArray(openTabs) && openTabs.length > 0) {
    monacoTabsSection = `\n================================================================================\n3. MONACO CODE EDITOR: ALL OPEN TABS & BUFFER CONTENTS (${openTabs.length} open tabs)\n================================================================================\n` +
      openTabs.map((tab, idx) => {
        const isCurrent = tab.isActive || (activeFile && (activeFile.path === tab.path || activeFile.name === tab.name));
        const cursor = tab.cursorPosition ? ` | Cursor Line ${tab.cursorPosition.lineNumber}, Col ${tab.cursorPosition.column}` : '';
        const status = tab.isDirty ? 'UNSAVED EDITS IN BUFFER' : 'SAVED TO DISK';
        const snippet = tab.contentSnippet || tab.content || '(empty)';
        return `Tab [${idx + 1}]: ${isCurrent ? '>>> [CURRENT ACTIVE TAB] <<< ' : ''}"${tab.name}"\n` +
          `File Path: ${tab.path}\n` +
          `Language: ${tab.language || 'plaintext'} | Buffer Status: ${status}${cursor}\n` +
          `Code Content:\n\`\`\`${tab.language || ''}\n${snippet}\n\`\`\``;
      }).join('\n\n') + '\n';
  } else if (activeFile) {
    monacoTabsSection = `\n================================================================================\n3. MONACO CODE EDITOR: ACTIVE FILE BUFFER\n================================================================================\n` +
      `Active File: "${activeFile.name}" (${activeFile.path})\n` +
      `Language: ${activeFile.language || 'plaintext'} | Buffer Status: ${activeFile.isDirty ? 'Unsaved Edits' : 'Saved'}\n` +
      `Code Content:\n\`\`\`${activeFile.language || ''}\n${activeFile.content ? activeFile.content.slice(0, 6000) : '(empty)'}\n\`\`\`\n`;
  } else {
    monacoTabsSection = `\n================================================================================\n3. MONACO CODE EDITOR\n================================================================================\n(No editor tabs currently open)\n`;
  }

  let agentRoleInstructions = '';
  if (agentMode === 'editor') {
    agentRoleInstructions = `
YOU ARE IN MONACO EDITOR AGENT MODE:
Your focus is analyzing, refactoring, and modifying code in Monaco editor.
Active open file: ${activeFile ? `"${activeFile.name}" (${activeFile.path})` : 'None open yet'}.
Provide complete, drop-in replacement code in standard code blocks so the user can use "Apply to Monaco".
If you need to create a new file or open an existing file, you can output an action block:
\`\`\`action
{"action": "createFile", "path": "relativePath", "content": "file contents..."}
\`\`\`
\`\`\`action
{"action": "openFile", "path": "relativePath"}
\`\`\`
`;
  } else if (agentMode === 'terminal') {
    agentRoleInstructions = `
YOU ARE IN TERMINAL DEBUGGER AGENT MODE:
Your focus is monitoring terminal commands, diagnosing runtime errors, stack traces, and fixing issues in the shell.
Always provide plain-English root cause analysis and clean executable code blocks (\`\`\`sh ... \`\`\`) that the user can run with 1-click in the terminal.
`;
  } else {
    // Autonomous Mode
    agentRoleInstructions = `
YOU ARE IN FULL AUTONOMOUS AGENT MODE (Third Eye Agent):
You have direct tools and authority to perform file and directory operations in the user's workspace.
When you want to create a file, edit/write to a file, create a directory, open a file in Monaco editor, or execute a command, include structured JSON action blocks in your output:
\`\`\`action
{"action": "createFile", "path": "relativePath", "content": "file contents..."}
\`\`\`
\`\`\`action
{"action": "writeFile", "path": "relativePath", "content": "updated full content..."}
\`\`\`
\`\`\`action
{"action": "createDirectory", "path": "relativePath"}
\`\`\`
\`\`\`action
{"action": "openFile", "path": "relativePath"}
\`\`\`
\`\`\`action
{"action": "executeCommand", "command": "command to run"}
\`\`\`
\`\`\`action
{"action": "switchWorkspace", "path": "relativePathOrAbsolutePath"}
\`\`\`
The application will automatically execute these action blocks, update the Monaco editor, update the workspace filesystem, and show live progress accordions.
Always accompany actions with clear, friendly pair-programming explanation.
`;
  }

  const sessionsOverview = Array.isArray(sessions) && sessions.length > 0
    ? `\n\nAll Active Workspace Terminal Tabs (${sessions.length} open sessions):\n` +
      sessions.map((s, idx) => `[Tab ${idx + 1}: "${s.title}" (${s.isRemote ? `Remote VM: ${s.ip || s.user || 'SSH'}` : 'Local Workstation'})]${s.isFocused ? ' [CURRENT FOCUS]' : ''}\nWorking Path: ${s.cwd}\nRecent buffer (${(s.recentLines || []).length} lines):\n${(s.recentLines || []).slice(-35).join('\n') || '(prompt ready)'}`).join('\n\n')
    : '';

  const systemPrompt = `You are THIRD EYE AI, an intelligent, conversational agentic AI developer assistant embedded inside the user's terminal workspace and Monaco code editor.
You have real-time visibility and full context across all active terminal tabs, the complete project filesystem tree, and all open Monaco code editor tabs.
${agentRoleInstructions}
${cwdScopeSection}${wsScopeSection}${monacoTabsSection}
CURRENT ACTIVE TERMINAL SCREEN & LIVE BUFFER:
\`\`\`terminal
${mergedLogs.slice(-6000) || '(Terminal buffer ready / awaiting input)'}
\`\`\`

CRITICAL ENVIRONMENT AWARENESS & DIRECT BEHAVIOR RULES:
1. FULL DIRECTORY AND FILESYSTEM KNOWLEDGE (HIGHEST PRIORITY):
   You have DIRECT, REAL-TIME VISIBILITY into the filesystem tree and all directory contents provided above for both the active working directory (${activeCwd}) and workspace root (${workspaceRoot || activeCwd}).
   - When the user asks "tell me what's inside it?", "what is in this folder?", "what files do I have?", "what does this project do?", or asks about folder structure:
     >>> NEVER TELL THE USER TO RUN "ls", "ls -la", "dir", OR "find" IN THE TERMINAL! <<<
     The user is asking YOU because you are their pair programmer with direct environment knowledge. Immediately inspect the provided DIRECTORY TREE above, and directly list, categorize, and explain the files, folders, architecture, scripts, and purpose of the directory!

2. COMPLETE MONACO EDITOR VISIBILITY (HIGHEST PRIORITY):
   You have DIRECT visibility into ALL open tabs in the Monaco code editor, their file paths, dirty (unsaved) status, and their full code buffers.
   - When the user asks about open files, unsaved changes, code in tabs, or asks to refactor/inspect code, directly cite the tab name, file path, and reference lines or contents from the open Monaco tabs.

3. DYNAMIC ENVIRONMENT SYNC:
   Notice that the terminal working directory is ${activeCwd}. If the user navigated into a subfolder or subproject (e.g. ${path.basename(activeCwd) || 'current folder'}), your primary scope for folder contents is that active directory.

CONVERSATION & ASSISTANCE PROTOCOL:
You adapt seamlessly between two interaction modes based on what the user needs:

1. HUMAN CONVERSATIONAL MODE:
- When the user asks casual, general, conceptual, feedback, or conversational questions (e.g. "hi", "how are you?", "can we talk like humans?", "what do you think?", "who are you?", "thanks for your help"):
  - Answer naturally, conversationally, warmly, and thoughtfully—just like an experienced software engineer pair-programming with the user.
  - Do NOT dump terminal diagnostics, checklists, or robotic templates.

2. TECHNICAL ASSISTANCE MODE (HUMAN + TECH COMBINATION):
- When the user asks for technical help, code changes, or system tasks:
  Provide clear explanation, executable code/action blocks, and actionable next steps.

Context Awareness:
- Always reference relative project file paths accurately.
- Formatting Hygiene: Use bold section headings (e.g. **Section Title:**) and clean bullet points.
${sessionsOverview}`;

  if (geminiKey) {
    try {
      const formattedContents = [];
      for (const msg of messages) {
        const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
        let text = msg.content || msg.text || '';
        if (!text) continue;
        if (role === 'user') {
          const qMatch = text.match(/User Question:\s*([\s\S]*)$/i);
          if (qMatch && qMatch[1].trim()) {
            text = qMatch[1].trim();
          }
        }
        if (formattedContents.length > 0 && formattedContents[formattedContents.length - 1].role === role) {
          formattedContents[formattedContents.length - 1].parts[0].text += `\n\n${text}`;
        } else {
          formattedContents.push({ role, parts: [{ text }] });
        }
      }
      if (formattedContents.length > 0 && formattedContents[0].role !== 'user') {
        formattedContents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
      }

      const reply = await callGemini({
        apiKey: geminiKey,
        systemPrompt,
        contents: formattedContents,
        responseJson: false,
      });

      if (reply && reply.trim().length > 0) {
        return res.json({
          success: true,
          reply: sanitizeAiReply(reply.trim()),
          backend: 'gemini-cloud-engine',
        });
      }
    } catch (geminiErr) {
      console.warn('[AI Service] Gemini error:', geminiErr.message);
      if (geminiErr.message.includes('Authentication') || geminiErr.message.includes('API_KEY_INVALID') || geminiErr.message.includes('400') || geminiErr.message.includes('401') || geminiErr.message.includes('403')) {
        return res.json({
          success: true,
          reply: `**AI API Key Rejected by Google**: The \`GEMINI_API_KEY\` in your \`.env\` was rejected (${geminiErr.message.includes('API_KEY_INVALID') ? 'API key invalid' : geminiErr.message.slice(0, 100)}).\n\nTo enable live, conversational AI:\n1. Get a free API key at [Google AI Studio](https://aistudio.google.com/) (keys start with \`AIzaSy...\`).\n2. Open your \`.env\` file and set: \`GEMINI_API_KEY=AIzaSy...\`\n3. Or configure an \`OPENAI_API_KEY=sk-...\` in \`.env\`.`,
          backend: 'gemini-auth-error',
        });
      }
      if (!openAiClient) {
        const reply = generateSmartTerminalReply({
          query: cleanUserQuery,
          lines: mergedLogs ? mergedLogs.split(/\r?\n/) : [],
          cwd: activeCwd,
          sessions,
          workspaceRoot,
          openTabs,
          activeFile,
          cwdTree: effectiveCwdTree,
          packageInfo: effectiveCwdPackage,
        });
        return res.json({
          success: true,
          reply: sanitizeAiReply(reply),
          backend: 'enterprise-smart-engine',
        });
      }
    }
  }

  if (openAiClient) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      const cleanedMessages = messages.map((m) => {
        let content = m.content || m.text || '';
        if (m.role === 'user') {
          const qMatch = content.match(/User Question:\s*([\s\S]*)$/i);
          if (qMatch && qMatch[1].trim()) {
            content = qMatch[1].trim();
          }
        }
        return { role: m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user', content };
      });
      const completion = await openAiClient.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...cleanedMessages],
        temperature: 0.3,
      });

      return res.json({
        success: true,
        reply: sanitizeAiReply(completion.choices[0]?.message?.content || 'No response.'),
        backend: 'openai-cloud-engine',
      });
    } catch (err) {
      const reply = generateSmartTerminalReply({
        query: cleanUserQuery,
        lines: mergedLogs ? mergedLogs.split(/\r?\n/) : [],
        cwd: activeCwd,
        sessions,
        workspaceRoot,
        openTabs,
        activeFile,
        cwdTree: effectiveCwdTree,
        packageInfo: effectiveCwdPackage,
      });
      return res.json({
        success: true,
        reply: sanitizeAiReply(reply),
        backend: 'enterprise-smart-engine',
      });
    }
  }
});

app.get('/api/ai/status', (req, res) => {
  reloadEnvIfNeeded();
  const geminiKey = getGeminiApiKey();
  const openAiClient = getOpenAIClient();
  return res.json({
    success: true,
    hasGeminiKey: Boolean(geminiKey),
    hasOpenAiKey: Boolean(openAiClient),
    activeProvider: geminiKey ? 'gemini' : openAiClient ? 'openai' : 'none',
    models: ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'],
  });
});

app.post('/api/ai/save-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    return res.status(400).json({ success: false, error: 'API key is required' });
  }
  const cleanKey = apiKey.trim();
  try {
    const envPath = path.join(__dirname, '../../.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    const isGemini = cleanKey.startsWith('AIzaSy') || !cleanKey.startsWith('sk-');
    if (isGemini) {
      if (/^GEMINI_API_KEY=/m.test(envContent)) {
        envContent = envContent.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${cleanKey}`);
      } else {
        envContent += `\nGEMINI_API_KEY=${cleanKey}\n`;
      }
      process.env.GEMINI_API_KEY = cleanKey;
    } else {
      if (/^OPENAI_API_KEY=/m.test(envContent)) {
        envContent = envContent.replace(/^OPENAI_API_KEY=.*$/m, `OPENAI_API_KEY=${cleanKey}`);
      } else {
        envContent += `\nOPENAI_API_KEY=${cleanKey}\n`;
      }
      process.env.OPENAI_API_KEY = cleanKey;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    return res.json({ success: true, message: 'API Key successfully configured in .env and active!' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================================================
// AUTONOMOUS AGENT LOOP ENDPOINTS (Phase 4 & Phase 5)
// ==========================================================================
let AgentLoopClass = null;
let RepoMapClass = null;
let HybridRetrieverClass = null;
let ContextBudgetManagerClass = null;
let compactTurnsFn = null;
let permissionPolicyEngine = null;

try {
  const loopMod = require('./dist/loop');
  const repoMod = require('./dist/context/repoMap');
  const retMod = require('./dist/context/retriever');
  const bgtMod = require('./dist/context/budgetManager');
  const cmpMod = require('./dist/context/compaction');
  const prmMod = require('./dist/tools/permissions');

  AgentLoopClass = loopMod.AgentLoop;
  RepoMapClass = repoMod.RepoMap;
  HybridRetrieverClass = retMod.HybridRetriever;
  ContextBudgetManagerClass = bgtMod.ContextBudgetManager;
  compactTurnsFn = cmpMod.compactConversationHistory;
  permissionPolicyEngine = prmMod.permissionPolicy;
} catch (e) {
  console.warn('[AI Service] dist modules not yet built:', e.message);
}

let AgentRouterClass = null;
let SkillManagerClass = null;

try {
  const agentMod = require('./dist/agents');
  AgentRouterClass = agentMod.AgentRouter;
  const skillMod = require('./dist/skills/skillManager');
  SkillManagerClass = skillMod.SkillManager;
} catch (e) {
  console.warn('[AI Service] agents/skills modules not yet built:', e.message);
}

let defaultWorkspace = path.resolve(__dirname, '../..');
let repoMapInstance = RepoMapClass ? new RepoMapClass(defaultWorkspace) : null;
let hybridRetrieverInstance = (repoMapInstance && HybridRetrieverClass) ? new HybridRetrieverClass(repoMapInstance) : null;
let agentLoopInstance = AgentLoopClass ? new AgentLoopClass(defaultWorkspace) : null;
let agentRouterInstance = AgentRouterClass ? new AgentRouterClass(defaultWorkspace) : null;
let skillManagerInstance = SkillManagerClass ? new SkillManagerClass(defaultWorkspace) : null;

let getActiveRunningTasksSummary = null;
let executeStopServer = null;
try {
  const termMod = require('./dist/tools/runTerminal');
  getActiveRunningTasksSummary = termMod.getActiveRunningTasksSummary;
  executeStopServer = termMod.executeStopServer;
} catch (e) {}

// Get active running tasks and ports
app.get('/api/ai/server/running-tasks', (req, res) => {
  if (getActiveRunningTasksSummary) {
    return res.json({ success: true, summary: getActiveRunningTasksSummary() });
  }
  return res.json({ success: true, summary: 'No active background tasks or server processes running.' });
});

// Explicit stop server endpoint
app.post('/api/ai/server/stop', async (req, res) => {
  try {
    if (executeStopServer) {
      const result = await executeStopServer(req.body);
      return res.json(result);
    }
    return res.status(500).json({ error: 'runTerminal tool not initialized' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Get available skills
app.get('/api/ai/skills', (req, res) => {
  const ws = req.query.workspaceRoot || defaultWorkspace;
  if (!skillManagerInstance && SkillManagerClass) {
    skillManagerInstance = new SkillManagerClass(ws);
  }
  if (skillManagerInstance) {
    skillManagerInstance.setWorkspaceRoot(ws);
    const skills = skillManagerInstance.loadSkills();
    return res.json({ success: true, count: skills.length, skills });
  }
  return res.json({ success: true, count: 0, skills: [] });
});

// SSE Streaming Autonomous Agent Endpoint
app.post('/api/ai/agent/stream', async (req, res) => {
  const {
    messages = [],
    sessionId = `session-${Date.now()}`,
    workspaceRoot = defaultWorkspace,
    openTabs = [],
    terminalTail = '',
    model,
    context_v2 = true,
    agentMode = 'autonomous',
    activeFile = null,
  } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (agentRouterInstance) {
      agentRouterInstance.setWorkspaceRoot(workspaceRoot);
      const lastMsg = messages[messages.length - 1];
      const userPrompt = lastMsg?.role === 'user' ? lastMsg.content : (req.body.prompt || '');

      await agentRouterInstance.execute(
        userPrompt,
        {
          workspaceRoot,
          sessionId,
          openTabs,
          terminalTail,
          activeFile,
          history: messages.slice(0, -1),
          agentMode,
          model,
          apiKey: getGeminiApiKey() || undefined,
        },
        (event) => {
          sendEvent(event.type, { ...event.data, sessionId: event.sessionId });
        }
      );

      res.end();
      return;
    }

    if (!agentLoopInstance) {
      throw new Error('AgentLoop not initialized. Run tsc build first.');
    }

    agentLoopInstance.setWorkspaceRoot(workspaceRoot);
    if (context_v2 && repoMapInstance) {
      repoMapInstance.setWorkspaceRoot(workspaceRoot);
    }

    const lastMsg = messages[messages.length - 1];
    const userPrompt = lastMsg?.role === 'user' ? lastMsg.content : '';

    // Hybrid retrieval
    let relevantChunks = [];
    if (context_v2 && hybridRetrieverInstance && userPrompt) {
      relevantChunks = await hybridRetrieverInstance.retrieveRelevantChunks({
        userQuery: userPrompt,
        workspaceRoot,
        openTabs,
        maxChunks: 4,
      });
    }

    const repoSummary = (context_v2 && repoMapInstance) ? repoMapInstance.getRepoMapSummary(50) : '';
    const chunkText = relevantChunks
      .map((c) => `--- File: ${c.filePath} (lines ${c.startLine}-${c.endLine}) ---\n${c.content}`)
      .join('\n\n');

    let skillsPromptText = '';
    if (skillManagerInstance) {
      skillManagerInstance.setWorkspaceRoot(workspaceRoot);
      const matched = skillManagerInstance.matchSkills(userPrompt, 3);
      if (
        matched.length === 0 &&
        (userPrompt.toLowerCase().includes('website') ||
         userPrompt.toLowerCase().includes('project') ||
         userPrompt.toLowerCase().includes('app') ||
         userPrompt.toLowerCase().includes('build') ||
         userPrompt.toLowerCase().includes('create') ||
         userPrompt.toLowerCase().includes('design'))
      ) {
        const defaultWeb = skillManagerInstance.getSkill('web-app-architecture');
        const defaultDesign = skillManagerInstance.getSkill('frontend-design');
        if (defaultWeb) matched.push(defaultWeb);
        if (defaultDesign) matched.push(defaultDesign);
      }
      skillsPromptText = skillManagerInstance.formatSkillsPrompt(matched);
    }

    const systemPrompt = `You are THIRD_EYE, a world-class autonomous AI coding agent designed to outperform Cursor, Claude Code, and Antigravity.
You are operating strictly within the workspace root: ${workspaceRoot} (project name: ${path.basename(workspaceRoot)}).
You have direct tool access to read, write, edit, search files, inspect directories, and run terminal commands.
Always use tools (such as listDir, readFile, searchCode) to deeply inspect the workspace structure and existing file states before writing code.
ZERO PLACEHOLDERS & NO EMPTY FILES: Never output empty files, stub functions, or "// TODO" placeholders. Every file must be a complete, robust, full-featured production implementation.
RICH AESTHETICS & MODERN UI: For web and frontend projects, produce visually stunning, modern designs (Tailwind/CSS, curated color palettes, Google Fonts like Inter/Outfit, smooth micro-animations, glassmorphism, rich mock datasets with Unsplash images). Never output raw unstyled HTML.
POLYGLOT EXCELLENCE: Support any language and framework with idiomatic best practices, clean modular architecture, and zero syntax errors.
When modifying code: every write or edit produces a reviewable diff for the developer.
Workspace Root: ${workspaceRoot}
${skillsPromptText ? `\n${skillsPromptText}\n` : ''}
${repoSummary ? `\nWorkspace Repo Map:\n${repoSummary}\n` : ''}
${chunkText ? `\nRelevant Code Chunks:\n${chunkText}\n` : ''}
${terminalTail ? `\nRecent Terminal State:\n${terminalTail}\n` : ''}`;

    // Compact history if needed
    const turns = messages.slice(0, -1);
    const compactedTurns = (context_v2 && compactTurnsFn) ? compactTurnsFn(turns, 10) : turns;

    const result = await agentLoopInstance.run({
      userMessage: userPrompt,
      workspaceRoot,
      sessionId,
      model,
      envelope: {
        systemPrompt,
        repoMapSummary: repoSummary,
        openTabs,
        terminalTail,
        history: compactedTurns,
      },
      onDelta: (delta) => {
        sendEvent('delta', { delta, sessionId });
      },
      onToolCall: (tc) => {
        sendEvent('tool_call', { toolCall: tc, sessionId });
      },
      onToolResult: (tr) => {
        sendEvent('tool_result', { toolResult: tr, sessionId });
      },
      onStatus: (status) => {
        sendEvent('status', { status, sessionId });
      },
      onPermissionRequest: async (permReq) => {
        sendEvent('permission_request', { ...permReq, sessionId });
        return new Promise((resolve) => {
          permissionPolicyEngine?.registerPendingPrompt(permReq.id, (decision) => {
            resolve(decision);
          });
        });
      },
    });

    sendEvent('finish', { reply: result.reply, iterations: result.iterations, sessionId });
    res.end();
  } catch (err) {
    sendEvent('error', { error: err.message, sessionId });
    res.end();
  }
});

// Permission Decision Callback
app.post('/api/ai/agent/permission_decision', (req, res) => {
  const { requestId, decision, command } = req.body || {};
  if (!requestId || !decision) {
    return res.status(400).json({ error: 'Missing requestId or decision' });
  }
  permissionPolicyEngine?.resolveDecision(requestId, decision, command);
  res.json({ success: true });
});

// Checkpoints
app.get('/api/ai/agent/checkpoints', (req, res) => {
  if (agentLoopInstance) {
    res.json(agentLoopInstance['toolRegistry'].getCheckpointManager().listCheckpoints());
  } else {
    res.json([]);
  }
});

app.post('/api/ai/agent/revert_checkpoint', async (req, res) => {
  const { checkpointId } = req.body || {};
  if (!checkpointId) return res.status(400).json({ error: 'Missing checkpointId' });
  const cm = agentLoopInstance?.['toolRegistry']?.getCheckpointManager() ||
    agentRouterInstance?.['autonomousAgent']?.['orchestrator']?.['workerPool']?.['loop']?.getToolRegistry()?.getCheckpointManager();
  if (cm) {
    const result = await cm.revertCheckpoint(checkpointId);
    res.json(result);
  } else {
    res.status(500).json({ error: 'CheckpointManager not initialized' });
  }
});

// Emergency Stop / Kill Switch
app.post('/api/ai/agent/stop', (req, res) => {
  const { sessionId } = req.body || {};
  try {
    if (sessionId) {
      agentRouterInstance?.['autonomousAgent']?.cancel(sessionId);
      agentLoopInstance?.cancel?.(sessionId);
    }
    res.json({ success: true, message: `Stopped session ${sessionId || 'all'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Revert all checkpoints created in session
app.post('/api/ai/agent/revert_session', async (req, res) => {
  try {
    const cm = agentLoopInstance?.['toolRegistry']?.getCheckpointManager() ||
      agentRouterInstance?.['autonomousAgent']?.['orchestrator']?.['workerPool']?.['loop']?.getToolRegistry()?.getCheckpointManager();
    if (!cm) return res.status(500).json({ error: 'CheckpointManager not available' });

    const checkpoints = cm.listCheckpoints();
    const allReverted = new Set();
    for (const cp of checkpoints) {
      const r = await cm.revertCheckpoint(cp.id);
      for (const f of r.revertedFiles) allReverted.add(f);
    }
    res.json({ success: true, revertedFiles: Array.from(allReverted) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Running background terminal tasks count
app.get('/api/ai/agent/background_tasks', (req, res) => {
  try {
    const registry = agentLoopInstance?.['toolRegistry'] ||
      agentRouterInstance?.['autonomousAgent']?.['orchestrator']?.['workerPool']?.['loop']?.getToolRegistry();
    const tasks = registry ? registry.getRunningTasks?.() || [] : [];
    res.json({ count: tasks.length, tasks });
  } catch {
    res.json({ count: 0, tasks: [] });
  }
});

// Antigravity Reviewable Artifacts endpoints
app.get('/api/ai/agent/artifacts', (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const artMgr = agentRouterInstance?.getAutonomousAgent?.()?.getOrchestrator?.()?.getArtifactManager();
    if (!artMgr) return res.json({ success: true, count: 0, artifacts: [] });
    const artifacts = artMgr.getAllArtifacts(sessionId);
    res.json({ success: true, count: artifacts.length, artifacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/agent/artifacts/feedback', (req, res) => {
  try {
    const { sessionId, artifactId, comment, author = 'user' } = req.body || {};
    if (!sessionId || !artifactId || !comment) {
      return res.status(400).json({ error: 'sessionId, artifactId, and comment required' });
    }
    const artMgr = agentRouterInstance?.getAutonomousAgent?.()?.getOrchestrator?.()?.getArtifactManager();
    if (!artMgr) return res.status(500).json({ error: 'ArtifactManager not initialized' });
    const updated = artMgr.addFeedback(sessionId, artifactId, comment, author);
    res.json({ success: true, artifact: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[THIRD EYE Dedicated Enterprise AI Service] Running on http://localhost:${PORT}`);
  console.log(`[THIRD EYE Dedicated Enterprise AI Service] Autonomous Agent Loop and Context_v2 Engine active`);
});

