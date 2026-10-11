export type TicketPriority = 'P1 - Critical' | 'P2 - High' | 'P3 - Medium' | 'P4 - Low';
export type TicketStatus = 'New' | 'Assigned' | 'In Progress' | 'Escalated' | 'Resolved';

export interface VMNode {
  id: string;
  name: string;
  ip: string;
  port?: number | undefined;
  user?: string | undefined;
  keyPath?: string | undefined;
  role: 'primary' | 'worker' | 'database' | 'gateway' | 'edge';
  status?: 'online' | 'unreachable' | 'unknown' | undefined;
}

export interface SiteDefinition {
  id: string;
  code: string;
  name: string;
  customer: string;
  region: string;
  primaryIp: string;
  primaryUser: string;
  authType: 'ssh_key' | 'password';
  keyPath?: string | undefined;
  password?: string | undefined;
  vms: VMNode[];
  notes?: string | undefined;
}

export interface SalesforceTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  siteId: string;
  siteName: string;
  primaryIp: string;
  assignedTo: string;
  assignedEmail: string;
  customer: string;
  createdAt: string;
  updatedAt: string;
  caseOrigin: 'Salesforce Service Cloud' | 'PagerDuty' | 'Automated Robot Telemetry';
}

export interface TicketWorkspace {
  ticketId: string;
  sessionIds: string[];
  activeSessionId?: string | undefined;
  notes?: string | undefined;
  createdAt: number;
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  employeeId: string;
  avatarUrl?: string | undefined;
}

export interface SalesforceConfig {
  instanceUrl: string;
  connectedAppClientId: string;
  apiToken: string;
  assignedUserEmail: string;
  autoSyncIntervalMinutes: number;
  enabled: boolean;
  lastSyncedAt?: number | undefined;
}

export interface AIConfig {
  apiKey: string;
  model: string;
  provider: 'gemini' | 'openai';
  autoDiagnoseTickets: boolean;
}

export interface AppSettings {
  profile: UserProfile;
  salesforce: SalesforceConfig;
  ai: AIConfig;
  sites: SiteDefinition[];
}
