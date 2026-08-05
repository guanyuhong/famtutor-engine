import { evaluateNumericExpression } from "../expression/evaluator.js";
import { evaluateMathDocument, runtimeValueMap, type EvaluationOverrides } from "../kernel/evaluate.js";
import {
  clipLineToBoundingBox,
  clipRayToBoundingBox,
  conicSamplePoints,
  isAngle,
  isArc,
  isCircle,
  isConic,
  isLine,
  isPoint,
  isPolygon,
  isRay,
  isSector,
  isSegment,
  isVector,
  lineLikeToLine,
  type BoundingBox
} from "../kernel/geometry.js";
import type {
  DirectSvgResult,
  Graphics2DView,
  MathDocument,
  MathEntity,
  RenderReport,
  RuntimeValue,
  ValidationIssue
} from "../types.js";
import { escapeXml, stableHash } from "../util.js";
import { angleLabelPoint, angleLayout } from "./angle-layout.js";
import { estimateLabelSize, layoutPointLabels, type PointLabelPosition } from "./point-label-layout.js";
import { styleForEntity, type ResolvedStyle } from "./style.js";
import { renderDirectSvg3D } from "./direct-svg3d.js";
import { isEntityVisible } from "./visibility.js";
import { isInterval } from "../kernel/interval.js";
import { functionValueAt } from "../kernel/function.js";

export interface DirectSvgOptions {
  viewId?: string;
  width?: number;
  height?: number;
  theme?: "light" | "dark";
  stageId?: string;
  background?: string | null;
  functionSamples?: number;
  curveSamples?: number;
  overrides?: EvaluationOverrides;
}

interface CoordinateTransform {
  x: (value: number) => number;
  y: (value: number) => number;
  point: (value: { x: number; y: number }) => [number, number];
  world: (value: [number, number]) => { x: number; y: number };
  scaleX: number;
  scaleY: number;
}

function graphicsView(document: MathDocument, requested?: string): Graphics2DView {
  const view = document.views.find(candidate => candidate.kind === "graphics2d" && (!requested || candidate.id === requested));
  if (!view || view.kind !== "graphics2d") throw new Error(`Graphics2D view '${requested ?? "default"}' not found.`);
  return view;
}

function transformFor(view: Graphics2DView, width: number, height: number): CoordinateTransform {
  const [xmin, ymax, xmax, ymin] = view.boundingBox;
  const rawScaleX = width / (xmax - xmin);
  const rawScaleY = height / (ymax - ymin);
  const keepAspect = view.keepAspectRatio !== false;
  const scaleX = keepAspect ? Math.min(rawScaleX, rawScaleY) : rawScaleX;
  const scaleY = keepAspect ? Math.min(rawScaleX, rawScaleY) : rawScaleY;
  const contentWidth = (xmax - xmin) * scaleX;
  const contentHeight = (ymax - ymin) * scaleY;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;
  return {
    x: value => offsetX + (value - xmin) * scaleX,
    y: value => offsetY + (ymax - value) * scaleY,
    point: value => [offsetX + (value.x - xmin) * scaleX, offsetY + (ymax - value.y) * scaleY],
    world: value => ({ x: xmin + (value[0] - offsetX) / scaleX, y: ymax - (value[1] - offsetY) / scaleY }),
    scaleX,
    scaleY
  };
}

