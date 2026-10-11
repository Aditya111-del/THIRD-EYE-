import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  AppSettings,
  SalesforceTicket,
  SiteDefinition,
  VMNode,
} from '@/types/salesforce';
import type { TerminalApi } from '@/hooks/useTerminalSession';

const SETTINGS_STORAGE_KEY = 'third_eye_app_settings_v2';
const TICKETS_STORAGE_KEY = 'third_eye_sf_tickets_v2';

export const defaultSites: SiteDefinition[] = [
  {
    id: 'site-gor-prod',
    code: 'GOR-FHR-PROD',
    name: 'GreyOrange Butler Core — FHR Prod',
    customer: 'GreyOrange Robotics',
    region: 'us-east-1',
    primaryIp: '172.28.76.144',
    primaryUser: 'aditya_s_ctr_greyorange_com',
    authType: 'ssh_key',
    keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
    vms: [
      {
        id: 'vm-gor-1',
        name: 'butler-core-fhrprod-prod (Primary)',
        ip: '172.28.76.144',
        role: 'primary',
        user: 'aditya_s_ctr_greyorange_com',
        keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
        status: 'online',
      },
      {
        id: 'vm-gor-2',
        name: 'butler-db-cluster-01',
        ip: '172.28.76.145',
        role: 'database',
        user: 'aditya_s_ctr_greyorange_com',
        keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
        status: 'online',
      },
      {
        id: 'vm-gor-3',
        name: 'butler-worker-node-02',
        ip: '172.28.76.146',
        role: 'worker',
        user: 'aditya_s_ctr_greyorange_com',
        keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
        status: 'online',
      },
      {
        id: 'vm-gor-4',
        name: 'butler-edge-gateway-01',
        ip: '172.28.76.150',
        role: 'gateway',
        user: 'aditya_s_ctr_greyorange_com',
        keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
        status: 'online',
      },
    ],
    notes: 'Main North American automated robotics dispatch core cluster.',
  },
  {
    id: 'site-wmt-402',
    code: 'WMT-DC-402',
    name: 'Walmart Fulfillment Center DC-402',
    customer: 'Walmart Global Tech',
    region: 'us-central-1',
    primaryIp: '10.20.255.2',
    primaryUser: 'aditya.s.ctr',
    authType: 'ssh_key',
    keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
    vms: [
      {
        id: 'vm-wmt-1',
        name: 'wmt-sorter-master (Primary)',
        ip: '10.20.255.2',
        role: 'primary',
        user: 'aditya.s.ctr',
        keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
        status: 'online',
      },
      {
        id: 'vm-wmt-2',
        name: 'wmt-sorter-worker-01',
        ip: '10.20.255.3',
        role: 'worker',
        user: 'aditya.s.ctr',
        keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
        status: 'online',
      },
      {
        id: 'vm-wmt-3',
        name: 'wmt-redis-cache-01',
        ip: '10.20.255.10',
        role: 'database',
        user: 'aditya.s.ctr',
        keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
        status: 'online',
      },
    ],
    notes: 'High throughput sorter automated conveyor infrastructure.',
  },
  {
    id: 'site-tgt-09',
    code: 'TGT-ATL-09',
    name: 'Target Regional Hub — ATL-09',
    customer: 'Target Distribution',
    region: 'us-east-2',
    primaryIp: '172.22.152.12',
    primaryUser: 'gor',
    authType: 'password',
    vms: [
      {
        id: 'vm-tgt-1',
        name: 'tgt-butler-fleet-01 (Primary)',
        ip: '172.22.152.12',
        role: 'primary',
        user: 'gor',
        status: 'online',
      },
      {
        id: 'vm-tgt-2',
        name: 'tgt-dispatch-mgr',
        ip: '172.22.152.14',
        role: 'worker',
        user: 'gor',
        status: 'online',
      },
    ],
    notes: 'Autonomous mobile robot fleet manager in Atlanta hub.',
  },
];

export const defaultSettings: AppSettings = {
  profile: {
    name: 'Aditya S.',
    email: 'aditya.s.ctr@greyorange.com',
    role: 'Lead Infrastructure & Robotics DevOps Engineer',
    employeeId: 'GOR-ENG-9457',
  },
  salesforce: {
    instanceUrl: 'https://greyorange.my.salesforce.com',
    connectedAppClientId: '',
    apiToken: '',
    assignedUserEmail: 'aditya.s.ctr@greyorange.com',
    autoSyncIntervalMinutes: 5,
    enabled: true,
    lastSyncedAt: null,
  },
  ai: {
    apiKey: '',
    model: 'gemini-3.8-flash',
    provider: 'gemini',
    autoDiagnoseTickets: true,
  },
  sites: defaultSites,
};

