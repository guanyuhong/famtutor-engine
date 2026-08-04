import { MathEngineError } from "../errors.js";
import type { Interval1Value } from "../types.js";

export interface IntervalBounds {
  lower?: number;
  upper?: number;
  lowerClosed?: boolean;
  upperClosed?: boolean;
  y?: number;
}

export function intervalFromBounds(bounds: IntervalBounds): Interval1Value {
  const lower = bounds.lower ?? null;
  const upper = bounds.upper ?? null;
  const y = bounds.y ?? 0;
  if (lower !== null && !Number.isFinite(lower)) {
    throw new MathEngineError("INVALID_INTERVAL_BOUND", "Interval lower bound must be finite when present.");
  }
  if (upper !== null && !Number.isFinite(upper)) {
    throw new MathEngineError("INVALID_INTERVAL_BOUND", "Interval upper bound must be finite when present.");
  }
  if (!Number.isFinite(y)) {
    throw new MathEngineError("INVALID_INTERVAL_TRACK", "Interval params.y must be finite.");
  }
  const lowerClosed = lower !== null && (bounds.lowerClosed ?? false);
  const upperClosed = upper !== null && (bounds.upperClosed ?? false);
  const empty = lower !== null && upper !== null && (
    lower > upper || (lower === upper && !(lowerClosed && upperClosed))
  );
  return {
    kind: "interval1",
    lower,
    upper,
    lowerClosed,
    upperClosed,
    y,
    empty
  };
}

export function isInterval(value: unknown): value is Interval1Value {
  return Boolean(value && typeof value === "object" && (value as Interval1Value).kind === "interval1");
}
