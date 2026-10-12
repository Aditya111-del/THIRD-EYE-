import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Search,
  Terminal,
  RefreshCw,
  Settings,
  PanelLeft,
  PanelRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Command,
  Clipboard,
} from "lucide-react";

export interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: any;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewCmd: () => void;
  onNewPowerShell: () => void;
  onClearBuffer: () => void;
  onPasteClipboard?: () => void;
  onOpenSettings: () => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onToggleMaximize: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export function CommandPaletteModal({
  open,
  onOpenChange,
  onNewCmd,
  onNewPowerShell,
  onClearBuffer,
  onPasteClipboard,
  onOpenSettings,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onToggleMaximize,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: CommandItem[] = [
    {
      id: "term-cmd",
      title: "Terminal: Create New CMD Terminal",
      category: "Terminal",
      icon: Terminal,
      shortcut: "Ctrl+Shift+`",
      action: onNewCmd,
    },
    {
      id: "term-ps",
      title: "Terminal: Create New PowerShell Terminal",
      category: "Terminal",
      icon: Terminal,
      shortcut: "Ctrl+P",
      action: onNewPowerShell,
    },
    {
      id: "term-clear",
      title: "Terminal: Clear Screen Buffer",
      category: "Terminal",
      icon: Trash2,
      shortcut: "Ctrl+L",
      action: onClearBuffer,
    },
    ...(onPasteClipboard ? [{
      id: "term-paste",
      title: "Terminal: Paste from OS Clipboard",
      category: "Terminal",
      icon: Clipboard,
      shortcut: "Ctrl+V",
      action: onPasteClipboard,
    }] : []),
    {
      id: "layout-left",
      title: "Layout: Toggle Primary Side Bar (Explorer)",
      category: "View",
      icon: PanelLeft,
      shortcut: "Ctrl+B",
      action: onToggleLeftSidebar,
    },
    {
      id: "layout-right",
      title: "Layout: Toggle Secondary Side Bar (THIRD EYE AI)",
      category: "View",
      icon: PanelRight,
      shortcut: "Ctrl+Shift+A",
      action: onToggleRightSidebar,
    },
    {
      id: "app-settings",
      title: "Preferences: Open Settings & API Keys",
      category: "Settings",
      icon: Settings,
      shortcut: "Ctrl+,",
      action: onOpenSettings,
    },
    {
      id: "view-zoomin",
      title: "View: Zoom In (+10%)",
      category: "View",
      icon: ZoomIn,
      shortcut: "Ctrl+=",
      action: onZoomIn,
    },
    {
      id: "view-zoomout",
      title: "View: Zoom Out (-10%)",
      category: "View",
      icon: ZoomOut,
      shortcut: "Ctrl+-",
      action: onZoomOut,
    },
    {
      id: "view-zoomreset",
      title: "View: Reset Zoom (100%)",
      category: "View",
      icon: Maximize2,
      shortcut: "Ctrl+0",
      action: onResetZoom,
    },
    {
      id: "win-max",
      title: "Window: Toggle Maximize / Restore",
      category: "Window",
      icon: Maximize2,
      shortcut: "F11",
      action: onToggleMaximize,
    },
  ];

  const filtered = commands.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filtered[selectedIndex];
      if (selected) {
        selected.action();
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-[#1C1C1C] border border-[#333333] shadow-2xl rounded-lg">
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2C2C2C] bg-[#181818]">
          <Search className="h-4 w-4 text-[#888888] shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search actions..."
            className="w-full bg-transparent text-[13px] text-[#E0E0E0] placeholder-[#707070] outline-none"
          />
          <kbd className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#252525] border border-[#3A3A3A] text-[10px] text-[#888888] font-mono">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#707070]">
              No commands matching "{query}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onOpenChange(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-md text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[#2A2A2A] text-white"
                      : "text-[#B0B0B0] hover:bg-[#232323] hover:text-[#E0E0E0]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-[#FF6B00]" : "text-[#707070]"}`} />
                    <span className="truncate text-[12.5px]">{item.title}</span>
                  </div>
                  {item.shortcut && (
                    <span className="font-mono text-[10.5px] text-[#707070] ml-3 shrink-0">
                      {item.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer tip */}
        <div className="flex items-center justify-between px-3.5 py-2 border-t border-[#282828] bg-[#141414] text-[10.5px] text-[#707070]">
          <span className="flex items-center gap-1.5">
            <Command className="h-3 w-3 text-[#FF6B00]" />
            <span>Third Eye Quick Command Runner</span>
          </span>
          <span className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Execute</span>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
