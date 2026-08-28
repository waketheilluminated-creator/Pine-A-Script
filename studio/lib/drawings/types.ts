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
  if (typeof drawing.createdAt !== "number" || !Number.isFinite(drawing.createdAt)
    || typeof drawing.updatedAt !== "number" || !Number.isFinite(drawing.updatedAt)
    || points.some((point) => !isPoint(point))) return false;
  if (drawing.type === "trend-line" || drawing.type === "arrow") return points.length === 2;
  if (drawing.type === "horizontal-line") return points.length === 1;
  return drawing.type === "text" && points.length === 1 && typeof drawing.text === "string" && drawing.text.trim().length > 0;
}
