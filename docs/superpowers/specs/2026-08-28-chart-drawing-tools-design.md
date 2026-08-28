# πlab Chart Drawing Tools Design

Date: 2026-08-28
Status: Approved in chat; awaiting written-spec review

## Goal

Add a TradingView-inspired drawing experience to the existing πlab chart without replacing `lightweight-charts` or disrupting live candles, indicators, alerts, Pine execution, or the resizable editor panel.

The first release provides six tools:

- Select
- Trend line
- Horizontal line
- Arrow
- Text
- Crosshair

Users can create, select, reshape, move, delete, and persist drawings. Drawings remain anchored to market time and price while the chart pans, zooms, resizes, or changes timeframe.

## Non-goals

The first release does not include Fibonacci tools, freehand brushes, shape libraries, drawing templates, locking, visibility controls, undo/redo history, cloud synchronization, collaboration, mobile-specific gesture editing, or a full property inspector. It also does not reproduce TradingView trademarks or proprietary icons.

## Chosen Approach

Use the public `lightweight-charts` 5.2 Series Primitive API for rendering and the public chart event and coordinate APIs for interaction.

This approach keeps every persistent anchor in domain coordinates:

```ts
type DrawingPoint = {
  time: UTCTimestamp;
  price: number;
};
```

Canvas pixel coordinates are derived only while rendering or hit-testing. They are never the source of truth. This prevents drawings from drifting when the chart changes size or visible range.

An independent overlay canvas was rejected because it would duplicate chart transforms and make pan, zoom, high-DPI rendering, and resize synchronization less reliable. Replacing the chart library was rejected because it would unnecessarily disturb the existing data and indicator integration.

## User Experience

### Toolbar

A compact vertical toolbar sits inside the chart column at the left edge, below the top chart toolbar and above the bottom editor panel. It uses πlab's dark visual system and original SVG icons.

The toolbar contains:

1. Select cursor
2. Trend line
3. Horizontal line
4. Arrow
5. Text
6. Crosshair

The active tool receives a filled background and accessible pressed state. Each control has a tooltip and keyboard-focus style. The toolbar remains visible when the bottom panel expands or collapses.

### Creating Drawings

- Trend line and arrow: first click creates the start anchor; pointer movement previews the end; second click commits the drawing.
- Horizontal line: one click commits a price-anchored line spanning the pane.
- Text: one click places the anchor and opens a small inline text input. Enter commits; Escape cancels.
- Crosshair: activates the chart's normal inspection crosshair and creates no persistent object.
- Escape cancels any drawing in progress and returns to Select.
- After a drawing is committed, the active tool returns to Select so accidental repeated drawings are avoided.

While creating or dragging a drawing, chart scrolling and scaling are temporarily disabled. They are restored when the gesture completes or is cancelled.

### Selecting and Editing

Select mode performs hit-testing from front to back and selects the nearest drawing within an 8 CSS-pixel tolerance.

- Selected two-point drawings show circular handles at both anchors.
- Dragging a handle changes one anchor.
- Dragging the drawing body moves the complete drawing while preserving its time and price deltas.
- A selected horizontal line can be dragged vertically.
- A selected text label can be dragged from its bounding box.
- Clicking empty chart space clears selection.
- Delete or Backspace removes the selected drawing when focus is not inside an input or editor.

Selection is intentionally single-object in the first release.

### Switching Symbols and Timeframes

Drawings are grouped by normalized `exchange + symbol`, not timeframe. A drawing therefore remains available across timeframes for the same market. Anchors use UTC timestamps and prices. If an exact timestamp is absent in the new timeframe, the coordinate adapter projects it to the nearest current candle for display while preserving the original stored timestamp. Dragging that anchor on the new timeframe explicitly updates it to the selected current candle time.

Switching to another symbol loads that symbol's drawing collection and clears any transient selection or unfinished drawing.

## Architecture

### Drawing Model

Create a discriminated model in `studio/lib/drawings/types.ts`:

```ts
type Drawing =
  | TrendLineDrawing
  | HorizontalLineDrawing
  | ArrowDrawing
  | TextDrawing;
```

Every drawing contains:

- stable generated `id`
- `type`
- one or two domain-coordinate anchors
- minimal style (`color`, `lineWidth`)
- text content where applicable
- creation/update timestamps for migration and diagnostics

Runtime-only hover, selection, preview, and drag state are not persisted.

### Drawing Store

`studio/lib/drawings/store.ts` owns serialization, schema validation, versioning, and browser persistence.