function niceStep(range: number, target = 10): number {
  const rough = Math.abs(range) / target;
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function styleAttributes(style: ResolvedStyle, fill = "none"): string {
  return [
    `stroke="${escapeXml(style.stroke)}"`,
    `stroke-width="${style.strokeWidth}"`,
    `stroke-linecap="round"`,
    `stroke-linejoin="round"`,
    `fill="${fill}"`,
    `opacity="${style.opacity}"`,
    style.dashArray ? `stroke-dasharray="${style.dashArray}"` : ""
  ].filter(Boolean).join(" ");
}

function stageVisibleEntities(document: MathDocument, stageId?: string): Set<string> | null {
  if (!stageId) return null;
  for (const activity of document.activities ?? []) {
    const stage = activity.stages?.find(candidate => candidate.id === stageId);
    if (!stage) continue;
    const visible = new Set(stage.reveal ?? document.entities.map(entity => entity.id));
    for (const hidden of stage.hide ?? []) visible.delete(hidden);
    return visible;
  }
  return null;
}

function renderGridAndAxes(view: Graphics2DView, transform: CoordinateTransform, width: number, height: number, theme: "light" | "dark"): string {
  const [xmin, ymax, xmax, ymin] = view.boundingBox;
  const parts: string[] = [];
  const gridColor = theme === "dark" ? "#31424f" : "#dfe7ec";
  const axisColor = theme === "dark" ? "#8296a6" : "#6f7f8c";
  if (view.grid) {
    const xStep = niceStep(xmax - xmin, 12);
    const yStep = niceStep(ymax - ymin, 10);
    for (let x = Math.ceil(xmin / xStep) * xStep; x <= xmax + xStep * 1e-9; x += xStep) {
      parts.push(`<line x1="${transform.x(x)}" y1="0" x2="${transform.x(x)}" y2="${height}" stroke="${gridColor}" stroke-width="1"/>`);
    }
    for (let y = Math.ceil(ymin / yStep) * yStep; y <= ymax + yStep * 1e-9; y += yStep) {
      parts.push(`<line x1="0" y1="${transform.y(y)}" x2="${width}" y2="${transform.y(y)}" stroke="${gridColor}" stroke-width="1"/>`);
    }
  }
  if (view.axes) {
    if (xmin <= 0 && xmax >= 0) parts.push(`<line x1="${transform.x(0)}" y1="0" x2="${transform.x(0)}" y2="${height}" stroke="${axisColor}" stroke-width="1.4"/>`);
    if (ymin <= 0 && ymax >= 0) parts.push(`<line x1="0" y1="${transform.y(0)}" x2="${width}" y2="${transform.y(0)}" stroke="${axisColor}" stroke-width="1.4"/>`);
  }
  return parts.join("");
}

function pathFromSamples(samples: Array<[number, number] | null>, jumpThreshold: number): string[] {
  const paths: string[] = [];
  let current = "";
  let previous: [number, number] | null = null;
  for (const sample of samples) {
    if (!sample || (previous && Math.hypot(sample[0] - previous[0], sample[1] - previous[1]) > jumpThreshold)) {
      if (current) paths.push(current);
      current = "";
      previous = null;
      if (!sample) continue;
    }
    current += `${current ? " L" : "M"}${sample[0].toFixed(3)} ${sample[1].toFixed(3)}`;
    previous = sample;
  }
  if (current) paths.push(current);
  return paths;
}

function renderFunction(
  expression: string,
  domain: [number, number],
  values: Map<string, RuntimeValue>,
  transform: CoordinateTransform,
  style: ResolvedStyle,
  entityId: string,
  samplesCount: number,
  height: number
): string {
  const samples: Array<[number, number] | null> = [];
  for (let index = 0; index <= samplesCount; index += 1) {
    const x = domain[0] + (domain[1] - domain[0]) * (index / samplesCount);
    try {
      const y = evaluateNumericExpression(expression, name => name === "x" ? x : values.get(name));
      if (!Number.isFinite(y)) samples.push(null);
      else samples.push([transform.x(x), transform.y(y)]);
    } catch {
      samples.push(null);
    }
  }
  return pathFromSamples(samples, height * 1.25)
    .map(path => `<path data-entity-id="${escapeXml(entityId)}" d="${path}" ${styleAttributes(style)}/>`)
    .join("");
}

function renderPiecewiseFunction(
  value: Extract<RuntimeValue, { kind: "function1" }>,
  values: Map<string, RuntimeValue>,
  transform: CoordinateTransform,
  style: ResolvedStyle,
  entityId: string,
  samplesCount: number,
  height: number,
  theme: "light" | "dark"
): string {
  const branches = value.branches ?? [];
  const curveParts = branches.map(branch => renderFunction(
    branch.expression,
    branch.domain,
    values,
    transform,
    style,
    entityId,
    Math.max(24, Math.round(samplesCount / branches.length)),
    height
  ));
  const endpointParts: string[] = [];
  for (const branch of branches) {
    for (const [x, closed] of [[branch.domain[0], branch.lowerClosed], [branch.domain[1], branch.upperClosed]] as Array<[number, boolean]>) {
      try {
        const y = evaluateNumericExpression(branch.expression, name => name === "x" ? x : values.get(name));
        if (!Number.isFinite(y)) continue;
        const [cx, cy] = transform.point({ x, y });
        endpointParts.push(`<circle data-piecewise-endpoint-for="${escapeXml(entityId)}" cx="${cx}" cy="${cy}" r="4" fill="${closed ? escapeXml(style.fill) : theme === "dark" ? "#111820" : "#ffffff"}" stroke="${escapeXml(style.stroke)}" stroke-width="2"/>`);
      } catch { /* invalid dynamic branch samples are already reported by evaluation */ }
    }
  }
  return curveParts.join("") + endpointParts.join("");
}

function renderFunctionRegion(
  value: Extract<RuntimeValue, { kind: "region2" }>,
  values: Map<string, RuntimeValue>,
  transform: CoordinateTransform,
  style: ResolvedStyle,
  entityId: string,
  samplesCount: number,
  height: number
): string {
  const samples: Array<[number, number] | null> = [];
  for (let index = 0; index <= samplesCount; index += 1) {
    const x = value.domain[0] + (value.domain[1] - value.domain[0]) * (index / samplesCount);
    try {
      const y = functionValueAt(value.boundary, x, name => values.get(name));
      samples.push(Number.isFinite(y) ? [transform.x(x), Math.max(0, Math.min(height, transform.y(y)))] : null);
    } catch {
      samples.push(null);
    }
  }
  const edgeY = value.relation === "above" ? 0 : height;
  return pathFromSamples(samples, height * 1.25).map(boundaryPath => {
    const coordinates = [...boundaryPath.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)];
    if (coordinates.length < 2) return "";
    const firstX = coordinates[0]![1];
    const lastX = coordinates.at(-1)![1];
    const areaPath = `${boundaryPath} L${lastX} ${edgeY} L${firstX} ${edgeY} Z`;
    const dash = value.boundaryIncluded ? style : { ...style, dashArray: "8 6" };
    return `<path data-entity-id="${escapeXml(entityId)}" d="${areaPath}" fill="${escapeXml(style.fill)}" fill-opacity="${style.fillOpacity}" stroke="none"/><path data-region-boundary-for="${escapeXml(entityId)}" d="${boundaryPath}" ${styleAttributes(dash)}/>`;
  }).join("");
}

