/**
 * Tool: fileOps (delete_file, create_dir, move_file)
 */

import fs from 'fs';
import path from 'path';
import { CheckpointManager } from './checkpoints';
import { FileLockRegistry } from './fileLocks';

export async function executeDeleteFile(
  input: { path: string },
  workspaceRoot: string,
  checkpointManager: CheckpointManager,
  fileLockRegistry?: FileLockRegistry,
  agentId = 'coder'
) {
  const filePath = input.path;
  if (!filePath) throw new Error('delete_file requires path');

  const target = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
  if (!fs.existsSync(target)) {
    return { success: true, message: `File already does not exist: ${filePath}` };
  }

  if (fileLockRegistry) {
    const locked = await fileLockRegistry.acquireWrite(target, agentId);
    if (!locked) throw new Error(`File is locked by another worker: ${filePath}`);
  }

  try {
    const checkpoint = await checkpointManager.createCheckpoint([target], `Delete ${path.basename(filePath)}`);
    await fs.promises.unlink(target);
    return {
      success: true,
      path: filePath,
      checkpointId: checkpoint.id,
      message: `Deleted file ${filePath}. Checkpoint created for rollback.`,
    };
  } finally {
    if (fileLockRegistry) fileLockRegistry.releaseWrite(target, agentId);
  }
}

export async function executeCreateDir(
  input: { path: string },
  workspaceRoot: string
) {
  const dirPath = input.path;
  if (!dirPath) throw new Error('create_dir requires path');

  const target = path.isAbsolute(dirPath) ? dirPath : path.join(workspaceRoot, dirPath);
  await fs.promises.mkdir(target, { recursive: true });
  return {
    success: true,
    path: dirPath,
    message: `Created directory: ${dirPath}`,
  };
}

export async function executeMoveFile(
  input: { sourcePath: string; destinationPath: string },
  workspaceRoot: string,
  checkpointManager: CheckpointManager,
  fileLockRegistry?: FileLockRegistry,
  agentId = 'coder'
) {
  const src = input.sourcePath;
  const dst = input.destinationPath;
  if (!src || !dst) throw new Error('move_file requires sourcePath and destinationPath');

  const srcTarget = path.isAbsolute(src) ? src : path.join(workspaceRoot, src);
  const dstTarget = path.isAbsolute(dst) ? dst : path.join(workspaceRoot, dst);

  if (!fs.existsSync(srcTarget)) {
    throw new Error(`Source file not found: ${src}`);
  }

  if (fileLockRegistry) {
    const lockedSrc = await fileLockRegistry.acquireWrite(srcTarget, agentId);
    if (!lockedSrc) throw new Error(`Source file locked: ${src}`);
    const lockedDst = await fileLockRegistry.acquireWrite(dstTarget, agentId);
    if (!lockedDst) {
      fileLockRegistry.releaseWrite(srcTarget, agentId);
      throw new Error(`Destination file locked: ${dst}`);
    }
  }

  try {
    const checkpoint = await checkpointManager.createCheckpoint([srcTarget, dstTarget], `Move ${src} to ${dst}`);
    await fs.promises.mkdir(path.dirname(dstTarget), { recursive: true });
    await fs.promises.rename(srcTarget, dstTarget);
    return {
      success: true,
      sourcePath: src,
      destinationPath: dst,
      checkpointId: checkpoint.id,
      message: `Moved ${src} -> ${dst}`,
    };
  } finally {
    if (fileLockRegistry) {
      fileLockRegistry.releaseWrite(srcTarget, agentId);
      fileLockRegistry.releaseWrite(dstTarget, agentId);
    }
  }
}