Storage key format:

```text
pilab:drawings:v1:<exchange>:<normalized-symbol>
```

Invalid or partially corrupt records are ignored individually instead of preventing all drawings from loading. Storage failures are non-fatal: the current in-memory session continues to work. All browser storage access is client-only.

### Coordinate Adapter

`studio/lib/drawings/coordinates.ts` is the only module that translates between market coordinates and canvas coordinates.

- X: `timeScale().timeToCoordinate()` and `coordinateToTime()`
- Y: candlestick series `priceToCoordinate()` and `coordinateToPrice()`

The adapter also receives the current sorted candle timestamps. When `timeToCoordinate()` cannot resolve a stored timestamp after a timeframe change, it uses binary search to find the nearest current candle and requests that candle's coordinate without mutating the stored anchor. It returns `null` for points outside valid chart data or unavailable scales. Controllers and renderers must handle `null` without creating invalid drawings.

### Primitive Renderer

`studio/lib/drawings/primitive.ts` implements the Series Primitive interfaces and renders committed drawings, the in-progress preview, selection highlights, and handles.

The primitive:

- draws in media coordinate space for straightforward CSS-pixel hit tolerance
- uses the library's high-DPI rendering target
- requests updates when the drawing state changes
- exposes hit-test results with drawing ID and hit part
- avoids extending autoscale, so off-screen annotations do not unexpectedly change candle scale

Arrowheads and selection handles are computed from pure geometry helpers. Horizontal lines are clipped to the plot pane. Text uses a bounded dark label with readable contrast.

### Interaction Controller

`studio/lib/drawings/controller.ts` owns the drawing state machine:

```text
idle -> placing-first -> previewing -> committed
idle -> selected -> dragging-handle/body -> selected
any transient state -> cancelled -> idle
```

It subscribes to chart click/crosshair events and uses pointer events on the chart host for pointer capture during dragging. It must clean up all subscriptions and restore chart interaction options when detached.

The controller receives callbacks instead of importing React state. This keeps interaction logic testable and prevents the chart component from accumulating geometry rules.

### React Integration

`studio/components/drawing-toolbar.tsx` renders the toolbar. `studio/app/trading-workspace.tsx` owns the active tool and drawing collection, creates one renderer/controller pair after the chart and candle series exist, and replaces the collection when the market identity changes.

The existing chart host remains the source of chart lifecycle. Drawing modules attach to the existing candlestick series; they do not create another chart or data series.

## Data Flow

1. The user selects a toolbar tool.
2. The controller receives chart/pointer events.
3. The coordinate adapter converts pointer position to time and price.
4. The controller updates preview or committed drawing state.
5. React updates the drawing collection and schedules persistence.
6. The primitive requests a redraw and converts stored anchors back to pixels.
7. On market change, the store loads that market's collection and the primitive redraws it.

Persistence is debounced so pointer movement never writes to storage. Only committed create, update, move, and delete operations persist.

## Error Handling and Accessibility

- Invalid coordinate conversions cancel the current operation without adding malformed records.
- Pointer cancellation and window blur restore chart scrolling and release drag state.
- Escape always exits the current drawing gesture.
- Toolbar buttons expose `aria-label`, `aria-pressed`, title text, and visible focus.
- Text entry uses a labelled input and does not allow Delete/Backspace shortcuts to remove a drawing while editing.
- Local-storage quota or security errors are caught and do not interrupt chart rendering.

## Testing

### Unit Tests

- geometry: point-to-segment distance, handle/body hit tests, arrowhead vertices, translations
- models: validation and per-type anchor requirements
- storage: key normalization, schema round-trip, corrupt-record tolerance, version rejection
- controller state: start, preview, commit, cancel, select, drag, and delete transitions

### Integration and Regression Tests

- toolbar renders all six accessible controls
- switching tools updates pressed state
- domain coordinates round-trip through mocked chart APIs
- drawing persistence is scoped by exchange and symbol, not timeframe
- existing panel-collapse, Pine, alert, and rendered-page tests continue to pass
- production build, lint, and `git diff --check` pass before commit/deployment

### Manual Verification

On the local site, verify one example of every drawing type, selection and endpoint dragging, deletion, refresh restoration, chart pan/zoom, timeframe switching, symbol isolation, panel resizing, and high-DPI appearance.

## Delivery

Implementation will be developed test-first, committed to the existing repository, pushed to GitHub, published as a new private Sites version, and opened in the right panel after deployment succeeds. The existing owner-only access policy remains unchanged.
