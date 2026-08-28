# πlab Chart Drawing Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six TradingView-inspired chart tools to πlab with market-coordinate rendering, selection/editing, and per-market browser persistence.

**Architecture:** Keep drawing anchors as UTC time and price, render them through one `lightweight-charts` Series Primitive, and isolate pointer gestures in a controller. React owns the active tool and committed collection; pure geometry, coordinate projection, controller transitions, and storage remain independently testable.

**Tech Stack:** React 19, TypeScript 5.9, `lightweight-charts` 5.2.1, Canvas 2D, Node 22 test runner, CSS.

**Spec:** `docs/superpowers/specs/2026-08-28-chart-drawing-tools-design.md`

## Global Constraints

- Keep `lightweight-charts` at `^5.2.1`; do not add or replace the chart runtime.
- Provide exactly Select, Trend line, Horizontal line, Arrow, Text, and Crosshair in v1.
- Persist committed drawings by normalized `exchange + symbol`, never by timeframe.
- Store UTC time and price only; never persist canvas pixels, hover state, selection, preview, or drag state.
- Use original πlab SVG icons and copy; do not copy TradingView trademarks or proprietary icon assets.
- Do not add Fibonacci, brushes, templates, locking, undo/redo, cloud sync, collaboration, or a property inspector.
- Do not let drawing autoscale change the candle price scale.
- Keep the existing owner-only deployment policy unchanged.
- Follow red-green-refactor for every task and preserve all existing tests.

## File Structure

- `studio/lib/drawings/types.ts`: drawing unions, tool names, styles, runtime hit/gesture types, validators.
- `studio/lib/drawings/store.ts`: storage key normalization, schema parsing, load/save functions.
- `studio/lib/drawings/geometry.ts`: pure segment, arrowhead, translation, and hit-test math.
- `studio/lib/drawings/coordinates.ts`: chart API adapter and nearest-candle timestamp projection.
- `studio/lib/drawings/controller.ts`: pointer/keyboard state machine and chart-interaction locking.
- `studio/lib/drawings/primitive.ts`: Series Primitive pane view and Canvas renderer.
- `studio/components/drawing-toolbar.tsx`: accessible six-button vertical toolbar.
- `studio/app/trading-workspace.tsx`: chart lifecycle, React state, storage lifecycle, controller wiring, text input.
- `studio/app/globals.css`: toolbar, selection, cursor, and text-input styling.
- `studio/tests/drawing-store.test.mjs`: validation and persistence behavior.
- `studio/tests/drawing-geometry.test.mjs`: geometry and hit-test behavior.
- `studio/tests/drawing-coordinates.test.mjs`: price/time conversion and cross-timeframe projection.
- `studio/tests/drawing-controller.test.mjs`: reducer/gesture behavior.
- `studio/tests/rendered-html.test.mjs`: accessible toolbar SSR regression.

---

### Task 1: Drawing Models and Versioned Persistence

**Files:**
- Create: `studio/lib/drawings/types.ts`
- Create: `studio/lib/drawings/store.ts`
- Create: `studio/tests/drawing-store.test.mjs`
- Modify: `studio/package.json`
- Modify: `studio/tsconfig.json`

**Interfaces:**
- Produces: `DrawingTool`, `DrawingPoint`, `Drawing`, `DrawingStyle`, `DEFAULT_DRAWING_STYLE`, `isDrawing(value): value is Drawing`.
- Produces: `drawingStorageKey(exchange, symbol): string`, `parseDrawingCollection(value): Drawing[]`, `loadDrawings(storage, exchange, symbol): Drawing[]`, `saveDrawings(storage, exchange, symbol, drawings): boolean`.

- [ ] **Step 1: Enable Node's TypeScript stripping for pure-module tests**

Change the test script to:

```json
"test": "npm run build && node --experimental-strip-types --test tests/*.test.mjs"
```

Add this compiler option so source modules and Node tests can consistently use explicit `.ts` imports:

```json
"allowImportingTsExtensions": true
```

Run: `cd studio && npm test`
Expected: the current suite passes; Node may print an experimental feature warning.

- [ ] **Step 2: Write the failing storage tests**

