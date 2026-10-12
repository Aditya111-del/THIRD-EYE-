/**
 * Tool: gitTools (git_status, git_diff)
 */

import { exec } from 'child_process';

export async function executeGitStatus(workspaceRoot: string) {
  return new Promise((resolve) => {
    exec('git status --short --branch', { cwd: workspaceRoot, timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          isGitRepo: false,
          error: (stderr || err.message).trim(),
        });
        return;
      }
      resolve({
        isGitRepo: true,
        status: (stdout || '').trim(),
      });
    });
  });
}

export async function executeGitDiff(input: { path?: string; staged?: boolean }, workspaceRoot: string) {
  return new Promise((resolve) => {
    const cmd = input.staged
      ? `git diff --cached ${input.path || ''}`
      : `git diff ${input.path || ''}`;

    exec(cmd, { cwd: workspaceRoot, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ error: (stderr || err.message).trim() });
        return;
      }
      resolve({
        diff: (stdout || '').trim() || '(No uncommitted git changes)',
      });
    });
  });
}
