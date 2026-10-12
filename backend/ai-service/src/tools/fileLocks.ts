import path from 'path';

export interface FileLockEntry {
  path: string;
  writerAgentId: string | null;
  readers: Set<string>;
  acquiredAt: number;
}

export class FileLockRegistry {
  private locks: Map<string, FileLockEntry> = new Map();

  private normalize(filePath: string): string {
    return path.normalize(filePath).toLowerCase();
  }

  public async acquireRead(filePath: string, agentId: string): Promise<boolean> {
    const key = this.normalize(filePath);
    let entry = this.locks.get(key);
    if (!entry) {
      entry = {
        path: filePath,
        writerAgentId: null,
        readers: new Set<string>(),
        acquiredAt: Date.now(),
      };
      this.locks.set(key, entry);
    }

    if (entry.writerAgentId && entry.writerAgentId !== agentId) {
      // Waiting briefly for writer to release
      let attempts = 0;
      while (entry.writerAgentId && attempts < 10) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      if (entry.writerAgentId) return false;
    }

    entry.readers.add(agentId);
    return true;
  }

  public releaseRead(filePath: string, agentId: string): void {
    const key = this.normalize(filePath);
    const entry = this.locks.get(key);
    if (entry) {
      entry.readers.delete(agentId);
      if (!entry.writerAgentId && entry.readers.size === 0) {
        this.locks.delete(key);
      }
    }
  }

  public async acquireWrite(filePath: string, agentId: string, timeoutMs = 3000): Promise<boolean> {
    const key = this.normalize(filePath);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      let entry = this.locks.get(key);
      if (!entry) {
        entry = {
          path: filePath,
          writerAgentId: agentId,
          readers: new Set<string>(),
          acquiredAt: Date.now(),
        };
        this.locks.set(key, entry);
        return true;
      }

      if (entry.writerAgentId === agentId) {
        return true;
      }

      if (!entry.writerAgentId && (entry.readers.size === 0 || (entry.readers.size === 1 && entry.readers.has(agentId)))) {
        entry.writerAgentId = agentId;
        entry.acquiredAt = Date.now();
        return true;
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    return false;
  }

  public releaseWrite(filePath: string, agentId: string): void {
    const key = this.normalize(filePath);
    const entry = this.locks.get(key);
    if (entry && entry.writerAgentId === agentId) {
      entry.writerAgentId = null;
      if (entry.readers.size === 0) {
        this.locks.delete(key);
      }
    }
  }

  public releaseAllForAgent(agentId: string): void {
    for (const [key, entry] of Array.from(this.locks.entries())) {
      entry.readers.delete(agentId);
      if (entry.writerAgentId === agentId) {
        entry.writerAgentId = null;
      }
      if (!entry.writerAgentId && entry.readers.size === 0) {
        this.locks.delete(key);
      }
    }
  }

  public isLockedForWrite(filePath: string, byAgentId?: string): boolean {
    const key = this.normalize(filePath);
    const entry = this.locks.get(key);
    if (!entry) return false;
    if (byAgentId) return entry.writerAgentId !== null && entry.writerAgentId !== byAgentId;
    return entry.writerAgentId !== null;
  }
}