Create `studio/tests/drawing-store.test.mjs` with these cases:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  drawingStorageKey, loadDrawings, parseDrawingCollection, saveDrawings,
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
```

- [ ] **Step 3: Run the new tests to verify red**

Run: `cd studio && node --experimental-strip-types --test tests/drawing-store.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `store.ts`.

- [ ] **Step 4: Implement the drawing union and strict validator**

Define these exact types in `types.ts`:

```ts
import type { UTCTimestamp } from "lightweight-charts";

export type DrawingTool = "select" | "trend-line" | "horizontal-line" | "arrow" | "text" | "crosshair";
export type DrawingPoint = { time: UTCTimestamp; price: number };
export type DrawingStyle = { color: string; lineWidth: 1 | 2 | 3 | 4 };
export const DEFAULT_DRAWING_STYLE: DrawingStyle = { color: "#76e7a4", lineWidth: 2 };
type DrawingBase = { id: string; style: DrawingStyle; createdAt: number; updatedAt: number };
export type TrendLineDrawing = DrawingBase & { type: "trend-line"; points: [DrawingPoint, DrawingPoint] };
export type ArrowDrawing = DrawingBase & { type: "arrow"; points: [DrawingPoint, DrawingPoint] };
export type HorizontalLineDrawing = DrawingBase & { type: "horizontal-line"; points: [DrawingPoint] };
export type TextDrawing = DrawingBase & { type: "text"; points: [DrawingPoint]; text: string };
export type Drawing = TrendLineDrawing | ArrowDrawing | HorizontalLineDrawing | TextDrawing;
const isPoint = (value: unknown): value is DrawingPoint => {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return typeof point.time === "number" && Number.isFinite(point.time)
    && typeof point.price === "number" && Number.isFinite(point.price);
};
export function isDrawing(value: unknown): value is Drawing {
  if (!value || typeof value !== "object") return false;
  const drawing = value as Record<string, unknown>;
  const style = drawing.style as Record<string, unknown> | undefined;
  const points = drawing.points;
  if (typeof drawing.id !== "string" || !drawing.id || !Array.isArray(points)) return false;
  if (!style || typeof style.color !== "string" || ![1, 2, 3, 4].includes(style.lineWidth as number)) return false;
  if (typeof drawing.createdAt !== "number" || typeof drawing.updatedAt !== "number" || !points.every(isPoint)) return false;
  if (drawing.type === "trend-line" || drawing.type === "arrow") return points.length === 2;
  if (drawing.type === "horizontal-line") return points.length === 1;
  return drawing.type === "text" && points.length === 1 && typeof drawing.text === "string" && drawing.text.trim().length > 0;
}
```

`isDrawing` must reject unknown types, non-string IDs/colors, unsupported line widths, non-finite numbers, wrong point counts, and blank text.

- [ ] **Step 5: Implement storage without throwing**

In `store.ts`, use this persisted envelope and interfaces:

```ts
import { isDrawing, type Drawing } from "./types.ts";
type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;
type Envelope = { version: 1; drawings: Drawing[] };

export function drawingStorageKey(exchange: string, symbol: string): string;
export function parseDrawingCollection(value: string | null): Drawing[];
export function loadDrawings(storage: StorageReader, exchange: string, symbol: string): Drawing[];
export function saveDrawings(storage: StorageWriter, exchange: string, symbol: string, drawings: Drawing[]): boolean;
```

Normalize exchange to lowercase alphanumerics and symbol to lowercase alphanumerics. Catch JSON and storage errors. Save `{ version: 1, drawings }` only after filtering through `isDrawing`.

- [ ] **Step 6: Run tests and commit**

Run: `cd studio && node --experimental-strip-types --test tests/drawing-store.test.mjs && npm run lint`
Expected: all storage tests pass and lint exits 0.

```bash
git add studio/package.json studio/tsconfig.json studio/lib/drawings/types.ts studio/lib/drawings/store.ts studio/tests/drawing-store.test.mjs
git commit -m "Add drawing models and persistence"
```

---

### Task 2: Geometry and Coordinate Projection

