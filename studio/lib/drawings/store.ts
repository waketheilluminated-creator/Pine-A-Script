import { isDrawing, type Drawing } from "./types.ts";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;
type Envelope = { version: 1; drawings: Drawing[] };
type TimerApi = {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
};
type PendingSave = { exchange: string; symbol: string; drawings: Drawing[] };

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function drawingStorageKey(exchange: string, symbol: string): string {
  return `pilab:drawings:v1:${normalize(exchange)}:${normalize(symbol)}`;
}

export function parseDrawingCollection(value: string | null): Drawing[] {
  if (value === null) return [];
  try {
    const envelope = JSON.parse(value) as Partial<Envelope>;
    if (envelope.version !== 1 || !Array.isArray(envelope.drawings)) return [];
    return envelope.drawings.filter(isDrawing);
  } catch {
    return [];
  }
}

export function loadDrawings(storage: StorageReader, exchange: string, symbol: string): Drawing[] {
  try {
    return parseDrawingCollection(storage.getItem(drawingStorageKey(exchange, symbol)));
  } catch {
    return [];
  }
}

export function saveDrawings(storage: StorageWriter, exchange: string, symbol: string, drawings: Drawing[]): boolean {
  try {
    const envelope: Envelope = { version: 1, drawings: drawings.filter(isDrawing) };
    storage.setItem(drawingStorageKey(exchange, symbol), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

const browserTimers: TimerApi = {
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

export class DrawingSaveScheduler {
  private pending: PendingSave | null = null;
  private timer: number | null = null;
  private readonly storage: StorageWriter;
  private readonly timers: TimerApi;
  private readonly delay: number;

  constructor(storage: StorageWriter, timers: TimerApi = browserTimers, delay = 150) {
    this.storage = storage;
    this.timers = timers;
    this.delay = delay;
  }

  schedule(exchange: string, symbol: string, drawings: readonly Drawing[]): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.pending = { exchange, symbol, drawings: [...drawings] };
    this.timer = this.timers.setTimeout(() => this.writePending(), this.delay);
  }

  flush(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.writePending();
  }

  private writePending(): void {
    const pending = this.pending;
    this.pending = null;
    this.timer = null;
    if (pending) saveDrawings(this.storage, pending.exchange, pending.symbol, pending.drawings);
  }
}
