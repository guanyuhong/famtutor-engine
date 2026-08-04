import type { AngleValue, Point2Value } from "../types.js";

export interface AngleLayout {
  start: number;
  delta: number;
  labelAngle: number;
}

export function angleLayout(value: AngleValue): AngleLayout {
  const start = Math.atan2(value.from.y - value.vertex.y, value.from.x - value.vertex.x);
  const end = Math.atan2(value.to.y - value.vertex.y, value.to.x - value.vertex.x);
  let delta = end - start;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return { start, delta, labelAngle: start + delta / 2 };
}

function estimatedLabelWidth(label: string, fontSize: number): number {
  return [...label].reduce((width, character) => width + (character.codePointAt(0)! > 255 ? 1 : 0.62), 0) * fontSize;
}

export function angleLabelPoint(
  value: AngleValue,
  arcRadius: number,
  label: string,
  fontSize: number,
  pixelsPerUnit: number,
  authoredRadius?: number
): Point2Value {
  const layout = angleLayout(value);
  const halfSweep = Math.max(Math.abs(layout.delta) / 2, 0.08);
  const safeScale = Math.max(pixelsPerUnit, 1);
  const minimumPixels = arcRadius * safeScale + fontSize * 1.2;
  const fitPixels = (estimatedLabelWidth(label, fontSize) * 0.36 + 8) / Math.sin(halfSweep);
  const automaticPixels = Math.min(Math.max(minimumPixels, fitPixels), minimumPixels + fontSize * 4.2);
  const radius = typeof authoredRadius === "number" && Number.isFinite(authoredRadius) && authoredRadius > arcRadius
    ? authoredRadius
    : automaticPixels / safeScale;
  return {
    kind: "point2",
    x: value.vertex.x + Math.cos(layout.labelAngle) * radius,
    y: value.vertex.y + Math.sin(layout.labelAngle) * radius
  };
}