**Files:**
- Create: `studio/lib/drawings/geometry.ts`
- Create: `studio/lib/drawings/coordinates.ts`
- Create: `studio/tests/drawing-geometry.test.mjs`
- Create: `studio/tests/drawing-coordinates.test.mjs`

**Interfaces:**
- Consumes: `Drawing`, `DrawingPoint` from Task 1.
- Produces: `distanceToSegment`, `arrowHead`, `hitTestDrawing`, `translateDrawing`.
- Produces: `DrawingCoordinateAdapter`, `nearestTimestamp`, `toScreenPoint`, `toDrawingPoint`.

- [ ] **Step 1: Write failing geometry tests**

Create `drawing-geometry.test.mjs`:

```js
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
```

- [ ] **Step 2: Write failing coordinate tests**

Create `drawing-coordinates.test.mjs`:

```js
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
```

- [ ] **Step 3: Run both files to verify red**

Run: `cd studio && node --experimental-strip-types --test tests/drawing-geometry.test.mjs tests/drawing-coordinates.test.mjs`
Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement pure geometry**

Use `ScreenPoint = { x: number; y: number }`, `HitPart = "body" | "point-0" | "point-1"`, and a render-shape type containing `id`, `type`, `points`, and optional `textBounds`. Handle zero-length segments. `arrowHead(start, end, size)` returns `[tip, left, right]`. `hitTestDrawing` checks handles first, then line/arrow segments, the whole pane-width horizontal line, or text bounds. `translateDrawing` preserves every other drawing field and adds `timeDelta` and `priceDelta` to all anchors.

- [ ] **Step 5: Implement the chart adapter**

Define structural interfaces so tests do not need a real chart:

```ts
export type DrawingCoordinateAdapter = {
  timeToCoordinate(time: UTCTimestamp): number | null;
  coordinateToTime(x: number): Time | null;
  priceToCoordinate(price: number): number | null;
  coordinateToPrice(y: number): number | null;
};
export function nearestTimestamp(sorted: readonly number[], target: number): UTCTimestamp | null;
export function toScreenPoint(point: DrawingPoint, candleTimes: readonly number[], api: DrawingCoordinateAdapter): ScreenPoint | null;
export function toDrawingPoint(point: ScreenPoint, api: DrawingCoordinateAdapter): DrawingPoint | null;
```

Convert `BusinessDay` results to `null`; πlab candles use `UTCTimestamp`. `toScreenPoint` tries the exact time first, then the nearest current timestamp, while leaving the input untouched.

- [ ] **Step 6: Run tests and commit**

Run: `cd studio && node --experimental-strip-types --test tests/drawing-geometry.test.mjs tests/drawing-coordinates.test.mjs && npm run lint`
Expected: all tests pass.

```bash
git add studio/lib/drawings/geometry.ts studio/lib/drawings/coordinates.ts studio/tests/drawing-geometry.test.mjs studio/tests/drawing-coordinates.test.mjs
git commit -m "Add drawing geometry and coordinates"
```

---

### Task 3: Drawing Controller State Machine

**Files:**
- Create: `studio/lib/drawings/controller.ts`
- Create: `studio/tests/drawing-controller.test.mjs`

**Interfaces:**
- Consumes: `DrawingTool`, `Drawing`, `DrawingPoint`, `HitPart`.
- Produces: `DrawingSession`, `DrawingAction`, `reduceDrawingSession`, `DrawingController`.
- `DrawingController` callbacks: `getDrawings`, `replaceDrawings`, `getTool`, `setTool`, `requestRender`, `requestText`.

- [ ] **Step 1: Write failing reducer tests**

Create `drawing-controller.test.mjs` covering exact transitions:

```js
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
```

- [ ] **Step 2: Run the test to verify red**

Run: `cd studio && node --experimental-strip-types --test tests/drawing-controller.test.mjs`
Expected: FAIL because `controller.ts` is missing.

- [ ] **Step 3: Implement the pure reducer**

Define the discriminated `DrawingSession` phases `idle`, `placing-first`, `previewing`, `selected`, and `dragging`. Reducer actions must include `BEGIN`, `PREVIEW`, `COMMIT`, `SELECT`, `START_DRAG`, `DRAG`, `END_DRAG`, `CLEAR_SELECTION`, and `CANCEL`. Return committed drawing changes on the state as one-shot `committed` or `updated` values for the controller to consume.

