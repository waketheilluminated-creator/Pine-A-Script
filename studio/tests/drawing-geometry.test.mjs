import assert from "node:assert/strict";
import test from "node:test";
import { arrowHead, distanceToSegment, hitTestDrawing, translateDrawing } from "../lib/drawings/geometry.ts";

test("measures segment distance and clamps beyond endpoints", () => {
  assert.equal(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  assert.equal(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
});

test("prefers endpoint handles over a line body", () => {
  const screen = { id: "d-1", type: "trend-line", points: [{ x: 10, y: 10 }, { x: 100, y: 100 }] };
  assert.deepEqual(hitTestDrawing(screen, { x: 12, y: 11 }, 8), { drawingId: "d-1", part: "point-0" });
  assert.deepEqual(hitTestDrawing(screen, { x: 55, y: 54 }, 8), { drawingId: "d-1", part: "body" });
});

test("builds a finite arrow head and translates all anchors", () => {
  assert.equal(arrowHead({ x: 0, y: 0 }, { x: 20, y: 0 }, 8).length, 3);
  const moved = translateDrawing({ points: [{ time: 100, price: 10 }, { time: 200, price: 20 }] }, 30, 5);
  assert.deepEqual(moved.points, [{ time: 130, price: 15 }, { time: 230, price: 25 }]);
});
