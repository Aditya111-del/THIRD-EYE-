/**
 * In-Memory File Model Service & Diff Review Registry (Phase 2)
 *
 * Hard Constraint 5: Every agent write/edit MUST go through the File Model Service
 * (in-memory model → diff preview → save). Direct fs.writeFile from the agent loop is FORBIDDEN.
 */

export interface DiffHunk {
  id: string;
  originalStartLine: number;
  originalLineCount: number;
  modifiedStartLine: number;
  modifiedLineCount: number;
  originalLines: string[];
  modifiedLines: string[];
  accepted?: boolean;
}

export interface PendingDiff {
  id: string;
  uri: string;
  originalContent: string;
  modifiedContent: string;
  hunkCount: number;
  createdAt: number;
  agentTurnId?: string;
}

export interface FileModel {
  uri: string;
  name: string;
  content: string;
  originalContent: string;
  version: number;
  isDirty: boolean;
  language: string;
  pendingDiff: PendingDiff | null;
  conflictDetected?: boolean;
  lastSyncedTimestamp: number;
}

type ModelChangeListener = (model: FileModel) => void;
type RegistryChangeListener = (models: FileModel[]) => void;

class FileModelRegistry {
  private models: Map<string, FileModel> = new Map();
  private modelListeners: Map<string, Set<ModelChangeListener>> = new Map();
  private registryListeners: Set<RegistryChangeListener> = new Set();
  private watcherUnsubscribe: (() => void) | null = null;

  constructor() {
    this.initWatchBridge();
  }

  private initWatchBridge() {
    if (typeof window === 'undefined') return;

    const onWatch = (payload: { type: string; path: string; filename?: string }) => {
      if (!payload || !payload.path) return;
      this.handleExternalFileChange(payload.path, payload.type);
    };

    if (window.thirdEye?.files?.onWatchEvent) {
      this.watcherUnsubscribe = window.thirdEye.files.onWatchEvent(onWatch);
    } else if (window.electronAPI?.fs?.onWatchEvent) {
      this.watcherUnsubscribe = window.electronAPI.fs.onWatchEvent(onWatch);
    }
  }

  public getModel(uri: string): FileModel | undefined {
    return this.models.get(uri);
  }

  public getAllModels(): FileModel[] {
    return Array.from(this.models.values());
  }

  public async openOrCreateModel(uri: string, initialContent?: string): Promise<FileModel> {
    const existing = this.models.get(uri);
    if (existing) {
      return existing;
    }

    let content = initialContent ?? '';
    if (initialContent === undefined) {
      try {
        if (window.thirdEye?.files?.readFile) {
          const res = await window.thirdEye.files.readFile(uri);
          if (res.success) content = res.content;
        } else if (window.electronAPI?.fs?.readFile) {
          const res = await window.electronAPI.fs.readFile(uri);
          if (res.success) content = res.content;
        }
      } catch (err) {
        console.warn(`[FileModelRegistry] Failed to read ${uri}:`, err);
      }
    }

    const name = uri.split('/').pop() || uri.split('\\').pop() || uri;
    const language = this.inferLanguage(name);

    const model: FileModel = {
      uri,
      name,
      content,
      originalContent: content,
      version: 1,
      isDirty: false,
      language,
      pendingDiff: null,
      lastSyncedTimestamp: Date.now(),
    };

    this.models.set(uri, model);
    this.notifyRegistryChange();
    return model;
  }

  public updateContent(uri: string, newContent: string): FileModel | undefined {
    const model = this.models.get(uri);
    if (!model) return undefined;

    model.content = newContent;
    model.version += 1;
    model.isDirty = newContent !== model.originalContent;
    this.notifyModelChange(model);
    return model;
  }

  public async saveModel(uri: string): Promise<boolean> {
    const model = this.models.get(uri);
    if (!model) return false;

    try {
      let success = false;
      if (window.thirdEye?.files?.writeFile) {
        const res = await window.thirdEye.files.writeFile(model.uri, model.content);
        success = res.success;
      } else if (window.electronAPI?.fs?.writeFile) {
        const res = await window.electronAPI.fs.writeFile(model.uri, model.content);
        success = res.success;
      } else {
        success = true;
      }

      if (success) {
        model.originalContent = model.content;
        model.isDirty = false;
        model.lastSyncedTimestamp = Date.now();
        model.conflictDetected = false;
        this.notifyModelChange(model);
        return true;
      }
    } catch (err) {
      console.error(`[FileModelRegistry] Failed saving ${uri}:`, err);
    }
    return false;
  }

