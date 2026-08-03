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
import { styleForEntity, type ResolvedStyle } from "./style.js";

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

function renderAngle(value: Extract<RuntimeValue, { kind: "angle" }>, transform: CoordinateTransform, style: ResolvedStyle, entityId: string): string {
  const start = Math.atan2(value.from.y - value.vertex.y, value.from.x - value.vertex.x);
  const end = Math.atan2(value.to.y - value.vertex.y, value.to.x - value.vertex.x);
  let delta = end - start;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const radius = 0.5;
  const points: string[] = [];
  for (let index = 0; index <= 24; index += 1) {
    const angle = start + delta * (index / 24);
    const [x, y] = transform.point({ x: value.vertex.x + Math.cos(angle) * radius, y: value.vertex.y + Math.sin(angle) * radius });
    points.push(`${x.toFixed(3)},${y.toFixed(3)}`);
  }
  return `<polyline data-entity-id="${escapeXml(entityId)}" points="${points.join(" ")}" ${styleAttributes(style)}/>`;
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
  if (isLine(value)) {
    const clipped = clipLineToBoundingBox(value, view.boundingBox);
    if (!clipped) return "";
    const [a, b] = clipped.map(transform.point) as [[number, number], [number, number]];
    return `<line data-entity-id="${id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${styleAttributes(style)}/>`;
  }
  if (isRay(value)) {
    const clipped = clipRayToBoundingBox(value, view.boundingBox);
    if (!clipped) return "";
    const [a, b] = clipped.map(transform.point) as [[number, number], [number, number]];
    return `<line data-entity-id="${id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${styleAttributes(style)} marker-end="url(#fme-arrow)"/>`;
  }
  if (isSegment(value)) {
    const [a, b] = [transform.point(value.from), transform.point(value.to)];
    return `<line data-entity-id="${id}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${styleAttributes(style)}/>`;
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
    return `<polygon data-entity-id="${id}" points="${points}" ${styleAttributes(style, style.fill)} fill-opacity="${style.fillOpacity}"/>`;
  }
  if (isAngle(value)) return renderAngle(value, transform, style, entity.id);
  if (value && typeof value === "object" && value.kind === "function1") {
    return renderFunction(value.expression, value.domain, values, transform, style, entity.id, options.functionSamples, height);
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

function renderPointAndLabel(entity: MathEntity, value: RuntimeValue, document: MathDocument, transform: CoordinateTransform, theme: "light" | "dark"): string {
  if (!isPoint(value)) return "";
  const style = styleForEntity(document, entity, theme);
  const [x, y] = transform.point(value);
  const label = style.labelVisible && entity.label
    ? `<text data-label-for="${escapeXml(entity.id)}" x="${x + style.pointSize + 5}" y="${y - style.pointSize - 4}" fill="${escapeXml(style.stroke)}" font-size="${style.fontSize}" font-family="system-ui, sans-serif" paint-order="stroke" stroke="${theme === "dark" ? "#111820" : "#ffffff"}" stroke-width="3" stroke-linejoin="round">${escapeXml(entity.label)}</text>`
    : "";
  return `<circle data-entity-id="${escapeXml(entity.id)}" cx="${x}" cy="${y}" r="${style.pointSize}" fill="${escapeXml(style.fill)}" stroke="${escapeXml(style.stroke)}" stroke-width="1.5" opacity="${style.opacity}"/>${label}`;
}

export function renderDirectSvg(document: MathDocument, options: DirectSvgOptions = {}): DirectSvgResult {
  const width = Math.max(64, Math.floor(options.width ?? 960));
  const height = Math.max(64, Math.floor(options.height ?? 640));
  const theme = options.theme ?? "light";
  const view = graphicsView(document, options.viewId);
  const transform = transformFor(view, width, height);
  const evaluation = evaluateMathDocument(document, options.overrides);
  const values = runtimeValueMap(evaluation);
  const stageVisible = stageVisibleEntities(document, options.stageId);
  const selectedIds = new Set(view.entityIds ?? document.entities.map(entity => entity.id));
  const renderedEntities: string[] = [];
  const skippedEntities: Array<{ id: string; reason: string }> = [];
  const warnings: ValidationIssue[] = [...evaluation.issues];
  const shapeParts: string[] = [];
  const pointParts: string[] = [];

  const layerOrder: Record<string, number> = {
    function1: 10,
    curve2: 10,
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
    point2: 70,
    vector2: 40,
    transform2: 0,
    scalar: 0,
    boolean: 0
  };
  const entities = [...document.entities].sort((left, right) => (layerOrder[left.type] ?? 50) - (layerOrder[right.type] ?? 50));

  for (const entity of entities) {
    if (!selectedIds.has(entity.id) || entity.visible === false || (stageVisible && !stageVisible.has(entity.id))) continue;
    const runtime = evaluation.entities.get(entity.id);
    if (!runtime?.defined || runtime.value === undefined) {
      skippedEntities.push({ id: entity.id, reason: runtime?.issue?.message ?? "undefined" });
      continue;
    }
    if (entity.type === "point2") {
      const output = renderPointAndLabel(entity, runtime.value, document, transform, theme);
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
    : `<rect width="100%" height="100%" fill="${escapeXml(options.background ?? (theme === "dark" ? "#111820" : "#ffffff"))}"/>`;
  const description = document.metadata.description ?? document.metadata.title;
  const content = `${background}${renderGridAndAxes(view, transform, width, height, theme)}${shapeParts.join("")}${pointParts.join("")}`;
  const renderHash = stableHash({ document, viewId: view.id, width, height, theme, stageId: options.stageId ?? null, content });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="fme-title fme-desc" data-document-id="${escapeXml(document.documentId)}" data-revision="${document.revision}" data-render-hash="${renderHash}"><title id="fme-title">${escapeXml(document.metadata.title)}</title><desc id="fme-desc">${escapeXml(description)}</desc><defs><marker id="fme-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>${content}</svg>`;

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
