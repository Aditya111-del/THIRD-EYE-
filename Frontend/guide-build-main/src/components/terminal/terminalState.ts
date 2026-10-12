/**
 * terminalState.ts
 *
 * Centralized, decoupled state and helper functions for Xterm instances.
 * Separating non-component logic from XtermView.tsx preserves React Fast Refresh (HMR).
 */

let activeXtermInstance: any = null;
let lastGlobalPasteTimestamp = 0;
let lastGlobalPastedContent = "";

export function setActiveXtermInstance(term: any): void {
  activeXtermInstance = term;
}

export function getActiveXtermInstance(): any {
  return activeXtermInstance;
}

export function getActiveTerminalSelection(): string {
  if (
    activeXtermInstance &&
    typeof activeXtermInstance.hasSelection === "function" &&
    activeXtermInstance.hasSelection()
  ) {
    return activeXtermInstance.getSelection?.() || "";
  }
  return "";
}

export function pasteToActiveTerminal(text: string): void {
  if (!text) return;
  const now = Date.now();
  if (now - lastGlobalPasteTimestamp < 350 && text === lastGlobalPastedContent) {
    return;
  }
  lastGlobalPasteTimestamp = now;
  lastGlobalPastedContent = text;

  if (activeXtermInstance) {
    activeXtermInstance.paste?.(text);
  }
}

/**
 * Extract live terminal buffer lines directly from the active Xterm instance
 */
export function getActiveTerminalBufferLines(maxLines: number = 300): string[] {
  if (!activeXtermInstance || !activeXtermInstance.buffer || !activeXtermInstance.buffer.active) {
    return [];
  }
  try {
    const buf = activeXtermInstance.buffer.active;
    const lines: string[] = [];
    const count = Math.min(maxLines, buf.length);
    const start = Math.max(0, buf.length - count);
    for (let i = start; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }
    while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
      lines.pop();
    }
    return lines;
  } catch (_e) {
    return [];
  }
}

// Global buffer cache so session data is preserved when switching tabs or views
export const sessionDataCache: Map<string, string[]> = new Map();

export function clearSessionDataCache(sessionId?: string): void {
  if (sessionId) {
    sessionDataCache.delete(sessionId);
  } else {
    sessionDataCache.clear();
  }
}

export function appendSessionDataCache(sessionId: string, chunk: string): void {
  if (!sessionId || !chunk) return;
  let list = sessionDataCache.get(sessionId);
  if (!list) {
    list = [];
    sessionDataCache.set(sessionId, list);
  }
  list.push(chunk);
  if (list.length > 1000) {
    list.shift();
  }
}

export function setSessionDataCache(sessionId: string, content: string[]): void {
  if (!sessionId) return;
  sessionDataCache.set(sessionId, content);
}
