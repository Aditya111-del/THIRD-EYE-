export interface TerminalSpawnConfig {
  id?: string | undefined;
  shell?: string | undefined;
  shellType?: 'cmd' | 'powershell' | undefined;
  cwd?: string | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
  env?: Record<string, string> | undefined;
}

export interface TerminalSessionInfo {
  id: string;
  shell: string;
  cwd: string;
  cols?: number | undefined;
  rows?: number | undefined;
  createdAt?: number | undefined;
}

export interface TerminalSpawnResult extends Partial<TerminalSessionInfo> {
  success: boolean;
  error?: string | undefined;
}

export interface AIAnalysisResult {
  success: boolean;
  explanation: string;
  suggested_command: string;
  severity?: 'high' | 'medium' | 'low' | 'info' | undefined;
  root_cause?: string | undefined;
  timestamp: number;
}

export interface AIErrorDetectedEvent {
  terminalId: string;
  errorSummary: string;
  snippet: string;
  timestamp: number;
}

export interface ElectronAPI {
  services?: {
    ptyUrl: string;
    aiUrl: string;
    wsUrl: string;
  } | undefined;
  terminal: {
    spawn: (config?: TerminalSpawnConfig) => Promise<TerminalSpawnResult>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    kill: (id: string) => Promise<{ success: boolean }>;
    list: () => Promise<TerminalSessionInfo[]>;
    onData: (callback: (payload: { id: string; data: string }) => void) => () => void;
    onExit: (
      callback: (payload: { id: string; exitCode: number; signal?: number | undefined }) => void
    ) => () => void;
  };
  ai: {
    analyze: (params: {
      terminalId: string;
      customPrompt?: string | undefined;
      logCount?: number | undefined;
      cwd?: string | undefined;
      recentLines?: string[] | undefined;
    }) => Promise<AIAnalysisResult>;
    chat: (params: {
      terminalId: string;
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
      cwd?: string | undefined;
      recentLines?: string[] | undefined;
    }) => Promise<{ success: boolean; reply: string }>;
    getBuffer: (params: { terminalId: string; lineCount?: number | undefined }) => Promise<string>;
    clearBuffer: (terminalId: string) => Promise<{ success: boolean }>;
    onErrorDetected: (callback: (event: AIErrorDetectedEvent) => void) => () => void;
  };
  salesforce?: {
    testConnection: (params: { instanceUrl?: string | undefined; apiKey?: string | undefined }) => Promise<{ success: boolean; message?: string | undefined; error?: string | undefined; latencyMs?: number | undefined }>;
    fetchTickets: (params?: { instanceUrl?: string | undefined; apiKey?: string | undefined; userEmail?: string | undefined }) => Promise<{ success: boolean; tickets: any[]; count?: number | undefined; error?: string | undefined }>;
    saveConfig: (config: { instanceUrl?: string | undefined; apiKey?: string | undefined; userEmail?: string | undefined; clientId?: string | undefined }) => Promise<{ success: boolean; message?: string | undefined }>;
    getConfig: () => Promise<{ instanceUrl: string; hasApiKey: boolean; userEmail: string; maskedApiKey?: string | undefined }>;
  } | undefined;
  window?: {
    zoomIn: () => Promise<number>;
    zoomOut: () => Promise<number>;
    resetZoom: () => Promise<number>;
    getZoom: () => Promise<number>;
    setZoom: (factor: number) => Promise<number>;
    minimize?: () => Promise<boolean>;
    close?: () => Promise<boolean>;
    toggleMaximize: () => Promise<boolean>;
    isMaximized: () => Promise<boolean>;
    onZoomChanged?: (callback: (zoom: number) => void) => () => void;
    onMaximizedChanged?: (callback: (isMaximized: boolean) => void) => () => void;
  } | undefined;
  clipboard?: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<boolean>;
  } | undefined;
  system: {
    getDefaultShell: () => Promise<string>;
    getCwd: () => Promise<string>;
    inspectDirectory?: (cwd?: string) => Promise<{
      cwd: string;
      directories: string[];
      files: string[];
      packageData: any;
      gitInfo: { branch: string; hasGit: boolean };
      error?: string;
    }>;
    openExternalTerminal: (cwd?: string) => Promise<{ success: boolean }>;
    relaunchApp?: (() => Promise<{ success: boolean; error?: string | undefined }>) | undefined;
    platform: 'win32' | 'darwin' | 'linux';
    versions: {
      electron: string;
      node: string;
      chrome: string;
    };
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI | undefined;
  }
}
