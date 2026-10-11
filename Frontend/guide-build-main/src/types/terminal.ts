export type Protocol = "ssh" | "container" | "local";

export interface TerminalInstance {
  id: string;
  name: string;
  host: string;
  shellType?: 'cmd' | 'powershell';
}

export interface ServiceGroup {
  id: string;
  name: string;
  terminals: TerminalInstance[];
}

export interface Environment {
  id: string;
  protocol: Protocol;
  name: string;
  online: boolean;
  services: ServiceGroup[];
}

export type LineKind = "input" | "out" | "error" | "info" | "success";

export interface TermLine {
  kind: LineKind;
  text: string;
  prompt?: string;
}

export interface Session {
  id: string;
  terminalId: string;
  title: string;
  protocol: Protocol;
  cwd: string;
  user: string;
  shellType?: 'cmd' | 'powershell';
  shell?: string;
  lines: TermLine[];
  currentPrompt?: string | undefined;
  lastError?: string | undefined;
  ptyId?: string | undefined;
  ticketId?: string | undefined;
  vmNodeId?: string | undefined;
  ip?: string | undefined;
}

export interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}