- [ ] **Step 4: Implement DOM/chart orchestration around the reducer**

`DrawingController` must expose:

```ts
class DrawingController {
  attach(host: HTMLElement): void;
  detach(): void;
  setCandleTimes(times: readonly number[]): void;
  cancel(): void;
  deleteSelected(): boolean;
  getSession(): DrawingSession;
}
```

Use pointer capture for drags, translate host-relative pointer coordinates through `toDrawingPoint`, and hit-test top-to-bottom. Call `chart.applyOptions({ handleScroll: false, handleScale: false })` only during active creation/drag and restore both to `true` on commit, cancel, pointer cancellation, blur, and detach. Never intercept pointer events when the tool is `crosshair` or when Select finds no drawing.

For Text, call `requestText(point)` and do not commit until React returns non-blank text through a controller method `commitText(text)`. Escape calls `cancel`. After a successful commit, call `setTool("select")`.

- [ ] **Step 5: Add controller edge-case tests and make them pass**

Add tests that verify:

```js
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
```

Run: `cd studio && node --experimental-strip-types --test tests/drawing-controller.test.mjs && npm run lint`
Expected: all controller tests pass.

- [ ] **Step 6: Commit**

```bash
git add studio/lib/drawings/controller.ts studio/tests/drawing-controller.test.mjs
git commit -m "Add drawing interaction controller"
```

---

### Task 4: Series Primitive Renderer

**Files:**
- Create: `studio/lib/drawings/primitive.ts`
- Modify: `studio/tests/drawing-geometry.test.mjs`

**Interfaces:**
- Consumes: `Drawing[]`, `DrawingSession`, candle timestamps, coordinate adapter, geometry helpers.
- Produces: `DrawingPrimitive implements ISeriesPrimitive<Time>` with `setState(drawings, session, candleTimes)`, `paneViews()`, `hitTest()`, `attached()`, and `detached()`.

- [ ] **Step 1: Add failing render-scene tests to geometry suite**

Extract rendering preparation into a pure exported function `buildScreenDrawings(drawings, candleTimes, api)` and add:

```js
test("omits unresolvable drawings and preserves front-to-back order", () => {
  const drawings = [
    { id: "valid", type: "trend-line", points: [{ time: 100, price: 10 }, { time: 200, price: 20 }], style: { color: "#fff", lineWidth: 2 }, createdAt: 1, updatedAt: 1 },
    { id: "invalid", type: "horizontal-line", points: [{ time: 100, price: -1 }], style: { color: "#fff", lineWidth: 2 }, createdAt: 1, updatedAt: 1 },
  ];
  const mockApi = {
    timeToCoordinate: (time) => time / 10,
    priceToCoordinate: (price) => price < 0 ? null : price,
  };
  const scene = buildScreenDrawings(drawings, [100, 200], mockApi);
  assert.deepEqual(scene.map((item) => item.id), ["valid"]);
});
```

Run: `cd studio && node --experimental-strip-types --test tests/drawing-geometry.test.mjs`
Expected: FAIL because `buildScreenDrawings` is not exported.

- [ ] **Step 2: Implement render-scene preparation**

Add `buildScreenDrawings` to `geometry.ts`. Resolve every anchor with `toScreenPoint`; omit a drawing if any required anchor is unresolved. Preserve array order so the final item is visually and interactively topmost.

- [ ] **Step 3: Implement the primitive lifecycle and pane view**

In `primitive.ts`:

```ts
export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time, "Candlestick">): void;
  detached(): void;
  setState(drawings: readonly Drawing[], session: DrawingSession, candleTimes: readonly number[]): void;
  paneViews(): readonly IPrimitivePaneView[];
  hitTest(x: number, y: number): PrimitiveHoveredItem | null;
}
```

The pane renderer uses `target.useMediaCoordinateSpace`. Draw trend/horizontal lines with round caps, arrows with a filled three-point head, and text as a dark rounded label. Draw the selected item with a translucent highlight and 4px circular handles. Use `zOrder(): "top"`. Do not implement `autoscaleInfo`.