function renderParametricCurve(
  xExpression: string,
  yExpression: string,
  parameter: string,
  domain: [number, number],
  values: Map<string, RuntimeValue>,
  transform: CoordinateTransform,
  style: ResolvedStyle,
  entityId: string,
  samplesCount: number,
  height: number
): string {
  const samples: Array<[number, number] | null> = [];
  for (let index = 0; index <= samplesCount; index += 1) {
    const t = domain[0] + (domain[1] - domain[0]) * (index / samplesCount);
    const resolver = (name: string) => name === parameter ? t : values.get(name);
    try {
      const x = evaluateNumericExpression(xExpression, resolver);
      const y = evaluateNumericExpression(yExpression, resolver);
      samples.push(Number.isFinite(x) && Number.isFinite(y) ? [transform.x(x), transform.y(y)] : null);
    } catch {
      samples.push(null);
    }
  }
  return pathFromSamples(samples, height * 1.25)
    .map(path => `<path data-entity-id="${escapeXml(entityId)}" d="${path}" ${styleAttributes(style)}/>`)
    .join("");
}

function renderAngle(
  value: Extract<RuntimeValue, { kind: "angle" }>,
  transform: CoordinateTransform,
  style: ResolvedStyle,
  entity: MathEntity,
  document: MathDocument,
  theme: "light" | "dark"
): string {
  const { start, delta } = angleLayout(value);
  const producer = document.construction.find(node => node.outputs.includes(entity.id));
  const authoredRadius = producer?.command === "angle.three_points" ? producer.params?.radius : undefined;
  const radius = typeof authoredRadius === "number" && Number.isFinite(authoredRadius) && authoredRadius > 0
    ? authoredRadius
    : 0.6;
  const points: string[] = [];
  for (let index = 0; index <= 24; index += 1) {
    const angle = start + delta * (index / 24);
    const [x, y] = transform.point({ x: value.vertex.x + Math.cos(angle) * radius, y: value.vertex.y + Math.sin(angle) * radius });
    points.push(`${x.toFixed(3)},${y.toFixed(3)}`);
  }
  const [vertexX, vertexY] = transform.point(value.vertex);
  const sectorPath = `M${vertexX.toFixed(3)} ${vertexY.toFixed(3)} L${points.join(" L")} Z`;
  const sector = `<path data-angle-fill-for="${escapeXml(entity.id)}" d="${sectorPath}" fill="${escapeXml(style.fill)}" fill-opacity="${style.fillOpacity}" stroke="none"/>`;
  const arc = `<polyline data-entity-id="${escapeXml(entity.id)}" points="${points.join(" ")}" ${styleAttributes(style)}/>`;
  const shape = `${sector}${arc}`;
  if (!style.labelVisible || !entity.label) return shape;
  const authoredLabelRadius = producer?.command === "angle.three_points" ? producer.params?.labelRadius : undefined;
  const labelPoint = angleLabelPoint(
    value,
    radius,
    entity.label,
    style.fontSize,
    Math.min(transform.scaleX, transform.scaleY),
    typeof authoredLabelRadius === "number" ? authoredLabelRadius : undefined
  );
  const [labelX, labelY] = transform.point(labelPoint);
  const outline = theme === "dark" ? "#111820" : "#ffffff";
  const label = `<text data-label-for="${escapeXml(entity.id)}" x="${labelX}" y="${labelY}" fill="${escapeXml(style.stroke)}" font-size="${style.fontSize}" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="${outline}" stroke-width="4" stroke-linejoin="round">${escapeXml(entity.label)}</text>`;
  return `${shape}${label}`;
}

