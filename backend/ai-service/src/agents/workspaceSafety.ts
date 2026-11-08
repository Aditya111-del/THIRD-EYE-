import path from 'path';
import fs from 'fs';
import os from 'os';

export interface WorkspaceSafetyInfo {
  isProtected: boolean;
  reason?: 'third_eye_root' | 'home_dir' | 'root_fs' | 'downloads_or_desktop_root' | 'empty';
  currentDirectory: string;
  directoryName: string;
  humanFriendlyPath: string;
  suggestedProjectBase: string;
}

/**
 * Check if the active workspace directory is a protected location (e.g. THIRD EYE IDE root,
 * home directory, filesystem root, or empty) where project files must NEVER be written.
 */
export function checkWorkspaceSafety(workspaceRoot?: string): WorkspaceSafetyInfo {
  const effectiveWs = workspaceRoot ? path.resolve(workspaceRoot) : '';
  const homeDir = path.resolve(os.homedir());
  const downloadsDir = path.join(homeDir, 'Downloads');
  const desktopDir = path.join(homeDir, 'Desktop');
  const suggestedBase = path.join(homeDir, 'Projects');

  const humanFriendly = effectiveWs.startsWith(homeDir)
    ? `~${effectiveWs.slice(homeDir.length)}`
    : effectiveWs;

  const dirName = effectiveWs ? path.basename(effectiveWs) : 'None';

  // 1. Empty or filesystem root
  if (!effectiveWs || effectiveWs === '/' || effectiveWs === path.parse(effectiveWs).root) {
    return {
      isProtected: true,
      reason: effectiveWs ? 'root_fs' : 'empty',
      currentDirectory: effectiveWs || 'None',
      directoryName: dirName,
      humanFriendlyPath: humanFriendly || 'None',
      suggestedProjectBase: suggestedBase,
    };
  }

  // 2. User Home directory directly
  if (effectiveWs === homeDir) {
    return {
      isProtected: true,
      reason: 'home_dir',
      currentDirectory: effectiveWs,
      directoryName: dirName,
      humanFriendlyPath: '~',
      suggestedProjectBase: suggestedBase,
    };
  }

  // 3. Downloads or Desktop root directory directly
  if (effectiveWs === downloadsDir || effectiveWs === desktopDir) {
    return {
      isProtected: true,
      reason: 'downloads_or_desktop_root',
      currentDirectory: effectiveWs,
      directoryName: dirName,
      humanFriendlyPath: humanFriendly,
      suggestedProjectBase: suggestedBase,
    };
  }

  // 4. Check if workspace is the THIRD EYE IDE codebase itself
  const hasElectronMain = fs.existsSync(path.join(effectiveWs, 'electron', 'main.js'));
  const hasBackendAi = fs.existsSync(path.join(effectiveWs, 'backend', 'ai-service'));
  const pkgPath = path.join(effectiveWs, 'package.json');
  let isThirdEyeApp = hasElectronMain && hasBackendAi;

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name === 'third-eye' || pkg.name === 'third-eye-ide') {
        isThirdEyeApp = true;
      }
    } catch {}
  }

  if (isThirdEyeApp) {
    return {
      isProtected: true,
      reason: 'third_eye_root',
      currentDirectory: effectiveWs,
      directoryName: dirName,
      humanFriendlyPath: humanFriendly,
      suggestedProjectBase: suggestedBase,
    };
  }

  // Workspace is safe for project modifications
  return {
    isProtected: false,
    currentDirectory: effectiveWs,
    directoryName: dirName,
    humanFriendlyPath: humanFriendly,
    suggestedProjectBase: suggestedBase,
  };
}

/**
 * Checks if user is explicitly asking to start, initialize, or create a project folder.
 */
export function isProjectInitRequest(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();

  // Exact or prefix matches
  if (/^(start|init|initialize|create|scaffold|setup|make|open)\s+(a\s+|an\s+|the\s+)?(new\s+)?(project|app|workspace|application|folder)\b/i.test(p)) {
    return true;
  }

  if (/^(start\s+project|init\s+project|initialize\s+project|new\s+project|create\s+project|init\s+folder|start\s+app)\b/i.test(p)) {
    return true;
  }

  return ['start project', 'init project', 'start a project', 'initialize project', 'new project', 'create project', 'init project folder'].includes(p);
}

