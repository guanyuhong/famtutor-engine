import { evaluateNumericExpression } from "../expression/evaluator.js";
import { evaluateMathDocument, runtimeValueMap } from "../kernel/evaluate.js";
import type {
  DirectSvgResult,
  Graphics3DView,
  MathDocument,
  Point3Value,
  RenderReport,
  RuntimeValue
} from "../types.js";
import { stableHash } from "../util.js";
import { styleForEntity } from "./style.js";
import { isEntityVisible } from "./visibility.js";

export interface DirectSvg3DOptions { width?: number; height?: number; viewId?: string; stageId?: string; background?: string | null }

const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

function selectedView(document: MathDocument, requested?: string): Graphics3DView {
  const view = document.views.find(candidate => candidate.kind === "graphics3d" && (!requested || candidate.id === requested));
  if (!view || view.kind !== "graphics3d") throw new Error(requested ? `Graphics3D view '${requested}' was not found.` : "No graphics3d view exists.");
  return view;
}

function projector(view: Graphics3DView, width: number, height: number) {
  const az = view.camera?.azimuth ?? Math.PI / 4;
  const el = view.camera?.elevation ?? Math.PI / 6;
  const center = view.boundingBox3D.map(range => (range[0] + range[1]) / 2) as [number, number, number];
  const spans = view.boundingBox3D.map(range => range[1] - range[0]);
  const scale = Math.min(width, height) * 0.68 / Math.max(...spans);
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  return (p: Point3Value): [number, number] => {
    const x = p.x - center[0], y = p.y - center[1], z = p.z - center[2];
    const horizontal = -sa * x + ca * y;
    const vertical = -se * (ca * x + sa * y) + ce * z;
    const depth = ce * (ca * x + sa * y) + se * z;
    const perspective = view.projection === "central" ? (view.camera?.distance ?? Math.max(...spans) * 3) / Math.max(0.15, (view.camera?.distance ?? Math.max(...spans) * 3) - depth) : 1;
    return [width / 2 + horizontal * scale * perspective, height / 2 - vertical * scale * perspective];
  };
}

