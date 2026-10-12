import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Shield,
  CheckCircle2,
  Sliders,
  User,
  Monitor,
  Code2,
  Sparkles,
} from 'lucide-react';
import { ThirdEyeIcon } from '@/components/ai-assistant/AiSidecar';
import { cn } from '@/lib/utils';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'ai' | 'editor' | 'profile';
}

export function SettingsModal({
  open,
  onOpenChange,
  defaultTab = 'ai',
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'editor' | 'profile'>(defaultTab);

  // AI Form state
  const [geminiKey, setGeminiKey] = useState(() => {
    return localStorage.getItem('thirdeye_gemini_key') || '';
  });
  const [geminiModel, setGeminiModel] = useState(() => {
    return localStorage.getItem('thirdeye_gemini_model') || 'gemini-2.0-flash';
  });

  // Editor settings state
  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('thirdeye_editor_font_size') || '14';
  });
  const [tabSize, setTabSize] = useState(() => {
    return localStorage.getItem('thirdeye_editor_tab_size') || '2';
  });
  const [wordWrap, setWordWrap] = useState(() => {
    return localStorage.getItem('thirdeye_editor_word_wrap') === 'on';
  });
  const [minimap, setMinimap] = useState(() => {
    return localStorage.getItem('thirdeye_editor_minimap') !== 'off';
  });

  // Profile settings state
  const [engineerName, setEngineerName] = useState(() => {
    return localStorage.getItem('thirdeye_profile_name') || 'Aditya Salgotra';
  });
  const [engineerEmail, setEngineerEmail] = useState(() => {
    return localStorage.getItem('thirdeye_profile_email') || 'aditya.s.ctr@greyorange.com';
  });
  const [employeeId, setEmployeeId] = useState(() => {
    return localStorage.getItem('thirdeye_profile_emp_id') || 'GO-84920';
  });

  // Save feedback state
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  if (!open) return null;

  const handleSaveAi = () => {
    localStorage.setItem('thirdeye_gemini_key', geminiKey.trim());
    localStorage.setItem('thirdeye_gemini_model', geminiModel);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleSaveEditor = () => {
    localStorage.setItem('thirdeye_editor_font_size', fontSize);
    localStorage.setItem('thirdeye_editor_tab_size', tabSize);
    localStorage.setItem('thirdeye_editor_word_wrap', wordWrap ? 'on' : 'off');
    localStorage.setItem('thirdeye_editor_minimap', minimap ? 'on' : 'off');
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleSaveProfile = () => {
    localStorage.setItem('thirdeye_profile_name', engineerName);
    localStorage.setItem('thirdeye_profile_email', engineerEmail);
    localStorage.setItem('thirdeye_profile_emp_id', employeeId);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 font-sans select-none animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-3xl rounded-xl border border-[#303030] bg-[#222222] overflow-hidden flex flex-col max-h-[85vh] shadow-2xl"
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
                Settings & Configuration
              </h2>
              <p className="text-[11px] text-[#808080]">
                Manage AI models, editor preferences, and engineer profile
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
        <div className="flex flex-1 min-h-[440px] overflow-hidden">
          {/* Tabs Sidebar */}
          <div className="w-56 shrink-0 border-r border-[#303030] bg-[#1C1C1C] p-2 space-y-1">
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
              <span>AI Intelligence</span>
            </button>

            <button
              onClick={() => setActiveTab('editor')}
              className={cn(
                'w-full flex items-center gap-2.5 rounded px-3 py-2 text-xs font-medium transition-colors text-left cursor-pointer',
                activeTab === 'editor'
                  ? 'bg-[#2A2A2A] text-[#FF6B00] border border-[#383838]'
                  : 'text-[#808080] hover:bg-[#222222] hover:text-[#E0E0E0]'
              )}
            >
              <Code2 className="h-4 w-4 shrink-0" />
              <span>Monaco Editor</span>
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
            {/* 1. AI ENGINE TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-[#E0E0E0] tracking-tight flex items-center gap-2">
                    <ThirdEyeIcon className="h-4 w-4 text-[#FF6B00]" />
                    THIRD EYE AI Engine Configuration
                  </h3>
                  <p className="text-[11.5px] text-[#808080] mt-0.5">
                    Configure your Google Gemini API credentials and neural diagnostics model.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[#E0E0E0] flex items-center justify-between">
                    <span>Google Gemini API Key</span>
                    <span className="text-[10px] text-[#808080]">Optional if configured in .env</span>
                  </label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy... (Leave empty to use .env)"
                    className="w-full rounded-lg border border-[#383838] bg-[#181818] px-3 py-2 text-xs text-[#E0E0E0] font-mono focus:border-[#FF6B00] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[#E0E0E0]">AI Model</label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full rounded-lg border border-[#383838] bg-[#181818] px-3 py-2 text-xs text-[#E0E0E0] focus:border-[#FF6B00] focus:outline-none cursor-pointer"
                  >
                    <option value="gemini-2.0-flash">gemini-2.0-flash (Recommended - Fast & Accurate)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (Deep reasoning)</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash (Low latency)</option>
                  </select>
                </div>

                <div className="rounded-xl border border-[#303030] bg-[#1A1A1A] p-3 text-xs text-[#808080] space-y-1.5">
                  <div className="flex items-center gap-2 text-[#E0E0E0] font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-[#FF6B00]" />
                    <span>Real-time Code & Terminal Intelligence</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#808080]">
                    THIRD EYE AI analyzes active terminal output, detects build errors, provides instant contextual code fixes, and integrates with your Monaco editor in real time.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveAi}
                    className="rounded-lg bg-[#FF6B00] hover:bg-[#FF8533] px-4 py-2 text-xs font-semibold text-black transition-colors cursor-pointer"
                  >
                    Save AI Configuration
                  </button>
                  {saveSuccess && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 animate-in fade-in">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Saved successfully
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 2. MONACO EDITOR TAB */}
            {activeTab === 'editor' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-[#E0E0E0] tracking-tight flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-[#FF6B00]" />
                    Monaco Editor & Terminal Preferences
                  </h3>
                  <p className="text-[11.5px] text-[#808080] mt-0.5">
                    Customize font sizing, tab spacing, and editor behaviors.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#E0E0E0]">Font Size (px)</label>
                    <input
                      type="number"
                      min={10}
                      max={28}
                      value={fontSize}
                      onChange={(e) => setFontSize(e.target.value)}
                      className="w-full rounded-lg border border-[#383838] bg-[#181818] px-3 py-2 text-xs text-[#E0E0E0] font-mono focus:border-[#FF6B00] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#E0E0E0]">Tab Size (spaces)</label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={tabSize}
                      onChange={(e) => setTabSize(e.target.value)}
                      className="w-full rounded-lg border border-[#383838] bg-[#181818] px-3 py-2 text-xs text-[#E0E0E0] font-mono focus:border-[#FF6B00] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2.5 text-xs text-[#E0E0E0] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wordWrap}
                      onChange={(e) => setWordWrap(e.target.checked)}
                      className="rounded border-[#383838] bg-[#181818] text-[#FF6B00] focus:ring-0 cursor-pointer"
                    />
                    <span>Enable Word Wrap</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-[#E0E0E0] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={minimap}
                      onChange={(e) => setMinimap(e.target.checked)}
                      className="rounded border-[#383838] bg-[#181818] text-[#FF6B00] focus:ring-0 cursor-pointer"
                    />
                    <span>Display Code Minimap</span>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveEditor}
                    className="rounded-lg bg-[#FF6B00] hover:bg-[#FF8533] px-4 py-2 text-xs font-semibold text-black transition-colors cursor-pointer"
                  >
                    Save Editor Settings
                  </button>
                  {saveSuccess && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 animate-in fade-in">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Saved successfully
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 3. ENGINEER PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-[#E0E0E0] tracking-tight flex items-center gap-2">
                    <User className="h-4 w-4 text-[#FF6B00]" />
                    Engineer Identity & Workspace Signature
                  </h3>
                  <p className="text-[11.5px] text-[#808080] mt-0.5">
                    Your engineer identity for Git commits, session tracking, and audit logging.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#808080]">Full Name</label>
                    <input
                      type="text"
                      value={engineerName}
                      onChange={(e) => setEngineerName(e.target.value)}
                      className="w-full rounded-lg border border-[#383838] bg-[#181818] px-3 py-2 text-xs text-[#E0E0E0] focus:border-[#FF6B00] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#808080]">Corporate Email</label>
                    <input
                      type="email"
                      value={engineerEmail}
                      onChange={(e) => setEngineerEmail(e.target.value)}
                      className="w-full rounded-lg border border-[#383838] bg-[#181818] px-3 py-2 text-xs text-[#E0E0E0] focus:border-[#FF6B00] focus:outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#808080]">Employee ID</label>
                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="w-full rounded-lg border border-[#383838] bg-[#181818] px-3 py-2 text-xs text-[#E0E0E0] focus:border-[#FF6B00] focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="rounded-lg bg-[#FF6B00] hover:bg-[#FF8533] px-4 py-2 text-xs font-semibold text-black transition-colors cursor-pointer"
                  >
                    Save Profile
                  </button>
                  {saveSuccess && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 animate-in fade-in">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Saved successfully
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