function renderCenteredLabel(
  entity: MathEntity,
  x: number,
  y: number,
  style: ResolvedStyle,
  theme: "light" | "dark",
  attributes = ""
): string {
  if (!style.labelVisible || !entity.label) return "";
  return `<text data-label-for="${escapeXml(entity.id)}" ${attributes} x="${x}" y="${y}" fill="${escapeXml(style.stroke)}" font-size="${style.fontSize}" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="${theme === "dark" ? "#111820" : "#ffffff"}" stroke-width="3" stroke-linejoin="round">${escapeXml(entity.label)}</text>`;
}

function renderInterval(
  value: Extract<RuntimeValue, { kind: "interval1" }>,
  entity: MathEntity,
  view: Graphics2DView,
  transform: CoordinateTransform,
  style: ResolvedStyle,
  theme: "light" | "dark"
): string {
  const [xmin, , xmax] = view.boundingBox;
  const range = xmax - xmin;
  const inset = Math.max(range * 0.025, 0.12);
  const start = value.lower ?? xmin + inset;
  const end = value.upper ?? xmax - inset;
  const y = transform.y(value.y);
  const openFill = view.background ?? (theme === "dark" ? "#111820" : "#ffffff");
  const id = escapeXml(entity.id);
  if (value.empty) {
    const x = transform.x((xmin + xmax) / 2);
    return `<text data-entity-id="${id}" x="${x}" y="${y}" fill="${escapeXml(style.stroke)}" font-size="${style.fontSize + 4}" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="middle">∅</text>`;
  }

  const startX = transform.x(start);
  const endX = transform.x(end);
  const markers = [
    value.lower === null ? `marker-start="url(#fme-arrow)"` : "",
    value.upper === null ? `marker-end="url(#fme-arrow)"` : ""
  ].filter(Boolean).join(" ");
  const line = Math.abs(endX - startX) > 0.01
    ? `<line data-entity-id="${id}" x1="${startX}" y1="${y}" x2="${endX}" y2="${y}" ${styleAttributes(style)} ${markers}/>`
    : "";
  const endpoint = (at: number, closed: boolean, side: "lower" | "upper") => {
    const x = transform.x(at);
    return `<circle data-interval-endpoint="${side}" data-entity-id="${id}" cx="${x}" cy="${y}" r="${style.pointSize}" fill="${escapeXml(closed ? style.fill : openFill)}" stroke="${escapeXml(style.stroke)}" stroke-width="${Math.max(1.5, style.strokeWidth * 0.75)}" opacity="${style.opacity}"/>`;
  };
  const endpoints = [
    value.lower === null ? "" : endpoint(value.lower, value.lowerClosed, "lower"),
    value.upper === null || (value.lower !== null && value.upper === value.lower) ? "" : endpoint(value.upper, value.upperClosed, "upper")
  ].join("");
  const midpoint = (startX + endX) / 2;
  const label = renderCenteredLabel(entity, midpoint + style.labelOffset[0], y - 22 + style.labelOffset[1], style, theme, `data-label-kind="interval"`);
  return `${line}${endpoints}${label}`;
}