function path(points: Point3Value[], project: (p: Point3Value) => [number, number], close = false): string {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index ? "L" : "M"}${project(point).map(v => v.toFixed(3)).join(" ")}`).join(" ") + (close ? " Z" : "");
}

export function renderDirectSvg3D(document: MathDocument, options: DirectSvg3DOptions = {}): DirectSvgResult {
  const width = options.width ?? 960, height = options.height ?? 640;
  const view = selectedView(document, options.viewId);
  const evaluation = evaluateMathDocument(document);
  const values = runtimeValueMap(evaluation);
  const project = projector(view, width, height);
  const selected = new Set(view.entityIds ?? document.entities.map(entity => entity.id));
  const stage = document.activities?.flatMap(activity => activity.stages ?? []).find(item => item.id === options.stageId);
  const visible = stage?.reveal ? new Set(stage.reveal) : undefined;
  stage?.hide?.forEach(id => visible?.delete(id));
  const renderedEntities: string[] = [], skippedEntities: Array<{ id: string; reason: string }> = [], parts: string[] = [];

  const styleAttrs = (id: string, fill = "none") => {
    const entity = document.entities.find(item => item.id === id)!;
    const style = styleForEntity(document, entity);
    const dashArray = style.dashArray;
    return `stroke="${esc(style.stroke)}" stroke-width="${style.strokeWidth}" stroke-opacity="${style.opacity}" fill="${esc(fill)}"${dashArray ? ` stroke-dasharray="${dashArray}"` : ""}`;
  };
  const asPoint = (value: RuntimeValue) => value as Point3Value;
  const evalAt = (expression: string, locals: Record<string, number>) => evaluateNumericExpression(expression, name => locals[name] ?? values.get(name));

  for (const entity of document.entities) {
    if (!selected.has(entity.id) || !isEntityVisible(entity, id => values.get(id)) || (visible && !visible.has(entity.id))) continue;
    const value = values.get(entity.id);
    if (!value) { skippedEntities.push({ id: entity.id, reason: "undefined" }); continue; }
    if (typeof value !== "object") { renderedEntities.push(entity.id); continue; }
    const style = styleForEntity(document, entity);
    if (value.kind === "point3") {
      const [x, y] = project(value);
      parts.push(`<circle cx="${x}" cy="${y}" r="${style.pointSize}" ${styleAttrs(entity.id, style.fill)}/>${entity.label && style.labelVisible ? `<text x="${x + 9}" y="${y - 9}" fill="${esc(style.stroke)}" font-size="${style.fontSize}">${esc(entity.label)}</text>` : ""}`);
    } else if (value.kind === "segment3") {
      parts.push(`<path d="${path([value.from, value.to], project)}" ${styleAttrs(entity.id)}/>`);
    } else if (value.kind === "line3") {
      const span = Math.max(...view.boundingBox3D.map(range => range[1] - range[0])) * 2;
      const a = { kind: "point3", x: value.point.x - value.direction.x * span, y: value.point.y - value.direction.y * span, z: value.point.z - value.direction.z * span } as Point3Value;
      const b = { kind: "point3", x: value.point.x + value.direction.x * span, y: value.point.y + value.direction.y * span, z: value.point.z + value.direction.z * span } as Point3Value;
      parts.push(`<path d="${path([a, b], project)}" ${styleAttrs(entity.id)}/>`);
    } else if (value.kind === "polygon3") {
      parts.push(`<path d="${path(value.vertices, project, true)}" ${styleAttrs(entity.id, style.fill)} fill-opacity="${style.fillOpacity}"/>`);
    } else if (value.kind === "plane3") {
      const ranges: Array<[number, number]> = [[-0.15,-0.15],[1.15,-0.15],[1.15,1.15],[-0.15,1.15]];
      const corners: Point3Value[] = ranges.map(([u,v]) => ({ kind: "point3", x: value.origin.x + value.basisU.x*u + value.basisV.x*v, y: value.origin.y + value.basisU.y*u + value.basisV.y*v, z: value.origin.z + value.basisU.z*u + value.basisV.z*v }));
      parts.push(`<path d="${path(corners, project, true)}" ${styleAttrs(entity.id, style.fill)} fill-opacity="${Math.min(style.fillOpacity, .2)}"/>`);
    } else if (value.kind === "sphere3") {
      const center = project(value.center);
      const edge = project({ kind: "point3", x: value.center.x + value.radius, y: value.center.y, z: value.center.z });
      const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
      parts.push(`<circle cx="${center[0]}" cy="${center[1]}" r="${radius}" ${styleAttrs(entity.id, style.fill)} fill-opacity="${style.fillOpacity}"/>`);
    } else if (value.kind === "curve3") {
      const points: Point3Value[] = [];
      for (let i = 0; i <= 160; i++) { const t = value.domain[0] + (value.domain[1] - value.domain[0]) * i / 160; const locals = { [value.parameter]: t }; points.push({ kind: "point3", x: evalAt(value.xExpression, locals), y: evalAt(value.yExpression, locals), z: evalAt(value.zExpression, locals) }); }
      parts.push(`<path d="${path(points, project)}" ${styleAttrs(entity.id)}/>`);
    } else if (value.kind === "surface3") {
      const [uName, vName] = value.parameters;
      for (let row = 0; row <= 12; row++) for (const swap of [false, true]) {
        const points: Point3Value[] = [];
        for (let col = 0; col <= 30; col++) { const u = value.uDomain[0] + (value.uDomain[1] - value.uDomain[0]) * (swap ? col/30 : row/12); const v = value.vDomain[0] + (value.vDomain[1] - value.vDomain[0]) * (swap ? row/12 : col/30); const locals = { [uName]: u, [vName]: v }; points.push({ kind: "point3", x: evalAt(value.xExpression, locals), y: evalAt(value.yExpression, locals), z: evalAt(value.zExpression, locals) }); }
        parts.push(`<path d="${path(points, project)}" ${styleAttrs(entity.id)} stroke-opacity="${Math.min(style.opacity, .55)}"/>`);
      }
    } else if (!["vector3", "scalar", "boolean"].includes(value.kind)) {
      skippedEntities.push({ id: entity.id, reason: `Direct SVG 3D has no primitive for ${value.kind}.` }); continue;
    }
    renderedEntities.push(entity.id);
  }

  const background = options.background === null ? "" : `<rect width="100%" height="100%" fill="${esc(options.background ?? view.background ?? "#ffffff")}"/>`;
  const content = `${background}${parts.join("")}`;
  const renderHash = stableHash({ document, viewId: view.id, width, height, stageId: options.stageId ?? null, content });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" data-document-id="${esc(document.documentId)}" data-render-hash="${renderHash}"><title>${esc(document.metadata.title)}</title>${content}</svg>`;
  const report: RenderReport = { backend: "direct-svg", viewId: view.id, width, height, renderedEntities, skippedEntities, warnings: evaluation.issues, renderHash };
  return { svg, report };
}
