import { MathEngineError } from "../errors.js";
import { evaluateNumericExpression } from "../expression/evaluator.js";
import { evaluateMathDocument, runtimeValueMap } from "../kernel/evaluate.js";
import type { Graphics3DView, MathDocument, NormalizedMathEvent, Point3Value, RuntimeValue, ValidationIssue } from "../types.js";
import { stableHash } from "../util.js";
import { renderDirectSvg } from "./direct-svg.js";
import { styleForEntity } from "./style.js";
import { isEntityVisible } from "./visibility.js";
import type { JsxGraphRuntimeHandle, JsxGraphRuntimeOptions, JxgBoard, JxgNamespace, JxgObject } from "./jsxgraph.js";

let nextId = 0;

function view3d(document: MathDocument, requested?: string): Graphics3DView {
  const found = document.views.find(view => view.kind === "graphics3d" && (!requested || view.id === requested));
  if (!found || found.kind !== "graphics3d") throw new MathEngineError("GRAPHICS3D_VIEW_NOT_FOUND", requested ? `Graphics3D view '${requested}' was not found.` : "No graphics3d view exists.");
  return found;
}

function visibleIds(document: MathDocument, view: Graphics3DView, valueOf: (id: string) => RuntimeValue | undefined, stageId?: string): Set<string> {
  const authored = new Set((view.entityIds ?? document.entities.map(entity => entity.id)).filter(id => {
    const entity = document.entities.find(candidate => candidate.id === id);
    return Boolean(entity && isEntityVisible(entity, valueOf));
  }));
  const stage = document.activities?.flatMap(activity => activity.stages ?? []).find(item => item.id === stageId);
  const result = stage?.reveal ? new Set(stage.reveal.filter(id => authored.has(id))) : authored;
  stage?.hide?.forEach(id => result.delete(id));
  return result;
}

function styleAttributes(document: MathDocument, id: string): Record<string, unknown> {
  const entity = document.entities.find(item => item.id === id)!;
  const style = styleForEntity(document, entity);
  return {
    name: style.labelVisible ? entity.label ?? "" : "",
    withLabel: Boolean(entity.label && style.labelVisible),
    strokeColor: style.stroke,
    fillColor: style.fill,
    strokeWidth: style.strokeWidth,
    strokeOpacity: style.opacity,
    fillOpacity: style.fillOpacity,
    dash: style.dashArray === "8 6" ? 2 : style.dashArray === "2 5" ? 1 : 0,
    size: style.pointSize,
    fixed: entity.role !== "free",
    highlight: false,
    label: { offset: style.labelOffset[0] || style.labelOffset[1] ? style.labelOffset : [9, -9] }
  };
}

function setVisible(object: JxgObject | undefined, visible: boolean): void {
  object?.setAttribute?.({ visible });
  object?.label?.setAttribute?.({ visible });
  const projected = object?.element2D as JxgObject | undefined;
  if (projected && projected !== object) setVisible(projected, visible);
  object?.fmeChildren?.forEach(child => setVisible(child, visible));
  object?.borders?.forEach(child => setVisible(child, visible));
}