function renderLinearLabel(
  entity: MathEntity,
  from: [number, number],
  to: [number, number],
  style: ResolvedStyle,
  theme: "light" | "dark"
): string {
  if (!style.labelVisible || !entity.label) return "";
  const fraction = Math.min(1, Math.max(0, style.lineLabelPosition));
  const anchorX = from[0] + (to[0] - from[0]) * fraction;
  const anchorY = from[1] + (to[1] - from[1]) * fraction;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return "";
  const size = estimateLabelSize(entity.label, style.fontSize);
  const side = style.lineLabelSide === "left" ? 1 : -1;
  const distance = style.lineLabelDistance * size.height * 0.5;
  const normalX = side * dy / length;
  const normalY = side * -dx / length;
  return renderCenteredLabel(
    entity,
    anchorX + normalX * distance + style.labelOffset[0],
    anchorY + normalY * distance + style.labelOffset[1],
    style,
    theme,
    `data-label-kind="path" data-label-position="${fraction}" data-label-side="${style.lineLabelSide}"`
  );
}

function polygonCentroid(vertices: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (vertices.length === 0) return { x: 0, y: 0 };
  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    weightedX += (current.x + next.x) * cross;
    weightedY += (current.y + next.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    return {
      x: vertices.reduce((sum, vertex) => sum + vertex.x, 0) / vertices.length,
      y: vertices.reduce((sum, vertex) => sum + vertex.y, 0) / vertices.length
    };
  }
  return { x: weightedX / (3 * twiceArea), y: weightedY / (3 * twiceArea) };
}

function renderArc(value: Extract<RuntimeValue, { kind: "arc2" }>, transform: CoordinateTransform, style: ResolvedStyle, entityId: string): string {
  const start = value.startAngle;
  const end = value.endAngle;
  let sweep = end - start;
  while (sweep <= 0) sweep += Math.PI * 2;
  while (sweep > Math.PI * 2) sweep -= Math.PI * 2;
  const samples: Array<[number, number]> = [];
  const count = Math.max(24, Math.ceil((sweep / (Math.PI * 2)) * 64));
  for (let index = 0; index <= count; index += 1) {
    const angle = start + sweep * (index / count);
    samples.push(transform.point({
      x: value.center.x + value.radius * Math.cos(angle),
      y: value.center.y + value.radius * Math.sin(angle)
    }));
  }
  const d = samples.map((sample, index) => `${index === 0 ? "M" : "L"}${sample[0].toFixed(3)} ${sample[1].toFixed(3)}`).join(" ");
  return `<path data-entity-id="${escapeXml(entityId)}" d="${d}" ${styleAttributes(style)}/>`;
}

