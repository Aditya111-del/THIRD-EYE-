import { useMemo } from "react";
import type { Session } from "@/types/terminal";

export function useAiContext(s?: Session) {
  return useMemo(() => {
    if (!s) return ["No active terminal session open."];
    const inputs = s.lines.filter((l) => l.kind === "input").map((l) => l.text);
    const errors = s.lines.filter((l) => l.kind === "error").length;
    const shellName = s.shellType === "powershell" ? "Windows PowerShell" : "Command Prompt (cmd.exe)";
    return [
      `Shell: ${shellName}`,
      `Directory: ${s.cwd || "C:\\Users\\aditya.s.ctr"}`,
      inputs.length ? `Last Command: ${inputs.at(-1)}` : "No commands executed yet",
      `Buffer: ${s.lines.length} lines, ${errors} error${errors === 1 ? "" : "s"}`,
      s.lastError ? `Incident: ${s.lastError.slice(0, 60)}...` : "Status: Active & Healthy",
    ];
  }, [s]);
}

export function mockReply(q: string, s?: Session, liveLines?: string[]): string {
  const t = q.toLowerCase();
  const shell = s?.shellType === "powershell" ? "Windows PowerShell" : "Command Prompt";
  const cwd = s?.cwd || "C:\\Users\\aditya.s.ctr\\Desktop\\THIRD EYE";
  const recentLines = (liveLines && liveLines.length > 0) ? liveLines : (s?.lines?.map((l) => l.text) || []);
  const inputs = s?.lines?.filter((l) => l.kind === "input").map((l) => l.text) || [];
  const lastCommand = inputs.length > 0 ? inputs[inputs.length - 1] : "";
  const recentText = recentLines.slice(-150).join("\n");

  const isDevServer = /(vite\s+v|ready in \d+ms|Local:\s+http|Server listening)/i.test(recentText);
  const isBuilding = /(built in|dist\/|vite build|tsc)/i.test(recentText);
  const isGitStatus = /(On branch|Changes not staged|Untracked files|up to date with)/i.test(recentText);

  // 1. RICH SYSTEM TELEMETRY (df -h / load average)
  const hasDf = /Filesystem\s+Size\s+Used\s+Avail\s+Use%/i.test(recentText) || /(?:udev|\/dev\/|overlay|tmpfs)\s+[\d.]+[MGTP]\s+[\d.]+[MGTP]/i.test(recentText);
  const loadMatch = recentText.match(/load average:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/i);

  if (hasDf || loadMatch) {
    const partitionMatches = [...recentText.matchAll(/([^\s]+)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+([\d.]+[MGTP]?)\s+(\d{1,3})%\s+([^\r\n]+)/gi)];
    const highUsage = partitionMatches.filter((m) => parseInt(m[5], 10) >= 70);
    const hasDocker = recentText.includes('/opt/docker') || recentText.includes('overlay');

    const findings: string[] = [];
    if (highUsage.length > 0) {
      const topPart = highUsage[0];
      findings.push(`**1. High Disk Usage on \`${topPart[6].trim()}\` (${topPart[5]}% Full — ${topPart[3]} used out of ${topPart[2]})**\nStorage device \`${topPart[1]}\` mounted at \`${topPart[6].trim()}\` has only ${topPart[4]} available.${hasDocker ? ' Multiple `overlay` filesystems show that Docker container layers, images, and build cache in `/opt/docker/overlay2` are using the majority of this space.' : ''}`);
    }
    if (loadMatch) {
      findings.push(`**2. Elevated System Load Average (${loadMatch[1]}, ${loadMatch[2]}, ${loadMatch[3]})**\nYour system load average is high, meaning CPU or I/O processes are heavily competing for compute resources.`);
    }

    return `Looking at your terminal logs, here is what is happening and how to solve it:

${findings.join('\n\n')}

**How to solve this:**

${hasDocker ? `**Step 1: Clean up Docker images & reclaim space**\n\`\`\`sh\ndocker system prune -a --volumes\n\`\`\`` : `**Step 1: Inspect disk space**\n\`\`\`sh\ndu -sh /* | sort -h\n\`\`\``}

**Step 2: Check active high-CPU processes**
\`\`\`sh\ntop -c\n\`\`\``;
  }

  // 2. WHAT IS HAPPENING / OVERVIEW / STATUS
  if (
    t.includes("happen") ||
    t.includes("going on") ||
    t.includes("status") ||
    t.includes("overview") ||
    t.includes("summary") ||
    t.includes("what is this") ||
    t.includes("state")
  ) {
    let activity = "Your shell prompt is initialized and awaiting commands.";
    if (s?.lastError) {
      activity = `I noticed an error in your terminal: \`${s.lastError}\`.`;
    } else if (isDevServer) {
      activity = "Your local development server is running and actively serving requests.";
    } else if (isBuilding) {
      activity = "Your production build compilation completed successfully.";
    } else if (isGitStatus) {
      activity = "You just checked your git working tree. Branch details and file status are in the buffer.";
    } else if (lastCommand) {
      activity = `You recently ran \`${lastCommand}\`, which finished with ${recentLines.length} lines of output.`;
    }

    const recentSnippet = recentLines.length > 0
      ? `Here's what recently ran in your terminal:\n\`\`\`sh\n${recentLines.slice(-6).join("\n")}\n\`\`\``
      : `The terminal prompt is waiting for input.`;

    const suggestCmd = isDevServer ? "git status" : "npm run dev";

    return `Here is what is currently happening in your workspace:

**Current Activity:**
Working in \`${cwd}\` with ${shell}. ${activity}

${recentSnippet}

**Suggested Next Step:**
You can run this in your terminal:
\`\`\`sh
${suggestCmd}
\`\`\``;
  }

  // 3. FILES / DIRECTORY LISTING
  if (t.includes("file") || t.includes("dir") || t.includes("list") || t.includes("folder") || t.includes("ls")) {
    return `Here are your active directory details:

**Active Workspace:** \`${cwd}\`

To list all files and folders in your directory, you can run:
\`\`\`sh
${s?.shellType === "powershell" ? "Get-ChildItem" : "dir"}
\`\`\``;
  }

  // 4. EXPLAIN / DIAGNOSE / HOW TO SOLVE
  if (t.startsWith("/explain") || t.includes("explain") || t.includes("diagnose") || t.includes("solve") || t.includes("how to")) {
    if (s?.lastError) {
      return `Here's what went wrong in your ${shell} session:

**The Issue:**
\`${s.lastError}\`

**How to resolve it:**
Try running:
\`\`\`sh
npm install
\`\`\``;
    }
    return `Looking at your ${shell} buffer in \`${cwd}\`, everything looks healthy. The last command was \`${lastCommand || "initial shell"}\`, and there are no fatal errors in the recent ${recentLines.length} lines.`;
  }

  // 5. FIX
  if (t.startsWith("/fix") || t.includes("fix")) {
    return s?.lastError
      ? `To resolve the recent error (\`${s.lastError}\`), try running:\n\`\`\`sh\nnpm run build\n\`\`\``
      : "No active error detected in your terminal buffer right now. Everything is running smoothly!";
  }

  // 6. DEFAULT TERMINAL OUTPUT EXPLANATION
  if (recentLines.length > 0) {
    return `Looking at your terminal, here is what recently executed:

\`\`\`sh
${recentLines.slice(-8).join("\n")}
\`\`\`

The shell is active in \`${cwd}\`. Feel free to ask what a specific command output means or how to solve any error!`;
  }

  // 5. SUGGEST
  if (t.startsWith("/suggest") || t.includes("suggest")) {
    return s?.shellType === "powershell"
      ? "Here are a few useful commands you can run right now:\n```sh\nGet-Process\nGet-ChildItem\ngit status\n```"
      : "Here are a few useful commands you can run right now:\n```sh\ndir\nipconfig\ngit status\n```";
  }

  return `I'm keeping track of your terminal session and active workspace in \`${cwd}\` (${shell}).

Ask me what is happening, request an error diagnosis, or ask for command suggestions anytime!`;
}