`hitTest` searches the current screen scene in reverse order and returns `externalId` formatted as `drawing:<id>:<part>`. Endpoint handles use `cursorStyle: "grab"`, line/text bodies use `cursorStyle: "move"`, and an unselected hover uses `cursorStyle: "pointer"`.

- [ ] **Step 4: Verify TypeScript and tests**

Run: `cd studio && npm run build && node --experimental-strip-types --test tests/drawing-geometry.test.mjs && npm run lint`
Expected: build and tests pass with no type errors.

- [ ] **Step 5: Commit**

```bash
git add studio/lib/drawings/geometry.ts studio/lib/drawings/primitive.ts studio/tests/drawing-geometry.test.mjs
git commit -m "Render chart drawing primitives"
```

---

### Task 5: Accessible Drawing Toolbar

**Files:**
- Create: `studio/components/drawing-toolbar.tsx`
- Modify: `studio/app/globals.css`
- Modify: `studio/app/trading-workspace.tsx`
- Modify: `studio/tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `DrawingTool`.
- Produces: `<DrawingToolbar activeTool onToolChange />`.

- [ ] **Step 1: Add failing SSR assertions**

Append these assertions to the workspace render test:

```js
assert.match(html, /aria-label="Select drawing tool"/);
assert.match(html, /aria-label="Trend line drawing tool"/);
assert.match(html, /aria-label="Horizontal line drawing tool"/);
assert.match(html, /aria-label="Arrow drawing tool"/);
assert.match(html, /aria-label="Text drawing tool"/);
assert.match(html, /aria-label="Crosshair drawing tool"/);
assert.match(html, /aria-pressed="true"/);
```

Run: `cd studio && npm test`
Expected: rendered HTML test fails because the accessible controls do not exist.

- [ ] **Step 2: Build the toolbar with original inline SVGs**

Implement:

```tsx
type DrawingToolbarProps = {
  activeTool: DrawingTool;
  onToolChange(tool: DrawingTool): void;
};
export function DrawingToolbar({ activeTool, onToolChange }: DrawingToolbarProps) {
  const tools: { tool: DrawingTool; label: string; Icon: ComponentType }[] = [
    { tool: "select", label: "Select drawing tool", Icon: SelectIcon },
    { tool: "trend-line", label: "Trend line drawing tool", Icon: TrendLineIcon },
    { tool: "horizontal-line", label: "Horizontal line drawing tool", Icon: HorizontalLineIcon },
    { tool: "arrow", label: "Arrow drawing tool", Icon: ArrowIcon },
    { tool: "text", label: "Text drawing tool", Icon: TextIcon },
    { tool: "crosshair", label: "Crosshair drawing tool", Icon: CrosshairIcon },
  ];
  return <nav className="left-rail" aria-label="Chart drawing tools">
    {tools.map(({ tool, label, Icon }) => <button key={tool} type="button" className="tool-button" aria-label={label} aria-pressed={activeTool === tool} title={label.replace(" drawing tool", "")} onClick={() => onToolChange(tool)}><Icon /></button>)}
    <span className="rail-spacer" />
    <button type="button" className="tool-button" aria-label="Chart settings" title="Settings"><SettingsIcon /></button>
  </nav>;
}
```

Define `SelectIcon`, `TrendLineIcon`, `HorizontalLineIcon`, `ArrowIcon`, `TextIcon`, `CrosshairIcon`, and `SettingsIcon` in the same file. Each returns a 20×20 `<svg viewBox="0 0 20 20" aria-hidden="true">` built from simple `<path>`, `<line>`, or `<circle>` elements.

Each button needs `type="button"`, exact `aria-label` from the test, `aria-pressed={activeTool === tool}`, `title`, and an SVG with `aria-hidden="true"`. Use a pointer arrow, diagonal segment, horizontal segment, arrow, `T`, and crosshair—not text glyph approximations copied from the screenshot.

- [ ] **Step 3: Replace the current static left rail**

In `trading-workspace.tsx`, add `const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool>("select")` and render `DrawingToolbar`. Keep the existing settings control visually separated at the bottom, but do not make it part of the six drawing tools.

- [ ] **Step 4: Add toolbar styling**

Add CSS for 44px rail, 34px square buttons, active filled state, hover state, SVG stroke sizing, tooltip titles, and visible focus. Preserve the existing workspace columns. Use `touch-action: none` only on the chart while a drawing gesture is active, not on the whole page.

- [ ] **Step 5: Run tests and commit**

Run: `cd studio && npm test && npm run lint`
Expected: all existing and toolbar SSR tests pass.

```bash
git add studio/components/drawing-toolbar.tsx studio/app/trading-workspace.tsx studio/app/globals.css studio/tests/rendered-html.test.mjs
git commit -m "Add chart drawing toolbar"
```

---

### Task 6: Workspace Integration, Text Entry, and Persistence

**Files:**
- Modify: `studio/app/trading-workspace.tsx`
- Modify: `studio/app/globals.css`
- Modify: `studio/tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes all drawing modules from Tasks 1–5.
- Produces end-to-end user behavior in the existing workspace.