  /**
   * Hard Constraint 5: Agent proposals create in-memory diff previews
   */
  public proposeAgentDiff(uri: string, modifiedContent: string, turnId?: string): PendingDiff {
    let model = this.models.get(uri);
    if (!model) {
      const name = uri.split('/').pop() || uri;
      model = {
        uri,
        name,
        content: '',
        originalContent: '',
        version: 1,
        isDirty: false,
        language: this.inferLanguage(name),
        pendingDiff: null,
        lastSyncedTimestamp: Date.now(),
      };
      this.models.set(uri, model);
    }

    const pendingDiff: PendingDiff = {
      id: `diff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      uri,
      originalContent: model.content,
      modifiedContent,
      hunkCount: 1,
      createdAt: Date.now(),
      ...(turnId ? { agentTurnId: turnId } : {}),
    };

    model.pendingDiff = pendingDiff;
    this.notifyModelChange(model);
    this.notifyRegistryChange();
    return pendingDiff;
  }

  public acceptPendingDiff(uri: string): boolean {
    const model = this.models.get(uri);
    if (!model || !model.pendingDiff) return false;

    model.content = model.pendingDiff.modifiedContent;
    model.pendingDiff = null;
    model.version += 1;
    model.isDirty = true;
    this.notifyModelChange(model);
    this.notifyRegistryChange();
    return true;
  }

  public rejectPendingDiff(uri: string): boolean {
    const model = this.models.get(uri);
    if (!model || !model.pendingDiff) return false;

    model.pendingDiff = null;
    this.notifyModelChange(model);
    this.notifyRegistryChange();
    return true;
  }

  public async handleExternalFileChange(filePath: string, eventType: string) {
    const model = this.models.get(filePath);
    if (!model) return;

    if (eventType === 'unlink') {
      model.conflictDetected = true;
      this.notifyModelChange(model);
      return;
    }

    // If file has no uncommitted local edits, auto-sync from disk
    if (!model.isDirty) {
      try {
        let newDiskContent = '';
        if (window.thirdEye?.files?.readFile) {
          const res = await window.thirdEye.files.readFile(filePath);
          if (res.success) newDiskContent = res.content;
        } else if (window.electronAPI?.fs?.readFile) {
          const res = await window.electronAPI.fs.readFile(filePath);
          if (res.success) newDiskContent = res.content;
        }

        model.content = newDiskContent;
        model.originalContent = newDiskContent;
        model.version += 1;
        model.lastSyncedTimestamp = Date.now();
        model.conflictDetected = false;
        this.notifyModelChange(model);
      } catch (err) {
        console.warn(`[FileModelRegistry] Sync failed on external change:`, err);
      }
    } else {
      model.conflictDetected = true;
      this.notifyModelChange(model);
    }
  }

  public subscribeToModel(uri: string, listener: ModelChangeListener): () => void {
    if (!this.modelListeners.has(uri)) {
      this.modelListeners.set(uri, new Set());
    }
    this.modelListeners.get(uri)!.add(listener);
    return () => {
      this.modelListeners.get(uri)?.delete(listener);
    };
  }

  public subscribeToRegistry(listener: RegistryChangeListener): () => void {
    this.registryListeners.add(listener);
    return () => {
      this.registryListeners.delete(listener);
    };
  }

  private notifyModelChange(model: FileModel) {
    const listeners = this.modelListeners.get(model.uri);
    if (listeners) {
      listeners.forEach((cb) => cb(model));
    }
  }

  private notifyRegistryChange() {
    const all = this.getAllModels();
    this.registryListeners.forEach((cb) => cb(all));
  }

  private inferLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return 'javascript';
      case 'json':
        return 'json';
      case 'html':
      case 'htm':
        return 'html';
      case 'css':
      case 'scss':
      case 'less':
        return 'css';
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'sh':
      case 'bash':
      case 'zsh':
        return 'shell';
      case 'bat':
      case 'cmd':
        return 'bat';
      case 'ps1':
        return 'powershell';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'xml':
      case 'svg':
        return 'xml';
      case 'env':
      case 'example':
        return 'ini';
      case 'sql':
        return 'sql';
      case 'py':
        return 'python';
      default:
        return 'plaintext';
    }
  }
}

export const fileModelService = new FileModelRegistry();
