import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const moduleUrl = new URL("../lib/panel-layout.js", import.meta.url);

test("snaps the bottom panel to its title bar below the drag threshold", async () => {
  assert.ok(existsSync(fileURLToPath(moduleUrl)), "panel layout logic module should exist");
  const { resolvePanelHeight } = await import(moduleUrl.href);

  assert.equal(resolvePanelHeight(900, 800), 37);
  assert.equal(resolvePanelHeight(900, 775), 37);
});

test("keeps the bottom panel resizable above the collapse threshold", async () => {
  assert.ok(existsSync(fileURLToPath(moduleUrl)), "panel layout logic module should exist");
  const { resolvePanelHeight } = await import(moduleUrl.href);

  assert.equal(resolvePanelHeight(900, 760), 112);
  assert.equal(resolvePanelHeight(900, 500), 372);
  assert.equal(resolvePanelHeight(900, 100), 585);
});

test("recognizes only the snapped title-bar height as collapsed", async () => {
  assert.ok(existsSync(fileURLToPath(moduleUrl)), "panel layout logic module should exist");
  const { isPanelCollapsed } = await import(moduleUrl.href);

  assert.equal(isPanelCollapsed(37), true);
  assert.equal(isPanelCollapsed(112), false);
});
