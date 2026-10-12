/**
 * Circular Ring Buffer & Pub/Sub Output Bus for Terminal Streams (Phase 3)
 * Holds up to 10,000 lines per session for late-subscriber backfill and AI agent context tail.
 */

export class CircularRingBuffer {
  private buffer: string[] = [];
  private capacity: number;

  constructor(capacity = 10000) {
    this.capacity = capacity;
  }

  public push(line: string): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(line);
  }

  public pushChunk(chunk: string): void {
    const lines = chunk.split('\n');
    for (const line of lines) {
      this.push(line);
    }
  }

  public getTail(lineCount = 200): string[] {
    const count = Math.min(lineCount, this.buffer.length);
    return this.buffer.slice(this.buffer.length - count);
  }

  public getAll(): string[] {
    return [...this.buffer];
  }

  public getRawText(): string {
    return this.buffer.join('\n');
  }

  public clear(): void {
    this.buffer = [];
  }

  public size(): number {
    return this.buffer.length;
  }
}

type OutputListener = (data: string) => void;

export class SessionOutputBus {
  public readonly sessionId: string;
  private ringBuffer: CircularRingBuffer;
  private listeners: Set<OutputListener> = new Set();

  constructor(sessionId: string, maxLines = 10000) {
    this.sessionId = sessionId;
    this.ringBuffer = new CircularRingBuffer(maxLines);
  }

  public write(data: string): void {
    this.ringBuffer.pushChunk(data);
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (err) {
        console.error(`[OutputBus ${this.sessionId}] Listener error:`, err);
      }
    }
  }

  public subscribe(listener: OutputListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getTail(lineCount = 200): string {
    return this.ringBuffer.getTail(lineCount).join('\n');
  }

  public getSnapshot(): string {
    return this.ringBuffer.getRawText();
  }

  public clear(): void {
    this.ringBuffer.clear();
  }
}

export class OutputBusRegistry {
  private buses: Map<string, SessionOutputBus> = new Map();

  public getOrCreate(sessionId: string, maxLines = 10000): SessionOutputBus {
    let bus = this.buses.get(sessionId);
    if (!bus) {
      bus = new SessionOutputBus(sessionId, maxLines);
      this.buses.set(sessionId, bus);
    }
    return bus;
  }

  public get(sessionId: string): SessionOutputBus | undefined {
    return this.buses.get(sessionId);
  }

  public remove(sessionId: string): void {
    const bus = this.buses.get(sessionId);
    if (bus) {
      bus.clear();
      this.buses.delete(sessionId);
    }
  }
}

export const outputBusRegistry = new OutputBusRegistry();
