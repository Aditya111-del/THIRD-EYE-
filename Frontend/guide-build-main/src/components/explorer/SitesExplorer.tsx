import { useState } from 'react';
import {
  Server,
  Plus,
  Terminal,
  Shield,
  Key,
  Trash2,
  Edit2,
  Laptop,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SalesforceWorkspaceApi } from '@/hooks/useSalesforceWorkspace';
import type { TerminalApi } from '@/hooks/useTerminalSession';
import type { SiteDefinition, VMNode } from '@/types/salesforce';

export function SitesExplorer({
  sfApi,
  terminalApi,
  onOpenAddSite,
}: {
  sfApi: SalesforceWorkspaceApi;
  terminalApi: TerminalApi;
  onOpenAddSite: () => void;
}) {
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({
    'site-gor-prod': true,
  });

  const toggleExpand = (id: string) => {
    setExpandedSites((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleConnectSite = (site: SiteDefinition, vm?: VMNode) => {
    const targetIp = vm ? vm.ip : site.primaryIp;
    const targetUser = (vm && vm.user) ? vm.user : site.primaryUser;
    const targetTitle = vm ? `${site.code}: ${vm.name}` : `${site.code}: ${site.primaryIp} (Primary)`;
    const keyPath = (vm && vm.keyPath) ? vm.keyPath : site.keyPath;

    if (terminalApi.connectSsh) {
      terminalApi.connectSsh({
        title: targetTitle,
        ip: targetIp,
        user: targetUser,
        keyPath,
      });
    } else {
      terminalApi.createTerminal('cmd');
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-[#0A0A0A] border-r border-[#262626] font-sans select-none">
      {/* Header matching pro IDE design: >_ Command Prompts (5) + */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#242424] px-3 bg-[#0D0D0D]">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-[#FF6B00]" />
          <span className="text-[12px] font-semibold tracking-tight text-[#E0E0E0]">
            Command Prompts
          </span>
          <span className="rounded bg-[#181818] border border-[#2A2A2A] px-1.5 py-0.2 text-[10px] font-mono text-[#FF6B00] font-bold">
            {sfApi.settings.sites.length}
          </span>
        </div>
        <button
          onClick={onOpenAddSite}
          className="p-1 rounded text-[#808080] hover:text-[#E0E0E0] hover:bg-[#181818] transition-colors cursor-pointer"
          title="Add Predefined Site"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Sites List Cards */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-2.5 bg-[#121212]">
        {sfApi.settings.sites.map((site) => {
          const isExpanded = Boolean(expandedSites[site.id]);

          return (
            <div
              key={site.id}
              className="rounded-lg fabric-card p-3.5 transition-all select-none"
            >
              {/* Site Header Row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => toggleExpand(site.id)}
                    className="text-[#808080] hover:text-[#E0E0E0] p-0.5 cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-[#808080]" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-[#808080]" />
                    )}
                  </button>
                  <span className="font-mono text-[12px] font-bold text-[#E0E0E0] truncate">
                    {site.code}
                  </span>
                </div>

                {/* Connect button - Solid tactile button with depth */}
                <button
                  onClick={() => handleConnectSite(site)}
                  className="rounded-md fabric-btn px-3 py-1 text-[11px] font-sans font-semibold text-[#E0E0E0] transition-all cursor-pointer"
                  title="Auto-login to primary IP"
                >
                  Connect
                </button>
              </div>

              {/* Customer Tag pill - Recessed woven tag */}
              <div className="mt-1.5 pl-5">
                <span className="inline-block rounded-md fabric-tag px-2.5 py-0.5 text-[10px] font-sans font-medium text-[#FF6B00]">
                  {site.customer || site.name}
                </span>
              </div>

              {/* Primary IP and User meta info */}
              <div className="mt-2.5 pl-5 flex items-center justify-between text-[11px] font-mono text-[#808080]">
                <span>
                  Primary: <span className="text-[#FF6B00] font-semibold">{site.primaryIp}</span>
                </span>
                <span>
                  User: <span className="text-[#A0A0A0] font-medium">{site.primaryUser}</span>
                </span>
              </div>

              {/* Sub VMs dropdown if expanded */}
              {isExpanded && site.vms.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-[#181818] pl-5 space-y-1.5">
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[#707070] mb-1">
                    Node Fleet ({site.vms.length})
                  </div>
                  {site.vms.map((vm) => (
                    <div
                      key={vm.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-md fabric-tag text-[11px]"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Terminal className="h-3 w-3 text-[#FF6B00] shrink-0" />
                        <span className="font-mono text-[#E0E0E0] truncate font-medium">{vm.name}</span>
                        <span className="font-mono text-[10px] text-[#707070]">({vm.ip})</span>
                      </div>
                      <button
                        onClick={() => handleConnectSite(site, vm)}
                        className="text-[10px] font-mono text-[#FF6B00] hover:text-orange-300 cursor-pointer font-medium"
                      >
                        Launch
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Add Predefined Site Button */}
      <div className="p-2 border-t border-[#1C1C1C] bg-[#101010]">
        <button
          onClick={onOpenAddSite}
          className="w-full flex items-center justify-center gap-2 rounded-lg fabric-card py-2 text-[12px] font-sans font-semibold text-[#E0E0E0] transition-all cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 text-[#FF6B00]" />
          <span>Add Predefined Site & IPs</span>
        </button>
      </div>
    </div>
  );
}