- [ ] **Step 1: Add a failing integration-source regression**

In `rendered-html.test.mjs`, read the workspace source with `readFile` and assert the wiring contract:

```js
const source = await readFile(new URL("../app/trading-workspace.tsx", import.meta.url), "utf8");
assert.match(source, /candleSeries\.attachPrimitive\(drawingPrimitive\)/);
assert.match(source, /loadDrawings\(window\.localStorage, exchange, symbol\)/);
assert.match(source, /saveDrawings\(window\.localStorage, exchange, symbol, drawings\)/);
assert.match(source, /drawing-text-input/);
```

Run: `cd studio && node --experimental-strip-types --test tests/rendered-html.test.mjs`
Expected: FAIL on missing primitive/storage wiring.

- [ ] **Step 2: Own drawing state and refs in React**

Add:

```ts
const drawingPrimitiveRef = useRef<DrawingPrimitive | null>(null);
const drawingControllerRef = useRef<DrawingController | null>(null);
const drawingsRef = useRef<Drawing[]>([]);
const [drawings, setDrawings] = useState<Drawing[]>([]);
const [drawingSession, setDrawingSession] = useState<DrawingSession>(initialDrawingSession);
const [textAnchor, setTextAnchor] = useState<DrawingPoint | null>(null);
const [drawingText, setDrawingText] = useState("");
```

Keep callback refs synchronized so the controller always reads current drawings/tool without reattaching on every render.

- [ ] **Step 3: Attach one primitive/controller to the candle series**

Immediately after creating the candlestick series, define callbacks that update both the ref and React state:

```ts
const drawingPrimitive = new DrawingPrimitive();
candleSeries.attachPrimitive(drawingPrimitive);
const replaceDrawings = (next: Drawing[]) => {
  drawingsRef.current = next;
  setDrawings(next);
};
const drawingController = new DrawingController({
  chart,
  series: candleSeries,
  getDrawings: () => drawingsRef.current,
  replaceDrawings,
  getTool: () => activeDrawingToolRef.current,
  setTool: setActiveDrawingTool,
  setSession: setDrawingSession,
  requestRender: () => drawingPrimitive.setState(drawingsRef.current, drawingController.getSession(), candleTimesRef.current),
  requestText: (point) => { setTextAnchor(point); setDrawingText(""); },
});
drawingController.attach(chartHost.current);
```

On effect cleanup, call `drawingController.detach()`, `candleSeries.detachPrimitive(drawingPrimitive)`, then remove the chart. Avoid duplicate subscriptions under React Strict Mode.

- [ ] **Step 4: Load, save, and redraw by market identity**

On `[exchange, symbol]`, cancel transient state, clear text entry, load from local storage, update `drawingsRef`, state, and primitive. Do not include `interval` in the storage key or load effect.

On committed drawing changes, update state immediately and debounce `saveDrawings` by 150ms. Clear the timer on dependency change/unmount. On candle changes, pass sorted numeric candle times to controller and primitive, then request render.

- [ ] **Step 5: Add inline text entry and keyboard behavior**

