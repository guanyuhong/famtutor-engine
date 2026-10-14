/** Press-to-drag timing is input semantics, not a callback-count adjustment.
 * Fixed reference: geogebra/geogebra@325faee17884c7ced41d360d0f08ae919a38a955
 * EuclidianConstants.DRAGGING_DELAY and EuclidianController.shouldCancelDrag.
 * A move before the delay is ignored; the first move at/after it is accepted.
 * No timer replays old coordinates when the deadline expires.
 */
export const GEOGEBRA_DRAGGING_DELAY_MS = 100;

export function pointerActivationReady(pressedAtMs: number, nowMs: number, delayMs: number): boolean {
  if (![pressedAtMs, nowMs, delayMs].every(Number.isFinite) || delayMs < 0) {
    throw new TypeError("Pointer activation requires finite times and a nonnegative delay.");
  }
  return nowMs >= pressedAtMs + delayMs;
}
