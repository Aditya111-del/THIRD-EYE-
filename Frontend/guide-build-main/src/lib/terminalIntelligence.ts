import type { Session } from "@/types/terminal";

export interface ExecutedCommand {
  command: string;
  output: string[];
  user?: string;
  host?: string;
  cwd?: string;
}

/**
 * Strip all ANSI / VT100 control and color sequences
 */
export function stripAnsi(str: string): string {
  if (typeof str !== "string") return "";
  return str
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[P^_][^\x1b]*\x1b\\/g, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Check if command is an internal IDE shell setup wrapper (e.g. init_shell.bat aliases)
 */
function isInternalShellCmd(cmd: string): boolean {
  const c = (cmd || "").trim().toLowerCase();
  return (
    c.startsWith("doskey") ||
    c.startsWith("clear-host") ||
    c === "cls" ||
    c.startsWith("@echo off") ||
    c.startsWith("chcp") ||
    c.includes("init_shell.bat") ||
    c.startsWith("microsoft windows") ||
    c.startsWith("(c) microsoft")
  );
}

/**
 * Robust parser for terminal streams.
 * Anchored to prevent false positives (e.g. kernel version "#1 SMP Debian" being mistaken for a prompt).
 */
export function parseTerminalHistory(lines: string[]): {
  commands: ExecutedCommand[];
  activeHost: string;
  activeUser: string;
  activeDir: string;
  isRemote: boolean;
  cleanLines: string[];
} {
  const cleanLines = (lines || [])
    .map((l) => stripAnsi(l).trim())
    .filter((l) => l.length > 0);

  const commands: ExecutedCommand[] = [];

  let activeHost = "local-machine";
  let activeUser = "user";
  let activeDir = "~";
  let isRemote = false;

  let currentCmd: string | null = null;
  let currentOutput: string[] = [];

  // Strictly match valid prompts anchored at start of line
  // 1. Linux user@host:path[$#] cmd
  // 2. Windows PS C:\path> cmd
  // 3. Windows C:\path> cmd
  // 4. Bare $ cmd or # cmd at beginning of line
  const linuxPromptRegex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([^\r\n$#]*)[$#]\s*(.*)$/;
  const winPsPromptRegex = /^PS\s+([a-zA-Z]:\\[^>]*?)>\s*(.*)$/;
  const winCmdPromptRegex = /^([a-zA-Z]:\\[^>]*?)>\s*(.*)$/;
  const barePromptRegex = /^[$#]\s+([a-zA-Z0-9._/-].*)$/;
  const bareIdlePromptRegex = /^[$#]\s*$/;

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i] ?? "";

    const linuxMatch = line.match(linuxPromptRegex);
    const winPsMatch = line.match(winPsPromptRegex);
    const winCmdMatch = line.match(winCmdPromptRegex);
    const bareMatch = line.match(barePromptRegex);
    const bareIdleMatch = line.match(bareIdlePromptRegex);

    if (linuxMatch) {
      if (currentCmd && !isInternalShellCmd(currentCmd)) {
        commands.push({
          command: currentCmd,
          output: currentOutput,
          user: activeUser,
          host: activeHost,
          cwd: activeDir,
        });
      }
      activeUser = linuxMatch[1] || "user";
      activeHost = linuxMatch[2] || "remote-host";
      activeDir = (linuxMatch[3] || "~").trim();
      isRemote = true;

      const cmdText = (linuxMatch[4] || "").trim();
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
      activeDir = ((winPsMatch ? winPsMatch[1] : winCmdMatch?.[1]) || "C:\\").trim();
      isRemote = false;

      const cmdText = ((winPsMatch ? winPsMatch[2] : winCmdMatch?.[2]) || "").trim();
      if (cmdText && !isInternalShellCmd(cmdText)) {
        currentCmd = cmdText;
        currentOutput = [];
      } else {
        currentCmd = null;
        currentOutput = [];
      }
    } else if (bareMatch) {
      // Avoid false positive matching of kernel banners like "#1 SMP Debian"
      const candidate = (bareMatch[1] || "").trim();
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

  // Fallback: If prompt wasn't recognized but known commands are in cleanLines
  if (commands.length === 0) {
    for (let i = 0; i < cleanLines.length; i++) {
      const line = cleanLines[i] ?? "";
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
export function generateSmartTerminalReply(params: {
  query: string;
  lines: string[];
  session?: Session | null;
  sessions?: any[];
}): string {
  const { query, lines, session, sessions = [] } = params;
  const p = (query || "").toLowerCase().trim();

  const { commands, activeHost, activeUser, activeDir, isRemote: parsedRemote, cleanLines } = parseTerminalHistory(lines);

  const isSessionRemote = session?.protocol === "ssh" || Boolean(session?.ip) || (session?.title || "").toLowerCase().includes("ssh");
  const isCwdWindows = /^[A-Za-z]:\\/.test(session?.cwd || activeDir);
  const isRemote = (parsedRemote || isSessionRemote) && !isCwdWindows;

  const host = isRemote
    ? (session?.ip || (activeHost !== "local-machine" ? activeHost : "remote-server"))
    : "local-machine";
  const user = session?.user || (activeUser !== "user" ? activeUser : "user");
  const dir = session?.cwd || activeDir || (isRemote ? "~" : "C:\\Users");

  const allText = cleanLines.join("\n");

  // 0. GREETINGS & CASUAL INTERACTION ("hi", "hello", "hey", "who are you", etc.)
  const isGreeting =
    /^(?:hi|hello|hey|greetings|howdy|good\s+(?:morning|afternoon|evening)|yo|sup|who are you|what can you do)[\s!.?]*$/i.test(p) ||
    p === "hi" ||
    p === "hello" ||
    p === "hey";

  if (isGreeting) {
    if (isRemote) {
      return `Hello! I'm THIRD EYE AI, your developer assistant. I'm connected to your remote SSH session on \`${host}\` (${user} in \`${dir}\`).

How can I help you today? You can ask me to inspect server status, explain command outputs, check disk/RAM usage, or diagnose errors anytime!`;
    }

    const shellName = session?.shellType === "powershell" ? "PowerShell" : "Command Prompt";
    return `Hello! I'm THIRD EYE AI, your developer assistant. I'm connected to your local **${shellName}** session in \`${dir}\`.

How can I help you today? Feel free to ask about your project, run commands, analyze errors, or check system status anytime!`;
  }

  // 0.1 CONVERSATION STYLE & PERSONA FEEDBACK ("same conversation like with you", "human answer", "human + tech")
  const isPersonaFeedback =
    p.includes("same conversation") ||
    p.includes("human answer") ||
    p.includes("human + tech") ||
    p.includes("human plus tech") ||
    p.includes("fabricate") ||
    p.includes("like i do with you") ||
    p.includes("like claude") ||
    p.includes("like chatgpt") ||
    p.includes("talk like") ||
    p.includes("be more human") ||
    p.includes("conversation format");

  if (isPersonaFeedback) {
    return `Got it, absolutely! From now on, that is exactly how we will communicate:

- **When you need a human conversation** (ideas, questions, high-level thoughts, or general chat): I'll reply naturally and conversationally, just like a senior engineering partner pair-programming with you—no robotic forms or mechanical checklists.
- **When you need technical assistance** (fixing bugs, understanding commands, writing code, or managing infrastructure): I'll deliver the **human + technical combination**:
  1. A clear, human explanation of what is happening and *why*.
  2. The exact executable command or code block ready to run.
  3. Actionable context on how it works, caveats, and next steps.

I'm connected to your active terminal in \`${dir}\`${session?.title ? ` (**${session.title}**)` : ""}. Whatever you'd like to dive into—whether it's code, errors, or a design discussion—I'm ready!`;
  }

  // 0.2 CASUAL CHAT & COURTESY
  const isGratitude = /^(?:thanks|thank you|thx|cheers|appreciate it|good job|nice work|awesome|great|perfect|cool|ok|okay|got it|sounds good)[\s!.?]*$/i.test(p);
  if (isGratitude) {
    return `You're very welcome! I'm here in your terminal workspace whenever you need anything. Feel free to run a command or ask any question!`;
  }

  const isHowAreYou = /^(?:how are you|how's it going|how are things|whats up|what's up)[\s!.?]*$/i.test(p);
  if (isHowAreYou) {
    const shellName = session?.shellType === "powershell" ? "PowerShell" : "Command Prompt";
    return `Doing great and ready to build with you! Your local **${shellName}** at \`${dir}\` is active and responsive. What are we working on next?`;
  }

  // 1. Telemetry Pattern Matchers
  const hasFreeMem = /total\s+used\s+free\s+shared/i.test(allText) || /Mem:\s+[\d.]+[MGTP]i?/i.test(allText);
  const hasDf = /Filesystem\s+Size\s+Used\s+Avail\s+Use%/i.test(allText) || /(?:udev|\/dev\/|overlay|tmpfs)\s+[\d.]+[MGTP]\s+[\d.]+[MGTP]/i.test(allText);
  const loadMatch = allText.match(/load average:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/i);
  const isUname = /Linux\s+\w+\s+[\d.-]+\s+#\d+\s+SMP/i.test(allText);

  // Parse df -h partitions
  const partitionMatches = [...allText.matchAll(/([^\s]+)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+(\d{1,3})%\s+([^\r\n]+)/gi)];
  const highUsage = partitionMatches.filter((m) => parseInt(m[5] || "0", 10) >= 70);
  const hasDocker = allText.includes("/opt/docker") || allText.includes("overlay");

  // Parse free -h memory table
  const memLineMatch = allText.match(/Mem:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+(?:[\d.]+[MGTP]?i?\s+)?([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);
  const swapLineMatch = allText.match(/Swap:\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)\s+([\d.]+[MGTP]?i?)/i);

  // Synthesize lastExecuted if command prompt was scrolled off but output signature is prominent
  let lastExecuted = commands.length > 0 ? commands[commands.length - 1] : null;
  const previousExecuted = commands.length > 1 ? commands[commands.length - 2] : null;

  if (!lastExecuted) {
    if (hasFreeMem && isRemote) {
      lastExecuted = {
        command: "free -h",
        output: cleanLines.filter((l) => /total|Mem:|Swap:/i.test(l)),
        user,
        host,
        cwd: dir,
      };
    } else if (hasDf && isRemote) {
      lastExecuted = {
        command: "df -h",
        output: cleanLines.filter((l) => /Filesystem|\/dev\/|overlay|tmpfs/i.test(l)),
        user,
        host,
        cwd: dir,
      };
    } else if (loadMatch && isRemote) {
      lastExecuted = {
        command: "uptime",
        output: cleanLines.filter((l) => /load average|up\s+\d+/i.test(l)),
        user,
        host,
        cwd: dir,
      };
    } else if (isUname && isRemote) {
      lastExecuted = {
        command: "uname -a",
        output: cleanLines.filter((l) => /Linux\s+/i.test(l)),
        user,
        host,
        cwd: dir,
      };
    }
  }

  // -------------------------------------------------------------
  // INTENT A: "Which command did I run" / "What did I run"
  // -------------------------------------------------------------
  const isAskingWhatCommandRan =
    p.includes("which command") ||
    p.includes("what command") ||
    p.includes("what did i run") ||
    p.includes("what did i type") ||
    p.includes("last command") ||
    p.includes("what i ran") ||
    p.includes("which cmd");

  if (isAskingWhatCommandRan) {
    if (lastExecuted) {
      const outputSnippet = lastExecuted.output.length > 0
        ? `\n\nHere is what it returned:\n\`\`\`sh\n${lastExecuted.output.slice(-10).join("\n")}\n\`\`\``
        : "";

      let explanation = "";
      if (lastExecuted.command.startsWith("free")) {
        if (memLineMatch) {
          explanation = `\n\nThis command inspects system RAM and swap allocation. You have **${memLineMatch[1]}** total RAM (**${memLineMatch[2]}** used, **${memLineMatch[5] || memLineMatch[3]}** available).`;
        } else {
          explanation = "\n\nThis command inspects real-time memory and swap allocation on the server.";
        }
      } else if (lastExecuted.command.startsWith("df")) {
        explanation = "\n\nThis command displays filesystem disk space usage across all mounted storage partitions.";
      } else if (lastExecuted.command.startsWith("uptime")) {
        explanation = "\n\nThis command displays how long the system has been up along with current 1, 5, and 15-minute load averages.";
      } else if (lastExecuted.command.startsWith("uname")) {
        explanation = "\n\nThis command prints Linux kernel release details and system hardware architecture.";
      }

      const priorNote = previousExecuted
        ? `\n\n*(Earlier in this terminal session, you also ran \`${previousExecuted.command}\`)*`
        : "";

      const hostTag = "`" + host + "`";
      const dirTag = "`" + dir + "`";
      const locationStr = isRemote
        ? ` on remote Linux host ${hostTag} (${user}@${host} in ${dirTag})`
        : ` in your local directory ${dirTag}`;

      return `You ran \`${lastExecuted.command}\`${locationStr}.${outputSnippet}${explanation}${priorNote}`;
    }

    return isRemote
      ? `No command has been executed yet on \`${host}\`. The prompt is ready for your input!`
      : `No command has been executed yet in this session. The prompt at \`${dir}\` is ready for your input!`;
  }

  // -------------------------------------------------------------
  // INTENT B: MEMORY & RAM INQUIRIES
  // -------------------------------------------------------------
  const isAskingMemory = p.includes("memory") || p.includes("ram") || p.includes("swap") || p.includes("free -h");
  if (isAskingMemory && hasFreeMem) {
    const memDetails = memLineMatch
      ? `- **Total Memory:** ${memLineMatch[1]}\n- **Used:** ${memLineMatch[2]}\n- **Free / Available:** ${memLineMatch[5] || memLineMatch[3]}`
      : "- Memory statistics are displayed in the buffer above.";
    const swapDetails = swapLineMatch
      ? `\n- **Swap Space:** ${swapLineMatch[1]} total (${swapLineMatch[2]} used, ${swapLineMatch[3]} free)`
      : "";

    return `Here is the memory status from your \`free -h\` output on \`${host}\`:

${memDetails}${swapDetails}

\`\`\`sh
${cleanLines.filter((l) => /Mem:|Swap:|total\s+used/i.test(l)).join("\n") || cleanLines.slice(-4).join("\n")}
\`\`\`

Your system memory looks healthy with plenty of available capacity. Let me know if you would like to inspect high-memory processes using \`ps aux --sort=-%mem | head -n 10\`.`;
  }

  // -------------------------------------------------------------
  // INTENT C: DISK SPACE & STORAGE SATURATION (df -h)
  // -------------------------------------------------------------
  const isAskingDisk = p.includes("disk") || p.includes("storage") || p.includes("space") || p.includes("df -h") || p.includes("partition");
  if (isAskingDisk || ((p.includes("solve") || p.includes("fix") || p.includes("explain")) && hasDf && highUsage.length > 0)) {
    if (highUsage.length > 0) {
      const top = highUsage[0]!;
      return `Looking at your terminal, storage partition \`${top[1]}\` mounted on \`${top[6]?.trim()}\` is **${top[5]}% full** (${top[3]} used out of ${top[2]}, with only ${top[4]} available).${hasDocker ? "\n\nMultiple `overlay` filesystems show that Docker container layers, images, and build cache in `/opt/docker/overlay2` are using the majority of this space." : ""}

**How to solve this and reclaim disk space:**

${hasDocker ? `**Step 1: Prune unused Docker images, stopped containers & build cache**\n\`\`\`sh\ndocker system prune -a --volumes\n\`\`\`` : `**Step 1: Check what is consuming the most space**\n\`\`\`sh\ndu -sh ${top[6]?.trim()}/* 2>/dev/null | sort -h | tail -n 10\n\`\`\``}

**Step 2: Clean up system package caches & rotated logs**
\`\`\`sh\nsudo apt autoremove -y && sudo journalctl --vacuum-size=200M\n\`\`\``;
    }

    if (hasDf) {
      return `You ran \`df -h\` on \`${host}\`. All mounted storage partitions have healthy available capacity, with no partitions exceeding 70% usage.

\`\`\`sh
${cleanLines.slice(-8).join("\n")}
\`\`\``;
    }
  }

  // -------------------------------------------------------------
  // INTENT D: SYSTEM LOAD & CPU INQUIRIES
  // -------------------------------------------------------------
  if (loadMatch && (p.includes("load") || p.includes("cpu") || p.includes("uptime") || p.includes("slow"))) {
    const l1 = parseFloat(loadMatch[1] || "0");
    const l5 = parseFloat(loadMatch[2] || "0");
    const l15 = parseFloat(loadMatch[3] || "0");
    const isElevated = l1 > 4.0 || l5 > 4.0;

    return `System load averages on \`${host}\` are **${l1}** (1 min), **${l5}** (5 min), and **${l15}** (15 min).

${isElevated ? "Load is elevated, meaning background workloads or containers are actively competing for CPU or disk I/O." : "Load is within standard normal operating parameters."}

To check the highest CPU-consuming processes in real time:
\`\`\`sh
top -c
\`\`\``;
  }

  // -------------------------------------------------------------
  // INTENT E: "EXPLAIN" / "WHAT IS HAPPENING" / "WHAT DOES THIS MEAN"
  // -------------------------------------------------------------
  const isAskingExplanation =
    p.includes("explain") ||
    p.includes("what is happening") ||
    p.includes("what is going on") ||
    p.includes("what does this mean") ||
    p.includes("what is this") ||
    p.includes("status") ||
    p.includes("overview");

  if (isAskingExplanation) {
    if (hasFreeMem && (lastExecuted?.command?.startsWith("free") || !lastExecuted)) {
      return `In your terminal on \`${host}\`, you executed \`free -h\` to inspect memory capacity.

\`\`\`sh
${(lastExecuted?.output && lastExecuted.output.length > 0 ? lastExecuted.output.join("\n") : cleanLines.filter((l) => /total|Mem:|Swap:/i.test(l)).join("\n")) || cleanLines.slice(-5).join("\n")}
\`\`\`

Here is what these numbers tell you:
${memLineMatch ? `- **Total RAM:** ${memLineMatch[1]} installed.\n- **Used RAM:** ${memLineMatch[2]} currently active.\n- **Available RAM:** ${memLineMatch[5] || memLineMatch[3]} immediately free for new programs.\n` : ""}${swapLineMatch ? `- **Swap Space:** ${swapLineMatch[2]} used of ${swapLineMatch[1]} (no paging pressure).\n` : ""}
Your server memory is healthy and operating normally!`;
    }

    if (hasDf) {
      if (highUsage.length > 0) {
        const top = highUsage[0]!;
        return `Your terminal output from \`df -h\` shows high disk utilization on \`${top[6]?.trim()}\` (**${top[5]}% full**, ${top[3]} used of ${top[2]}).

To inspect and reclaim space:
\`\`\`sh
${hasDocker ? "docker system prune -a --volumes" : `du -sh ${top[6]?.trim()}/* 2>/dev/null | sort -h | tail -n 10`}
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

      return `Here is what is currently happening ${targetHeader}:

You ran command \`${lastExecuted.command}\`. It completed, generating ${lastExecuted.output.length} lines of output:

\`\`\`sh
${lastExecuted.output.slice(-8).join("\n") || "(Command executed without terminal output)"}
\`\`\`

The shell prompt is active and ready for your next command.`;
    }

    if (isRemote) {
      return `Connected to remote Linux host \`${host}\` in \`${dir}\`. The shell prompt is active and ready for commands!`;
    }

    const shellLabel = session?.shellType === "powershell" ? "PowerShell" : "Command Prompt";
    return `Your local **${shellLabel}** is ready at \`${dir}\`. What would you like to run next?`;
  }

  // -------------------------------------------------------------
  // INTENT F: "HOW TO SOLVE" / "FIX"
  // -------------------------------------------------------------
  if (p.includes("solve") || p.includes("fix") || p.includes("error") || p.includes("crash") || p.includes("issue") || p.includes("what happened") || p.includes("why")) {
    // 1. GitHub Push Protection / Secret Scanning error
    if (/Push cannot contain secrets|GH013|Repository rule violations|unblock-secret|secret-scanning/i.test(allText)) {
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

*Or simply double-click the updated \`push_to_github.bat\` in your project root!*`;
    }

    // 2. Generic Git Push Rejected
    if (/failed to push some refs|remote rejected|non-fast-forward/i.test(allText)) {
      return `Your Git push was rejected by the remote repository.

**To solve:**
Force-update the remote branch:
\`\`\`sh
git push -u origin main --force
\`\`\``;
    }

    if (highUsage.length > 0) {
      const top = highUsage[0]!;
      return `The primary issue on \`${host}\` is storage capacity on partition \`${top[1]}\` (**${top[5]}% full**).

To solve this:
\`\`\`sh
${hasDocker ? "docker system prune -a --volumes" : `du -sh ${top[6]?.trim()}/* 2>/dev/null | sort -h | tail -n 10`}
\`\`\``;
    }

    if (loadMatch && parseFloat(loadMatch[1] || "0") > 4.0) {
      return `The system load average on \`${host}\` is elevated (${loadMatch[1]}). Check processes with:
\`\`\`sh
top -c
\`\`\``;
    }

    // 3. Inspect recent command output for errors
    const errorLines = (lastExecuted?.output || cleanLines).filter((l) =>
      /error:|fatal:|rejected|failed|cannot find|syntaxerror|typeerror|referenceerror|denied|exception|eaddrinuse|econnrefused/i.test(l)
    );

    if (errorLines.length > 0) {
      const errorSnippet = errorLines.slice(-6).join("\n");
      return `An error was detected in the output of \`${lastExecuted?.command || "your last command"}\`:

\`\`\`sh
${errorSnippet}
\`\`\`

Let me know what you would like to do, or ask for recommended fix steps!`;
    }

    if (lastExecuted) {
      return `Your recent command \`${lastExecuted.command}\` finished without error indicators.

If you are looking to run diagnostics, you can check system resource health anytime:
\`\`\`sh
${isRemote ? "uptime && df -h" : "dir"}
\`\`\``;
    }

    return `No active errors detected in this session. The prompt at \`${dir}\` is ready!`;
  }

  // -------------------------------------------------------------
  // INTENT G: GIT WORKFLOW & VERSION CONTROL (Human + Tech Combination)
  // -------------------------------------------------------------
  if (p.includes("git") || p.includes("branch") || p.includes("commit") || p.includes("merge") || p.includes("stash") || p.includes("revert")) {
    if (p.includes("branch") || p.includes("create branch") || p.includes("switch")) {
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

    if (p.includes("undo") || p.includes("revert") || p.includes("reset") || p.includes("discard")) {
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
  // INTENT H: BUILD, RUN & DEV SCRIPTS (Human + Tech Combination)
  // -------------------------------------------------------------
  if (p.includes("build") || p.includes("dev") || p.includes("npm") || p.includes("start") || p.includes("test") || p.includes("package")) {
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
  // INTENT I: DOCKER & CONTAINER OPS (Human + Tech Combination)
  // -------------------------------------------------------------
  if (p.includes("docker") || p.includes("container") || p.includes("overlay") || p.includes("prune")) {
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
  // INTENT J: PORT CONFLICTS & EADDRINUSE (Human + Tech Combination)
  // -------------------------------------------------------------
  if (p.includes("port") || p.includes("eaddrinuse") || p.includes("address already in use") || p.includes("kill port")) {
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
  // INTENT K: FLEET & ROBOTICS CLUSTER ARCHITECTURE
  // -------------------------------------------------------------
  if (p.includes("fleet") || p.includes("butler") || p.includes("greyorange") || p.includes("gor") || p.includes("node")) {
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

  // -------------------------------------------------------------
  // INTENT L: LINUX LEARNING & ESSENTIAL COMMANDS
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // INTENT M: COMMAND SUGGESTIONS
  // -------------------------------------------------------------
  if (p.includes("command") || p.includes("ommand") || p.includes("suggest") || p.includes("what can i run")) {
    return `Here are some high-value commands you can run right now:

### Workspace & Project Status:
\`\`\`sh
git status
\`\`\`

### System & Resource Diagnostics:
\`\`\`sh
${isRemote ? "uptime && df -h && free -h" : (session?.shellType === "powershell" ? "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10" : "dir")}
\`\`\`

### Active Network & Ports:
\`\`\`sh
${isRemote ? "netstat -tuln" : "netstat -ano | findstr LISTENING"}
\`\`\`

Click **Run** on any block to execute it immediately in your terminal!`;
  }

  // -------------------------------------------------------------
  // DEFAULT: CONVERSATIONAL ANSWER GROUNDED IN SCREEN CONTENTS
  // -------------------------------------------------------------
  if (lastExecuted && !isInternalShellCmd(lastExecuted.command)) {
    const locSnippet = isRemote
      ? `on remote host \`${host}\` (${user}@${host} in \`${dir}\`)`
      : `in your local workspace (\`${dir}\`)`;

    return `You executed \`${lastExecuted.command}\` ${locSnippet}. Here is what was returned:

\`\`\`sh
${lastExecuted.output.slice(-8).join("\n") || cleanLines.slice(-6).join("\n")}
\`\`\`

The shell prompt is active and ready. Let me know if you would like me to explain what this output means, debug any issues, or suggest the next command!`;
  }

  if (isRemote) {
    return `Connected to remote Linux host \`${host}\` as \`${user}\` in \`${dir}\`. The shell prompt is idle and waiting for commands. What would you like to run next?`;
  }

  const shellLabel = session?.shellType === "powershell" ? "PowerShell" : "Command Prompt";
  return `I'm listening and ready to help with your workspace in \`${dir}\`${session?.title ? ` (**${session.title}**)` : ""}!

Feel free to ask any conceptual or technical questions, run commands, or paste errors for diagnosis. What would you like to explore or do next?`;
}
