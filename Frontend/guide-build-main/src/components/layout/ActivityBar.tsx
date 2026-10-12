import { useState, useEffect } from "react";
import {
  Files,
  Search,
  GitBranch,
  FlaskConical,
  Settings,
  CircleUser,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivityView =
  | "explorer"
  | "search"
  | "git"
  | "debug"
  | "remote"
  | "extensions"
  | "testing"
  | "ai";

/**
 * Pixel-perfect VS Code Run & Debug icon (Play triangle + bottom-left bug)
 */
function RunDebugIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="6 3 20 12 6 21 6 3" strokeWidth="1.6" />
      <circle cx="8" cy="15.5" r="2.8" fill="#181818" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5.2" y1="14" x2="3.8" y2="13" strokeWidth="1.5" />
      <line x1="5.2" y1="17" x2="3.8" y2="18" strokeWidth="1.5" />
      <line x1="10.8" y1="14" x2="12.2" y2="13" strokeWidth="1.5" />
      <line x1="10.8" y1="17" x2="12.2" y2="18" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Pixel-perfect VS Code Remote & Ports icon (Monitor with remote connectivity badge)
 */
function RemoteIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3.5" width="20" height="13" rx="2" strokeWidth="1.6" />
      <path d="M7 20.5h10M12 16.5v4" strokeWidth="1.6" />
      <circle cx="16.5" cy="12.5" r="4" fill="#181818" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 11.5a1.8 1.8 0 0 1 2.5 0M18 13.5a1.8 1.8 0 0 1-2.5 0" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * Pixel-perfect VS Code Extensions icon (3 squares + 1 top-right diamond rotated 45°)
 */
function ExtensionsIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3.5" width="7" height="7" rx="1.2" strokeWidth="1.6" />
      <rect x="3" y="13.5" width="7" height="7" rx="1.2" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" strokeWidth="1.6" />
      <rect x="14" y="3.5" width="6.2" height="6.2" rx="1" transform="rotate(45 17.1 6.6)" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * Pixel-perfect VS Code Copilot / AI Cloud icon (Cloud with stars / sparkles)
 */
function CopilotIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.5 16H6.5A4.5 4.5 0 0 1 6.5 7a4.5 4.5 0 0 1 4.3 3.1A4 4 0 0 1 15.5 16Z" strokeWidth="1.6" />
      <path d="M19 11v4M17 13h4" strokeWidth="1.6" />
      <path d="M21 17v2M20 18h2" strokeWidth="1.4" />
    </svg>
  );
}

export function ActivityBar({
  activeView,
  onSelectView,
  onOpenSettings,
  onToggleAi,
  isAiActive,
  isSidebarOpen = true,
}: {
  activeView: ActivityView;
  onSelectView: (v: ActivityView) => void;
  onOpenSettings: () => void;
  onToggleAi: () => void;
  isAiActive: boolean;
  isSidebarOpen?: boolean;
}) {
  const [gitBadge, setGitBadge] = useState<string | number | undefined>(undefined);

  // Sync real git changes count and ahead sync status with automatic real-time updates
  useEffect(() => {
    const updateGitBadge = () => {
      if (window.electronAPI?.git?.status) {
        window.electronAPI.git.status().then((res: any) => {
          if (res?.success) {
            if (res.isRepo === false) {
              setGitBadge(undefined);
              return;
            }
            const count = typeof res.count === "number" ? res.count : 0;
            const ahead = typeof res.ahead === "number" ? res.ahead : 0;
            if (count > 0 && ahead > 0) {
              setGitBadge(`${count} ↑${ahead}`);
            } else if (count > 0) {
              setGitBadge(count);
            } else if (ahead > 0) {
              setGitBadge(`↑${ahead}`);
            } else {
              setGitBadge(undefined);
            }
          } else {
            setGitBadge(undefined);
          }
        }).catch(() => {
          setGitBadge(undefined);
        });
      }
    };

    updateGitBadge();

    const unsubFs = window.electronAPI?.fs?.onWatchEvent?.(() => updateGitBadge());
    const unsubRoot = window.electronAPI?.workspace?.onRootChanged?.(() => updateGitBadge());
    const unsubGit = window.electronAPI?.git?.onStatusChanged?.(() => updateGitBadge());

    window.addEventListener("focus", updateGitBadge);

    return () => {
      unsubFs?.();
      unsubRoot?.();
      unsubGit?.();
      window.removeEventListener("focus", updateGitBadge);
    };
  }, []);

  const topItems: Array<{ id: ActivityView; label: string; icon: any; badge?: string | number | undefined }> = [
    { id: "explorer", label: "Explorer (⇧⌘E)", icon: Files },
    { id: "search", label: "Search (⇧⌘F)", icon: Search },
    { id: "git", label: "Source Control (⌃⇧G)", icon: GitBranch, badge: gitBadge },
    { id: "debug", label: "Run and Debug (⇧⌘D)", icon: RunDebugIcon },
    { id: "remote", label: "Remote Explorer & Ports", icon: RemoteIcon },
    { id: "extensions", label: "Extensions (⇧⌘X)", icon: ExtensionsIcon },
    { id: "testing", label: "Testing", icon: FlaskConical },
  ];

  return (
    <aside className="w-12 shrink-0 bg-[#181818] border-r border-[#262626] flex flex-col items-center justify-between py-2 select-none z-20 font-sans">
      {/* ── Top Navigation Icons (Matches Image 2 exactly) ── */}
      <div className="flex flex-col items-center gap-1 w-full">
        {topItems.map((item) => {
          const isActive = isSidebarOpen && activeView === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={cn(
                "relative h-10 w-10 rounded-md flex items-center justify-center transition-all cursor-pointer",
                isActive
                  ? "bg-[#2A2D2E] text-white shadow-sm before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-white"
                  : "text-[#858585] hover:text-white hover:bg-[#202020]"
              )}
              title={item.label}
              aria-label={item.label}
            >
              <Icon className="h-5 w-5 stroke-[1.75]" />

              {/* Source Control badge */}
              {item.badge !== undefined && (
                <span className="absolute bottom-0 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#007ACC] text-[9.5px] font-sans font-bold text-white flex items-center justify-center shadow">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* AI Assistant / Copilot Cloud Icon (Toggles THIRD EYE AI Sidecar) */}
        <button
          onClick={onToggleAi}
          className={cn(
            "relative h-10 w-10 rounded-md flex items-center justify-center transition-all cursor-pointer mt-1",
            isAiActive
              ? "bg-[#2A2D2E] text-[#FF6B00] shadow-sm before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#FF6B00]"
              : "text-[#858585] hover:text-[#FF6B00] hover:bg-[#202020]"
          )}
          title="THIRD EYE AI Assistant (⌘I / Ctrl+Shift+A)"
          aria-label="AI Assistant"
        >
          <CopilotIcon className="h-5 w-5 stroke-[1.75]" />
        </button>
      </div>

      {/* ── Bottom Section: Settings & Accounts ── */}
      <div className="flex flex-col items-center gap-1 w-full pt-2">
        {/* Profile / Account Avatar */}
        <button
          onClick={onOpenSettings}
          className="h-10 w-10 rounded-md flex items-center justify-center text-[#858585] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
          title="Accounts & Profile"
          aria-label="Accounts"
        >
          <CircleUser className="h-5 w-5 stroke-[1.75]" />
        </button>

        {/* Settings Gear */}
        <button
          onClick={onOpenSettings}
          className="h-10 w-10 rounded-md flex items-center justify-center text-[#858585] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
          title="Settings (⌘,)"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5 stroke-[1.75]" />
        </button>
      </div>
    </aside>
  );
}
