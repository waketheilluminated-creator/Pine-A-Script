import assert from "node:assert/strict";
import test from "node:test";
import {
  DrawingSaveScheduler, drawingStorageKey, loadDrawings, parseDrawingCollection, saveDrawings,
} from "../lib/drawings/store.ts";

const trend = {
  id: "d-1", type: "trend-line",
  points: [{ time: 1700000000, price: 42000 }, { time: 1700000900, price: 42500 }],
  style: { color: "#76e7a4", lineWidth: 2 }, createdAt: 1, updatedAt: 1,
};

test("scopes drawing storage by normalized exchange and symbol, not timeframe", () => {
  assert.equal(drawingStorageKey("Bybit", "BTC/USDT:USDT"), "pilab:drawings:v1:bybit:btcusdtusdt");
});

test("keeps valid drawings and drops malformed records", () => {
  assert.deepEqual(parseDrawingCollection(JSON.stringify({ version: 1, drawings: [trend, { id: 3 }] })), [trend]);
  assert.deepEqual(parseDrawingCollection("not-json"), []);
  assert.deepEqual(parseDrawingCollection(JSON.stringify({ version: 2, drawings: [trend] })), []);
});

test("round-trips drawings and survives storage errors", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(saveDrawings(storage, "bybit", "BTCUSDT", [trend]), true);
  assert.deepEqual(loadDrawings(storage, "bybit", "BTCUSDT"), [trend]);
  assert.equal(saveDrawings({ setItem() { throw new Error("quota"); } }, "bybit", "BTCUSDT", [trend]), false);
});

test("flushes a captured drawing snapshot under its original market identity", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let pending = null;
  const timers = {
    setTimeout(callback, delay) {
      assert.equal(delay, 150);
      pending = callback;
      return 1;
    },
    clearTimeout(handle) {
      assert.equal(handle, 1);
      pending = null;
    },
  };
  const scheduler = new DrawingSaveScheduler(storage, timers);
  const committed = [trend];

  scheduler.schedule("bybit", "BTCUSDT", committed);
  committed.length = 0;
  scheduler.flush();

  assert.equal(pending, null);
  assert.deepEqual(loadDrawings(storage, "bybit", "BTCUSDT"), [trend]);
  assert.deepEqual(loadDrawings(storage, "binance", "BTCUSDT"), []);
});
