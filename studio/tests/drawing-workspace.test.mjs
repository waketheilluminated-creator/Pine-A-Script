import assert from "node:assert/strict";
import test from "node:test";

const shortcuts = await import("../lib/drawings/workspace-shortcuts.ts").catch(() => ({}));

function escapeHarness(searchOpen) {
  const calls = [];
  const event = {
    preventDefault: () => calls.push("prevent"),
    stopImmediatePropagation: () => calls.push("stop"),
  };
  shortcuts.handleWorkspaceEscape?.({
    searchOpen,
    event,
    closeSearch: () => calls.push("close-search"),
    cancelDrawing: () => calls.push("cancel-drawing"),
  });
  return calls;
}

test("first Escape consumes symbol search closure before drawing cancellation", () => {
  assert.equal(typeof shortcuts.handleWorkspaceEscape, "function");
  assert.deepEqual(escapeHarness(true), ["prevent", "stop", "close-search"]);
});

test("Escape cancels drawing state when symbol search is already closed", () => {
  assert.equal(typeof shortcuts.handleWorkspaceEscape, "function");
  assert.deepEqual(escapeHarness(false), ["prevent", "stop", "cancel-drawing"]);
});
