import type { Time } from "lightweight-charts";
import { toDrawingPoint, type DrawingCoordinateAdapter } from "./coordinates.ts";
import type { DrawingHit, HitPart, ScreenPoint } from "./geometry.ts";
import { translateDrawing } from "./geometry.ts";
import { DEFAULT_DRAWING_STYLE, type Drawing, type DrawingPoint, type DrawingTool } from "./types.ts";

type SessionEffect = { committed?: Drawing; updated?: Drawing };
export type IdleDrawingSession = { phase: "idle" } & SessionEffect;
export type PlacingFirstDrawingSession = {
  phase: "placing-first";
  tool: Exclude<DrawingTool, "select" | "crosshair" | "horizontal-line">;
  start: DrawingPoint;
} & SessionEffect;
export type PreviewingDrawingSession = {
  phase: "previewing";
  tool: "trend-line" | "arrow";
  start: DrawingPoint;
  preview: DrawingPoint;
} & SessionEffect;
export type SelectedDrawingSession = { phase: "selected"; selectedId: string } & SessionEffect;
export type DraggingDrawingSession = {
  phase: "dragging";
  selectedId: string;
  part: HitPart;
  origin: DrawingPoint;
  original: Drawing;
} & SessionEffect;

export type DrawingSession =
  | IdleDrawingSession
  | PlacingFirstDrawingSession
  | PreviewingDrawingSession
  | SelectedDrawingSession
  | DraggingDrawingSession;

export const initialDrawingSession: IdleDrawingSession = { phase: "idle" };

export type DrawingAction =
  | { type: "BEGIN"; tool: DrawingTool; point: DrawingPoint; id?: string; now?: number }
  | { type: "PREVIEW"; point: DrawingPoint }
  | { type: "COMMIT"; point: DrawingPoint; id: string; now: number }
  | { type: "TEXT_COMMIT"; text: string; id: string; now: number }
  | { type: "SELECT"; drawingId: string }
  | { type: "START_DRAG"; drawing: Drawing; part: HitPart; point: DrawingPoint }
  | { type: "DRAG"; point: DrawingPoint; now: number }
  | { type: "END_DRAG" }
  | { type: "CLEAR_SELECTION" }
  | { type: "CANCEL" };

const twoPointTool = (tool: DrawingTool): tool is "trend-line" | "arrow" => tool === "trend-line" || tool === "arrow";

function drawingFor(tool: "trend-line" | "arrow", start: DrawingPoint, end: DrawingPoint, id: string, now: number): Drawing {
  return {
    id,
    type: tool,
    points: [start, end],
    style: DEFAULT_DRAWING_STYLE,
    createdAt: now,
    updatedAt: now,
  };
}

function horizontalDrawing(point: DrawingPoint, id: string, now: number): Drawing {
  return {
    id,
    type: "horizontal-line",
    points: [point],
    style: DEFAULT_DRAWING_STYLE,
    createdAt: now,
    updatedAt: now,
  };
}

function textDrawing(point: DrawingPoint, text: string, id: string, now: number): Drawing {
  return {
    id,
    type: "text",
    points: [point],
    text,
    style: DEFAULT_DRAWING_STYLE,
    createdAt: now,
    updatedAt: now,
  };
}

function dragDrawing(state: DraggingDrawingSession, point: DrawingPoint, now: number): Drawing {
  const { original, part } = state;
  if (part === "point-0" && original.points.length === 2) {
    return { ...original, points: [point, original.points[1]], updatedAt: now } as Drawing;
  }
  if (part === "point-1" && original.points.length === 2) {
    return { ...original, points: [original.points[0], point], updatedAt: now } as Drawing;
  }
  if (original.type === "horizontal-line") {
    return { ...original, points: [{ ...original.points[0], price: point.price }], updatedAt: now };
  }
  return { ...translateDrawing(original, point.time - state.origin.time, point.price - state.origin.price), updatedAt: now };
}