export function mountJsxGraph3D(host: HTMLElement, document: MathDocument, options: JsxGraphRuntimeOptions = {}): JsxGraphRuntimeHandle {
  const JXG = options.jsxgraph ?? (globalThis as unknown as { JXG?: JxgNamespace }).JXG;
  if (!JXG?.JSXGraph?.initBoard || !JXG?.JSXGraph?.freeBoard) throw new MathEngineError("JSXGRAPH_NOT_AVAILABLE", "JSXGraph must be loaded before mounting graphics3d.");
  const view = view3d(document, options.viewId);
  const container = host.ownerDocument.createElement("div");
  container.id = `famtutor-math-3d-${++nextId}`;
  container.className = "jxgbox famtutor-math-board famtutor-math-board-3d";
  container.style.width = "100%"; container.style.height = "100%"; container.style.minHeight = "420px";
  container.style.background = view.background ?? "#ffffff";
  container.setAttribute("role", "img"); container.setAttribute("aria-label", document.metadata.title);
  host.replaceChildren(container);

  const board = JXG.JSXGraph.initBoard(container.id, {
    boundingbox: [-6, 6, 6, -6], axis: false, grid: false,
    renderer: view.renderer === "jsxgraph-canvas" ? "canvas" : "svg",
    showCopyright: false, showNavigation: false,
    pan: { enabled: false }, zoom: { enabled: false }
  }) as JxgBoard;
  const planeNames = ["xPlaneRear", "yPlaneRear", "zPlaneRear", "xPlaneFront", "yPlaneFront", "zPlaneFront"];
  const scene = board.create("view3d", [[-5, -5], [10, 10], view.boundingBox3D], {
    projection: view.projection ?? "parallel",
    az: { slider: { visible: false, start: view.camera?.azimuth ?? Math.PI / 4 } },
    el: { slider: { visible: false, start: view.camera?.elevation ?? Math.PI / 6 } },
    bank: { slider: { visible: false, start: 0 } },
    trackball: { enabled: true },
    depthOrder: { enabled: true },
    axes3d: Object.fromEntries(planeNames.map(name => [name, { visible: false }]))
  }) as JxgObject;
  (scene as { setView?: (az: number, el: number, distance?: number) => void }).setView?.(
    view.camera?.azimuth ?? Math.PI / 4,
    view.camera?.elevation ?? Math.PI / 6,
    view.camera?.distance
  );
  const axes3d = (scene as { defaultAxes?: JxgObject }).defaultAxes;
  if (view.axes === false) setVisible(axes3d, false);
  else for (const name of planeNames) {
    setVisible(axes3d?.[name] as JxgObject | undefined, false);
  }

  const evaluation = evaluateMathDocument(document);
  const values = runtimeValueMap(evaluation);
  const objects = new Map<string, JxgObject>();
  const warnings: ValidationIssue[] = [...evaluation.issues];
  const skipped: Array<{ id: string; reason: string }> = [];
  const created: string[] = [];
  let stageId = options.stageId;
  const valueOf = (id: string) => values.get(id);
  const pointObject = (id: string) => {
    const object = objects.get(id); if (!object) throw new MathEngineError("JSXGRAPH_DEPENDENCY_MISSING", `3D point '${id}' was not constructed.`); return object;
  };
  const evalAt = (expression: string, locals: Record<string, number>) => evaluateNumericExpression(expression, name => locals[name] ?? valueOf(name));

  board.suspendUpdate?.();
  for (const nodeId of evaluation.order) {
    const node = document.construction.find(item => item.id === nodeId)!;
    const id = node.outputs[0];
    const value = id ? values.get(id) : undefined;
    if (!id || !value || !document.entities.some(entity => entity.id === id)) continue;
    if (typeof value !== "object") continue;
    const refs = (node.inputs ?? []).filter(input => "ref" in input).map(input => (input as { ref: string }).ref);
    const attrs = styleAttributes(document, id);
    try {
      let native: JxgObject | undefined;
      if (value.kind === "point3") {
        native = (scene as JxgBoard).create("point3d", [[value.x, value.y, value.z]], attrs);
        native.on?.("down", () => options.onSelect?.(id));
      } else if (value.kind === "segment3") {
        native = (scene as JxgBoard).create("line3d", [pointObject(refs[0]!), pointObject(refs[1]!)], { ...attrs, straightFirst: false, straightLast: false });
      } else if (value.kind === "line3") {
        native = (scene as JxgBoard).create("line3d", [pointObject(refs[0]!), pointObject(refs[1]!)], { ...attrs, straightFirst: true, straightLast: true });
      } else if (value.kind === "plane3") {
        const numericRange = (name: "uRange" | "vRange"): [number, number] => {
          const raw = node.params?.[name];
          const lower = Array.isArray(raw) ? raw[0] : undefined;
          const upper = Array.isArray(raw) ? raw[1] : undefined;
          return typeof lower === "number" && Number.isFinite(lower) && typeof upper === "number" && Number.isFinite(upper) && lower < upper
            ? [lower, upper]
            : [-0.15, 1.15];
        };
        native = (scene as JxgBoard).create("plane3d", [pointObject(refs[0]!), pointObject(refs[1]!), pointObject(refs[2]!), numericRange("uRange"), numericRange("vRange")], { ...attrs, threePoints: true });
      } else if (value.kind === "polygon3") {
        native = (scene as JxgBoard).create("polygon3d", [refs.map(pointObject)], attrs);
      } else if (value.kind === "sphere3") {
        native = (scene as JxgBoard).create("sphere3d", [pointObject(refs[0]!), () => (valueOf(id) as typeof value).radius], attrs);
      } else if (value.kind === "curve3") {
        const parameter = value.parameter;
        native = (scene as JxgBoard).create("curve3d", [
          (t: number) => {
            const locals = { [parameter]: t };
            return [evalAt(value.xExpression, locals), evalAt(value.yExpression, locals), evalAt(value.zExpression, locals)];
          },
          value.domain
        ], attrs);
      } else if (value.kind === "surface3") {
        const [uName, vName] = value.parameters;
        native = (scene as JxgBoard).create("parametricsurface3d", [
          (u: number, v: number) => [evalAt(value.xExpression, { [uName]: u, [vName]: v }), evalAt(value.yExpression, { [uName]: u, [vName]: v }), evalAt(value.zExpression, { [uName]: u, [vName]: v })],
          value.uDomain, value.vDomain
        ], { ...attrs, stepsU: 24, stepsV: 24 });
      }
      if (native) { objects.set(id, native); created.push(id); }
    } catch (error) {
      skipped.push({ id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  board.unsuspendUpdate?.(); board.fullUpdate?.();

  const applyStage = () => { const shown = visibleIds(document, view, valueOf, stageId); for (const [id, object] of objects) setVisible(object, shown.has(id)); board.update?.(); };
  applyStage();
  let destroyed = false;
  const ready = Promise.resolve();

  return {
    board, document, view, ready,
    getNative: id => objects.get(id),
    getValue: id => {
      const native = objects.get(id), original = values.get(id);
      if (typeof original === "object" && original?.kind === "point3" && native?.X && native?.Y && native?.Z) return { kind: "point3", x: native.X(), y: native.Y(), z: native.Z() } as Point3Value;
      return original;
    },
    setPoint() { throw new MathEngineError("UNSUPPORTED_INTERACTION", "Use a future point3.set action for 3D points; 2D point.set is intentionally not overloaded."); },
    setScalar() { throw new MathEngineError("UNSUPPORTED_INTERACTION", "Scalar mutation requires a document rebuild in graphics3d v1."); },
    setStage(next) { stageId = next; applyStage(); },
    exportSvg() {
      const root = board.renderer?.svgRoot;
      if (!root) throw new MathEngineError("JSXGRAPH_SVG_UNAVAILABLE", "The active JSXGraph 3D renderer did not expose an SVG root.");
      return root.outerHTML.includes("xmlns=") ? root.outerHTML : root.outerHTML.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    },
    exportDirectSvg(width = 960, height = 640) { return renderDirectSvg(document, { viewId: view.id, stageId, width, height }); },
    report() {
      return {
        backend: view.renderer === "jsxgraph-canvas" ? "jsxgraph-canvas" : "jsxgraph-svg",
        viewId: view.id,
        width: Math.max(1, host.clientWidth || 0), height: Math.max(1, host.clientHeight || 0),
        renderedEntities: [...created], skippedEntities: [...skipped], warnings: [...warnings],
        renderHash: stableHash({ documentId: document.documentId, revision: document.revision, viewId: view.id, created, skipped })
      };
    },
    destroy() { if (destroyed) return; destroyed = true; JXG.JSXGraph.freeBoard(board); host.replaceChildren(); objects.clear(); }
  };
}
