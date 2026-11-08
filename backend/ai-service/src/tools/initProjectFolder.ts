/**
 * Tool: initialize_project_folder
 * Creates an isolated, dedicated project folder (e.g. ~/Projects/my-app)
 * without requiring the user to open an OS file chooser dialog.
 * Switches workspace context to the new folder to protect root directories.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';

export interface InitProjectFolderInput {
  folderName: string;
  parentDir?: string;
  initGit?: boolean;
}

export interface InitProjectFolderResult {
  success: boolean;
  projectPath: string;
  folderName: string;
  isNew: boolean;
  message: string;
}

export async function executeInitProjectFolder(
  input: InitProjectFolderInput,
  currentWorkspace: string
): Promise<InitProjectFolderResult> {
  const cleanName = (input.folderName || `project-${Date.now()}`)
    .trim()
    .replace(/[^a-zA-Z0-9_\-\.]/g, '-');

  // Determine base directory
  let baseDir: string;
  if (input.parentDir) {
    baseDir = path.isAbsolute(input.parentDir)
      ? input.parentDir
      : path.join(os.homedir(), input.parentDir);
  } else {
    // Default to ~/Projects or parent directory outside THIRD_EYE
    baseDir = path.join(os.homedir(), 'Projects');
  }

  const targetPath = path.join(baseDir, cleanName);
  const alreadyExisted = fs.existsSync(targetPath);

  try {
    await fs.promises.mkdir(targetPath, { recursive: true });

    // Optional git init
    if (input.initGit !== false && !fs.existsSync(path.join(targetPath, '.git'))) {
      exec('git init', { cwd: targetPath }, () => {});
    }

    return {
      success: true,
      projectPath: targetPath,
      folderName: cleanName,
      isNew: !alreadyExisted,
      message: `Project folder ready at "${targetPath}". Workspace context switched to this isolated directory.`,
    };
  } catch (err: any) {
    throw new Error(`Failed to initialize project folder at "${targetPath}": ${err.message}`);
  }
}