export function reduceDrawingSession(state: DrawingSession, action: DrawingAction): DrawingSession {
  switch (action.type) {
    case "BEGIN":
      if (action.tool === "horizontal-line" && action.id && action.now !== undefined) {
        const committed = horizontalDrawing(action.point, action.id, action.now);
        return { phase: "selected", selectedId: committed.id, committed };
      }
      if (twoPointTool(action.tool) || action.tool === "text") {
        return { phase: "placing-first", tool: action.tool, start: action.point };
      }
      return state;
    case "PREVIEW":
      if (state.phase === "placing-first" && twoPointTool(state.tool)) {
        return { phase: "previewing", tool: state.tool, start: state.start, preview: action.point };
      }
      return state;
    case "COMMIT":
      if (state.phase === "previewing") {
        const committed = drawingFor(state.tool, state.start, action.point, action.id, action.now);
        return { phase: "selected", selectedId: committed.id, committed };
      }
      return state;
    case "TEXT_COMMIT":
      if (state.phase !== "placing-first" || state.tool !== "text") return state;
      if (!action.text.trim()) return initialDrawingSession;
      {
        const committed = textDrawing(state.start, action.text, action.id, action.now);
        return { phase: "selected", selectedId: committed.id, committed };
      }
    case "SELECT":
      return { phase: "selected", selectedId: action.drawingId };
    case "START_DRAG":
      return {
        phase: "dragging",
        selectedId: action.drawing.id,
        part: action.part,
        origin: action.point,
        original: action.drawing,
      };
    case "DRAG":
      if (state.phase !== "dragging") return state;
      return { ...state, updated: dragDrawing(state, action.point, action.now) };
    case "END_DRAG":
      return state.phase === "dragging" ? { phase: "selected", selectedId: state.selectedId } : state;
    case "CLEAR_SELECTION":
      return initialDrawingSession;
    case "CANCEL":
      return state.phase === "dragging"
        ? { phase: "selected", selectedId: state.selectedId }
        : initialDrawingSession;
  }
}

type ChartInteraction = {
  applyOptions(options: { handleScroll: boolean; handleScale: boolean }): void;
  timeScale(): { coordinateToTime(x: number): Time | null };
};

type SeriesInteraction = { coordinateToPrice(y: number): number | null };

export type DrawingControllerOptions = {
  chart: ChartInteraction;
  series: SeriesInteraction;
  getDrawings(): readonly Drawing[];
  replaceDrawings(drawings: Drawing[]): void;
  getTool(): DrawingTool;
  setTool(tool: DrawingTool): void;
  setSession?(session: DrawingSession): void;
  requestRender(): void;
  requestText(point: DrawingPoint): void;
  /** Returns the frontmost hit from the shared primitive scene. */
  hitTest(point: ScreenPoint): DrawingHit | null;
  createId?(): string;
  now?(): number;
};

export class DrawingController {
  private readonly options: DrawingControllerOptions;
  private readonly coordinateAdapter: DrawingCoordinateAdapter;
  private session: DrawingSession = initialDrawingSession;
  private host: HTMLElement | null = null;
  private candleTimes: readonly number[] = [];
  private interactionsLocked = false;
  private activePointerId: number | null = null;

  constructor(options: DrawingControllerOptions) {
    this.options = options;
    this.coordinateAdapter = {
      coordinateToTime: (x) => this.options.chart.timeScale().coordinateToTime(x),
      coordinateToPrice: (y) => this.options.series.coordinateToPrice(y),
      timeToCoordinate: () => null,
      priceToCoordinate: () => null,
    };
  }

