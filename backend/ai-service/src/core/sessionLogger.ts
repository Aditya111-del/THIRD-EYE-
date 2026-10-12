/**
 * Session Event Logger
 * Appends all agent activities to workspace/.third-eye/sessions/<timestamp>.jsonl for debugging.
 */

import fs from 'fs';
import path from 'path';

export class SessionLogger {
  private logFilePath: string;

  constructor(workspaceRoot: string, sessionId: string) {
    const dir = path.join(workspaceRoot, '.third-eye', 'sessions');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
    this.logFilePath = path.join(dir, `${sessionId || Date.now()}.jsonl`);
  }

  public log(event: { type: string; timestamp?: number; data?: any }) {
    try {
      const line = JSON.stringify({
        ...event,
        timestamp: event.timestamp || Date.now(),
      }) + '\n';
      fs.appendFileSync(this.logFilePath, line, 'utf-8');
    } catch {}
  }
}
