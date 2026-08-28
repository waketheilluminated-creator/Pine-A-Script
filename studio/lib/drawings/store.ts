import { isDrawing, type Drawing } from "./types.ts";

export type DrawingStorage = Pick<Storage, "getItem" | "setItem">;
type StorageReader = Pick<DrawingStorage, "getItem">;
type StorageWriter = Pick<DrawingStorage, "setItem">;
type Envelope = { version: 1; drawings: Drawing[] };
type TimerApi = {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
};
type PendingSave = { venue: string; symbol: string; drawings: Drawing[] };

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function drawingStorageKey(venue: string, symbol: string): string {
  return `pilab:drawings:v1:${normalize(venue)}:${normalize(symbol)}`;
}

export function createDrawingStorage(
  acquire: () => DrawingStorage = () => window.localStorage,
): DrawingStorage {
  let primary: DrawingStorage | null = null;
  try {
    primary = acquire();
  } catch {
    // Browser storage may be unavailable by policy; memory remains active.
  }

  const memory = new Map<string, string>();
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key) ?? null;
      try {
        return primary?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        primary?.setItem(key, value);
      } catch {
        // The mounted workspace continues from its in-memory mirror.
      }
    },
  };
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

export function loadDrawings(storage: StorageReader, venue: string, symbol: string): Drawing[] {
  try {
    return parseDrawingCollection(storage.getItem(drawingStorageKey(venue, symbol)));
  } catch {
    return [];
  }
}

export function saveDrawings(storage: StorageWriter, venue: string, symbol: string, drawings: Drawing[]): boolean {
  try {
    const envelope: Envelope = { version: 1, drawings: drawings.filter(isDrawing) };
    storage.setItem(drawingStorageKey(venue, symbol), JSON.stringify(envelope));
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

  schedule(venue: string, symbol: string, drawings: readonly Drawing[]): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.pending = { venue, symbol, drawings: [...drawings] };
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
    if (pending) saveDrawings(this.storage, pending.venue, pending.symbol, pending.drawings);
  }
}