function renderSector(value: Extract<RuntimeValue, { kind: "sector2" }>, transform: CoordinateTransform, style: ResolvedStyle, entityId: string): string {
  const arc = value.arc;
  const [cx, cy] = transform.point(arc.center);
  const start = arc.startAngle;
  const end = arc.endAngle;
  let sweep = end - start;
  while (sweep <= 0) sweep += Math.PI * 2;
  while (sweep > Math.PI * 2) sweep -= Math.PI * 2;
  const samples: Array<[number, number]> = [[cx, cy]];
  const count = Math.max(24, Math.ceil((sweep / (Math.PI * 2)) * 64));
  for (let index = 0; index <= count; index += 1) {
    const angle = start + sweep * (index / count);
    samples.push(transform.point({
      x: arc.center.x + arc.radius * Math.cos(angle),
      y: arc.center.y + arc.radius * Math.sin(angle)
    }));
  }
  samples.push([cx, cy]);
  const d = samples.map((sample, index) => `${index === 0 ? "M" : "L"}${sample[0].toFixed(3)} ${sample[1].toFixed(3)}`).join(" ");
  return `<path data-entity-id="${escapeXml(entityId)}" d="${d}" ${styleAttributes(style, style.fill)} fill-opacity="${style.fillOpacity}"/>`;
}

function renderConic(value: Extract<RuntimeValue, { kind: "conic2" }>, transform: CoordinateTransform, style: ResolvedStyle, entityId: string, height: number): string {
  const samples = conicSamplePoints(value, value.conicKind === "ellipse" ? 180 : 160)
    .map(sample => transform.point(sample) as [number, number] | null);
  return pathFromSamples(samples, height * 1.25)
    .map(path => `<path data-entity-id="${escapeXml(entityId)}" d="${path}" ${styleAttributes(style)}/>`)
    .join("");
}

function renderEntity(
  entity: MathEntity,
  value: RuntimeValue,
  document: MathDocument,
  view: Graphics2DView,
  transform: CoordinateTransform,
  options: Required<Pick<DirectSvgOptions, "theme" | "functionSamples" | "curveSamples">>,
  values: Map<string, RuntimeValue>,
  height: number
): string {
  const style = styleForEntity(document, entity, options.theme);
  const id = escapeXml(entity.id);
  if (value && typeof value === "object" && value.kind === "collection") {
    return value.items.map((item, index) => {
      const child: MathEntity = {
        ...entity,
        id: `${entity.id}[${index}]`,
        type: value.itemType,
        label: undefined
      };
      if (value.itemType === "point2") return renderPointAndLabel(child, item, document, transform, options.theme);
      return renderEntity(child, item, document, view, transform, options, values, height);
    }).join("");
  }
  if (isLine(value)) {
    const clipped = clipLineToBoundingBox(value, view.boundingBox);
    if (!clipped) return "";
    const [a, b] = clipped.map(transform.point) as [[number, number], [number, number]];
    return `<line data-entity-id="${id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${styleAttributes(style)}/>${renderLinearLabel(entity, a, b, style, options.theme)}`;
  }
  if (isInterval(value)) return renderInterval(value, entity, view, transform, style, options.theme);
  if (isRay(value)) {
    const clipped = clipRayToBoundingBox(value, view.boundingBox);
    if (!clipped) return "";
    const [a, b] = clipped.map(transform.point) as [[number, number], [number, number]];
    return `<line data-entity-id="${id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${styleAttributes(style)} marker-end="url(#fme-arrow)"/>${renderLinearLabel(entity, a, b, style, options.theme)}`;
  }
  if (isSegment(value)) {
    const [a, b] = [transform.point(value.from), transform.point(value.to)];
    return `<line data-entity-id="${id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${styleAttributes(style)}/>${renderLinearLabel(entity, a, b, style, options.theme)}`;
  }
  if (isVector(value)) return "";
  if (isCircle(value)) {
    const [cx, cy] = transform.point(value.center);
    return `<ellipse data-entity-id="${id}" cx="${cx}" cy="${cy}" rx="${value.radius * transform.scaleX}" ry="${value.radius * transform.scaleY}" ${styleAttributes(style, style.fill)} fill-opacity="${style.fillOpacity}"/>`;
  }
  if (isArc(value)) return renderArc(value, transform, style, entity.id);
  if (isSector(value)) return renderSector(value, transform, style, entity.id);
  if (isConic(value)) return renderConic(value, transform, style, entity.id, height);
  if (isPolygon(value)) {
    const points = value.vertices.map(vertex => transform.point(vertex).map(item => item.toFixed(3)).join(",")).join(" ");
    const centroid = transform.point(polygonCentroid(value.vertices));
    const label = renderCenteredLabel(
      entity,
      centroid[0] + style.labelOffset[0],
      centroid[1] + style.labelOffset[1],
      style,
      options.theme,
      `data-label-kind="polygon"`
    );
    return `<polygon data-entity-id="${id}" points="${points}" ${styleAttributes(style, style.fill)} fill-opacity="${style.fillOpacity}"/>${label}`;
  }
  if (isAngle(value)) return renderAngle(value, transform, style, entity, document, options.theme);
  if (value && typeof value === "object" && value.kind === "function1") {
    if (value.branches) return renderPiecewiseFunction(value, values, transform, style, entity.id, options.functionSamples, height, options.theme);
    return renderFunction(value.expression, value.domain, values, transform, style, entity.id, options.functionSamples, height);
  }
  if (value && typeof value === "object" && value.kind === "region2") {
    return renderFunctionRegion(value, values, transform, style, entity.id, options.functionSamples, height);
  }
  if (value && typeof value === "object" && value.kind === "curve2") {
    return renderParametricCurve(value.xExpression, value.yExpression, value.parameter, value.domain, values, transform, style, entity.id, options.curveSamples, height);
  }
  if (value && typeof value === "object" && value.kind === "text") {
    const [x, y] = transform.point(value.at);
    return `<text data-entity-id="${id}" x="${x}" y="${y}" fill="${escapeXml(style.stroke)}" font-size="${style.fontSize}" font-family="system-ui, sans-serif">${escapeXml(value.text)}</text>`;
  }
  return "";
}

