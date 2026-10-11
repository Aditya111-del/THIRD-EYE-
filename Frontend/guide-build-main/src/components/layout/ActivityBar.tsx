import {
  FileText,
  Server,
  Terminal,
  RefreshCw,
  Settings,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SalesforceWorkspaceApi } from '@/hooks/useSalesforceWorkspace';

export type ActivityView = 'terminals' | 'tickets' | 'sites' | 'salesforce';

export function ActivityBar({
  activeView,
  onSelectView,
  onOpenSettings,
  sfApi,
}: {
  activeView: ActivityView;
  onSelectView: (v: ActivityView) => void;
  onOpenSettings: () => void;
  sfApi: SalesforceWorkspaceApi;
}) {
  const openTicketsCount = sfApi.tickets.filter((t) => t.status !== 'Resolved').length;
  const sitesCount = sfApi.settings.sites.length;

  return (
    <aside className="w-12 shrink-0 bg-[#0A0A0A] border-r border-[#262626] flex flex-col items-center justify-between py-2.5 select-none z-20 font-sans">
      {/* Top section: Primary Navigation Icons */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* 1. Command Prompts & Sites List */}
        <button
          onClick={() => onSelectView('sites')}
          className={cn(
            'relative h-10 w-full flex items-center justify-center transition-colors cursor-pointer',
            activeView === 'sites'
              ? 'text-[#E0E0E0] bg-[#141414] border-l-2 border-l-[#FF6B00]'
              : 'text-[#808080] hover:text-[#E0E0E0] hover:bg-[#121212] border-l-2 border-l-transparent'
          )}
          title="Command Prompts & Predefined Sites"
          aria-label="Command Prompts"
        >
          <Terminal className="h-4 w-4" />
        </button>

        {/* 2. Incident Tickets */}
        <button
          onClick={() => onSelectView('tickets')}
          className={cn(
            'relative h-10 w-full flex items-center justify-center transition-colors cursor-pointer',
            activeView === 'tickets'
              ? 'text-[#E0E0E0] bg-[#141414] border-l-2 border-l-[#FF6B00]'
              : 'text-[#808080] hover:text-[#E0E0E0] hover:bg-[#121212] border-l-2 border-l-transparent'
          )}
          title="Incident Tickets"
          aria-label="Tickets"
        >
          <FileText className="h-4 w-4" />
          {openTicketsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-3.5 min-w-[14px] px-0.5 rounded-full bg-[#FF6B00] text-[9px] font-mono font-bold text-white flex items-center justify-center">
              {openTicketsCount}
            </span>
          )}
        </button>

        {/* 3. Active Terminal Sessions */}
        <button
          onClick={() => onSelectView('terminals')}
          className={cn(
            'relative h-10 w-full flex items-center justify-center transition-colors cursor-pointer',
            activeView === 'terminals'
              ? 'text-[#E0E0E0] bg-[#141414] border-l-2 border-l-[#FF6B00]'
              : 'text-[#808080] hover:text-[#E0E0E0] hover:bg-[#121212] border-l-2 border-l-transparent'
          )}
          title="Active Shells & Quick Launch"
          aria-label="Terminals"
        >
          <Server className="h-4 w-4" />
        </button>

        {/* 4. Salesforce Live Sync */}
        <button
          onClick={() => {
            onSelectView('salesforce');
            sfApi.syncSalesforce();
          }}
          className={cn(
            'relative h-10 w-full flex items-center justify-center transition-colors cursor-pointer',
            activeView === 'salesforce'
              ? 'text-[#E0E0E0] bg-[#141414] border-l-2 border-l-[#FF6B00]'
              : 'text-[#808080] hover:text-[#E0E0E0] hover:bg-[#121212] border-l-2 border-l-transparent'
          )}
          title="Sync Salesforce Service Cloud"
          aria-label="Sync"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', sfApi.isSyncing && 'animate-spin text-[#FF6B00]')} />
        </button>
      </div>

      {/* Bottom section: Settings & Profile matching pro IDE design */}
      <div className="flex flex-col items-center gap-2 w-full pt-2">
        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="h-8 w-8 rounded flex items-center justify-center text-[#808080] hover:text-[#E0E0E0] hover:bg-[#141414] transition-colors cursor-pointer"
          title="Workspace Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* User Profile Avatar */}
        <div
          onClick={onOpenSettings}
          className="h-6.5 w-6.5 rounded-full bg-[#141414] border border-[#262626] hover:border-[#FF6B00] flex items-center justify-center text-[10px] font-mono font-bold text-[#FF6B00] cursor-pointer transition-colors"
          title="Active Engineer: aditya.s.ctr"
        >
          AS
        </div>
      </div>
    </aside>
  );
}
