import type { Time, UTCTimestamp } from "lightweight-charts";
import type { DrawingPoint } from "./types.ts";
import type { ScreenPoint } from "./geometry.ts";

export type DrawingCoordinateAdapter = {
  timeToCoordinate(time: UTCTimestamp): number | null;
  coordinateToTime(x: number): Time | null;
  priceToCoordinate(price: number): number | null;
  coordinateToPrice(y: number): number | null;
};

export function nearestTimestamp(sorted: readonly number[], target: number): UTCTimestamp | null {
  if (sorted.length === 0) return null;

  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sorted[middle] < target) low = middle + 1;
    else high = middle;
  }

  if (low === 0) return sorted[0] as UTCTimestamp;
  if (low === sorted.length) return sorted[sorted.length - 1] as UTCTimestamp;
  return target - sorted[low - 1] <= sorted[low] - target
    ? sorted[low - 1] as UTCTimestamp
    : sorted[low] as UTCTimestamp;
}

export function toScreenPoint(
  point: DrawingPoint,
  candleTimes: readonly number[],
  api: DrawingCoordinateAdapter,
): ScreenPoint | null {
  const timestamp = candleTimes.includes(point.time)
    ? point.time
    : nearestTimestamp(candleTimes, point.time);
  const x = timestamp === null ? null : api.timeToCoordinate(timestamp);
  const y = api.priceToCoordinate(point.price);
  return x === null || y === null ? null : { x, y };
}

export function toDrawingPoint(point: ScreenPoint, api: DrawingCoordinateAdapter): DrawingPoint | null {
  const time = api.coordinateToTime(point.x);
  const price = api.coordinateToPrice(point.y);
  if (typeof time !== "number" || price === null) return null;
  return { time: time as UTCTimestamp, price };
}