  attach(host: HTMLElement): void {
    this.detach();
    this.host = host;
    host.addEventListener("pointerdown", this.onPointerDown);
    host.addEventListener("pointermove", this.onPointerMove);
    host.addEventListener("pointerup", this.onPointerUp);
    host.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onWindowBlur);
  }

  detach(): void {
    if (this.host) {
      this.host.removeEventListener("pointerdown", this.onPointerDown);
      this.host.removeEventListener("pointermove", this.onPointerMove);
      this.host.removeEventListener("pointerup", this.onPointerUp);
      this.host.removeEventListener("pointercancel", this.onPointerCancel);
    }
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.onWindowBlur);
    this.releasePointer();
    this.unlockInteractions();
    this.host = null;
  }

  setCandleTimes(times: readonly number[]): void {
    this.candleTimes = times;
  }

  cancel(): void {
    this.dispatch({ type: "CANCEL" });
    this.releasePointer();
    this.unlockInteractions();
    this.options.setTool("select");
  }

  commitText(text: string): boolean {
    if (this.session.phase !== "placing-first" || this.session.tool !== "text") return false;
    this.dispatch({ type: "TEXT_COMMIT", text, id: this.createId(), now: this.now() });
    this.unlockInteractions();
    if (!text.trim()) return false;
    this.options.setTool("select");
    return true;
  }

  deleteSelected(): boolean {
    if (this.session.phase !== "selected") return false;
    const drawings = this.options.getDrawings();
    if (!drawings.some((drawing) => drawing.id === this.session.selectedId)) return false;
    this.options.replaceDrawings(drawings.filter((drawing) => drawing.id !== this.session.selectedId));
    this.dispatch({ type: "CLEAR_SELECTION" });
    return true;
  }

  getSession(): DrawingSession {
    return this.session;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const screenPoint = this.toHostPoint(event);
    const point = toDrawingPoint(screenPoint, this.coordinateAdapter);
    const tool = this.options.getTool();

    if (tool === "crosshair" || point === null) return;
    if (tool === "select") {
      const hit = this.options.hitTest(screenPoint);
      if (!hit) {
        this.dispatch({ type: "CLEAR_SELECTION" });
        return;
      }
      const drawing = this.options.getDrawings().find((item) => item.id === hit.drawingId);
      if (!drawing) return;
      event.preventDefault();
      this.dispatch({ type: "START_DRAG", drawing, part: hit.part, point });
      this.capturePointer(event.pointerId);
      this.lockInteractions();
      return;
    }

    event.preventDefault();
    if (this.session.phase === "previewing") {
      this.dispatch({ type: "COMMIT", point, id: this.createId(), now: this.now() });
      this.unlockInteractions();
      this.options.setTool("select");
      return;
    }
    if (this.session.phase !== "idle") return;

    this.dispatch({ type: "BEGIN", tool, point, id: this.createId(), now: this.now() });
    if (tool === "horizontal-line") {
      this.unlockInteractions();
      this.options.setTool("select");
      return;
    }
    this.lockInteractions();
    if (tool === "text") this.options.requestText(point);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.session.phase !== "placing-first" && this.session.phase !== "previewing" && this.session.phase !== "dragging") return;
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    const point = toDrawingPoint(this.toHostPoint(event), this.coordinateAdapter);
    if (point === null) {
      this.cancel();
      return;
    }
    event.preventDefault();
    if (this.session.phase === "dragging") this.dispatch({ type: "DRAG", point, now: this.now() });
    else this.dispatch({ type: "PREVIEW", point });
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.session.phase !== "dragging" || event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.dispatch({ type: "END_DRAG" });
    this.releasePointer();
    this.unlockInteractions();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    this.cancel();
  };

  private readonly onWindowBlur = (): void => {
    if (this.session.phase !== "idle" || this.interactionsLocked) this.cancel();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.cancel();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !isEditable(event.target) && this.deleteSelected()) {
      event.preventDefault();
    }
  };

  private dispatch(action: DrawingAction): void {
    this.session = reduceDrawingSession(this.session, action);
    if (this.session.committed) this.options.replaceDrawings([...this.options.getDrawings(), this.session.committed]);
    if (this.session.updated) {
      this.options.replaceDrawings(this.options.getDrawings().map((drawing) => (
        drawing.id === this.session.updated?.id ? this.session.updated : drawing
      )));
    }
    this.options.setSession?.(this.session);
    this.options.requestRender();
  }

  private toHostPoint(event: PointerEvent): ScreenPoint {
    const rect = this.host?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  private lockInteractions(): void {
    if (this.interactionsLocked) return;
    this.interactionsLocked = true;
    this.options.chart.applyOptions({ handleScroll: false, handleScale: false });
  }

  private unlockInteractions(): void {
    if (!this.interactionsLocked) return;
    this.interactionsLocked = false;
    this.options.chart.applyOptions({ handleScroll: true, handleScale: true });
  }

  private capturePointer(pointerId: number): void {
    if (!this.host) return;
    this.host.setPointerCapture(pointerId);
    this.activePointerId = pointerId;
  }

  private releasePointer(): void {
    if (this.host && this.activePointerId !== null && this.host.hasPointerCapture(this.activePointerId)) {
      this.host.releasePointerCapture(this.activePointerId);
    }
    this.activePointerId = null;
  }

  private createId(): string {
    return this.options.createId?.() ?? crypto.randomUUID();
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}