/**
 * Extracts explicit project folder name if user specified one in the prompt.
 * Examples:
 * - "start project milkshake-store" -> "milkshake-store"
 * - "init project called chat-agent" -> "chat-agent"
 * - "create project in portfolio-site" -> "portfolio-site"
 * - "start project" -> null
 */
export function extractProjectSlug(prompt: string): string | null {
  const p = prompt.trim();

  // Pattern: (start|init|create|scaffold|make) (a/an/the)? (new)? project (named|called|in|for)? <slug>
  const namedMatch = p.match(/(?:start|init|initialize|create|scaffold|make|setup)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:project|app|folder)\s+(?:named|called|in|as|titled|for)?\s+([a-zA-Z0-9_\-\.]+)/i);
  if (namedMatch && namedMatch[1]) {
    const slug = namedMatch[1].trim();
    // Exclude generic placeholder words
    const generic = ['a', 'an', 'the', 'new', 'folder', 'project', 'app', 'it', 'here', 'now', 'please', 'for', 'me', 'workspace'];
    if (!generic.includes(slug.toLowerCase())) {
      return slug.replace(/[^a-zA-Z0-9_\-\.]/g, '-');
    }
  }

  // Pattern: project <slug>
  const projectSlugMatch = p.match(/\bproject\s+([a-zA-Z0-9_\-\.]{3,30})\b/i);
  if (projectSlugMatch && projectSlugMatch[1]) {
    const slug = projectSlugMatch[1].trim();
    const generic = ['name', 'named', 'folder', 'root', 'directory', 'structure', 'files', 'setup', 'work'];
    if (!generic.includes(slug.toLowerCase())) {
      return slug.replace(/[^a-zA-Z0-9_\-\.]/g, '-');
    }
  }

  return null;
}

/**
 * Derives a clean project slug from a general feature/app prompt
 * e.g. "build a milkshake ordering web app" -> "milkshake-app"
 */
export function deriveFallbackProjectSlug(prompt: string): string {
  const cleaned = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(build|create|make|develop|implement|generate|start|init|a|an|the|new|project|app|application|website|web|site|full|simple|sample)\b/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join('-');

  return cleaned.length >= 2 ? `${cleaned}-app` : `project-${Date.now().toString(36).substring(4)}`;
}

/**
 * Generates an informative, friendly Directory Awareness Notice
 * explaining current directory protection and offering one-click project initialization.
 */
export function generateDirectoryAwarenessNotice(safety: WorkspaceSafetyInfo): string {
  const dirDescription =
    safety.reason === 'third_eye_root'
      ? 'THIRD EYE IDE Core Codebase'
      : safety.reason === 'home_dir'
      ? 'User Home Directory (~)'
      : safety.reason === 'root_fs'
      ? 'Filesystem Root (/)'
      : 'Protected System Directory';

  return `### 📍 Directory Awareness Notice

You are currently located in:
\`${safety.currentDirectory}\` **(${dirDescription})**

> [!IMPORTANT]
> **Directory Protection Active**: This directory contains the **THIRD EYE IDE application** and its system files. To keep your IDE stable and prevent polluting the editor's codebase, writing project files directly into this directory is protected.

---

### 🚀 Initialize a Dedicated Project Folder

You can initialize an isolated project folder right away **without needing to open any OS file picker dialog**!

#### How would you like to name your project?
Reply with your preferred project name, for example:
- \`start project my-app\`
- \`start project milkshake-bar\`
- \`start project ai-agent\`

#### Or choose a quick preset:
1. **React + Vite App** (\`~/Projects/react-app\`)
2. **Next.js Fullstack App** (\`~/Projects/nextjs-app\`)
3. **Node.js / Express API** (\`~/Projects/api-server\`)
4. **Python / FastAPI Project** (\`~/Projects/python-project\`)

> *Tip: You can also click the **"⚡ Initialize New Project"** button in the Explorer sidebar to create and open an isolated project folder in one click.*`;
}