function renderPointAndLabel(
  entity: MathEntity,
  value: RuntimeValue,
  document: MathDocument,
  transform: CoordinateTransform,
  theme: "light" | "dark",
  labelPosition?: PointLabelPosition
): string {
  if (!isPoint(value)) return "";
  const style = styleForEntity(document, entity, theme);
  const [x, y] = transform.point(value);
  const label = style.labelVisible && entity.label && labelPosition
    ? `<text data-label-for="${escapeXml(entity.id)}" data-label-placement="${labelPosition.placement}" x="${labelPosition.x}" y="${labelPosition.y}" fill="${escapeXml(style.stroke)}" font-size="${style.fontSize}" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="${theme === "dark" ? "#111820" : "#ffffff"}" stroke-width="3" stroke-linejoin="round">${escapeXml(entity.label)}</text>`
    : "";
  return `<circle data-entity-id="${escapeXml(entity.id)}" cx="${x}" cy="${y}" r="${style.pointSize}" fill="${escapeXml(style.fill)}" stroke="${escapeXml(style.stroke)}" stroke-width="1.5" opacity="${style.opacity}"/>${label}`;
}

function renderDirectSvg2D(document: MathDocument, options: DirectSvgOptions = {}): DirectSvgResult {
  const width = Math.max(64, Math.floor(options.width ?? 960));
  const height = Math.max(64, Math.floor(options.height ?? 640));
  const theme = options.theme ?? "light";
  const view = graphicsView(document, options.viewId);
  const transform = transformFor(view, width, height);
  const evaluation = evaluateMathDocument(document, options.overrides);
  const values = runtimeValueMap(evaluation);
  const stageVisible = stageVisibleEntities(document, options.stageId);
  const selectedIds = new Set(view.entityIds ?? document.entities.map(entity => entity.id));
  const visibleIds = new Set(document.entities
    .filter(entity => selectedIds.has(entity.id) && isEntityVisible(entity, id => values.get(id)) && (!stageVisible || stageVisible.has(entity.id)))
    .map(entity => entity.id));
  const pointLabels = layoutPointLabels(document, values, visibleIds, {
    width,
    height,
    pixelsPerUnit: Math.min(transform.scaleX, transform.scaleY),
    toScreen: transform.point,
    toWorld: transform.world
  }, theme);
  const renderedEntities: string[] = [];
  const skippedEntities: Array<{ id: string; reason: string }> = [];
  const warnings: ValidationIssue[] = [...evaluation.issues];
  const shapeParts: string[] = [];
  const pointParts: string[] = [];

  const layerOrder: Record<string, number> = {
    region2: 5,
    function1: 10,
    curve2: 10,
    collection: 25,
    conic2: 15,
    line2: 20,
    ray2: 20,
    circle2: 30,
    arc2: 32,
    sector2: 33,
    polygon2: 30,
    segment2: 40,
    angle: 45,
    text: 60,
    interval1: 35,
    point2: 70,
    vector2: 40,
    transform2: 0,
    scalar: 0,
    boolean: 0
  };
  const entities = [...document.entities].sort((left, right) => (layerOrder[left.type] ?? 50) - (layerOrder[right.type] ?? 50));

  for (const entity of entities) {
    if (!selectedIds.has(entity.id) || !isEntityVisible(entity, id => values.get(id)) || (stageVisible && !stageVisible.has(entity.id))) continue;
    const runtime = evaluation.entities.get(entity.id);
    if (!runtime?.defined || runtime.value === undefined) {
      skippedEntities.push({ id: entity.id, reason: runtime?.issue?.message ?? "undefined" });
      continue;
    }
    if (entity.type === "point2") {
      const output = renderPointAndLabel(entity, runtime.value, document, transform, theme, pointLabels.get(entity.id));
      if (output) {
        pointParts.push(output);
        renderedEntities.push(entity.id);
      }
      continue;
    }
    const output = renderEntity(entity, runtime.value, document, view, transform, {
      theme,
      functionSamples: Math.max(32, options.functionSamples ?? 320),
      curveSamples: Math.max(32, options.curveSamples ?? 320)
    }, values, height);
    if (output) {
      shapeParts.push(output);
      renderedEntities.push(entity.id);
    } else if (!["scalar", "boolean", "vector2", "transform2"].includes(entity.type)) {
      skippedEntities.push({ id: entity.id, reason: `Direct SVG has no visible primitive for ${entity.type}.` });
    }
  }

  const background = options.background === null
    ? ""
    : `<rect width="100%" height="100%" fill="${escapeXml(options.background ?? view.background ?? (theme === "dark" ? "#111820" : "#ffffff"))}"/>`;
  const description = document.metadata.description ?? document.metadata.title;
  const content = `${background}${renderGridAndAxes(view, transform, width, height, theme)}${shapeParts.join("")}${pointParts.join("")}`;
  const renderHash = stableHash({ document, viewId: view.id, width, height, theme, stageId: options.stageId ?? null, content });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="fme-title fme-desc" data-document-id="${escapeXml(document.documentId)}" data-revision="${document.revision}" data-render-hash="${renderHash}"><title id="fme-title">${escapeXml(document.metadata.title)}</title><desc id="fme-desc">${escapeXml(description)}</desc><defs><marker id="fme-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>${content}</svg>`;

  const report: RenderReport = {
    backend: "direct-svg",
    viewId: view.id,
    width,
    height,
    renderedEntities,
    skippedEntities,
    warnings,
    renderHash
  };
  return { svg, report };
}

export function renderDirectSvg(document: MathDocument, options: DirectSvgOptions = {}): DirectSvgResult {
  const requested = options.viewId ? document.views.find(view => view.id === options.viewId) : undefined;
  const default3D = !requested && !document.views.some(view => view.kind === "graphics2d") && document.views.some(view => view.kind === "graphics3d");
  if (requested?.kind === "graphics3d" || default3D) return renderDirectSvg3D(document, options);
  return renderDirectSvg2D(document, options);
}
