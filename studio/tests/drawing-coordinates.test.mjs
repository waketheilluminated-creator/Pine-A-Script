import assert from "node:assert/strict";
import test from "node:test";
import { nearestTimestamp, toDrawingPoint, toScreenPoint } from "../lib/drawings/coordinates.ts";

test("projects a missing timestamp to the nearest current candle without changing stored time", () => {
  assert.equal(nearestTimestamp([100, 200, 300], 240), 200);
  const adapter = { timeToCoordinate: (time) => time / 10, priceToCoordinate: (price) => price * 2 };
  assert.deepEqual(toScreenPoint({ time: 240, price: 7 }, [100, 200, 300], adapter), { x: 20, y: 14 });
});

test("converts pointer coordinates to market coordinates and rejects null scales", () => {
  const adapter = { coordinateToTime: (x) => x === 4 ? 200 : null, coordinateToPrice: (y) => y === 6 ? 3 : null };
  assert.deepEqual(toDrawingPoint({ x: 4, y: 6 }, adapter), { time: 200, price: 3 });
  assert.equal(toDrawingPoint({ x: 0, y: 0 }, adapter), null);
});
