import {
  isAngle,
  isPoint,
  isPolygon,
  isSegment
} from "../kernel/geometry.js";
import type { MathDocument, RuntimeValue } from "../types.js";
import { angleLabelPoint } from "./angle-layout.js";
import { styleForEntity } from "./style.js";

export type PointLabelPlacement =
  | "auto"
  | "manual"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left"
  | "top-left";

export interface LabelViewport {
  width: number;
  height: number;
  pixelsPerUnit: number;
  toScreen: (point: { x: number; y: number }) => [number, number];
  toWorld: (screen: [number, number]) => { x: number; y: number };
}

export interface PointLabelPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  placement: PointLabelPlacement;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  weight: number;
}

interface ScreenSegment {
  from: [number, number];
  to: [number, number];
}

type ScreenPolygon = Array<[number, number]>;

const AUTO_ORDER: Exclude<PointLabelPlacement, "auto" | "manual">[] = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
  "right",
  "left",
  "top",
  "bottom"
];

export function estimateLabelSize(text: string, fontSize: number): { width: number; height: number } {
  let units = 0;
  for (const character of text) {
    if (/\p{Script=Han}/u.test(character)) units += 1;
    else if (/[ilI1.,'°]/.test(character)) units += 0.35;
    else if (/[MW@%]/.test(character)) units += 0.9;
    else units += 0.62;
  }
  return {
    width: Math.max(fontSize * 0.7, units * fontSize),
    height: fontSize * 1.2
  };
}

function rectAt(x: number, y: number, width: number, height: number, weight = 1): Rect {
  return {
    left: x - width / 2,
    top: y - height / 2,
    right: x + width / 2,
    bottom: y + height / 2,
    weight
  };
}

function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function pointInsideRect(point: [number, number], rect: Rect): boolean {
  return point[0] >= rect.left && point[0] <= rect.right && point[1] >= rect.top && point[1] <= rect.bottom;
}

function orientation(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
}

function segmentsIntersect(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return (o1 === 0 || o2 === 0 || Math.sign(o1) !== Math.sign(o2))
    && (o3 === 0 || o4 === 0 || Math.sign(o3) !== Math.sign(o4));
}

function segmentHitsRect(segment: ScreenSegment, rect: Rect): boolean {
  if (pointInsideRect(segment.from, rect) || pointInsideRect(segment.to, rect)) return true;
  const topLeft: [number, number] = [rect.left, rect.top];
  const topRight: [number, number] = [rect.right, rect.top];
  const bottomRight: [number, number] = [rect.right, rect.bottom];
  const bottomLeft: [number, number] = [rect.left, rect.bottom];
  return segmentsIntersect(segment.from, segment.to, topLeft, topRight)
    || segmentsIntersect(segment.from, segment.to, topRight, bottomRight)
    || segmentsIntersect(segment.from, segment.to, bottomRight, bottomLeft)
    || segmentsIntersect(segment.from, segment.to, bottomLeft, topLeft);
}

function pointInsidePolygon(point: [number, number], polygon: ScreenPolygon): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current]!;
    const b = polygon[previous]!;
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function candidateCenter(
  placement: Exclude<PointLabelPlacement, "auto" | "manual">,
  point: [number, number],
  size: { width: number; height: number },
  pointSize: number,
  offset: [number, number]
): [number, number] {
  const gap = pointSize + 7;
  const horizontal = gap + size.width / 2;
  const vertical = gap + size.height / 2;
  const centers: Record<Exclude<PointLabelPlacement, "auto" | "manual">, [number, number]> = {
    top: [point[0], point[1] - vertical],
    "top-right": [point[0] + horizontal, point[1] - vertical],
    right: [point[0] + horizontal, point[1]],
    "bottom-right": [point[0] + horizontal, point[1] + vertical],
    bottom: [point[0], point[1] + vertical],
    "bottom-left": [point[0] - horizontal, point[1] + vertical],
    left: [point[0] - horizontal, point[1]],
    "top-left": [point[0] - horizontal, point[1] - vertical]
  };
  const center = centers[placement];
  return [center[0] + offset[0], center[1] + offset[1]];
}

function scoreCandidate(
  rect: Rect,
  viewport: LabelViewport,
  obstructions: Rect[],
  segments: ScreenSegment[],
  polygons: ScreenPolygon[],
  preferenceIndex: number
): number {
  // The candidate rectangle already includes a readability pad. Penalize only
  // actual clipping here; an additional inset incorrectly pushes apex labels
  // into a polygon when the visible text still fits above the point.
  const margin = 0;
  const outside = Math.max(0, margin - rect.left)
    + Math.max(0, margin - rect.top)
    + Math.max(0, rect.right - (viewport.width - margin))
    + Math.max(0, rect.bottom - (viewport.height - margin));
  let score = outside * 10_000 + preferenceIndex;
  for (const obstruction of obstructions) {
    score += intersectionArea(rect, obstruction) * obstruction.weight;
  }
  for (const segment of segments) {
    if (segmentHitsRect(segment, rect)) score += 2_500;
  }
  const center: [number, number] = [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];
  for (const polygon of polygons) {
    if (pointInsidePolygon(center, polygon)) score += 4_000;
  }
  return score;
}

function producerParams(document: MathDocument, entityId: string): Record<string, unknown> | undefined {
  return document.construction.find(node => node.outputs.includes(entityId))?.params;
}

/**
 * Deterministically lays out point labels in screen space. It is shared by Direct SVG and
 * JSXGraph so collision avoidance has the same semantics in static and mounted renderers.
 */
export function layoutPointLabels(
  document: MathDocument,
  values: Map<string, RuntimeValue>,
  visibleIds: Set<string>,
  viewport: LabelViewport,
  theme: "light" | "dark" = "light"
): Map<string, PointLabelPosition> {
  const obstructions: Rect[] = [];
  const segments: ScreenSegment[] = [];
  const polygons: ScreenPolygon[] = [];
  const result = new Map<string, PointLabelPosition>();

  for (const entity of document.entities) {
    if (!visibleIds.has(entity.id)) continue;
    const value = values.get(entity.id);
    if (!value) continue;
    if (isPoint(value)) {
      const style = styleForEntity(document, entity, theme);
      const [x, y] = viewport.toScreen(value);
      obstructions.push(rectAt(x, y, style.pointSize * 2 + 4, style.pointSize * 2 + 4, 24));
    } else if (isSegment(value)) {
      segments.push({ from: viewport.toScreen(value.from), to: viewport.toScreen(value.to) });
    } else if (isPolygon(value)) {
      const points = value.vertices.map(viewport.toScreen);
      if (entity.role !== "annotation" && points.length >= 3) polygons.push(points);
      for (let index = 0; index < points.length; index += 1) {
        segments.push({ from: points[index]!, to: points[(index + 1) % points.length]! });
      }
      if (entity.role === "annotation" && points.length > 0) {
        const xs = points.map(point => point[0]);
        const ys = points.map(point => point[1]);
        obstructions.push({
          left: Math.min(...xs) - 4,
          top: Math.min(...ys) - 4,
          right: Math.max(...xs) + 4,
          bottom: Math.max(...ys) + 4,
          weight: 60
        });
      }
    } else if (isAngle(value)) {
      const style = styleForEntity(document, entity, theme);
      const params = producerParams(document, entity.id);
      const radius = typeof params?.radius === "number" && params.radius > 0 ? params.radius : 0.6;
      const [vertexX, vertexY] = viewport.toScreen(value.vertex);
      const radiusPixels = radius * viewport.pixelsPerUnit + 4;
      obstructions.push(rectAt(vertexX, vertexY, radiusPixels * 2, radiusPixels * 2, 12));
      if (entity.label && style.labelVisible) {
        const authoredLabelRadius = typeof params?.labelRadius === "number" ? params.labelRadius : undefined;
        const world = angleLabelPoint(value, radius, entity.label, style.fontSize, viewport.pixelsPerUnit, authoredLabelRadius);
        const [x, y] = viewport.toScreen(world);
        const size = estimateLabelSize(entity.label, style.fontSize);
        obstructions.push(rectAt(x, y, size.width + 8, size.height + 6, 50));
      }
    }
  }

  for (const entity of document.entities) {
    if (!visibleIds.has(entity.id) || entity.type !== "point2" || !entity.label) continue;
    const value = values.get(entity.id);
    if (!isPoint(value)) continue;
    const style = styleForEntity(document, entity, theme);
    if (!style.labelVisible) continue;
    const point = viewport.toScreen(value);
    const size = estimateLabelSize(entity.label, style.fontSize);

    if (style.labelPlacement === "manual") {
      const x = point[0] + style.labelOffset[0];
      const y = point[1] + style.labelOffset[1];
      result.set(entity.id, { x, y, ...size, placement: "manual" });
      obstructions.push(rectAt(x, y, size.width + 6, size.height + 4, 80));
      continue;
    }

    const placements = style.labelPlacement === "auto" ? AUTO_ORDER : [style.labelPlacement];
    let best: { x: number; y: number; placement: PointLabelPlacement; score: number } | undefined;
    placements.forEach((placement, index) => {
      const [x, y] = candidateCenter(placement, point, size, style.pointSize, style.labelOffset);
      const rect = rectAt(x, y, size.width + 6, size.height + 4);
      const score = scoreCandidate(rect, viewport, obstructions, segments, polygons, index);
      if (!best || score < best.score) best = { x, y, placement, score };
    });
    if (!best) continue;
    result.set(entity.id, { x: best.x, y: best.y, ...size, placement: best.placement });
    obstructions.push(rectAt(best.x, best.y, size.width + 6, size.height + 4, 80));
  }

  return result;
}