Position a form inside `.chart-stage` from the current screen coordinate of `textAnchor`:

```tsx
{textAnchor && <form className="drawing-text-input" onSubmit={commitDrawingText}>
  <label><span>Chart label</span><input autoFocus value={drawingText} onChange={(event) => setDrawingText(event.target.value)} onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      drawingControllerRef.current?.cancel();
      setTextAnchor(null);
      setDrawingText("");
    }
  }} /></label>
</form>}
```

Enter submits non-blank text; Escape cancels. The global key handler must:

- ignore Delete/Backspace when `event.target` is an input, textarea, select, or contenteditable element;
- call controller `deleteSelected()` otherwise;
- let Escape close symbol search first, then cancel text/drawing state;
- retain all existing Pine, alert, and symbol shortcuts.

- [ ] **Step 6: Apply drawing cursors and text-input CSS**

Add chart-stage classes for `cursor: crosshair` during placement, `cursor: default` in Select, and `cursor: crosshair` for the crosshair tool. Style the text entry above the chart canvas with compact dark input, border, and focus ring. Ensure chart legend remains non-blocking and the loading overlay stays above drawing input only while loading.

- [ ] **Step 7: Run focused and full verification, then commit**

Run:

```bash
cd studio
node --experimental-strip-types --test tests/drawing-*.test.mjs
npm test
npm run lint
git diff --check
```

Expected: every command exits 0; existing panel, market, AI, alert, and Pine regressions remain green.

```bash
git add studio/app/trading-workspace.tsx studio/app/globals.css studio/tests/rendered-html.test.mjs
git commit -m "Integrate persistent chart drawings"
```

---

### Task 7: Manual Acceptance, GitHub Sync, and Private Deployment

**Files:**
- Modify only if acceptance exposes a defect; add a failing regression before each correction.
- Read: `studio/.openai/hosting.json`

**Interfaces:**
- Consumes the complete feature.
- Produces a verified Git commit, pushed GitHub source, and succeeded owner-only Sites deployment.

- [ ] **Step 1: Start the local site and open it in the right panel**

Run: `cd studio && npm run dev`
Expected: dev server reports a local URL and loads the workspace with no runtime error.

- [ ] **Step 2: Execute the manual acceptance matrix**

Verify in order:

1. Each of the six toolbar buttons can be activated and shows its pressed state.
2. Trend line and arrow preview after the first click and commit on the second.
3. Horizontal line commits on one click.
4. Text opens inline entry; Enter commits and Escape cancels.
5. Select shows handles; endpoint and whole-object dragging work.
6. Delete/Backspace removes selection but does not fire while editing text or Pine.
7. Escape and pointer cancellation restore chart pan/zoom.
8. Drawings remain aligned during chart pan, zoom, resize, and bottom-panel resize.
9. Refresh restores drawings.
10. Timeframe switch keeps drawings visible; switching symbols isolates collections.
11. EMA removal, Pine run, alert, symbol search, derivatives, and AI drawer remain usable.

- [ ] **Step 3: Run final automated verification from a clean prompt**

Run:

```bash
cd studio
npm test
npm run lint
git diff --check
cd ..
git status --short
git log --oneline -7
```

Expected: all commands exit 0 and only intentional commits/changes exist.

- [ ] **Step 4: Push the exact source state**

Run: `git push origin master`
Expected: GitHub accepts all drawing-tool commits.

Push the `studio` subtree to the configured private Sites source branch using the existing repository workflow. Record the resulting subtree commit SHA; do not invent it.

- [ ] **Step 5: Save and deploy a new private Sites version**

Read `studio/.openai/hosting.json`, reuse its exact `project_id`, verify the existing site is owner-only, archive the exact pushed subtree, save a version with that commit SHA, then deploy that saved version. Poll the deployment ID until `succeeded` or `failed`.

Expected: deployment succeeds at `https://pine-studio-crypto.waketheilluminated.chatgpt.site` without changing access controls.

- [ ] **Step 6: Open production and report**

Open the exact production URL in the right panel. Report the implemented tools, persistence/editing behavior, test results, final Git commit, GitHub link, and production URL. Do not claim deployment until the status call returns `succeeded`.
