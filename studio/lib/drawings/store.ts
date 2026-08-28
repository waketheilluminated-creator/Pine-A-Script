import { isDrawing, type Drawing } from "./types.ts";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;
type Envelope = { version: 1; drawings: Drawing[] };

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
