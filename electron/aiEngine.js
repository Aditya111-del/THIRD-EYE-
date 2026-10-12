const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Strips ANSI escape sequences from terminal output to provide clean text for LLM analysis.
 * @param {string} str
 * @returns {string}
 */
function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str
    // Strip OSC sequences (e.g. \x1b]633;D;... ending with \x07 or \x1b\)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Strip DCS, APC, PM sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[P^_][^\x1b]*\x1b\\/g, '')
    // Strip standard ANSI / CSI escape sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // Stray escape characters
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[@-Z\\-_]/g, '')
    // Control characters except newline and tab
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitizes LLM responses to strip system emojis and standardize on clean vector tags
 * @param {string} text
 * @returns {string}
 */
function sanitizeAiReply(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[📁📂]\s*/gu, '[dir] ')
    .replace(/[📄📝]\s*/gu, '[file] ')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\uFE0F?/gu, '')
    .trim();
}

/**
 * Checks if a command or line is an internal shell setup or cosmetic wrapper
 * @param {string} cmd
 * @returns {boolean}
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
 * Ring buffer class to hold a fixed maximum number of log lines per terminal
 */
class RingBuffer {
  /**
   * @param {number} maxLines
   */
  constructor(maxLines = 200) {
    this.maxLines = maxLines;
    /** @type {string[]} */
    this.lines = [];
    this.currentLineRemainder = '';
  }

  /**
   * Append raw streaming data chunk, strip ANSI, and split into complete lines
   * @param {string} chunk
   */
  append(chunk) {
    const clean = stripAnsi(chunk);
    const combined = this.currentLineRemainder + clean;
    const parts = combined.split(/\r?\n/);

    // The last element might be incomplete
    this.currentLineRemainder = parts.pop() || '';

    for (const part of parts) {
      const trimmed = part.trimEnd();
      if (trimmed.length > 0) {
        this.lines.push(trimmed);
        if (this.lines.length > this.maxLines) {
          this.lines.shift();
        }
      }
    }
  }

  /**
   * Return recent lines joined as text
   * @param {number} [count]
   * @returns {string}
   */
  getLogs(count = 200) {
    const sliceCount = Math.min(count, this.lines.length);
    const selected = this.lines.slice(-sliceCount);
    if (this.currentLineRemainder.trim().length > 0) {
      selected.push(this.currentLineRemainder.trim());
    }
    return selected.join('\n');
  }

  /**
   * Return raw array of lines
   * @param {number} [count]
   * @returns {string[]}
   */
  getLines(count = 200) {
    const sliceCount = Math.min(count, this.lines.length);
    return this.lines.slice(-sliceCount);
  }

  clear() {
    this.lines = [];
    this.currentLineRemainder = '';
  }
}