export function useSalesforceWorkspace(terminalApi: TerminalApi) {
  // 1. Persistent Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window === 'undefined') return defaultSettings;
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...defaultSettings,
          ...parsed,
          sites: parsed.sites?.length ? parsed.sites : defaultSites,
          salesforce: {
            ...defaultSettings.salesforce,
            ...(parsed.salesforce || {}),
          },
        };
      }
    } catch {}
    return defaultSettings;
  });

  // 2. Persistent Tickets (Dynamic from Salesforce API)
  const [tickets, setTickets] = useState<SalesforceTicket[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(TICKETS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // 3. Active Ticket Selection
  const [activeTicketId, setActiveTicketId] = useState<string | null>(() => {
    return tickets.length > 0 ? tickets[0]?.id ?? null : null;
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Sync settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Sync tickets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(tickets));
    } catch {}
  }, [tickets]);

  // Active ticket object (null by default so Salesforce does not interfere with terminal)
  const activeTicket = useMemo(() => {
    if (!activeTicketId) return null;
    return tickets.find((t) => t.id === activeTicketId) || null;
  }, [tickets, activeTicketId]);

  // Find site associated with the active ticket
  const activeSite = useMemo(() => {
    if (!activeTicket) return null;
    return (
      settings.sites.find((s) => s.id === activeTicket.siteId || s.primaryIp === activeTicket.primaryIp) ||
      settings.sites[0] ||
      null
    );
  }, [activeTicket, settings.sites]);

  // Get all terminal sessions that belong to the current active ticket
  const ticketSessions = useMemo(() => {
    if (!activeTicketId) return terminalApi.sessions;
    return terminalApi.sessions.filter((s) => s.ticketId === activeTicketId);
  }, [terminalApi.sessions, activeTicketId]);

  // Select a ticket and auto-login to its primary IP if no sessions exist
  const selectTicket = useCallback(
    (ticketId: string) => {
      setActiveTicketId(ticketId);
      const ticket = tickets.find((t) => t.id === ticketId);
      if (!ticket) return;

      // Locate or match site
      let site = settings.sites.find((s) => s.id === ticket.siteId || s.primaryIp === ticket.primaryIp);
      if (!site) {
        site = {
          id: `site-auto-${ticket.id}`,
          code: ticket.siteName ? ticket.siteName.slice(0, 10).toUpperCase() : 'AUTO-SITE',
          name: ticket.siteName || 'Salesforce Site',
          customer: ticket.customer || 'Salesforce',
          region: 'auto',
          primaryIp: ticket.primaryIp || '172.28.76.144',
          primaryUser: 'aditya_s_ctr_greyorange_com',
          authType: 'ssh_key',
          keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
          vms: [
            {
              id: `vm-${ticket.id}-primary`,
              name: `${ticket.siteName || 'Host'} (Primary)`,
              ip: ticket.primaryIp || '172.28.76.144',
              role: 'primary',
              user: 'aditya_s_ctr_greyorange_com',
              keyPath: 'C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519',
              status: 'online',
            },
          ],
        };
      }

      // Check if this ticket already has active terminal sessions
      const existingSessions = terminalApi.sessions.filter((s) => s.ticketId === ticketId);
      if (existingSessions.length > 0) {
        // Switch to the first session of this ticket
        terminalApi.setActiveId(existingSessions[0]!.id);
      }
      // Note: Automatic terminal spawning and SSH command execution disabled
      // to keep local terminal operations completely clean and uninterrupted.
    },
    [terminalApi]
  );

  // Add an additional terminal (Command Prompt / VM node) under the active ticket
  const addTerminalToTicket = useCallback(
    (ticketId: string, vmNode?: VMNode) => {
      const ticket = tickets.find((t) => t.id === ticketId) || activeTicket;
      if (!ticket) return;

      const site = settings.sites.find((s) => s.id === ticket.siteId || s.primaryIp === ticket.primaryIp);
      const targetVm = vmNode || site?.vms[0];

      const title = targetVm
        ? `${ticket.ticketNumber}: ${targetVm.name}`
        : `${ticket.ticketNumber}: Local Diagnostics`;

      if (targetVm && terminalApi.connectSsh) {
        terminalApi.connectSsh({
          title,
          ip: targetVm.ip,
          user: targetVm.user || site?.primaryUser || 'root',
          keyPath: targetVm.keyPath || site?.keyPath,
          ticketId: ticket.id,
          vmNodeId: targetVm.id,
        });
      } else {
        terminalApi.createTerminal('cmd', {
          title,
          ticketId: ticket.id,
        });
      }
    },
    [tickets, activeTicket, settings.sites, terminalApi]
  );

  // Close/delete a terminal under a ticket
  const deleteTerminalFromTicket = useCallback(
    (sessionId: string) => {
      terminalApi.closeSession(sessionId);
    },
    [terminalApi]
  );

  // Test Salesforce API Connection
  const testSalesforceConnection = useCallback(
    async (params?: { apiKey?: string; instanceUrl?: string }) => {
      const apiKey = (params?.apiKey ?? settings.salesforce.apiToken).trim();
      const instanceUrl = (params?.instanceUrl ?? settings.salesforce.instanceUrl).trim();

      if (!apiKey) {
        return { success: false, error: 'Salesforce API Key / Access Token is required.' };
      }

      if (typeof window !== 'undefined' && window.electronAPI?.salesforce?.testConnection) {
        return await window.electronAPI.salesforce.testConnection({ apiKey, instanceUrl });
      }

      const res = await fetch('http://localhost:4003/api/salesforce/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, instanceUrl }),
      });
      return await res.json();
    },
    [settings.salesforce]
  );

  // Fetch real tickets from Salesforce API Microservice
  const syncSalesforce = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);

    const apiKey = settings.salesforce.apiToken.trim();
    const instanceUrl = settings.salesforce.instanceUrl.trim();
    const userEmail = settings.salesforce.assignedUserEmail.trim();

    if (!apiKey) {
      const err = 'Salesforce API key is required. Please enter your API key in Settings.';
      setSyncError(err);
      setIsSyncing(false);
      return { success: false, error: err };
    }

    try {
      let fetchedTickets: SalesforceTicket[] = [];

      if (typeof window !== 'undefined' && window.electronAPI?.salesforce?.fetchTickets) {
        const res = await window.electronAPI.salesforce.fetchTickets({ apiKey, instanceUrl, userEmail });
        if (!res.success) {
          throw new Error(res.error || 'Failed to fetch tickets from Salesforce.');
        }
        fetchedTickets = res.tickets || [];
      } else {
        const queryParams = new URLSearchParams({ apiKey, instanceUrl, userEmail });
        const res = await fetch(`http://localhost:4003/api/salesforce/tickets?${queryParams}`);
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Salesforce microservice returned an error.');
        }
        fetchedTickets = data.tickets || [];
      }

      setTickets(fetchedTickets);
      if (fetchedTickets.length > 0 && (!activeTicketId || !fetchedTickets.some((t) => t.id === activeTicketId))) {
        setActiveTicketId(fetchedTickets[0]?.id ?? null);
      }

      setSettings((prev) => ({
        ...prev,
        salesforce: {
          ...prev.salesforce,
          lastSyncedAt: Date.now(),
        },
      }));

      return { success: true, count: fetchedTickets.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SalesforceWorkspace] Sync failed:', msg);
      setSyncError(msg);
      return { success: false, error: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [settings.salesforce, activeTicketId]);

  // Persist config to microservice backend
  const updateSalesforceConfig = useCallback(
    async (newSfConfig: Partial<AppSettings['salesforce']>) => {
      const mergedSf = { ...settings.salesforce, ...newSfConfig };
      setSettings((prev) => ({
        ...prev,
        salesforce: mergedSf,
      }));

      try {
        const payload = {
          instanceUrl: mergedSf.instanceUrl,
          apiKey: mergedSf.apiToken,
          userEmail: mergedSf.assignedUserEmail,
          clientId: mergedSf.connectedAppClientId,
        };

        if (typeof window !== 'undefined' && window.electronAPI?.salesforce?.saveConfig) {
          await window.electronAPI.salesforce.saveConfig(payload);
        } else {
          await fetch('http://localhost:4003/api/salesforce/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      } catch (e) {
        console.warn('[SalesforceWorkspace] Failed to sync config to microservice:', e);
      }
    },
    [settings.salesforce]
  );

  // Add a new Site
  const addSite = useCallback((newSite: Omit<SiteDefinition, 'id'>) => {
    const site: SiteDefinition = {
      ...newSite,
      id: `site-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    setSettings((prev) => ({
      ...prev,
      sites: [...prev.sites, site],
    }));
    return site;
  }, []);

  // Update an existing Site
  const updateSite = useCallback((id: string, updates: Partial<SiteDefinition>) => {
    setSettings((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  }, []);

  // Delete a Site
  const deleteSite = useCallback((id: string) => {
    setSettings((prev) => ({
      ...prev,
      sites: prev.sites.filter((s) => s.id !== id),
    }));
  }, []);

  // Create a new Ticket manually
  const createTicket = useCallback(
    (newTicket: Omit<SalesforceTicket, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt'>) => {
      const id = `sf-case-${Date.now()}`;
      const ticketNumber = `SF-${Math.floor(10000 + Math.random() * 90000)}`;
      const ticket: SalesforceTicket = {
        ...newTicket,
        id,
        ticketNumber,
        createdAt: 'Just now',
        updatedAt: 'Just now',
      };
      setTickets((prev) => [ticket, ...prev]);
      return ticket;
    },
    []
  );

  return {
    settings,
    setSettings,
    tickets,
    setTickets,
    activeTicketId,
    setActiveTicketId,
    activeTicket,
    activeSite,
    ticketSessions,
    isSyncing,
    syncError,
    selectTicket,
    addTerminalToTicket,
    deleteTerminalFromTicket,
    syncSalesforce,
    testSalesforceConnection,
    updateSalesforceConfig,
    addSite,
    updateSite,
    deleteSite,
    createTicket,
  };
}

export type SalesforceWorkspaceApi = ReturnType<typeof useSalesforceWorkspace>;
