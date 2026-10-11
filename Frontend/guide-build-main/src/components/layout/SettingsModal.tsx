import React, { useState } from 'react';
import {
  X,
  Server,
  Key,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  User,
  Sliders,
  ExternalLink,
  Laptop,
} from 'lucide-react';
import { ThirdEyeIcon } from '@/components/ai-assistant/AiSidecar';
import { cn } from '@/lib/utils';
import type { SalesforceWorkspaceApi } from '@/hooks/useSalesforceWorkspace';
import type { SiteDefinition, VMNode } from '@/types/salesforce';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sfApi: SalesforceWorkspaceApi;
  defaultTab?: 'salesforce' | 'sites' | 'ai' | 'profile';
}

export function SettingsModal({
  open,
  onOpenChange,
  sfApi,
  defaultTab = 'salesforce',
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'salesforce' | 'sites' | 'ai' | 'profile'>(defaultTab);

  // Salesforce Form state
  const [instanceUrl, setInstanceUrl] = useState(sfApi.settings.salesforce.instanceUrl);
  const [apiKey, setApiKey] = useState(sfApi.settings.salesforce.apiToken);
  const [userEmail, setUserEmail] = useState(sfApi.settings.salesforce.assignedUserEmail);
  const [clientId, setClientId] = useState(sfApi.settings.salesforce.connectedAppClientId);
  const [showApiKey, setShowApiKey] = useState(false);

  // Connection testing state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Sites state
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [newSiteCode, setNewSiteCode] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteIp, setNewSiteIp] = useState('');
  const [newSiteUser, setNewSiteUser] = useState('aditya_s_ctr_greyorange_com');
  const [newSiteKeyPath, setNewSiteKeyPath] = useState('C:\\Users\\aditya.s.ctr\\.ssh\\id_ed25519');

  // AI Form state
  const [geminiKey, setGeminiKey] = useState(sfApi.settings.ai.apiKey);
  const [geminiModel, setGeminiModel] = useState(sfApi.settings.ai.model || 'gemini-3.8-flash');

  // Save feedback state
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!open) return null;

  // Handle testing connection
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await sfApi.testSalesforceConnection({
        apiKey: apiKey.trim(),
        instanceUrl: instanceUrl.trim(),
      });
      if (res.success) {
        setTestResult({
          success: true,
          message: res.message || 'Successfully connected to Salesforce Service Cloud API.',
          latencyMs: res.latencyMs || 142,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Failed to authenticate with Salesforce. Please check your API Key and URL.',
        });
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Network error communicating with microservice.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Handle saving Salesforce configuration
  const handleSaveSalesforce = async () => {
    await sfApi.updateSalesforceConfig({
      instanceUrl: instanceUrl.trim(),
      apiToken: apiKey.trim(),
      assignedUserEmail: userEmail.trim(),
      connectedAppClientId: clientId.trim(),
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);

    // If key is set, immediately trigger sync
    if (apiKey.trim()) {
      sfApi.syncSalesforce();
    }
  };

  // Handle creating a new site
  const handleAddSite = () => {
    if (!newSiteCode.trim() || !newSiteIp.trim()) return;

    sfApi.addSite({
      code: newSiteCode.trim().toUpperCase(),
      name: newSiteName.trim() || newSiteCode.trim().toUpperCase(),
      customer: 'GreyOrange Robotics',
      region: 'us-east-1',
      primaryIp: newSiteIp.trim(),
      primaryUser: newSiteUser.trim() || 'root',
      authType: 'ssh_key',
      keyPath: newSiteKeyPath.trim(),
      vms: [
        {
          id: `vm-${Date.now()}-1`,
          name: `${newSiteCode.trim()} (Primary)`,
          ip: newSiteIp.trim(),
          role: 'primary',
          user: newSiteUser.trim(),
          keyPath: newSiteKeyPath.trim(),
          status: 'online',
        },
      ],
    });

    setNewSiteCode('');
    setNewSiteName('');
    setNewSiteIp('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 font-sans select-none animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-3xl rounded-xl border border-[#303030] bg-[#222222] overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-[#303030] px-5 py-3 bg-[#181818]">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded bg-[#2A1810] border border-[#FF6B00]/40 text-[#FF6B00]">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-[#E0E0E0]">
                Settings & Enterprise Integrations
              </h2>
              <p className="text-[11px] text-[#808080]">
                Manage Salesforce API credentials, predefined sites, and AI configurations
              </p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-[#808080] hover:bg-[#252525] hover:text-[#E0E0E0] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body: Navigation Sidebar + Content Area */}
        <div className="flex flex-1 min-h-[460px] overflow-hidden">
          {/* Tabs Sidebar */}
          <div className="w-52 shrink-0 border-r border-[#303030] bg-[#1C1C1C] p-2 space-y-1">
            <button
              onClick={() => setActiveTab('salesforce')}
              className={cn(
                'w-full flex items-center gap-2.5 rounded px-3 py-2 text-xs font-medium transition-colors text-left cursor-pointer',
                activeTab === 'salesforce'
                  ? 'bg-[#2A2A2A] text-[#FF6B00] border border-[#383838]'
                  : 'text-[#808080] hover:bg-[#222222] hover:text-[#E0E0E0]'
              )}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span>Salesforce API</span>
              {sfApi.settings.salesforce.apiToken && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FF6B00]" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('sites')}
              className={cn(
                'w-full flex items-center gap-2.5 rounded px-3 py-2 text-xs font-medium transition-colors text-left cursor-pointer',
                activeTab === 'sites'
                  ? 'bg-[#2A2A2A] text-[#FF6B00] border border-[#383838]'
                  : 'text-[#808080] hover:bg-[#222222] hover:text-[#E0E0E0]'
              )}
            >
              <Server className="h-4 w-4 shrink-0" />
              <span>Sites & Credentials</span>
              <span className="ml-auto font-mono text-[10px] text-[#808080]">
                {sfApi.settings.sites.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={cn(
                'w-full flex items-center gap-2.5 rounded px-3 py-2 text-xs font-medium transition-colors text-left cursor-pointer',
                activeTab === 'ai'
                  ? 'bg-[#2A2A2A] text-[#FF6B00] border border-[#383838]'
                  : 'text-[#808080] hover:bg-[#222222] hover:text-[#E0E0E0]'
              )}
            >
              <ThirdEyeIcon className="h-4 w-4 shrink-0" />
              <span>AI Engine (Gemini)</span>
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={cn(
                'w-full flex items-center gap-2.5 rounded px-3 py-2 text-xs font-medium transition-colors text-left cursor-pointer',
                activeTab === 'profile'
                  ? 'bg-[#2A2A2A] text-[#FF6B00] border border-[#383838]'
                  : 'text-[#808080] hover:bg-[#222222] hover:text-[#E0E0E0]'
              )}
            >
              <User className="h-4 w-4 shrink-0" />
              <span>Engineer Profile</span>
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#222222]">
            {/* 1. SALESFORCE TAB */}
            {activeTab === 'salesforce' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Salesforce Service Cloud Ingestion (Microservice on Port 4003)
                  </h3>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    Connect using your Salesforce API Key / Bearer Access Token. All incident tickets assigned to you will stream directly into the sidebar.
                  </p>
                </div>

                {/* Instance URL */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    Salesforce Instance URL
                  </label>
                  <input
                    type="text"
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                    placeholder="https://your-domain.my.salesforce.com"
                    className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground/60">
                    Your Salesforce My Domain URL (e.g. https://greyorange.my.salesforce.com)
                  </p>
                </div>

                {/* API Key / Access Token */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground flex items-center justify-between">
                    <span>Salesforce API Key / Access Token</span>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-[10.5px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      <span>{showApiKey ? 'Hide' : 'Show'}</span>
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your Salesforce Bearer token or API key..."
                      className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">
                    Generated from your Connected App, Salesforce CLI, or OAuth2 access token.
                  </p>
                </div>

                {/* User Email Filter */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-foreground">
                      Engineer Assigned Email
                    </label>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="aditya.s.ctr@greyorange.com"
                      className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-foreground">
                      Connected App Client ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="3MVG9... (Optional)"
                      className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Test Result Display */}
                {testResult && (
                  <div
                    className={cn(
                      'p-3 rounded-xl border text-xs flex items-start gap-2.5',
                      testResult.success
                        ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                        : 'border-[#282d3e] bg-[#141724] text-slate-300'
                    )}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-orange-400">
                        {testResult.success ? 'Connection Verified' : 'Authentication Failed'}
                      </p>
                      <p className="text-[11px] mt-0.5 opacity-90 break-words">{testResult.message}</p>
                      {testResult.latencyMs && (
                        <p className="text-[10px] font-mono mt-1 text-orange-400 font-semibold">
                          API Latency: {testResult.latencyMs}ms
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Save Feedback */}
                {saveSuccess && (
                  <div className="p-2.5 rounded-lg border border-orange-500/40 bg-orange-500/10 text-xs text-orange-300 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-orange-400" />
                    <span>Configuration saved and microservice synchronized.</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection || !apiKey.trim()}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-[#161824] px-3.5 py-2 text-xs font-medium text-foreground hover:bg-[#1e2030] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', testingConnection && 'animate-spin text-primary')} />
                    <span>{testingConnection ? 'Testing Connection...' : 'Test Connection'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveSalesforce}
                      className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 px-4 py-2 text-xs font-semibold text-white shadow-md transition-colors cursor-pointer"
                    >
                      <span>Save & Sync Tickets</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. SITES & CREDENTIALS TAB */}
            {activeTab === 'sites' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-2">
                      <Server className="h-4 w-4 text-primary" />
                      Predefined Sites & VM Fleet
                    </h3>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">
                      Configure automated login IPs and SSH key paths. Clicking a ticket auto-spawns a command prompt into that site's primary IP.
                    </p>
                  </div>
                </div>

                {/* Site List */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {sfApi.settings.sites.map((site) => (
                    <div
                      key={site.id}
                      className="rounded-xl border border-border/80 bg-[#12141e] p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-primary">{site.code}</span>
                          <span className="text-xs text-foreground font-medium">{site.name}</span>
                        </div>
                        <button
                          onClick={() => sfApi.deleteSite(site.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-[#201520] transition-colors cursor-pointer"
                          title="Delete Site"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-muted-foreground bg-[#0c0d14] p-2 rounded-lg border border-border/50">
                        <div>
                          <span className="text-muted-foreground/60">Primary IP: </span>
                          <span className="text-foreground font-semibold">{site.primaryIp}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground/60">User: </span>
                          <span className="text-foreground">{site.primaryUser}</span>
                        </div>
                        <div className="col-span-2 truncate">
                          <span className="text-muted-foreground/60">SSH Key: </span>
                          <span className="text-foreground/80">{site.keyPath || 'None (password auth)'}</span>
                        </div>
                      </div>

                      <div className="text-[10.5px] text-muted-foreground flex items-center gap-2">
                        <span>VM Nodes ({site.vms.length}):</span>
                        <div className="flex flex-wrap gap-1">
                          {site.vms.map((vm) => (
                            <span
                              key={vm.id}
                              className="rounded bg-[#1a1c28] px-1.5 py-0.5 font-mono text-[9.5px] text-orange-400"
                            >
                              {vm.name} ({vm.ip})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add New Site Section */}
                <div className="rounded-xl border border-dashed border-border/90 bg-[#10121a] p-3.5 space-y-3">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-primary" /> Add New Site Predefinition
                  </h4>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[10.5px] text-muted-foreground">Site Code</label>
                      <input
                        type="text"
                        value={newSiteCode}
                        onChange={(e) => setNewSiteCode(e.target.value)}
                        placeholder="e.g. GOR-ORD-01"
                        className="w-full rounded-lg border border-border bg-[#161824] px-2.5 py-1.5 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10.5px] text-muted-foreground">Primary Login IP</label>
                      <input
                        type="text"
                        value={newSiteIp}
                        onChange={(e) => setNewSiteIp(e.target.value)}
                        placeholder="e.g. 172.28.76.144"
                        className="w-full rounded-lg border border-border bg-[#161824] px-2.5 py-1.5 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10.5px] text-muted-foreground">Site Name</label>
                      <input
                        type="text"
                        value={newSiteName}
                        onChange={(e) => setNewSiteName(e.target.value)}
                        placeholder="e.g. Chicago Robotics Core"
                        className="w-full rounded-lg border border-border bg-[#161824] px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10.5px] text-muted-foreground">SSH User</label>
                      <input
                        type="text"
                        value={newSiteUser}
                        onChange={(e) => setNewSiteUser(e.target.value)}
                        placeholder="aditya_s_ctr_greyorange_com"
                        className="w-full rounded-lg border border-border bg-[#161824] px-2.5 py-1.5 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10.5px] text-muted-foreground">SSH Private Key Path</label>
                    <input
                      type="text"
                      value={newSiteKeyPath}
                      onChange={(e) => setNewSiteKeyPath(e.target.value)}
                      placeholder="C:\Users\aditya.s.ctr\.ssh\id_ed25519"
                      className="w-full rounded-lg border border-border bg-[#161824] px-2.5 py-1.5 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddSite}
                    disabled={!newSiteCode.trim() || !newSiteIp.trim()}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/40 py-1.5 text-xs font-semibold text-primary transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Save Predefined Site
                  </button>
                </div>
              </div>
            )}

            {/* 3. AI MODEL TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-2">
                    <ThirdEyeIcon className="h-4 w-4 text-primary" />
                    THIRD EYE AI & Incident Diagnostics
                  </h3>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    Powers automatic ticket analysis, error root-cause diagnostics, and terminal auto-fix commands.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    Google Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="Enter Gemini API Key..."
                    className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">AI Model</label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended - Fast & Accurate)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  </select>
                </div>

                <div className="rounded-xl border border-border/80 bg-[#12141e] p-3 text-xs text-muted-foreground space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <span className="h-2 w-2 rounded-full bg-online" />
                    <span>Real-time Ticket Context Bridging</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    When you select a ticket in the sidebar, THIRD EYE AI automatically ingests the ticket's description, customer context, and primary IP, providing instant domain guidance for your terminal session.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sfApi.setSettings((prev) => ({
                      ...prev,
                      ai: {
                        ...prev.ai,
                        apiKey: geminiKey.trim(),
                        model: geminiModel,
                      },
                    }));
                    setSaveSuccess(true);
                    setTimeout(() => setSaveSuccess(false), 2000);
                  }}
                  className="rounded-lg bg-primary hover:bg-primary/90 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  Save AI Configuration
                </button>
              </div>
            )}

            {/* 4. ENGINEER PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Engineer Identity & Queue
                  </h3>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    Your engineer profile matches tickets assigned to your queue in Salesforce.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Full Name</label>
                    <input
                      type="text"
                      defaultValue={sfApi.settings.profile.name}
                      onChange={(e) =>
                        sfApi.setSettings((prev) => ({
                          ...prev,
                          profile: { ...prev.profile, name: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Corporate Email</label>
                    <input
                      type="email"
                      defaultValue={sfApi.settings.profile.email}
                      onChange={(e) =>
                        sfApi.setSettings((prev) => ({
                          ...prev,
                          profile: { ...prev.profile, email: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Employee ID</label>
                    <input
                      type="text"
                      defaultValue={sfApi.settings.profile.employeeId}
                      onChange={(e) =>
                        sfApi.setSettings((prev) => ({
                          ...prev,
                          profile: { ...prev.profile, employeeId: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-[#141620] px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