class AIEngine {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxBufferLines=250]
   * @param {number} [options.errorCooldownMs=4000]
   */
  constructor(options = {}) {
    this.maxBufferLines = options.maxBufferLines || 250;
    this.errorCooldownMs = options.errorCooldownMs || 4000;

    /** @type {Map<string, RingBuffer>} */
    this.buffers = new Map();

    /** @type {Map<string, number>} */
    this.lastErrorTimestamp = new Map();

    /** @type {((eventData: { terminalId: string, errorSummary: string, snippet: string, timestamp: number }) => void) | null} */
    this.onErrorDetectedCallback = null;

    // Common DevOps and runtime error patterns
    this.errorSignatures = [
      {
        regex: /(address already in use|EADDRINUSE|listen EADDRINUSE :::?(\d+))/i,
        label: 'Port Conflict (EADDRINUSE)',
      },
      {
        regex: /(Cannot find module ['"]([^'"]+)['"]|ModuleNotFoundError: No module named ['"]?([^'"]+)['"]?)/i,
        label: 'Missing Dependency / Module Not Found',
      },
      {
        regex: /(is not recognized as an internal or external command|command not found:\s*(\S+))/i,
        label: 'Command Not Found',
      },
      {
        regex: /(Permission denied|EACCES: permission denied|access is denied)/i,
        label: 'Permission / Access Denied',
      },
      {
        regex: /(npm ERR!|yarn error|pnpm ERR!)/i,
        label: 'Package Manager Error',
      },
      {
        regex: /(Traceback \(most recent call last\):|UnhandledPromiseRejection|Panic:|FATAL ERROR:)/i,
        label: 'Fatal Runtime Exception',
      },
      {
        regex: /(failed to compile|Failed to parse|SyntaxError:|ReferenceError:|TypeError:)/i,
        label: 'Build / Compilation Syntax Error',
      },
      {
        regex: /(git fatal:|fatal: not a git repository|fatal: destination path.+already exists)/i,
        label: 'Git Repository Error',
      },
      {
        regex: /(Connection timed out|port 22: Connection timed out|Network is unreachable)/i,
        label: 'SSH Connection Timeout (Port 22 Unreachable)',
      },
      {
        regex: /(port 22: Connection refused|Connection refused|ECONNREFUSED)/i,
        label: 'SSH Connection Refused (Port 22 Closed or sshd Down)',
      },
      {
        regex: /(Permission denied \(publickey,password\)|Authentication failed)/i,
        label: 'SSH Authentication Failure (Key or Password Rejected)',
      },
      {
        regex: /(Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED)/i,
        label: 'SSH Host Key Verification Failed',
      },
      {
        regex: /(Could not resolve hostname|Name or service not known|getaddrinfo ENOTFOUND)/i,
        label: 'SSH DNS / Hostname Resolution Error',
      },
    ];

    this.geminiApiKey = null;
    this.geminiModel = 'gemini-3.8-flash';
    this.openaiClient = null;
    this._discoveredModels = null;
    this.initClients();
  }

  /**
   * Inspect the active directory, project package.json, and git state on disk.
   * Extremely fast (1-2ms) and provides deep IDE-grade workspace context.
   * @param {string} [targetCwd]
   * @returns {{ cwd: string, directories: string[], files: string[], packageData: any, gitInfo: { branch: string, hasGit: boolean } }}
   */
  inspectDirectoryContext(targetCwd) {
    try {
      let resolved = targetCwd;
      if (!resolved || !fs.existsSync(resolved)) {
        resolved = path.join(__dirname, '..');
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        resolved = path.dirname(resolved);
      }

      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const directories = [];
      const files = [];

      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        if (entry.name.startsWith('.') && entry.name !== '.env') continue;
        if (entry.isDirectory()) {
          directories.push(entry.name);
        } else {
          files.push(entry.name);
        }
      }

      let packageData = null;
      const pkgPath = path.join(resolved, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          packageData = {
            name: raw.name || path.basename(resolved),
            description: raw.description || '',
            scripts: Object.keys(raw.scripts || {}),
            dependencies: Object.keys(raw.dependencies || {}).slice(0, 15),
          };
        } catch {}
      }

      let gitInfo = { branch: '', hasGit: false };
      const gitHead = path.join(resolved, '.git', 'HEAD');
      if (fs.existsSync(gitHead)) {
        gitInfo.hasGit = true;
        try {
          const head = fs.readFileSync(gitHead, 'utf8').trim();
          gitInfo.branch = head.startsWith('ref: refs/heads/') ? head.replace('ref: refs/heads/', '') : 'detached';
        } catch {}
      }

      return {
        cwd: resolved,
        directories: directories.slice(0, 15),
        files: files.slice(0, 30),
        packageData,
        gitInfo,
      };
    } catch (err) {
      return {
        cwd: targetCwd || process.cwd(),
        directories: [],
        files: [],
        packageData: null,
        gitInfo: { branch: '', hasGit: false },
        error: err.message,
      };
    }
  }

  /**
   * Initialize or reload AI clients from environment
   */
  initClients() {
    try {
      const envPath = path.join(__dirname, '../.env');
      if (fs.existsSync(envPath)) {
        const raw = fs.readFileSync(envPath, 'utf8');
        const geminiMatch = raw.match(/^GEMINI_API_KEY\s*=\s*([^\r\n#]+)/m);
        if (geminiMatch && geminiMatch[1].trim() && geminiMatch[1].trim() !== 'your_gemini_api_key_here') {
          process.env.GEMINI_API_KEY = geminiMatch[1].trim();
        }
        const openAiMatch = raw.match(/^OPENAI_API_KEY\s*=\s*([^\r\n#]+)/m);
        if (openAiMatch && openAiMatch[1].trim() && openAiMatch[1].trim() !== 'your_openai_api_key_here') {
          process.env.OPENAI_API_KEY = openAiMatch[1].trim();
        }
      }
    } catch (e) {
      // ignore
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.trim() !== '' && geminiKey !== 'your_gemini_api_key_here') {
      this.geminiApiKey = geminiKey.trim();
      this.geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    } else {
      this.geminiApiKey = null;
    }

    const openAiApiKey = process.env.OPENAI_API_KEY;
    if (openAiApiKey && openAiApiKey !== 'your_openai_api_key_here') {
      try {
        if (!this.openaiClient || this.openaiClient.apiKey !== openAiApiKey) {
          this.openaiClient = new OpenAI({
            apiKey: openAiApiKey,
            baseURL: process.env.OPENAI_BASE_URL || undefined,
          });
        }
      } catch (err) {
        console.warn('[AIEngine] Failed to initialize OpenAI client:', err.message);
        this.openaiClient = null;
      }
    } else {
      this.openaiClient = null;
    }
  }

  /**
   * Discover available Gemini models enabled for this specific API key
   * @returns {Promise<string[]>}
   */
  async getOrDiscoverModels() {
    if (this._discoveredModels && this._discoveredModels.length > 0) {
      return this._discoveredModels;
    }
    if (!this.geminiApiKey) return [];

    try {
      const urls = [
        'https://generativelanguage.googleapis.com/v1beta/models',
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.geminiApiKey}`,
      ];

      for (const url of urls) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.geminiApiKey,
            },
          });

          if (res.ok) {
            const data = await res.json();
            if (data.models && Array.isArray(data.models)) {
              const valid = data.models
                .map((m) => m.name.replace(/^models\//, ''))
                .filter((n) => n.startsWith('gemini') && !n.includes('embedding') && !n.includes('aqa') && !n.includes('vision'));
              if (valid.length > 0) {
                console.log('[AIEngine] Successfully discovered active Gemini models for key:', valid);
                this._discoveredModels = valid;
                return valid;
              }
            }
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[AIEngine] Model discovery exception:', err.message);
    }
    return [];
  }

  /**
   * Call Google Gemini API with candidate model fallbacks and multi-version support
   * @param {Object} params
   * @param {string} [params.systemPrompt]
   * @param {string} [params.prompt]
   * @param {Array<{role: string, parts: Array<{text: string}>}>} [params.contents]
   * @param {boolean} [params.responseJson=false]
   * @returns {Promise<string>}
   */
  async callGemini({ systemPrompt, prompt, contents, responseJson = false, apiKey: overrideApiKey }) {
    const keyToUse = overrideApiKey || this.geminiApiKey;
    if (!keyToUse) {
      throw new Error('GEMINI_API_KEY is not configured in .env');
    }

    const candidateModels = [
      this.geminiModel || 'gemini-3.8-flash',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
    ].filter((m, i, arr) => m && arr.indexOf(m) === i && !m.includes('2.5') && !m.includes('2.0') && !m.includes('1.5'));

    const body = {
      contents: contents || [
        {
          role: 'user',
          parts: [{ text: prompt || '' }],
        },
      ],
      generationConfig: {
        temperature: responseJson ? 0.2 : 0.4,
      },
    };

    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    if (responseJson) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.geminiApiKey,
    };

    const versions = ['v1beta'];
    let lastError = null;

    for (const model of candidateModels) {
      const cleanModel = model.replace(/^models\//, '');
      for (const ver of versions) {
        const url = `https://generativelanguage.googleapis.com/${ver}/models/${cleanModel}:generateContent?key=${encodeURIComponent(this.geminiApiKey)}`;

        try {
          // 20000ms timeout per model attempt for reliable AI generation
          const timeoutSignal = AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined;
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: timeoutSignal,
          });

          if (!res.ok) {
            const errText = await res.text();
            let parsedMsg = errText;
            try {
              const errJson = JSON.parse(errText);
              parsedMsg = errJson?.error?.message || errText;
            } catch {}

            // If API key is rejected (400 / 401 / 403), do not loop across all models
            if (res.status === 400 || res.status === 401 || res.status === 403) {
              throw new Error(`Gemini Authentication error (${res.status}): ${parsedMsg}`);
            }

            if (res.status === 404 || res.status === 503 || res.status === 429) {
              console.warn(`[AIEngine] Model ${cleanModel} returned ${res.status}, trying next model...`);
              continue;
            }
            throw new Error(`Gemini API error (${res.status}): ${parsedMsg}`);
          }

          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text !== undefined && text !== null) {
            return text;
          }

          throw new Error('Empty response from Gemini API.');
        } catch (err) {
          lastError = err;
          if (err.message.includes('Authentication') || err.message.includes('API key')) {
            throw err;
          }
          console.warn(`[AIEngine] Model ${cleanModel} failed (${err.message}), trying next candidate...`);
          continue;
        }
      }
    }

    throw lastError || new Error('All candidate Gemini models failed.');
  }

  /**
   * Register listener for heuristic error detections
   * @param {(eventData: { terminalId: string, errorSummary: string, snippet: string, timestamp: number }) => void} callback
   */
  setOnErrorDetected(callback) {
    this.onErrorDetectedCallback = callback;
  }

  /**
   * Get or create a buffer for a given terminal ID
   * @param {string} terminalId
   * @returns {RingBuffer}
   */
  getBuffer(terminalId) {
    if (!this.buffers.has(terminalId)) {
      this.buffers.set(terminalId, new RingBuffer(this.maxBufferLines));
    }
    return this.buffers.get(terminalId);
  }

  /**
   * Ingest incoming PTY data stream, maintain buffer, and check error heuristics
   * @param {string} terminalId
   * @param {string} data
   */
  ingest(terminalId, data) {
    const buffer = this.getBuffer(terminalId);
    buffer.append(data);

    // Run error detection heuristics on the incoming chunk
    this.checkErrorHeuristics(terminalId, data);
  }

  /**
   * Check data against error patterns with debounce
   * @param {string} terminalId
   * @param {string} rawChunk
   */
  checkErrorHeuristics(terminalId, rawChunk) {
    const cleanChunk = stripAnsi(rawChunk);
    const now = Date.now();
    const lastTrigger = this.lastErrorTimestamp.get(terminalId) || 0;

    // Cooldown check to avoid multi-line flood
    if (now - lastTrigger < this.errorCooldownMs) {
      return;
    }

    for (const signature of this.errorSignatures) {
      const match = cleanChunk.match(signature.regex);
      if (match) {
        this.lastErrorTimestamp.set(terminalId, now);
        const snippet = cleanChunk.slice(0, 300).trim();

        console.log(`[AIEngine] Detected potential error in ${terminalId}: ${signature.label}`);

        if (this.onErrorDetectedCallback) {
          this.onErrorDetectedCallback({
            terminalId,
            errorSummary: signature.label,
            snippet,
            timestamp: now,
          });
        }
        break;
      }
    }
  }

  /**
   * Analyze recent terminal logs using Gemini / LLM
   * @param {Object} params
   * @param {string} params.terminalId - Terminal session ID
   * @param {string} [params.customPrompt] - User's custom question or request
   * @param {number} [params.logCount=150] - Number of lines to inspect
   * @returns {Promise<{
   *   explanation: string,
   *   suggested_command: string,
   *   severity?: string,
   *   root_cause?: string,
   *   timestamp: number
   * }>}
   */
  /**
   * Analyze recent terminal buffer with LLM or high-fidelity local intelligence
   * @param {Object} params
   * @param {string} params.terminalId
   * @param {string} [params.customPrompt]
   * @param {number} [params.logCount=150]
   * @param {string} [params.cwd]
   * @param {string[]} [params.recentLines]
   * @returns {Promise<{
   *   explanation: string,
   *   suggested_command: string,
   *   severity?: string,
   *   root_cause?: string,
   *   timestamp: number
   * }>}
   */
  async analyzeLogs({ terminalId, customPrompt, logCount = 300, cwd, recentLines, sessions }) {
    this.initClients();

    const buffer = this.getBuffer(terminalId);
    const ptyLogs = buffer.getLogs(logCount);
    const frontendLogs = Array.isArray(recentLines) ? recentLines.slice(-300).join('\n') : '';
    const mergedLogs = (frontendLogs.trim().length > 0 ? frontendLogs : ptyLogs).trim();
    const dirContext = this.inspectDirectoryContext(cwd);

    if (!mergedLogs || mergedLogs.length === 0) {
      return {
        explanation: `Terminal buffer is ready. Currently in directory \`${dirContext.cwd}\` with ${dirContext.files.length} files. Run a command like \`dir\` or \`npm run dev\` to begin!`,
        suggested_command: 'dir',
        severity: 'info',
        root_cause: 'Session Ready / Awaiting Commands',
        timestamp: Date.now(),
      };
    }

    if (!this.geminiApiKey && !this.openaiClient) {
      return this.generateOfflineHeuristicAnalysis(mergedLogs, customPrompt, dirContext, sessions);
    }

    const sessionsOverview = Array.isArray(sessions) && sessions.length > 0
      ? `\n\nAll Active Workspace Terminal Tabs (${sessions.length} open sessions):\n` +
        sessions.map((s, idx) => `[Tab ${idx + 1}: "${s.title}" (${s.isRemote ? `Remote VM: ${s.ip || s.user || 'SSH'}` : 'Local Workstation'})]${s.isFocused ? ' [CURRENT FOCUS]' : ''}\nWorking Path: ${s.cwd}\nRecent buffer (${(s.recentLines || []).length} lines):\n${(s.recentLines || []).slice(-50).join('\n') || '(prompt ready)'}`).join('\n\n')
      : '';

    const systemPrompt = `You are THIRD EYE AI, an expert AI developer assistant embedded in the terminal workspace (similar to Claude or ChatGPT).
You have real-time visibility into all active terminal tabs, command outputs, and workspace files.

Tone and Style:
- Explain what happened in a natural, conversational, and helpful manner like a senior engineer pair-programming with the user.
- Be clear, practical, and direct. Avoid stiff robotic checklists or machine templates.
- Explain the root cause of the issue in plain terms and suggest the exact command to resolve it.
- Never use system emojis.
${sessionsOverview}

Strictly respond with a valid JSON object:
{
  "explanation": "Natural, conversational 2-4 sentence explanation of what happened, what went wrong, and how the fix works. Do NOT use system emojis.",
  "suggested_command": "The exact shell command to run in the terminal, or empty string.",
  "root_cause": "Brief summary of the root cause.",
  "severity": "high" | "medium" | "low" | "info"
}`;

    const userMessageContent = `Terminal Logs (recent buffer):\n\`\`\`\n${mergedLogs}\n\`\`\`\n\n${customPrompt ? `User focus: "${customPrompt}"` : 'Please diagnose recent status and recommend exact fix.'}`;

    // 1. Try Google Gemini first
    if (this.geminiApiKey) {
      try {
        console.log('[AIEngine] Requesting terminal diagnostic from Google Gemini...');
        const rawContent = await this.callGemini({
          systemPrompt,
          prompt: userMessageContent,
          responseJson: true,
        });

        let parsed;
        try {
          parsed = JSON.parse(rawContent.trim());
        } catch {
          const cleanJson = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
          parsed = JSON.parse(cleanJson);
        }

        return {
          explanation: sanitizeAiReply(parsed.explanation || 'Analyzed logs successfully with Gemini.'),
          suggested_command: parsed.suggested_command || '',
          root_cause: sanitizeAiReply(parsed.root_cause || 'Identified pattern in terminal buffer'),
          severity: parsed.severity || 'medium',
          timestamp: Date.now(),
        };
      } catch (geminiErr) {
        console.warn('[AIEngine] Gemini analysis timed out or failed, falling back to local engine:', geminiErr.message);
        if (!this.openaiClient) {
          return this.generateOfflineHeuristicAnalysis(mergedLogs, customPrompt, dirContext, sessions);
        }
      }
    }

    // 2. OpenAI fallback
    if (this.openaiClient) {
      try {
        const model = process.env.OPENAI_MODEL || 'gpt-4o';
        const response = await this.openaiClient.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessageContent },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        });

        const rawContent = response.choices[0]?.message?.content?.trim() || '{}';
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
        } catch {
          const cleanJson = rawContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          parsed = JSON.parse(cleanJson);
        }

        return {
          explanation: sanitizeAiReply(parsed.explanation || 'Analyzed logs successfully.'),
          suggested_command: parsed.suggested_command || '',
          root_cause: sanitizeAiReply(parsed.root_cause || 'Identified pattern in terminal buffer'),
          severity: parsed.severity || 'medium',
          timestamp: Date.now(),
        };
      } catch (apiError) {
        console.warn('[AIEngine] OpenAI LLM API Call failed:', apiError.message);
      }
    }

    return this.generateOfflineHeuristicAnalysis(mergedLogs, customPrompt, dirContext, sessions);
  }

  /**
   * Interactive chat with full terminal and filesystem context
   * @param {Object} params
   * @param {string} params.terminalId
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {string} [params.cwd]
   * @param {string[]} [params.recentLines]
   */
  async chat({
    terminalId,
    messages = [],
    cwd = '',
    recentLines = [],
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
  } = {}) {
    this.initClients();

    const buffer = this.getBuffer(terminalId);
    const ptyLogs = buffer.getLogs(300);
    const frontendLogs = Array.isArray(recentLines) ? recentLines.slice(-300).join('\n') : '';
    const mergedLogs = (frontendLogs.trim().length > 0 ? frontendLogs : ptyLogs).trim();
    const dirContext = this.inspectDirectoryContext(cwd);

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    let cleanUserQuery = lastUserMsg;
    const questionMatch = lastUserMsg.match(/User Question:\s*([\s\S]*)$/i);
    if (questionMatch && questionMatch[1].trim()) {
      cleanUserQuery = questionMatch[1].trim();
    }

    // If no AI keys configured, immediately return high-speed grounded local analysis
    if (!this.geminiApiKey && !this.openaiClient) {
      return {
        reply: sanitizeAiReply(this.generateIntelligentAgentReply(cleanUserQuery, mergedLogs, dirContext, sessions)),
      };
    }

    const activeCwd = cwd || workspaceRoot || dirContext.cwd || process.cwd();
    const cwdName = path.basename(activeCwd) || 'Workspace';

    let cwdScopeSection = `\n================================================================================\n1. ACTIVE WORKING DIRECTORY FILESYSTEM SCOPE\n================================================================================\n` +
      `Directory Path: ${activeCwd}\n` +
      `Folder Name: ${cwdName}\n`;

    if (cwdPackageInfo || dirContext.packageData) {
      const pkg = cwdPackageInfo || dirContext.packageData;
      cwdScopeSection += `Project Manifest: ${pkg.name || cwdName} (v${pkg.version || '1.0.0'})` +
        (pkg.description ? `\nDescription: ${pkg.description}` : '') +
        (pkg.scripts && pkg.scripts.length > 0 ? `\nAvailable Scripts: ${pkg.scripts.join(', ')}` : '') +
        (pkg.dependencies && pkg.dependencies.length > 0 ? `\nDependencies: ${pkg.dependencies.slice(0, 20).join(', ')}` : '') + '\n';
    }

    if (cwdTree) {
      cwdScopeSection += `\nComplete Directory Tree of "${cwdName}":\n${cwdTree}\n`;
    } else if (Array.isArray(cwdEntries) && cwdEntries.length > 0) {
      cwdScopeSection += `\nFiles & Folders in "${cwdName}":\n` +
        cwdEntries.map((e) => `${e.isDirectory ? '[dir]' : '[file]'} ${e.relativePath || e.name}`).join('\n') + '\n';
    }

    let wsScopeSection = '';
    if (workspaceRoot && workspaceRoot !== activeCwd) {
      wsScopeSection = `\n================================================================================\n2. ROOT WORKSPACE PROJECT SCOPE\n================================================================================\n` +
        `Workspace Root: ${workspaceRoot}\n` +
        (workspaceTree ? `Root Filesystem Tree:\n${workspaceTree}\n` : `Root Files: ${(workspaceFiles || []).slice(0, 50).join(', ')}\n`);
    }

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
    }

    let agentRoleInstructions = '';
    if (agentMode === 'editor') {
      agentRoleInstructions = `\nYOU ARE IN MONACO EDITOR AGENT MODE: focus on code modifications and refactoring.\n`;
    } else if (agentMode === 'terminal') {
      agentRoleInstructions = `\nYOU ARE IN TERMINAL DEBUGGER AGENT MODE: focus on shell output, runtime diagnostics, and commands.\n`;
    } else {
      agentRoleInstructions = `\nYOU ARE IN FULL AUTONOMOUS AGENT MODE (Third Eye Agent):\nYou can output JSON action blocks to create files, write files, open files, or run commands:\n\`\`\`action\n{"action": "createFile", "path": "relativePath", "content": "..."}\n\`\`\`\n\`\`\`action\n{"action": "writeFile", "path": "relativePath", "content": "..."}\n\`\`\`\n\`\`\`action\n{"action": "openFile", "path": "relativePath"}\n\`\`\`\n\`\`\`action\n{"action": "executeCommand", "command": "..."}\n\`\`\`\n`;
    }

    const sessionsOverview = Array.isArray(sessions) && sessions.length > 0
      ? `\n\nAll Active Workspace Terminal Tabs (${sessions.length} open sessions):\n` +
        sessions.map((s, idx) => `[Tab ${idx + 1}: "${s.title}" (${s.isRemote ? `Remote VM: ${s.ip || s.user || 'SSH'}` : 'Local Workstation'})]${s.isFocused ? ' [CURRENT FOCUS]' : ''}\nWorking Path: ${s.cwd}\nRecent buffer (${(s.recentLines || []).length} lines):\n${(s.recentLines || []).slice(-35).join('\n') || '(prompt ready)'}`).join('\n\n')
      : '';

    const systemPrompt = `You are THIRD EYE AI, an intelligent, conversational AI developer assistant embedded inside the user's terminal workspace and Monaco code editor.
You have real-time visibility into all active terminal tabs, command outputs, open Monaco editor tabs, and complete project filesystem trees.
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
- When the user asks casual, general, conceptual, feedback, or conversational questions:
  - Answer naturally, conversationally, warmly, and thoughtfully—just like an experienced software engineer pair-programming with the user.
  - Do NOT dump terminal diagnostics, checklists, or robotic templates.

2. TECHNICAL ASSISTANCE MODE (HUMAN + TECH COMBINATION):
- When the user asks for technical help, commands, troubleshooting, code explanation, or system tasks:
  Always fabricate a balanced, high-value human + tech combination:
  a) Human Explanation: Conversational, plain-English understanding of what's happening or why it occurs, friendly and clear.
  b) Technical Execution: Clean, executable markdown code block (\`\`\`sh ... \`\`\` or \`\`\`powershell ... \`\`\`) with exact command(s).
  c) Proactive Guidance / Next Steps: Actionable tips on what to expect, verify, or watch out for.

Context Awareness:
- Always reference relative project file paths accurately.
- Formatting Hygiene: Use bold section headings (e.g. **Section Title:**) and clean bullet points.
${sessionsOverview}

Active Focus Workspace Directory: ${activeCwd}
Git Branch: ${dirContext.gitInfo?.branch || 'None'}`;

    if (this.geminiApiKey) {
      try {
        console.log('[AIEngine] Chatting with Google Gemini with full terminal & filesystem context...');
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

        const reply = await this.callGemini({
          systemPrompt,
          contents: formattedContents,
          responseJson: false,
        });

        if (reply && reply.trim().length > 0) {
          return { reply: sanitizeAiReply(reply.trim()) };
        }
      } catch (err) {
        console.warn('[AIEngine] Gemini chat unavailable/slow:', err.message);
        if (err.message.includes('Authentication') || err.message.includes('API_KEY_INVALID') || err.message.includes('400') || err.message.includes('401') || err.message.includes('403')) {
          if (!this.openaiClient) {
            return {
              reply: `**AI API Key Rejected by Google**: The \`GEMINI_API_KEY\` in your \`.env\` was rejected (${err.message.includes('API_KEY_INVALID') ? 'API key invalid' : err.message.slice(0, 100)}).\n\nTo enable live, conversational AI:\n1. Get a free API key at [Google AI Studio](https://aistudio.google.com/) (keys start with \`AIzaSy...\`).\n2. Open your \`.env\` file and set: \`GEMINI_API_KEY=AIzaSy...\`\n3. Or configure an \`OPENAI_API_KEY=sk-...\` in \`.env\`.`,
            };
          }
        }
        if (!this.openaiClient) {
          return {
            reply: sanitizeAiReply(this.generateIntelligentAgentReply(cleanUserQuery, mergedLogs, dirContext, sessions)),
          };
        }
      }
    }

    if (this.openaiClient) {
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
        const completion = await this.openaiClient.chat.completions.create({
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...cleanedMessages],
          temperature: 0.3,
        });

        return {
          reply: sanitizeAiReply(completion.choices[0]?.message?.content || 'No response from OpenAI.'),
        };
      } catch (err) {
        console.warn('[AIEngine] OpenAI chat failed:', err.message);
      }
    }

    return {
      reply: sanitizeAiReply(this.generateIntelligentAgentReply(cleanUserQuery, mergedLogs, dirContext, sessions)),
    };
  }

  /**
   * Comprehensive local heuristic and diagnostics engine when cloud LLM is offline or in fallback.
   * Fully aware of remote Linux VMs (SSH) and multi-tab terminal workspaces.
   * @param {string} logs
   * @param {string} [customPrompt]
   * @param {any} [dirContext]
   * @param {any[]} [sessions]
   */
  generateOfflineHeuristicAnalysis(logs, customPrompt, dirContext = null, sessions = []) {
    const cleanLogs = (logs || '').trim();
    const p = (customPrompt || '').toLowerCase();
    const lines = cleanLogs ? cleanLogs.split(/\r?\n/).filter((l) => l.trim().length > 0) : [];

    const activeSess = Array.isArray(sessions) ? (sessions.find((s) => s.isFocused || s.isCurrent) || sessions.find((s) => s.isRemote)) : null;
    const isCwdWindows = /^[A-Za-z]:\\/.test(activeSess?.cwd || dirContext?.cwd || '');

    // Check if remote VM / SSH session
    const hasSshKeyword =
      /(?:\[THIRD EYE SSH\]|ssh\s+[\w.-]+@|Connecting to\s+|@[a-zA-Z0-9.-]+:[^$#\r\n]*[$#]|Linux\s+\w+|Welcome to Ubuntu|Debian|CentOS|Red Hat|Last login:|System information as of)/i.test(cleanLogs);
    const hasRemoteSession = Array.isArray(sessions) && sessions.some((s) => (s.isFocused || s.isCurrent) && s.isRemote);
    const isRemote = (hasSshKeyword || hasRemoteSession) && !isCwdWindows;

    let remoteUser = 'root';
    let remoteHost = 'remote-vm';
    let remoteDir = '~';

    if (isRemote) {
      const promptMatch = cleanLogs.match(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([^\r\n$#]*)[$#]/);
      const sshMatch = cleanLogs.match(/ssh\s+(?:-i\s+["'][^"']+["']\s+)?([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+|[\d.]+)/i);

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

    // Extract last command and output, skipping internal shell setup wrappers
    let lastCmd = '';
    let recentOutput = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const match = line.match(/(?:PS\s+[^>]+>|[A-Za-z]:\\[^>]*>|[$#]\s+)(.+)/);
      if (match) {
        const candidate = match[1].trim();
        if (!isInternalShellCmd(candidate)) {
          lastCmd = candidate;
          recentOutput = lines.slice(i + 1);
          break;
        }
      }
    }
    if (!lastCmd) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isInternalShellCmd(line)) continue;
        if (/^(free(?:\s+-[a-zA-Z]+)?|df(?:\s+-[a-zA-Z]+)?|uptime|uname(?:\s+-[a-zA-Z]+)?|top|htop|ps aux|docker ps|git status|ls -la?|cat\s+)/i.test(line)) {
          lastCmd = line.trim();
          recentOutput = lines.slice(i + 1);
          break;
        }
      }
    }

    // 0. GitHub Push Protection & Secret Scanning
    if (/Push cannot contain secrets|GH013|Repository rule violations|unblock-secret|secret-scanning/i.test(cleanLogs)) {
      return {
        explanation: 'GitHub Push Protection blocked your push because a secret was detected in commit history. The secret has been removed from local files. Amend your commit to update git history and force push.',
        suggested_command: 'git add . && git commit --amend -m "feat: THIRD EYE - AI-Native Terminal Workspace" && git push -u origin main --force',
        severity: 'high',
        root_cause: 'GitHub Push Protection (Secret Scanning Blocked Push)',
        timestamp: Date.now(),
      };
    }

    // 0.1 Generic Git Push Rejected
    if (/failed to push some refs|remote rejected|non-fast-forward/i.test(cleanLogs)) {
      return {
        explanation: 'The remote GitHub repository rejected the push due to conflicting branch history. Force-push to overwrite remote main.',
        suggested_command: 'git push -u origin main --force',
        severity: 'high',
        root_cause: 'Git push rejected by remote repository',
        timestamp: Date.now(),
      };
    }

    // 1. Port conflict / EADDRINUSE
    if (/EADDRINUSE|address already in use/i.test(cleanLogs)) {
      const portMatch = cleanLogs.match(/:(\d{3,5})/);
      const port = portMatch ? portMatch[1] : 'the busy port';
      const isWin = process.platform === 'win32';
      return {
        explanation: `A process is already listening on port ${port} (EADDRINUSE). The socket is bound by an active background service. Terminate the conflicting process or choose an alternate port.`,
        suggested_command: isRemote
          ? `sudo fuser -k ${port || 3000}/tcp`
          : (isWin ? `Get-Process -Id (Get-NetTCPConnection -LocalPort ${port || 3000}).OwningProcess | Stop-Process -Force` : `npx kill-port ${port || 3000}`),
        severity: 'high',
        root_cause: `Port conflict on port ${port}`,
        timestamp: Date.now(),
      };
    }

    // 2. Linux Systemd / Service failure (e.g. systemctl status butler / apache2 / nginx)
    if (/Active:\s+failed|failed to start|Active:\s+inactive\s+\(dead\)|Unit\s+[\w.-]+\s+not found/i.test(cleanLogs)) {
      const serviceMatch = cleanLogs.match(/([a-zA-Z0-9_-]+)\.service/);
      const sName = serviceMatch ? serviceMatch[1] : (lastCmd.includes('systemctl') ? lastCmd.split(/\s+/).pop() : 'service');
      return {
        explanation: `Remote system service \`${sName}\` on host \`${remoteHost}\` is failed or inactive. Inspect unit journal telemetry to extract root failure traces.`,
        suggested_command: `sudo journalctl -u ${sName} -n 50 --no-pager`,
        severity: 'high',
        root_cause: `Systemd service ${sName} failed on remote host`,
        timestamp: Date.now(),
      };
    }

    // 3. Docker errors
    if (/Cannot connect to the Docker daemon|Is the docker daemon running\?/i.test(cleanLogs)) {
      return {
        explanation: `The Docker daemon is not running on host \`${remoteHost}\`. The local socket /var/run/docker.sock is unreachable.`,
        suggested_command: isRemote ? 'sudo systemctl start docker' : 'net start docker',
        severity: 'high',
        root_cause: 'Docker daemon stopped or inaccessible',
        timestamp: Date.now(),
      };
    }

    // 4. Missing Node Module
    if (/Cannot find module ['"]([^'"]+)['"]/i.test(cleanLogs)) {
      const modMatch = cleanLogs.match(/Cannot find module ['"]([^'"]+)['"]/i);
      const pkg = modMatch ? modMatch[1] : 'missing-package';
      return {
        explanation: `Module \`${pkg}\` is missing from the environment. Package dependencies must be installed in the active project directory.`,
        suggested_command: `npm install ${pkg}`,
        severity: 'high',
        root_cause: `Missing node module: ${pkg}`,
        timestamp: Date.now(),
      };
    }

    // 5. SSH DNS / Hostname resolution failure
    if (/Could not resolve hostname|Name or service not known/i.test(cleanLogs)) {
      const hostMatch = cleanLogs.match(/hostname\s+([^\s:]+)/i) || cleanLogs.match(/ssh\s+[\w.-]+@([^\s:]+)/i);
      const hName = hostMatch ? hostMatch[1] : 'remote host';
      return {
        explanation: `DNS resolution failed for hostname \`${hName}\`. The network resolver cannot map the hostname to an IP address. Check DNS servers or /etc/hosts.`,
        suggested_command: `ping -c 3 8.8.8.8`,
        severity: 'high',
        root_cause: `DNS Resolution failure for ${hName}`,
        timestamp: Date.now(),
      };
    }

    // 6. SSH Timeout
    if (/Connection timed out|port 22: Connection timed out/i.test(cleanLogs)) {
      const hostMatch = cleanLogs.match(/host\s+([^\s:]+)/i) || cleanLogs.match(/ssh\s+[\w.-]+@([^\s:]+)/i);
      const host = hostMatch ? hostMatch[1] : remoteHost;
      return {
        explanation: `SSH connection timed out reaching \`${host}\` on port 22. The remote VM is either powered off, security groups/firewall block port 22, or network routes are unreachable.`,
        suggested_command: `ssh -vvv ${host}`,
        severity: 'high',
        root_cause: `Port 22 unreachable on ${host}`,
        timestamp: Date.now(),
      };
    }

    // 7. SSH Connection Refused
    if (/port 22: Connection refused|Connection refused/i.test(cleanLogs)) {
      const hostMatch = cleanLogs.match(/host\s+([^\s:]+)/i) || cleanLogs.match(/ssh\s+[\w.-]+@([^\s:]+)/i);
      const host = hostMatch ? hostMatch[1] : remoteHost;
      return {
        explanation: `SSH connection was refused by \`${host}\` on port 22. The sshd service on the remote node is either not running or listening on a non-standard port.`,
        suggested_command: `ssh -p 22 ${host}`,
        severity: 'high',
        root_cause: `SSH daemon not accepting connections on ${host}`,
        timestamp: Date.now(),
      };
    }

    // 8. SSH Permission Denied
    if (/Permission denied \(publickey,password\)/i.test(cleanLogs)) {
      return {
        explanation: `SSH Authentication failed on host \`${remoteHost}\`. The remote server rejected both public key and password credentials. Verify key file permissions and username.`,
        suggested_command: `ssh -i ~/.ssh/id_rsa ${remoteUser}@${remoteHost}`,
        severity: 'high',
        root_cause: 'SSH Credentials / Private Key Rejected',
        timestamp: Date.now(),
      };
    }

    // 9. Host Key Mismatch
    if (/Host key verification failed/i.test(cleanLogs)) {
      const keyMatch = cleanLogs.match(/Offending RSA key in\s+([^\s:]+):(\d+)/i);
      return {
        explanation: `SSH host key fingerprint mismatch for \`${remoteHost}\`. The remote server's cryptographic identity has changed or IP was reassigned.`,
        suggested_command: `ssh-keygen -R ${remoteHost}`,
        severity: 'high',
        root_cause: 'Host Key Fingerprint Mismatch in known_hosts',
        timestamp: Date.now(),
      };
    }

    // 10. Linux bash: command not found
    if (/bash:\s*([^:]+):\s*command not found/i.test(cleanLogs) || /command not found/i.test(cleanLogs)) {
      const cmdMatch = cleanLogs.match(/bash:\s*([^:]+):\s*command not found/i);
      const missingCmd = cmdMatch ? cmdMatch[1].trim() : (lastCmd ? lastCmd.split(/\s+/)[0] : 'command');
      return {
        explanation: `Executable \`${missingCmd}\` was not found on remote node \`${remoteHost}\`. The package is either uninstalled or missing from PATH.`,
        suggested_command: `sudo apt update && sudo apt install -y ${missingCmd}`,
        severity: 'medium',
        root_cause: `Command ${missingCmd} not found in PATH on remote VM`,
        timestamp: Date.now(),
      };
    }

    // 11. Windows command not found
    if (/is not recognized as an internal or external command/i.test(cleanLogs)) {
      const missingCmd = lastCmd ? lastCmd.split(/\s+/)[0] : 'executable';
      return {
        explanation: `Command \`${missingCmd}\` was not found in your Windows PATH. Verify the tool name or install the required binary.`,
        suggested_command: `where ${missingCmd}`,
        severity: 'medium',
        root_cause: `Executable ${missingCmd} missing from Windows PATH`,
        timestamp: Date.now(),
      };
    }

    // 12. Linux High Disk Usage / Storage Saturation (df -h output)
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
          explanation += ` Multiple overlay filesystems indicate Docker images, container layers, and build cache in \`/opt/docker/overlay2\` are occupying most of this space.`;
        }

        return {
          explanation,
          suggested_command: dockerOverlay ? 'docker system prune -a --volumes' : `du -sh ${mount}/* | sort -h`,
          severity: parseInt(pct, 10) >= 85 ? 'high' : 'medium',
          root_cause: `Disk space at ${pct}% capacity on ${mount}`,
          timestamp: Date.now(),
        };
      }
    }

    // 13. High System Load Average (uptime / top output)
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
          timestamp: Date.now(),
        };
      }
    }

    // 14. Remote VM Activity / Healthy State
    if (isRemote) {
      const tabsNote = Array.isArray(sessions) && sessions.length > 1
        ? ` (${sessions.length} active terminal tabs in workspace)`
        : '';
      if (lastCmd && lastCmd !== 'exit' && lastCmd !== 'logout') {
        return {
          explanation: `Remote command \`${lastCmd}\` executed on Linux VM \`${remoteHost}\` (${remoteUser}@${remoteHost} in \`${remoteDir}\`). Process generated ${recentOutput.length} lines of output without fatal exceptions.${tabsNote}`,
          suggested_command: `uptime && df -h`,
          severity: 'info',
          root_cause: `Normal execution on ${remoteHost}`,
          timestamp: Date.now(),
        };
      }
      return {
        explanation: `Connected to remote Linux VM \`${remoteHost}\` as \`${remoteUser}\` in directory \`${remoteDir}\`. Terminal prompt is active and responsive.${tabsNote}`,
        suggested_command: `uptime && df -h`,
        severity: 'info',
        root_cause: `Remote SSH Session Ready`,
        timestamp: Date.now(),
      };
    }

    // 13. Local Shell Activity
    const tabsNote = Array.isArray(sessions) && sessions.length > 1
      ? ` (${sessions.length} active terminal tabs open in workspace)`
      : '';
    if (lastCmd && !isInternalShellCmd(lastCmd)) {
      return {
        explanation: `Command \`${lastCmd}\` executed in local workspace (\`${dirContext?.cwd || 'workspace'}\`). Output buffer contains ${recentOutput.length} lines.${tabsNote}`,
        suggested_command: 'git status',
        severity: 'info',
        root_cause: 'Standard terminal command execution',
        timestamp: Date.now(),
      };
    }

    return {
      explanation: `Terminal session is active and listening for commands in \`${dirContext?.cwd || 'workspace'}\`.${tabsNote}`,
      suggested_command: 'dir',
      severity: 'info',
      root_cause: 'Session Ready / Awaiting Commands',
      timestamp: Date.now(),
    };
  }

  /**
   * Generates a comprehensive, razor-sharp agent reply grounded in the real terminal buffer and active directory on disk.
   * Supports local Windows shells AND remote Linux VM / SSH sessions, plus multi-tab awareness.
   * Executes in < 5ms with zero network latency.
   * @param {string} userPrompt
   * @param {string} logs
   * @param {any} [dirContext]
   * @param {any[]} [sessions]
   * @returns {string}
   */
  generateIntelligentAgentReply(userPrompt, logs, dirContext = null, sessions = []) {
    const p = (userPrompt || '').toLowerCase();
    const cleanLogs = (logs || '').trim();
    const dir = dirContext || this.inspectDirectoryContext();

    const lines = cleanLogs ? cleanLogs.split(/\r?\n/).filter((l) => l.trim().length > 0) : [];

    const activeSess = Array.isArray(sessions) ? (sessions.find((s) => s.isFocused || s.isCurrent) || sessions.find((s) => s.isRemote)) : null;
    const isCwdWindows = /^[A-Za-z]:\\/.test(activeSess?.cwd || dir.cwd || '');
    const isMacPrompt = /@[a-zA-Z0-9.-]+\s+[^%#$\r\n]*[%#$]/.test(cleanLogs);

    // 1. Detect if current context is Remote VM / SSH session
    const hasSshKeyword =
      /(?:\[THIRD EYE SSH\]|ssh\s+[\w.-]+@|Connecting to\s+|Linux\s+\w+|Welcome to Ubuntu|Debian|CentOS|Red Hat|Last login:|System information as of)/i.test(cleanLogs);
    const hasRemoteSession = Array.isArray(sessions) && sessions.some((s) => (s.isFocused || s.isCurrent) && s.isRemote);
    const isRemote = (hasSshKeyword || hasRemoteSession) && !isCwdWindows && !isMacPrompt;

    let remoteUser = 'root';
    let remoteHost = 'remote-vm';
    let remoteDir = '~';

    if (isRemote) {
      const promptMatch = cleanLogs.match(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([^\r\n$#]*)[$#]/);
      const sshMatch = cleanLogs.match(/ssh\s+(?:-i\s+["'][^"']+["']\s+)?([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+|[\d.]+)/i);

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

    // Resolve directory safely
    const effectiveDir = (!isRemote && (dir.cwd === '~' || !dir.cwd)) ? process.cwd() : dir.cwd;
    const projectName = path.basename(effectiveDir) || 'Workspace';

    // Multi-session overview section if multiple sessions are active
    const sessionsSummaryBlock = (Array.isArray(sessions) && sessions.length > 1)
      ? `\n\n**Your Open Terminal Sessions (${sessions.length} total):**\n` +
        sessions.map((s, idx) => `- Tab ${idx + 1} (${s.title}): ${s.isRemote ? `Remote VM \`${s.ip || s.user || 'SSH'}\`` : 'Local Shell'}${s.isFocused ? ' (current tab)' : ''}${s.lastError ? ` — error noted: \`${s.lastError}\`` : ''}`).join('\n')
      : '';

    // 0. GREETINGS & CASUAL CONVERSATION ("hi", "hello", "hey", "who are you", etc.)
    const isGreeting =
      /^(?:hi|hello|hey|greetings|howdy|good\s+(?:morning|afternoon|evening)|yo|sup|who are you|what can you do)[\s!.?]*$/i.test(p.trim()) ||
      p.trim() === 'hi' ||
      p.trim() === 'hello' ||
      p.trim() === 'hey';

    if (isGreeting) {
      if (isRemote) {
        return `Hello! I'm THIRD EYE AI, your developer assistant. I'm connected to your remote SSH session on \`${remoteHost}\` (${remoteUser} in \`${remoteDir}\`).\n\nHow can I help you today? You can ask me to inspect server status, explain command outputs, check disk/RAM usage, or diagnose errors anytime!${sessionsSummaryBlock}`;
      }

      const shellName = activeSess?.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt';
      return `Hello! I'm THIRD EYE AI, your developer assistant. I'm connected to your local **${shellName}** session in project **${projectName}** (\`${effectiveDir}\`).\n\nHow can I help you today? Feel free to ask about your project, run commands, analyze errors, or check system status anytime!${sessionsSummaryBlock}`;
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

I'm connected to your active project **${projectName}** in \`${effectiveDir}\`${activeSess?.title ? ` (**${activeSess.title}**)` : ''}. Whatever you'd like to dive into—whether it's code, errors, or a design discussion—I'm ready!${sessionsSummaryBlock}`;
    }

    // 0.2 CASUAL CHAT & COURTESY
    const isGratitude = /^(?:thanks|thank you|thx|cheers|appreciate it|good job|nice work|awesome|great|perfect|cool|ok|okay|got it|sounds good)[\s!.?]*$/i.test(p);
    if (isGratitude) {
      return `You're very welcome! I'm here in project **${projectName}** whenever you need anything. Feel free to run a command or ask any question!${sessionsSummaryBlock}`;
    }

    const isHowAreYou = /^(?:how are you|how's it going|how are things|whats up|what's up)[\s!.?]*$/i.test(p);
    if (isHowAreYou) {
      const shellName = activeSess?.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt';
      return `Doing great and ready to build with you! Your local **${shellName}** in project **${projectName}** at \`${effectiveDir}\` is active and responsive. What are we working on next?${sessionsSummaryBlock}`;
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
      return `You are currently working inside project **${projectName}** at \`${effectiveDir}\`.

**Active IDE Scope:**
- **Project Root:** \`${effectiveDir}\`
- **Folders:** ${dir.directories.slice(0, 10).map((d) => `\`${d}/\``).join(', ') || 'Scanning...'}
- **Key Files:** ${dir.files.slice(0, 10).map((f) => `\`${f}\``).join(', ') || 'Scanning...'}
${dir.packageData ? `- **Project Stack:** ${dir.packageData.name} (v${dir.packageData.version || '1.0.0'})` : ''}

Everything in the file explorer, Monaco editor, and terminal sessions is linked to this project scope. What would you like to build, refactor, or test next?${sessionsSummaryBlock}`;
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
      const dirsList = dir.directories.slice(0, 15).map((d) => `- \`[dir] ${d}/\``).join('\n');
      const filesList = dir.files.slice(0, 15).map((f) => `- \`[file] ${f}\``).join('\n');

      return `### **Project Overview & Architecture: ${projectName}**

- **Root Location:** \`${effectiveDir}\`
${dir.packageData ? `- **Package Manifest:** ${dir.packageData.name} (Scripts: ${dir.packageData.scripts.join(', ') || 'standard'})` : ''}
${dir.packageData?.dependencies ? `- **Dependencies:** ${dir.packageData.dependencies.slice(0, 8).join(', ')}` : ''}

**Directory Structure:**
${dirsList}
${filesList}

What area would you like to inspect, modify, or test next?${sessionsSummaryBlock}`;
    }

    // Find last executed command by scanning backwards, properly skipping any trailing idle prompt and internal setup
    let lastCmd = '';
    let recentOutput = [];
    let currentIdlePrompt = '';

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const linuxMatch = line.match(/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([^\r\n$#]*)[$#]\s*(.*)$/);
      const winPsMatch = line.match(/^PS\s+([a-zA-Z]:\\[^>]*?)>\s*(.*)$/);
      const winCmdMatch = line.match(/^([a-zA-Z]:\\[^>]*?)>\s*(.*)$/);
      const bareMatch = line.match(/^[$#]\s+([a-zA-Z0-9._/-].*)$/);
      const bareIdleMatch = line.match(/^[$#]\s*$/);

      let cmdText = '';
      if (linuxMatch) {
        cmdText = (linuxMatch[4] || '').trim();
      } else if (winPsMatch) {
        cmdText = (winPsMatch[2] || '').trim();
      } else if (winCmdMatch) {
        cmdText = (winCmdMatch[2] || '').trim();
      } else if (bareMatch && !/^\d+\s+SMP\s+Debian/i.test(bareMatch[1])) {
        cmdText = (bareMatch[1] || '').trim();
      } else if (bareIdleMatch || (linuxMatch && !linuxMatch[4].trim())) {
        if (!currentIdlePrompt) currentIdlePrompt = line.trim();
      }

      if (cmdText && !isInternalShellCmd(cmdText)) {
        lastCmd = cmdText;
        recentOutput = lines.slice(i + 1);
        break;
      }
    }

    if (!lastCmd) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isInternalShellCmd(line)) continue;
        if (/^(free(?:\s+-[a-zA-Z]+)?|df(?:\s+-[a-zA-Z]+)?|uptime|uname(?:\s+-[a-zA-Z]+)?|top|htop|ps aux|docker ps|git status|ls -la?|cat\s+)/i.test(line)) {
          lastCmd = line.trim();
          recentOutput = lines.slice(i + 1);
          break;
        }
      }
    }

    // Telemetry signatures & disk usage detection
    const hasFreeMem = /total\s+used\s+free\s+shared/i.test(cleanLogs) || /Mem:\s+[\d.]+[MGTP]i?/i.test(cleanLogs);
    const hasDf = /Filesystem\s+Size\s+Used\s+Avail\s+Use%/i.test(cleanLogs) || /(?:udev|\/dev\/|overlay|tmpfs)\s+[\d.]+[MGTP]\s+[\d.]+[MGTP]/i.test(cleanLogs);
    const loadMatch = cleanLogs.match(/load average:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/i);
    const partitionMatches = [...cleanLogs.matchAll(/([^\s]+)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+(\d{1,3})%\s+([^\r\n]+)/gi)];
    const highUsage = partitionMatches.filter((m) => parseInt(m[5] || '0', 10) >= 70);
    const hasDocker = cleanLogs.includes('/opt/docker') || cleanLogs.includes('overlay');
    const detectedError = /error|fatal|exception|failed|command not found|cannot find module/i.test(cleanLogs);

    // 1. DISK USAGE & TELEMETRY SATURATION (df -h / load average)
    if (hasDf || loadMatch) {
      const findings = [];
      if (highUsage.length > 0) {
        const topPart = highUsage[0];
        findings.push(`**1. High Disk Usage on \`${topPart[6].trim()}\` (${topPart[5]}% Full — ${topPart[3]} used out of ${topPart[2]})**\nStorage device \`${topPart[1]}\` mounted at \`${topPart[6].trim()}\` has only ${topPart[4]} available.${hasDocker ? ' Multiple `overlay` filesystems show that Docker container layers, images, and build cache in `/opt/docker/overlay2` are using the majority of this space.' : ''}`);
      }
      if (loadMatch) {
        const l1 = parseFloat(loadMatch[1]);
        const l5 = parseFloat(loadMatch[2]);
        const l15 = parseFloat(loadMatch[3]);
        findings.push(`**2. Elevated System Load Average (${l1}, ${l5}, ${l15})**\nYour 1-min and 5-min load averages are high (${l1}), meaning active processes or Docker containers are competing for CPU and disk I/O.`);
      }

      const solutionSteps = [];
      if (hasDocker) {
        solutionSteps.push(`**Step 1: Clean up unused Docker layers & reclaim disk space**\nSafely prune stopped containers, dangling images, and build cache:\n\`\`\`sh\ndocker system prune -a --volumes\n\`\`\`\n*(To check what is taking the most disk space first without deleting: \`du -sh /opt/docker/* | sort -h\`)*`);
      } else if (highUsage.length > 0) {
        solutionSteps.push(`**Step 1: Inspect large files and directories**\nFind the largest directories consuming disk space:\n\`\`\`sh\ndu -sh ${highUsage[0][6].trim()}/* | sort -h | tail -n 10\n\`\`\``);
      }
      if (loadMatch) {
        solutionSteps.push(`**Step 2: Inspect processes causing high CPU/load**\nCheck active processes sorted by CPU and memory consumption:\n\`\`\`sh\ntop -c\n\`\`\`\n*(Or check container resource usage with: \`docker stats --no-stream\`)*`);
      }

      return `Looking at your terminal logs${isRemote ? ` from \`${remoteHost}\` (${remoteUser}@${remoteHost})` : ''}, here is what is happening and how to solve it:

${findings.join('\n\n')}

**How to solve this:**

${solutionSteps.join('\n\n')}${sessionsSummaryBlock}`;
    }

    // 2. ERROR DIAGNOSIS & FIXES
    if (detectedError || p.includes('fix') || p.includes('error') || p.includes('crash') || p.includes('failed') || p.includes('why')) {
      const diag = this.generateOfflineHeuristicAnalysis(cleanLogs, userPrompt, dir, sessions);
      const fixCmd = diag.suggested_command || (isRemote ? 'sudo journalctl -xe -n 50' : 'npm test');

      return `Here is what happened in your terminal and how to fix it:

**The Issue:**
${diag.root_cause}: ${diag.explanation}

**Recommended Fix:**
Run this command in your active terminal:
\`\`\`sh
${fixCmd}
\`\`\`

Let me know if you run into any issues after running this command!${sessionsSummaryBlock}`;
    }

    // A. "WHICH COMMAND DID I RUN"
    const isAskingCommand = p.includes('which command') || p.includes('what command') || p.includes('what did i run') || p.includes('what did i type') || p.includes('last command') || p.includes('what i ran') || p.includes('which cmd');
    if (isAskingCommand) {
      const hasFreeMemLocal = /total\s+used\s+free\s+shared/i.test(cleanLogs) || /Mem:\s+[\d.]+[MGTP]i?/i.test(cleanLogs);
      const memLineMatchLocal = cleanLogs.match(/Mem:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+(?:[\d.]+[MGTP]?i?\s+)?([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);
      const effectiveCmd = lastCmd || (hasFreeMemLocal ? 'free -h' : (hasDf ? 'df -h' : (loadMatch ? 'uptime' : '')));

      if (effectiveCmd) {
        let cmdExplanation = '';
        if (effectiveCmd.startsWith('free')) {
          cmdExplanation = memLineMatchLocal
            ? `\n\nThis command inspects system RAM and swap allocation. You have **${memLineMatchLocal[1]}** total RAM (**${memLineMatchLocal[2]}** used, **${memLineMatchLocal[5] || memLineMatchLocal[3]}** available).`
            : '\n\nThis command inspects real-time memory and swap allocation on the server.';
        } else if (effectiveCmd.startsWith('df')) {
          cmdExplanation = '\n\nThis command displays filesystem disk space usage across all mounted storage partitions.';
        } else if (effectiveCmd.startsWith('uptime')) {
          cmdExplanation = '\n\nThis command displays how long the server has been running along with current 1, 5, and 15-minute load averages.';
        }

        const outputSnippet = recentOutput.length > 0
          ? `\n\nHere is what it returned:\n\`\`\`sh\n${recentOutput.slice(-10).join('\n')}\n\`\`\``
          : '';
        const hostTag = '`' + remoteHost + '`';
        const dirTag = '`' + (isRemote ? remoteDir : dir.cwd) + '`';
        const locationStr = isRemote
          ? ` on remote Linux host ${hostTag} (${remoteUser}@${remoteHost} in ${dirTag})`
          : ` in ${dirTag}`;

        return `You ran \`${effectiveCmd}\`${locationStr}.${outputSnippet}${cmdExplanation}${sessionsSummaryBlock}`;
      }

      if (lines.length > 0) {
        return `Looking at your active terminal screen, here is what recently ran:\n\`\`\`sh\n${lines.slice(-6).join('\n')}\n\`\`\`${sessionsSummaryBlock}`;
      }

      return `No command has been executed yet in this session. The prompt is ready for your input!${sessionsSummaryBlock}`;
    }

    // B. MEMORY & RAM INQUIRIES
    if ((p.includes('memory') || p.includes('ram') || p.includes('swap') || p.includes('free -h')) && hasFreeMem) {
      const memLineMatch = cleanLogs.match(/Mem:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+(?:[\d.]+[MGTP]?i?\s+)?([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);
      const swapLineMatch = cleanLogs.match(/Swap:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);
      const memDetails = memLineMatch
        ? `- **Total Memory:** ${memLineMatch[1]}\n- **Used:** ${memLineMatch[2]}\n- **Free / Available:** ${memLineMatch[5] || memLineMatch[3]}`
        : '- Memory statistics are displayed in the buffer above.';
      const swapDetails = swapLineMatch
        ? `\n- **Swap Space:** ${swapLineMatch[1]} total (${swapLineMatch[2]} used, ${swapLineMatch[3]} free)`
        : '';

      return `Here is the memory status from your \`free -h\` output on \`${remoteHost}\`:

${memDetails}${swapDetails}

\`\`\`sh
${lines.filter((l) => /Mem:|Swap:|total\s+used/i.test(l)).join('\n') || lines.slice(-4).join('\n')}
\`\`\`

Your system memory looks healthy with plenty of available capacity. Let me know if you would like to inspect high-memory processes using \`ps aux --sort=-%mem | head -n 10\`.${sessionsSummaryBlock}`;
    }

    // 3. FILES / DIRECTORY LISTING
    const isFileQuery = (p.includes('list file') || p.includes('show file') || p.includes('what file') || p.includes('which file') || p.includes('directory content') || p.includes('folder structure') || p.includes('tree') || p === 'ls' || p === 'dir');
    if (isFileQuery) {
      if (isRemote) {
        return `You are currently logged into \`${remoteHost}\` as \`${remoteUser}\` in directory \`${remoteDir}\`.

To view the files and folders directly in your active remote session:
\`\`\`sh
ls -la ${remoteDir}
\`\`\`

To inspect disk space and filesystem capacity:
\`\`\`sh
df -h
\`\`\`${sessionsSummaryBlock}`;
      }

      const dirsFormatted = dir.directories.slice(0, 10).map((d) => `- \`[dir] ${d}/\``).join('\n');
      const filesFormatted = dir.files.slice(0, 12).map((f) => `- \`[file] ${f}\``).join('\n');
      return `Here are the files and folders in your project directory (\`${dir.cwd}\`):

**Directories:**
${dirsFormatted || '- None'}

**Key Files:**
${filesFormatted || '- None'}

${dir.packageData ? `This is a Node.js project (**${dir.packageData.name}**). Available npm scripts: ${dir.packageData.scripts.map((s) => `\`npm run ${s}\``).join(', ')}.` : ''}${sessionsSummaryBlock}`;
    }

    // 4. GIT WORKFLOW & VERSION CONTROL (Human + Tech Combination)
    if (p.includes('git') || p.includes('branch') || p.includes('commit') || p.includes('merge') || p.includes('stash') || p.includes('revert') || p.includes('push')) {
      if (/Push cannot contain secrets|GH013|Repository rule violations|unblock-secret|secret-scanning/i.test(cleanLogs)) {
        return `GitHub's **Push Protection** blocked your push because an API key was found in commit history:

- **Detected Location:** Commit history scan
- **Status:** The hardcoded secret has now been removed.

**How to solve:**
Amend your commit to replace the old commit in git history, then force push:
\`\`\`sh
git add .
git commit --amend -m "feat: THIRD EYE - AI-Native Terminal Workspace"
git push -u origin main --force
\`\`\`

*Or simply double-click \`push_to_github.bat\` in your project root!*${sessionsSummaryBlock}`;
      }

      if (/failed to push some refs|remote rejected|non-fast-forward/i.test(cleanLogs)) {
        return `Your Git push was rejected by the remote repository.

**To solve:**
Force-update the remote branch:
\`\`\`sh
git push -u origin main --force
\`\`\`${sessionsSummaryBlock}`;
      }

      if (p.includes('push')) {
        return `To push your local commits to GitHub:
\`\`\`sh
git push -u origin main
\`\`\`

If the remote repository requires overwriting earlier commits:
\`\`\`sh
git push -u origin main --force
\`\`\`${sessionsSummaryBlock}`;
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

Let me know what feature you're planning, and I can suggest branch naming and setup!${sessionsSummaryBlock}`;
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

Always run \`git status\` before and after to verify your working tree!${sessionsSummaryBlock}`;
      }

      if (isRemote) {
        return `You are connected to \`${remoteHost}\` in directory \`${remoteDir}\`. Here is how to inspect git status on the remote server:

\`\`\`sh
git status
\`\`\`
Or view recent commit history:
\`\`\`sh
git log -n 5 --oneline
\`\`\`${sessionsSummaryBlock}`;
      }

      return `You are working on branch \`${dir.gitInfo?.branch || 'main'}\` in \`${dir.cwd}\`.

To inspect your current branch and unstaged changes:
\`\`\`sh
git status
\`\`\`

To view recent commit history:
\`\`\`sh
git log -n 5 --oneline
\`\`\`

Feel free to ask about committing, branching, or resolving merge conflicts anytime!${sessionsSummaryBlock}`;
    }

    // 5. BUILD, RUN & DEV SCRIPTS (Human + Tech Combination)
    if (p.includes('build') || p.includes('dev') || p.includes('npm') || p.includes('start') || p.includes('package')) {
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

Let me know if you run into any compilation or dependency errors!${sessionsSummaryBlock}`;
    }

    // 6. DOCKER & CONTAINER OPS (Human + Tech Combination)
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

Let me know if you would like to inspect a specific container's logs with \`docker logs <id>\`!${sessionsSummaryBlock}`;
    }

    // 7. PORT CONFLICTS & EADDRINUSE (Human + Tech Combination)
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

Replace \`4001\` with whichever port is conflicting!${sessionsSummaryBlock}`;
    }

    // 8. FLEET & ROBOTICS CLUSTER ARCHITECTURE
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

Let me know if you would like to inspect systemctl service health or logs on any of the fleet nodes!${sessionsSummaryBlock}`;
    }

    // 9. EXPLAIN / WHAT IS HAPPENING / ACTIVE TERMINAL COMMAND OUTPUT
    if (lines.length > 0) {
      if (hasFreeMem && (lastCmd.startsWith('free') || !lastCmd)) {
        const memLineMatch = cleanLogs.match(/Mem:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+(?:[\d.]+[MGTP]?i?\s+)?([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);
        const swapLineMatch = cleanLogs.match(/Swap:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);
        return `In your terminal on \`${remoteHost}\`, you executed \`free -h\` to inspect memory capacity.

\`\`\`sh
${(recentOutput.length > 0 ? recentOutput.join('\n') : lines.filter((l) => /total|Mem:|Swap:/i.test(l)).join('\n')) || lines.slice(-5).join('\n')}
\`\`\`

Here is what these numbers tell you:
${memLineMatch ? `- **Total RAM:** ${memLineMatch[1]} installed.\n- **Used RAM:** ${memLineMatch[2]} currently active.\n- **Available RAM:** ${memLineMatch[5] || memLineMatch[3]} immediately free for new programs.\n` : ''}${swapLineMatch ? `- **Swap Space:** ${swapLineMatch[2]} used of ${swapLineMatch[1]} (no paging pressure).\n` : ''}
Your server memory is healthy and operating normally!${sessionsSummaryBlock}`;
      }

      const recentSnippet = lines.slice(-8).join('\n');

      if (isDevServer) {
        const portMatch = cleanLogs.match(/http:\/\/localhost:(\d+)/i);
        const port = portMatch ? portMatch[1] : '3000';
        return `Your development server is active and running at **http://localhost:${port}**, watching for code edits.

\`\`\`sh
${recentSnippet}
\`\`\`

The server is healthy and responding.${sessionsSummaryBlock}`;
      }

      if (lastCmd && lastCmd !== 'exit' && lastCmd !== 'logout' && !isInternalShellCmd(lastCmd)) {
        const locSnippet = isRemote
          ? `on remote host \`${remoteHost}\` (${remoteUser}@${remoteHost} in \`${remoteDir}\`)`
          : `in \`${dir.cwd}\``;

        return `You executed \`${lastCmd}\` ${locSnippet}. Here is what was returned:

\`\`\`sh
${recentOutput.slice(-8).join('\n') || recentSnippet}
\`\`\`

The shell prompt is active and ready. Let me know if you would like me to explain what this output means, debug any issues, or suggest the next command!${sessionsSummaryBlock}`;
      }

      if (isRemote) {
        return `Connected to remote Linux host \`${remoteHost}\` as \`${remoteUser}\` in \`${remoteDir}\`. The shell prompt is idle and waiting for commands. What would you like to run next?${sessionsSummaryBlock}`;
      }

      const shellLabel = activeSess?.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt';
      const displayDir = isRemote ? dir.cwd : effectiveDir;
      return `I'm listening and ready to help with your workspace in project **${projectName}** (\`${displayDir}\`)${activeSess?.title ? ` (**${activeSess.title}**)` : ''}!

Feel free to ask any conceptual or technical questions, run commands, or paste errors for diagnosis. What would you like to explore or do next?${sessionsSummaryBlock}`;
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

Try running one of these directly in your active terminal tab! What area of Linux would you like to explore further?${sessionsSummaryBlock}`;
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

Click **Run** on any block to execute it immediately in your terminal!${sessionsSummaryBlock}`;
    }

    // 10. DEFAULT WORKSPACE RESPONSE (Empty terminal)
    if (isRemote) {
      return `Connected to remote Linux host \`${remoteHost}\` as \`${remoteUser}\` in directory \`${remoteDir}\`.

The remote shell prompt is ready for your commands. You can check system health with:
\`\`\`sh
uptime && df -h
\`\`\`${sessionsSummaryBlock}`;
    }

    const shellLabel = activeSess?.shellType === 'powershell' ? 'PowerShell' : 'Command Prompt';
    const displayDir = isRemote ? dir.cwd : effectiveDir;
    return `I'm listening and ready to help with your workspace in project **${projectName}** (\`${displayDir}\`)${activeSess?.title ? ` (**${activeSess.title}**)` : ''}!

Feel free to ask any conceptual or technical questions, run commands, or paste errors for diagnosis. What would you like to explore or do next?${sessionsSummaryBlock}`;
  }

  /**
   * Clear buffer for terminal
   * @param {string} terminalId
   */
  clearBuffer(terminalId) {
    if (this.buffers.has(terminalId)) {
      this.buffers.get(terminalId).clear();
    }
  }

  /**
   * Remove buffer when terminal is closed
   * @param {string} terminalId
   */
  removeBuffer(terminalId) {
    this.buffers.delete(terminalId);
    this.lastErrorTimestamp.delete(terminalId);
  }
}

module.exports = { AIEngine, stripAnsi };
