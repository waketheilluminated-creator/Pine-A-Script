import type { Drawing, DrawingPoint } from "./types.ts";

export type ScreenPoint = { x: number; y: number };
export type HitPart = "body" | "point-0" | "point-1";
export type DrawingHit = { drawingId: string; part: HitPart };
export type ScreenDrawing = {
  id: string;
  type: Drawing["type"];
  points: readonly ScreenPoint[];
  textBounds?: { x: number; y: number; width: number; height: number };
};

export function distanceToSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

export function arrowHead(start: ScreenPoint, end: ScreenPoint, size: number): [ScreenPoint, ScreenPoint, ScreenPoint] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const unitX = length === 0 ? 1 : dx / length;
  const unitY = length === 0 ? 0 : dy / length;
  const backX = -unitX * size;
  const backY = -unitY * size;
  const sideX = -unitY * size * 0.5;
  const sideY = unitX * size * 0.5;

  return [
    end,
    { x: end.x + backX + sideX, y: end.y + backY + sideY },
    { x: end.x + backX - sideX, y: end.y + backY - sideY },
  ];
}

export function hitTestDrawing(drawing: ScreenDrawing, point: ScreenPoint, tolerance: number): DrawingHit | null {
  for (let index = 0; index < Math.min(drawing.points.length, 2); index += 1) {
    if (Math.hypot(point.x - drawing.points[index].x, point.y - drawing.points[index].y) <= tolerance) {
      return { drawingId: drawing.id, part: index === 0 ? "point-0" : "point-1" };
    }
  }

  if (drawing.type === "horizontal-line" && drawing.points[0]) {
    return Math.abs(point.y - drawing.points[0].y) <= tolerance ? { drawingId: drawing.id, part: "body" } : null;
  }

  if (drawing.type === "text" && drawing.textBounds) {
    const { x, y, width, height } = drawing.textBounds;
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
      ? { drawingId: drawing.id, part: "body" }
      : null;
  }

  if (drawing.points.length >= 2 && distanceToSegment(point, drawing.points[0], drawing.points[1]) <= tolerance) {
    return { drawingId: drawing.id, part: "body" };
  }
  return null;
}

export function translateDrawing(drawing: Drawing, timeDelta: number, priceDelta: number): Drawing {
  return {
    ...drawing,
    points: drawing.points.map((point): DrawingPoint => ({
      ...point,
      time: (point.time + timeDelta) as DrawingPoint["time"],
      price: point.price + priceDelta,
    })),
  } as Drawing;
}
