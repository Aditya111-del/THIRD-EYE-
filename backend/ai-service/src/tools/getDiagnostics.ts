/**
 * Tool: getDiagnostics
 * Universal Multi-Language Diagnostics Engine:
 * TypeScript/JavaScript (tsc), Python (py_compile/flake8), Rust (cargo check), Go (go vet).
 */

import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

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
  const targetPath = input.path ? (path.isAbsolute(input.path) ? input.path : path.join(workspaceRoot, input.path)) : '';
  const ext = targetPath ? path.extname(targetPath).toLowerCase() : '';

  // Determine diagnostic command based on file extension or workspace manifest
  let cmd = '';
  let parser: (output: string) => DiagnosticItem[];

  if (ext === '.py' || (!ext && (fs.existsSync(path.join(workspaceRoot, 'pyproject.toml')) || fs.existsSync(path.join(workspaceRoot, 'requirements.txt'))))) {
    // Python Diagnostics
    if (targetPath) {
      cmd = `python3 -m py_compile "${targetPath}"`;
    } else {
      cmd = 'python3 -m compileall -q .';
    }
    parser = (output: string) => {
      const items: DiagnosticItem[] = [];
      const lines = output.split('\n');
      for (const line of lines) {
        const match = line.match(/File "([^"]+)", line (\d+)/i);
        if (match) {
          items.push({
            file: match[1],
            line: parseInt(match[2], 10),
            column: 1,
            severity: 'error',
            message: line.trim(),
          });
        }
      }
      return items;
    };
  } else if (ext === '.rs' || (!ext && fs.existsSync(path.join(workspaceRoot, 'Cargo.toml')))) {
    // Rust Diagnostics
    cmd = 'cargo check --message-format=short';
    parser = (output: string) => {
      const items: DiagnosticItem[] = [];
      const lines = output.split('\n');
      for (const line of lines) {
        // Format: src/main.rs:10:5: error[E0425]: cannot find value `x`
        const match = line.match(/^([^:]+):(\d+):(\d+):\s*(error|warning)(?:\[([^\]]+)\])?:\s*(.+)$/i);
        if (match) {
          items.push({
            file: match[1].trim(),
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            severity: match[4].toLowerCase() as any,
            code: match[5] || '',
            message: match[6].trim(),
          });
        }
      }
      return items;
    };
  } else if (ext === '.go' || (!ext && fs.existsSync(path.join(workspaceRoot, 'go.mod')))) {
    // Go Diagnostics
    cmd = targetPath ? `go vet "${targetPath}"` : 'go vet ./...';
    parser = (output: string) => {
      const items: DiagnosticItem[] = [];
      const lines = output.split('\n');
      for (const line of lines) {
        // Format: ./main.go:12:2: message
        const match = line.match(/^([^:]+):(\d+):(\d+):\s*(.+)$/i);
        if (match) {
          items.push({
            file: match[1].trim(),
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            severity: 'error',
            message: match[4].trim(),
          });
        }
      }
      return items;
    };
  } else {
    // Default: TypeScript / JavaScript
    cmd = input.path
      ? `npx tsc --noEmit --pretty false "${input.path}"`
      : 'npx tsc --noEmit --pretty false';
    parser = (output: string) => {
      const items: DiagnosticItem[] = [];
      const lines = output.split('\n');
      for (const line of lines) {
        const match = line.match(/^([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s*([A-Za-z0-9]+)?:\s*(.+)$/i);
        if (match) {
          items.push({
            file: match[1].trim(),
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            severity: match[4].toLowerCase() as any,
            code: match[5] || '',
            message: match[6].trim(),
          });
        }
      }
      return items;
    };
  }

  const localBin = path.join(workspaceRoot, 'node_modules', '.bin');
  const localNodeModules = path.join(workspaceRoot, 'node_modules');
  const customEnv = {
    ...process.env,
    PATH: `${localBin}${path.delimiter}${process.env.PATH || ''}`,
    NODE_PATH: `${localNodeModules}${path.delimiter}${process.env.NODE_PATH || ''}`,
  };

  return new Promise<{ diagnostics: DiagnosticItem[]; clean: boolean; output: string }>((resolve) => {
    exec(cmd, { cwd: workspaceRoot, timeout: 25000, env: customEnv }, (err, stdout, stderr) => {
      const output = (stdout || '') + (stderr ? '\n' + stderr : '');
      const diagnostics = parser(output);

      resolve({
        diagnostics,
        clean: diagnostics.length === 0 && !err,
        output: output.slice(0, 3000),
      });
    });
  });
}
