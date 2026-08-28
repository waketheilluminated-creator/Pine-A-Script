import assert from "node:assert/strict";
import test from "node:test";
import { initialDrawingSession, reduceDrawingSession } from "../lib/drawings/controller.ts";

const p1 = { time: 100, price: 10 };
const p2 = { time: 200, price: 20 };
const trend = {
  id: "d-1", type: "trend-line", points: [p1, p2],
  style: { color: "#76e7a4", lineWidth: 2 }, createdAt: 1, updatedAt: 1,
};

test("creates a two-point preview then commits it", () => {
  let state = reduceDrawingSession(initialDrawingSession, { type: "BEGIN", tool: "trend-line", point: p1 });
  state = reduceDrawingSession(state, { type: "PREVIEW", point: p2 });
  assert.equal(state.phase, "previewing");
  const result = reduceDrawingSession(state, { type: "COMMIT", point: p2, id: "d-1", now: 5 });
  assert.equal(result.phase, "selected");
  assert.equal(result.committed?.id, "d-1");
  assert.deepEqual(result.committed?.points, [p1, p2]);
});

test("commits horizontal line immediately and cancels transient state", () => {
  const result = reduceDrawingSession(initialDrawingSession, { type: "BEGIN", tool: "horizontal-line", point: p1, id: "d-2", now: 6 });
  assert.equal(result.committed?.type, "horizontal-line");
  assert.deepEqual(reduceDrawingSession(result, { type: "CANCEL" }), initialDrawingSession);
});

test("selects and clears a drawing", () => {
  const selected = reduceDrawingSession(initialDrawingSession, { type: "SELECT", drawingId: "d-1" });
  assert.deepEqual(selected, { phase: "selected", selectedId: "d-1" });
  assert.deepEqual(reduceDrawingSession(selected, { type: "CLEAR_SELECTION" }), initialDrawingSession);
});

test("Escape cancellation and pointer cancellation return to idle", () => {
  const preview = reduceDrawingSession(
    { phase: "placing-first", tool: "trend-line", start: p1 },
    { type: "PREVIEW", point: p2 },
  );
  assert.deepEqual(reduceDrawingSession(preview, { type: "CANCEL" }), initialDrawingSession);
  const dragging = { phase: "dragging", selectedId: "d-1", part: "body", origin: p1, original: trend };
  assert.deepEqual(reduceDrawingSession(dragging, { type: "CANCEL" }), { phase: "selected", selectedId: "d-1" });
});

test("blank text never creates a drawing", () => {
  const placing = reduceDrawingSession(initialDrawingSession, { type: "BEGIN", tool: "text", point: p1 });
  const result = reduceDrawingSession(placing, { type: "TEXT_COMMIT", text: "   ", id: "d-2", now: 6 });
  assert.equal(result.committed, undefined);
});

test("drag updates only the selected endpoint", () => {
  const dragging = reduceDrawingSession(
    { phase: "selected", selectedId: "d-1" },
    { type: "START_DRAG", drawing: trend, part: "point-1", point: p2 },
  );
  const result = reduceDrawingSession(dragging, { type: "DRAG", point: { time: 250, price: 25 }, now: 7 });
  assert.deepEqual(result.updated?.points, [p1, { time: 250, price: 25 }]);
});
