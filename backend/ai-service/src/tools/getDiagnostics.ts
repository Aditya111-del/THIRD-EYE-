/**
 * Tool: getDiagnostics
 * Evaluates TypeScript and linter diagnostics in workspace or specific file.
 */

import { exec } from 'child_process';
import path from 'path';

export interface GetDiagnosticsInput {
  path?: string;
}

export interface DiagnosticItem {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
}

export async function executeGetDiagnostics(input: GetDiagnosticsInput, workspaceRoot: string) {
  return new Promise<{ diagnostics: DiagnosticItem[]; clean: boolean; output: string }>((resolve) => {
    // Run tsc --noEmit or tsx to check syntax and type errors
    const cmd = input.path
      ? `npx tsc --noEmit --pretty false ${input.path}`
      : 'npx tsc --noEmit --pretty false';

    const localBin = path.join(workspaceRoot, 'node_modules', '.bin');
    const localNodeModules = path.join(workspaceRoot, 'node_modules');
    const customEnv = {
      ...process.env,
      PATH: `${localBin}${path.delimiter}${process.env.PATH || ''}`,
      NODE_PATH: `${localNodeModules}${path.delimiter}${process.env.NODE_PATH || ''}`,
    };

    exec(cmd, { cwd: workspaceRoot, timeout: 20000, env: customEnv }, (err, stdout, stderr) => {
      const output = (stdout || '') + (stderr ? '\n' + stderr : '');
      const diagnostics: DiagnosticItem[] = [];

      // Parse standard tsc line format: file.ts(line,col): error TS1234: message
      const lines = output.split('\n');
      for (const line of lines) {
        const match = line.match(/^([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s*([A-Za-z0-9]+)?:\s*(.+)$/i);
        if (match) {
          diagnostics.push({
            file: match[1].trim(),
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            severity: match[4].toLowerCase() as any,
            code: match[5] || '',
            message: match[6].trim(),
          });
        }
      }

      resolve({
        diagnostics,
        clean: diagnostics.length === 0 && !err,
        output: output.slice(0, 3000),
      });
    });
  });
}
