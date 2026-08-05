import type { MathClock } from "../types.js";
import { clamp, roundForJson } from "../util.js";

export type ClockRunStatus = "idle" | "running" | "paused" | "completed";

export interface LogicalClockState {
  clockId: string;
  value: number;
  direction: 1 | -1;
  tick: number;
  status: ClockRunStatus;
}

export interface LogicalClockStep {
  state: LogicalClockState;
  shouldContinue: boolean;
}

export function initialClockState(clock: MathClock, currentValue?: number): LogicalClockState {
  const reset = clock.resetValue ?? clock.start;
  return {
    clockId: clock.id,
    value: roundForJson(clamp(currentValue ?? reset, clock.start, clock.end)),
    direction: 1,
    tick: 0,
    status: clock.autoStart ? "running" : "idle"
  };
}

/** Advance one logical tick. This function is pure and independent of wall time. */
export function advanceClock(clock: MathClock, state: LogicalClockState): LogicalClockStep {
  const loop = clock.loop ?? "none";
  const raw = state.value + clock.step * state.direction;
  let value = raw;
  let direction = state.direction;
  let status: ClockRunStatus = state.status === "running" ? "running" : "paused";
  let shouldContinue = state.status === "running";

  if (raw > clock.end + 1e-12) {
    if (loop === "repeat") value = clock.start;
    else if (loop === "alternate") {
      value = Math.max(clock.start, clock.end - (raw - clock.end));
      direction = -1;
    } else {
      value = clock.end;
      status = "completed";
      shouldContinue = false;
    }
  } else if (raw < clock.start - 1e-12) {
    if (loop === "repeat") value = clock.end;
    else if (loop === "alternate") {
      value = Math.min(clock.end, clock.start + (clock.start - raw));
      direction = 1;
    } else {
      value = clock.start;
      status = "completed";
      shouldContinue = false;
    }
  } else if (Math.abs(raw - clock.end) <= 1e-12) {
    value = clock.end;
    if (loop === "alternate") direction = -1;
    else if (loop === "none") {
      status = "completed";
      shouldContinue = false;
    }
  } else if (Math.abs(raw - clock.start) <= 1e-12) {
    value = clock.start;
    if (loop === "alternate") direction = 1;
  }

  return {
    state: {
      clockId: clock.id,
      value: roundForJson(clamp(value, clock.start, clock.end)),
      direction,
      tick: state.tick + 1,
      status
    },
    shouldContinue
  };
}

export function resetClockState(clock: MathClock): LogicalClockState {
  return {
    clockId: clock.id,
    value: roundForJson(clock.resetValue ?? clock.start),
    direction: 1,
    tick: 0,
    status: "idle"
  };
}
