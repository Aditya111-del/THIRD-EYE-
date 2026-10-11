import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Server,
  SquareTerminal,
  Terminal,
  X,
  ExternalLink,
  CheckCircle2,
  Clock,
  Laptop,
  FolderKanban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SalesforceWorkspaceApi } from '@/hooks/useSalesforceWorkspace';
import type { TerminalApi } from '@/hooks/useTerminalSession';
import type { VMNode } from '@/types/salesforce';

const priorityColors = {
  'P1 - Critical': 'text-[#FF6B00] fabric-tag font-bold',
  'P2 - High': 'text-[#FF6B00] fabric-tag font-semibold',
  'P3 - Medium': 'text-[#E0E0E0] fabric-tag',
  'P4 - Low': 'text-[#808080] fabric-tag',
};

const statusColors = {
  'New': 'fabric-tag text-[#888888]',
  'Assigned': 'fabric-tag text-[#888888]',
  'In Progress': 'fabric-tag text-[#FF6B00] font-medium',
  'Escalated': 'fabric-tag text-[#FF6B00] font-semibold',
  'Resolved': 'fabric-tag text-[#888888]',
};

export function TicketsExplorer({
  sfApi,
  terminalApi,
  onOpenSettings,
}: {
  sfApi: SalesforceWorkspaceApi;
  terminalApi: TerminalApi;
  onOpenSettings: () => void;
}) {
  const [search, setSearch] = useState('');
  const [collapsedTickets, setCollapsedTickets] = useState<Record<string, boolean>>({});
  const [addingVmForTicketId, setAddingVmForTicketId] = useState<string | null>(null);

  const toggleCollapse = (id: string) => {
    setCollapsedTickets((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredTickets = sfApi.tickets.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.ticketNumber.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.siteName.toLowerCase().includes(q) ||
      t.primaryIp.includes(q) ||
      t.customer.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-[#0A0A0A] border-r border-[#262626] font-sans select-none">
      {/* Top Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#242424] px-3 bg-[#0D0D0D]">
        <div className="flex items-center gap-2 min-w-0">
          <FolderKanban className="h-3.5 w-3.5 text-[#FF6B00]" />
          <span className="text-[12px] font-semibold tracking-tight text-[#E0E0E0] truncate">
            Salesforce Tickets
          </span>
          <span className="rounded bg-[#181818] border border-[#2A2A2A] px-1.5 py-0.2 text-[9.5px] font-mono text-[#FF6B00] font-bold">
            {sfApi.tickets.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => sfApi.syncSalesforce()}
            disabled={sfApi.isSyncing}
            className="p-1 rounded text-[#808080] hover:text-[#E0E0E0] hover:bg-[#181818] transition-colors cursor-pointer"
            title="Sync tickets from Salesforce"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', sfApi.isSyncing && 'animate-spin text-[#FF6B00]')} />
          </button>
        </div>
      </div>

      {/* User Assigned Banner */}
      <div className="px-3 py-1 bg-[#101010] border-b border-[#242424] flex items-center justify-between text-[11px] text-[#808080]">
        <span className="truncate">
          Queue: <span className="text-[#E0E0E0] font-medium">{sfApi.settings.profile.name}</span>
        </span>
        <span className="text-[9.5px] text-[#FF6B00] font-mono uppercase font-bold tracking-wider shrink-0 bg-[#181818] px-1.5 py-0.2 rounded border border-[#2A2A2A]">
          SYNCED
        </span>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-[#242424]">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#141414] border border-[#262626] focus-within:border-[#383838] transition-colors">
          <Search className="h-3 w-3 text-[#808080] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets, site, IP..."
            className="w-full bg-transparent text-[11.5px] text-[#E0E0E0] outline-none placeholder:text-[#606060] border-none p-0 font-sans"
          />
        </div>
      </div>

      {/* Sync Error Banner if any */}
      {sfApi.syncError && (
        <div className="mx-2 mt-2 p-2.5 rounded-lg border border-[#FF6B00]/40 bg-[#1A0E08] text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-[#FF6B00] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#FF6B00] text-[11.5px]">Salesforce API Sync Notice</p>
              <p className="text-[11px] text-[#808080] mt-0.5 leading-tight break-words">{sfApi.syncError}</p>
              <button
                onClick={onOpenSettings}
                className="mt-2 text-[10.5px] font-medium text-[#FF6B00] hover:underline flex items-center gap-1 cursor-pointer"
              >
                Configure API Key in Settings &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Workspaces Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-2.5 bg-[#121212]">
        {sfApi.tickets.length === 0 ? (
          <div className="my-8 px-4 text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-xl bg-[#2A1810] border border-[#FF6B00]/30 flex items-center justify-center text-[#FF6B00]">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#E0E0E0]">No Tickets In Queue</p>
              <p className="text-[11px] text-[#808080] mt-1 max-w-[220px] mx-auto leading-relaxed">
                Connect your Salesforce Service Cloud account with an API key to stream incident tickets assigned to you.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={onOpenSettings}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#2A1810] hover:bg-[#351E14] border border-[#FF6B00]/40 px-3 py-1.5 text-[11px] font-medium text-[#FF6B00] transition-colors cursor-pointer"
              >
                <span>Configure Salesforce API Key</span>
              </button>
              <button
                onClick={() => sfApi.syncSalesforce()}
                disabled={sfApi.isSyncing}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] border border-[#262626] px-3 py-1.5 text-[11px] font-medium text-[#808080] hover:text-[#E0E0E0] transition-colors cursor-pointer"
              >
                <RefreshCw className={cn('h-3 w-3', sfApi.isSyncing && 'animate-spin text-[#FF6B00]')} />
                <span>{sfApi.isSyncing ? 'Fetching from Salesforce...' : 'Sync Now'}</span>
              </button>
            </div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="py-8 px-3 text-center text-xs text-[#808080] space-y-2">
            <p>No tickets match your query</p>
            <button
              onClick={() => setSearch('')}
              className="text-[11px] text-[#FF6B00] hover:underline cursor-pointer"
            >
              Clear filter
            </button>
          </div>
        ) : (
          filteredTickets.map((ticket) => {
            const isSelected = sfApi.activeTicketId === ticket.id;
            const isCollapsed = Boolean(collapsedTickets[ticket.id]);
            const site = sfApi.settings.sites.find((s) => s.id === ticket.siteId);
            const sessionsForTicket = terminalApi.sessions.filter((s) => s.ticketId === ticket.id);

            return (
              <div
                key={ticket.id}
                className={cn(
                  'rounded-lg transition-all overflow-hidden select-none',
                  isSelected ? 'fabric-card-active' : 'fabric-card'
                )}
              >
                {/* Folder Header */}
                <div
                  onClick={() => {
                    sfApi.selectTicket(ticket.id);
                    if (isCollapsed) toggleCollapse(ticket.id);
                  }}
                  className="p-2.5 cursor-pointer flex flex-col gap-1.5 select-none"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(ticket.id);
                        }}
                        className="text-[#808080] hover:text-[#E0E0E0] p-0.5"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <span className="font-mono text-[11px] font-bold text-[#E0E0E0]">
                        {ticket.ticketNumber}
                      </span>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-[9.5px]',
                          priorityColors[ticket.priority]
                        )}
                      >
                        {ticket.priority.split(' - ')[0]}
                      </span>
                    </div>

                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-[9.5px] font-sans',
                        statusColors[ticket.status]
                      )}
                    >
                      {ticket.status}
                    </span>
                  </div>

                  {/* Subject line */}
                  <div className="text-[12px] font-medium text-[#E0E0E0]/90 leading-tight line-clamp-2">
                    {ticket.subject}
                  </div>

                  {/* Site & Primary IP badge */}
                  <div className="flex items-center justify-between text-[11px] text-[#808080] font-mono pt-0.5">
                    <span className="flex items-center gap-1.5 truncate max-w-[170px]" title={ticket.siteName}>
                      <Server className="h-3 w-3 text-[#FF6B00] shrink-0" /> {site?.code || ticket.siteName}
                    </span>
                    <span className="text-[#FF6B00] font-semibold">{ticket.primaryIp}</span>
                  </div>
                </div>

                {/* Sub-Folder: Nested Command Prompts / Terminals under this Ticket */}
                {!isCollapsed && (
                  <div className="border-t border-[#181818] bg-[#161616] p-2 space-y-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between px-1 text-[9.5px] font-semibold uppercase tracking-wider text-[#707070]">
                      <span>Command Prompts ({sessionsForTicket.length})</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddingVmForTicketId(
                            addingVmForTicketId === ticket.id ? null : ticket.id
                          );
                        }}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] text-[#FF6B00] hover:bg-[#2A1810] transition-colors cursor-pointer"
                        title="Add command prompt on specific VM node"
                      >
                        <Plus className="h-2.5 w-2.5" /> Add VM Shell
                      </button>
                    </div>

                    {/* VM Selection Dropdown */}
                    {addingVmForTicketId === ticket.id && (
                      <div className="my-1.5 p-2 rounded-lg border border-[#262626] bg-[#141414] space-y-1.5">
                        <div className="text-[10px] font-medium text-[#E0E0E0]">
                          Choose VM node to launch terminal:
                        </div>
                        <div className="space-y-1 max-h-36 overflow-auto">
                          {site?.vms.map((vm) => (
                            <button
                              key={vm.id}
                              onClick={() => {
                                sfApi.addTerminalToTicket(ticket.id, vm);
                                setAddingVmForTicketId(null);
                              }}
                              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-[#1E1E1E] text-[11px] text-left transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <Terminal className="h-3 w-3 text-[#FF6B00] shrink-0" />
                                <span className="font-mono text-[#E0E0E0] font-medium truncate">
                                  {vm.name}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] text-[#808080] shrink-0 pl-1">
                                {vm.ip}
                              </span>
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              sfApi.addTerminalToTicket(ticket.id);
                              setAddingVmForTicketId(null);
                            }}
                            className="w-full flex items-center gap-1.5 p-1.5 rounded-md hover:bg-[#1E1E1E] text-[11px] text-left text-[#808080] hover:text-[#E0E0E0] transition-colors cursor-pointer"
                          >
                            <SquareTerminal className="h-3 w-3 text-[#808080] shrink-0" />
                            <span>Local Command Prompt (Diagnostics)</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Active Terminal Sessions for this Ticket */}
                    {sessionsForTicket.length === 0 ? (
                      <div className="p-2 text-center text-[10.5px] text-[#707070] italic">
                        No command prompt open. Click to auto-login.
                      </div>
                    ) : (
                      sessionsForTicket.map((session) => {
                        const isActiveShell = terminalApi.activeId === session.id;
                        return (
                          <div
                            key={session.id}
                            onClick={() => {
                              sfApi.setActiveTicketId(ticket.id);
                              terminalApi.setActiveId(session.id);
                            }}
                            className={cn(
                              'group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11.5px] font-mono cursor-pointer transition-all',
                              isActiveShell
                                ? 'fabric-card-active text-[#E0E0E0] font-medium'
                                : 'fabric-tag text-[#808080] hover:text-[#E0E0E0]'
                            )}
                          >
                            <div className="flex items-center gap-1.5 truncate min-w-0">
                              <Terminal
                                className={cn(
                                  'h-3 w-3 shrink-0',
                                  isActiveShell ? 'text-[#FF6B00]' : 'text-[#808080]'
                                )}
                              />
                              <span className="truncate font-medium">{session.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isActiveShell && (
                                <span className="px-1.5 py-0.2 rounded fabric-tag text-[#FF6B00] font-mono text-[8.5px] font-bold">
                                  LIVE
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sfApi.deleteTerminalFromTicket(session.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#2E2E2E] text-[#808080] hover:text-[#E0E0E0] transition-all cursor-pointer"
                                title="Close Command Prompt"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Quick Config Banner */}
      <div className="p-2 border-t border-[#1C1C1C] bg-[#101010]">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg fabric-card py-2 text-[11px] font-semibold text-[#808080] hover:text-[#E0E0E0] transition-all cursor-pointer"
        >
          <Server className="h-3.5 w-3.5 text-[#FF6B00]" /> Manage Sites & Login Credentials
        </button>
      </div>
    </div>
  );
}
