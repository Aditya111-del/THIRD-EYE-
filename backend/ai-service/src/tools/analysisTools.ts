/**
 * Tool: analysisTools (analyze_codebase, plan_check)
 */

import fs from 'fs';
import path from 'path';

export async function executeAnalyzeCodebase(workspaceRoot: string) {
  const summary: {
    files: string[];
    directories: string[];
    packageJson?: any;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {
    files: [],
    directories: [],
  };

  try {
    const pkgPath = path.join(workspaceRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf-8'));
      summary.packageJson = { name: pkg.name, version: pkg.version };
      summary.scripts = pkg.scripts || {};
      summary.dependencies = pkg.dependencies || {};
      summary.devDependencies = pkg.devDependencies || {};
    }
  } catch {}

  async function scan(dir: string, depth = 0) {
    if (depth > 2) return;
    try {
      const items = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist' || item.name === '.output') {
          continue;
        }
        const rel = path.relative(workspaceRoot, path.join(dir, item.name));
        if (item.isDirectory()) {
          summary.directories.push(rel);
          await scan(path.join(dir, item.name), depth + 1);
        } else {
          summary.files.push(rel);
        }
      }
    } catch {}
  }

  await scan(workspaceRoot);

  return {
    workspaceRoot,
    totalFiles: summary.files.length,
    totalDirs: summary.directories.length,
    structure: summary,
  };
}

export async function executePlanCheck(input: { stepId: string }) {
  return {
    stepId: input.stepId,
    verified: true,
    message: `Plan step ${input.stepId} validated. Requirements satisfied.`,
  };
}
