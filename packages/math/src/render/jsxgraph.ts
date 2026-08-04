import { MathEngineError } from "../errors.js";
import { evaluateBooleanExpression, evaluateNumericExpression } from "../expression/evaluator.js";
import {
  angleValue,
  applyTransform,
  arcFromCenterPoints,
  arcFromThreePoints,
  arcLength,
  circle,
  circleArea,
  circlePerimeter,
  commonTangentLine,
  conicSamplePoints,
  dilatePoint,
  dilateTransform,
  distance,
  ellipseFromFoci,
  hyperbolaFromFoci,
  intersectLineConic,
  invertCircleInCircle,
  invertPointInCircle,
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
  isTransform,
  isVector,
  lineFromPointDirection,
  lineFromPoints,
  lineLikeToLine,
  midpoint,
  parallelChevronMarker,
  parabolaFromFocusDirectrix,
  point,
  polygonArea,
  polygonPerimeter,
  projectPointToPath,
  ray,
  reflectPointAcrossLine,
  reflectTransform,
  rightAngleMarkerPolygon,
  rotatePoint,
  rotateTransform,
  scaleVector,
  segmentTickMarker,
  sectorArea,
  sectorFromArc,
  segment,
  slope,
  subtractPoints,
  translateTransform,
  valueLength,
  vector
} from "../kernel/geometry.js";
import { buildConstructionGraph } from "../kernel/dag.js";
import type {
  ConstructionNode,
  DirectSvgResult,
  EntityStyle,
  Graphics2DView,
  JsonValue,
  MathDocument,
  NormalizedMathEvent,
  RenderReport,
  RuntimeValue,
  ValidationIssue
} from "../types.js";
import { stableHash, toJsonValue } from "../util.js";
import { angleLabelPoint } from "./angle-layout.js";
import { renderDirectSvg } from "./direct-svg.js";
import { layoutPointLabels, type LabelViewport } from "./point-label-layout.js";
import { styleForEntity } from "./style.js";
import { intervalFromBounds } from "../kernel/interval.js";

interface JxgObject {
  X?: () => number;
  Y?: () => number;
  Value?: () => number;
  L?: () => number;
  Radius?: () => number;
  getTextAnchor?: () => unknown;
  setValue?: (value: number) => void;
  setPosition?: (mode: number, coords: [number, number]) => void;
  setAttribute?: (attributes: Record<string, unknown>) => void;
  startAnimation?: (direction: number, stepCount: number, delay: number, maxRounds?: number) => void;
  stopAnimation?: () => void;
  on?: (event: string, callback: () => void) => void;
  label?: JxgObject;
  borders?: JxgObject[];
  vertices?: JxgObject[];
  fmeChildren?: JxgObject[];
  fmeVisibility?: () => boolean;
  rendNode?: SVGElement;
  [key: string]: unknown;
}

interface JxgBoard {
  create: (kind: string, parents: unknown[], attributes?: Record<string, unknown>) => JxgObject;
  suspendUpdate?: () => void;
  unsuspendUpdate?: () => void;
  fullUpdate?: () => void;
  update?: () => void;
  resizeContainer?: (width: number, height: number, dontSetStyle?: boolean, dontSetBoundingBox?: boolean) => unknown;
  stopResizeObserver?: () => void;
  updateContainerDims?: (...args: unknown[]) => unknown;
  getBoundingBox?: () => [number, number, number, number];
  setBoundingBox?: (box: [number, number, number, number], keepAspectRatio?: boolean) => void;
  renderer?: { svgRoot?: SVGElement };
  [key: string]: unknown;
}

interface JxgNamespace {
  JSXGraph: {
    initBoard: (containerId: string, options: Record<string, unknown>) => JxgBoard;
    freeBoard: (board: JxgBoard) => void;
  };
  COORDS_BY_USER?: number;
}

export interface JsxGraphRuntimeOptions {
  viewId?: string;
  jsxgraph?: JxgNamespace;
  stageId?: string;
  onEvent?: (event: NormalizedMathEvent) => void;
  onSelect?: (entityId: string) => void;
  disablePanZoom?: boolean;
}

export interface JsxGraphRuntimeHandle {
  readonly board: JxgBoard;
  readonly document: MathDocument;
  readonly view: Graphics2DView;
  readonly ready: Promise<void>;
  getNative(entityId: string): JxgObject | undefined;
  getValue(entityId: string): RuntimeValue | undefined;
  setPoint(entityId: string, coords: [number, number]): void;
  setScalar(entityId: string, value: number): void;
  setStage(stageId?: string): void;
  exportSvg(): string;
  exportDirectSvg(width?: number, height?: number): DirectSvgResult;
  report(): RenderReport;
  destroy(): void;
}

const runtimeCounter = { value: 0 };

function graphicsView(document: MathDocument, requested?: string): Graphics2DView {
  const found = document.views.find(view => view.kind === "graphics2d" && (!requested || view.id === requested));
  if (!found || found.kind !== "graphics2d") {
    throw new MathEngineError("GRAPHICS_VIEW_NOT_FOUND", requested ? `Graphics view '${requested}' was not found.` : "No graphics2d view exists.");
  }
  return found;
}

function isMovable(document: MathDocument, id: string): boolean {
  const policy = document.interactions?.find(candidate => candidate.target === id);
  if (policy) return policy.permissions.includes("drag") || policy.permissions.includes("set_value");
  return document.entities.find(entity => entity.id === id)?.role === "free";
}

function lineLikeNative(objects: Map<string, JxgObject>, id: string): JxgObject {
  const object = objects.get(id);
  if (!object) throw new MathEngineError("JSXGRAPH_DEPENDENCY_MISSING", `JSXGraph object '${id}' was not constructed.`);
  return object;
}

function pointNative(objects: Map<string, JxgObject>, id: string): JxgObject {
  const object = lineLikeNative(objects, id);
  if (typeof object.X !== "function" || typeof object.Y !== "function") {
    throw new MathEngineError("JSXGRAPH_POINT_REQUIRED", `JSXGraph object '${id}' is not point-like.`);
  }
  return object;
}

function numericParam(node: ConstructionNode, key: string, fallback?: number): number {
  const raw = node.params?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (fallback !== undefined) return fallback;
  throw new MathEngineError("JSXGRAPH_INVALID_PARAMETER", `Command '${node.command}' requires numeric params.${key}.`);
}

function sliderDigits(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  for (let digits = 0; digits <= 6; digits += 1) {
    const scale = 10 ** digits;
    if (Math.abs(Math.round(step * scale) - step * scale) < 1e-9) return digits;
  }
  return 6;
}

interface SliderAnimation {
  autoStart: boolean;
  direction: 1 | -1;
  stepCount: number;
  delayMs: number;
  maxRounds: number;
  startDelayMs: number;
}

function sliderAnimation(node: ConstructionNode): SliderAnimation | undefined {
  const raw = node.params?.animation;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MathEngineError("JSXGRAPH_INVALID_PARAMETER", `Command '${node.command}' requires params.animation to be an object.`);
  }
  const value = raw as Record<string, JsonValue>;
  const finiteNumber = (key: string, fallback: number): number => {
    const candidate = value[key];
    if (candidate === undefined) return fallback;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    throw new MathEngineError("JSXGRAPH_INVALID_PARAMETER", `Command '${node.command}' requires numeric params.animation.${key}.`);
  };
  const direction = finiteNumber("direction", 1);
  const stepCount = Math.round(finiteNumber("stepCount", 100));
  const delayMs = Math.round(finiteNumber("delayMs", 30));
  const maxRounds = Math.round(finiteNumber("maxRounds", 1));
  const startDelayMs = Math.round(finiteNumber("startDelayMs", 0));
  if (direction !== 1 && direction !== -1) {
    throw new MathEngineError("JSXGRAPH_INVALID_PARAMETER", `Command '${node.command}' requires params.animation.direction to be 1 or -1.`);
  }
  if (stepCount < 1 || delayMs < 1 || startDelayMs < 0 || maxRounds === 0 || maxRounds < -1) {
    throw new MathEngineError("JSXGRAPH_INVALID_PARAMETER", `Command '${node.command}' has an invalid params.animation range.`);
  }
  return {
    autoStart: value.autoStart === true,
    direction,
    stepCount,
    delayMs,
    maxRounds,
    startDelayMs
  };
}

function pairParam(node: ConstructionNode, key: string, fallback: [number, number] = [0, 0]): [number, number] {
  const raw = node.params?.[key];
  if (Array.isArray(raw) && raw.length === 2 && typeof raw[0] === "number" && typeof raw[1] === "number" && Number.isFinite(raw[0]) && Number.isFinite(raw[1])) {
    return [raw[0], raw[1]];
  }
  return fallback;
}

function domainParam(node: ConstructionNode): [number, number] {
  const raw = node.params?.domain;
  if (Array.isArray(raw) && raw.length === 2 && typeof raw[0] === "number" && typeof raw[1] === "number") return [raw[0], raw[1]];
  return [-10, 10];
}

function stringParam(node: ConstructionNode, key: string, fallback = ""): string {
  const raw = node.params?.[key];
  return typeof raw === "string" ? raw : fallback;
}

function expressionParam(node: ConstructionNode, key: string): string | number {
  const raw = node.params?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim().length > 0) return raw;
  throw new MathEngineError("JSXGRAPH_INVALID_PARAMETER", `Command '${node.command}' requires numeric or expression params.${key}.`);
}

function inputRefs(node: ConstructionNode): string[] {
  return (node.inputs ?? []).flatMap(input => "ref" in input ? [input.ref] : []);
}

function jxgAttributes(document: MathDocument, entityId: string, forceFixed = false): Record<string, unknown> {
  const entity = document.entities.find(candidate => candidate.id === entityId);
  if (!entity) return {};
  const style = styleForEntity(document, entity);
  const color = style.stroke ?? "#2855d9";
  const movable = isMovable(document, entityId) && !forceFixed;
  const label: Record<string, unknown> = {
    fontSize: style.fontSize ?? 15,
    color,
    cssStyle: "white-space:nowrap; paint-order:stroke; stroke:#ffffff; stroke-width:3px; stroke-linejoin:round;"
  };
  if (entity.type === "point2") {
    Object.assign(label, {
      anchorX: "middle",
      anchorY: "middle",
      offset: [10, 10],
      autoPosition: false
    });
  }
  if (entity.type === "line2" || entity.type === "segment2" || entity.type === "ray2") {
    Object.assign(label, {
      display: "internal",
      anchorX: "middle",
      anchorY: "middle",
      offset: style.labelOffset,
      position: `${style.lineLabelPosition}fr ${style.lineLabelSide}`,
      distance: style.lineLabelDistance,
      autoPosition: false
    });
  }
  const attributes: Record<string, unknown> = {
    name: style.labelVisible ? (entity.label ?? (entity.type === "point2" ? entity.id : "")) : "",
    withLabel: entity.type === "polygon2" ? false : style.labelVisible && Boolean(entity.label),
    visible: entity.visible !== false,
    fixed: !movable,
    highlight: true,
    strokeColor: color,
    highlightStrokeColor: color,
    fillColor: style.fill ?? color,
    highlightFillColor: style.fill ?? color,
    strokeWidth: style.strokeWidth ?? 2,
    strokeOpacity: style.opacity ?? 1,
    fillOpacity: (style.fillOpacity ?? (
      entity.type === "polygon2" ? 0.12
        : entity.type === "circle2" ? 0.04
          : entity.type === "angle" ? 0.16
            : entity.type === "point2" || entity.type === "scalar" ? 1
              : 0
    )) * (style.opacity ?? 1),
    size: style.pointSize ?? 4,
    fontSize: style.fontSize ?? 15,
    dash: style.dashArray === "8 6" ? 2 : style.dashArray === "2 5" ? 1 : 0,
    label
  };
  if (entity.type === "polygon2") {
    attributes.vertices = { visible: false };
    attributes.borders = { strokeColor: color, strokeWidth: style.strokeWidth ?? 2 };
  }
  if (entity.type === "text") {
    return {
      display: "internal",
      fixed: true,
      visible: entity.visible !== false,
      fontSize: style.fontSize ?? 16,
      color,
      opacity: style.opacity ?? 1,
      highlight: false,
      cssStyle: "white-space:nowrap;"
    };
  }
  return attributes;
}

function safeRuntimePoint(native: JxgObject): RuntimeValue | undefined {
  const x = native.X?.();
  const y = native.Y?.();
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return point(x, y);
}

function setVisibility(native: JxgObject | undefined, visible: boolean): void {
  const resolved = visible && native?.fmeVisibility ? native.fmeVisibility : visible;
  native?.setAttribute?.({ visible: resolved });
  native?.label?.setAttribute?.({ visible: resolved });
  native?.borders?.forEach(border => border.setAttribute?.({ visible }));
  native?.fmeChildren?.forEach(child => setVisibility(child, visible));
}

function normalizeSvg(svg: string): string {
  if (!svg.includes("xmlns=")) return svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}

export function mountJsxGraph(
  host: HTMLElement,
  document: MathDocument,
  options: JsxGraphRuntimeOptions = {}
): JsxGraphRuntimeHandle {
  const JXG = options.jsxgraph ?? (globalThis as unknown as { JXG?: JxgNamespace }).JXG;
  if (!JXG?.JSXGraph?.initBoard || !JXG?.JSXGraph?.freeBoard) {
    throw new MathEngineError("JSXGRAPH_NOT_AVAILABLE", "JSXGraph must be loaded as globalThis.JXG or passed in options.jsxgraph.", {
      retryable: false
    });
  }
  if (!host?.ownerDocument?.createElement) throw new MathEngineError("DOM_HOST_REQUIRED", "mountJsxGraph requires a DOM HTMLElement host.");

  const view = graphicsView(document, options.viewId);
  const container = host.ownerDocument.createElement("div");
  container.id = `famtutor-math-${++runtimeCounter.value}`;
  container.className = "jxgbox famtutor-math-board";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.minHeight = "320px";
  container.style.background = view.background ?? "#ffffff";
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", document.metadata.title);
  container.dataset.documentId = document.documentId;
  container.dataset.revision = String(document.revision);
  host.replaceChildren(container);

  const board = JXG.JSXGraph.initBoard(container.id, {
    boundingbox: view.boundingBox,
    axis: view.axes ?? false,
    grid: view.grid ?? false,
    keepAspectRatio: view.keepAspectRatio ?? true,
    renderer: view.renderer === "jsxgraph-canvas" ? "canvas" : "svg",
    showCopyright: false,
    showNavigation: false,
    pan: { enabled: !(options.disablePanZoom ?? true) },
    zoom: { enabled: !(options.disablePanZoom ?? true) }
  });

  const graph = buildConstructionGraph(document);
  const nodeById = graph.nodeById;
  const objects = new Map<string, JxgObject>();
  const valueResolvers = new Map<string, () => RuntimeValue | undefined>();
  const sliderAnimations = new Map<string, SliderAnimation>();
  const sliderAnimationTimers = new Map<string, number>();
  const skipped: Array<{ id: string; reason: string }> = [];
  const warnings: ValidationIssue[] = [];
  const createdIds: string[] = [];
  let stageId = options.stageId;
  let updatePointLabels = (): void => {};

  const valueOf = (id: string): RuntimeValue | undefined => valueResolvers.get(id)?.();
  const expressionValue = (source: string | number, locals: Record<string, number> = {}): number =>
    evaluateNumericExpression(source, identifier => locals[identifier] ?? valueOf(identifier));
  const booleanValue = (source: string): boolean =>
    evaluateBooleanExpression(source, identifier => valueOf(identifier));
  const pointOf = (id: string) => {
    const value = valueOf(id);
    if (!isPoint(value)) throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", `Entity '${id}' is not a point2 at runtime.`);
    return value;
  };

  const visibleIdsForStage = (nextStage?: string): Set<string> => {
    const stage = document.activities?.flatMap(activity => activity.stages ?? []).find(candidate => candidate.id === nextStage);
    const authoredVisibleIds = new Set(document.entities.filter(entity => entity.visible !== false).map(entity => entity.id));
    const visibleIds = stage?.reveal
      ? new Set(stage.reveal.filter(id => authoredVisibleIds.has(id)))
      : new Set(authoredVisibleIds);
    stage?.hide?.forEach(id => visibleIds.delete(id));
    return visibleIds;
  };

  const labelViewport = (): LabelViewport => {
    const [xmin, ymax, xmax, ymin] = view.boundingBox;
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const rawScaleX = width / (xmax - xmin);
    const rawScaleY = height / (ymax - ymin);
    const scaleX = view.keepAspectRatio === false ? rawScaleX : Math.min(rawScaleX, rawScaleY);
    const scaleY = view.keepAspectRatio === false ? rawScaleY : Math.min(rawScaleX, rawScaleY);
    const offsetX = (width - (xmax - xmin) * scaleX) / 2;
    const offsetY = (height - (ymax - ymin) * scaleY) / 2;
    return {
      width,
      height,
      pixelsPerUnit: Math.min(scaleX, scaleY),
      toScreen: value => [offsetX + (value.x - xmin) * scaleX, offsetY + (ymax - value.y) * scaleY],
      toWorld: value => ({ x: xmin + (value[0] - offsetX) / scaleX, y: ymax - (value[1] - offsetY) / scaleY })
    };
  };

  const currentPointLabelLayout = () => {
    const values = new Map<string, RuntimeValue>();
    for (const entity of document.entities) {
      const value = valueOf(entity.id);
      if (value !== undefined) values.set(entity.id, value);
    }
    return layoutPointLabels(document, values, visibleIdsForStage(stageId), labelViewport());
  };
  const lineLikeOf = (id: string) => {
    const value = valueOf(id);
    if (!value || (!isLine(value) && !isSegment(value) && !isRay(value))) throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", `Entity '${id}' is not line-like at runtime.`);
    return value;
  };

  const bindEvents = (entityId: string, native: JxgObject): void => {
    native.on?.("down", () => {
      options.onSelect?.(entityId);
      options.onEvent?.({
        type: "object.selected",
        target: entityId,
        timestamp: Date.now(),
        documentId: document.documentId,
        revision: document.revision,
        value: toJsonValue(valueOf(entityId))
      });
    });
    if (isMovable(document, entityId)) {
      native.on?.("drag", () => {
        updatePointLabels();
        const value = valueOf(entityId);
        options.onEvent?.({
          type: "object.drag",
          target: entityId,
          timestamp: Date.now(),
          documentId: document.documentId,
          revision: document.revision,
          value: toJsonValue(value),
          position: isPoint(value) ? [value.x, value.y] : undefined,
          stageId
        });
      });
      native.on?.("up", () => {
        const value = valueOf(entityId);
        options.onEvent?.({
          type: isPoint(value) ? "object.dragEnd" : "value.changed",
          target: entityId,
          timestamp: Date.now(),
          documentId: document.documentId,
          revision: document.revision,
          value: toJsonValue(value),
          position: isPoint(value) ? [value.x, value.y] : undefined,
          stageId
        });
      });
    }
  };

  const constructNode = (node: ConstructionNode): void => {
    const refs = inputRefs(node);
    const output = node.outputs[0];
    if (!output) return;
    let native: JxgObject | undefined;
    const attributes = jxgAttributes(document, output);

    switch (node.command) {
      case "scalar.constant": {
        const value = numericParam(node, "value");
        valueResolvers.set(output, () => value);
        return;
      }
      case "scalar.slider": {
        const min = numericParam(node, "min");
        const max = numericParam(node, "max");
        const value = numericParam(node, "value");
        const step = numericParam(node, "step", -1);
        const animation = sliderAnimation(node);
        const position = pairParam(node, "position", [view.boundingBox[0] + 1, view.boundingBox[3] + 1]);
        const length = numericParam(node, "length", Math.max(2, (view.boundingBox[2] - view.boundingBox[0]) / 4));
        native = board.create("slider", [position, [position[0] + length, position[1]], [min, value, max]], {
          ...attributes,
          snapWidth: step,
          digits: sliderDigits(step)
        });
        objects.set(output, native);
        valueResolvers.set(output, () => native?.Value?.());
        if (animation) {
          sliderAnimations.set(output, animation);
          native.on?.("down", () => {
            const timer = sliderAnimationTimers.get(output);
            if (timer !== undefined) host.ownerDocument.defaultView?.clearTimeout(timer);
            sliderAnimationTimers.delete(output);
            native?.stopAnimation?.();
          });
        }
        break;
      }
      case "boolean.expression": {
        const expression = stringParam(node, "expression");
        valueResolvers.set(output, () => booleanValue(expression));
        return;
      }
      case "interval.from_bounds": {
        const style = styleForEntity(document, document.entities.find(entity => entity.id === output)!);
        const hasLower = node.params?.lower !== undefined;
        const hasUpper = node.params?.upper !== undefined;
        const lowerExpression = hasLower ? expressionParam(node, "lower") : undefined;
        const upperExpression = hasUpper ? expressionParam(node, "upper") : undefined;
        const yExpression = node.params?.y === undefined ? 0 : expressionParam(node, "y");
        const lowerClosed = node.params?.lowerClosed === true;
        const upperClosed = node.params?.upperClosed === true;
        const current = () => intervalFromBounds({
          lower: lowerExpression === undefined ? undefined : expressionValue(lowerExpression),
          upper: upperExpression === undefined ? undefined : expressionValue(upperExpression),
          lowerClosed,
          upperClosed,
          y: expressionValue(yExpression)
        });
        const [xmin, , xmax] = view.boundingBox;
        const inset = Math.max((xmax - xmin) * 0.025, 0.12);
        const startX = () => current().lower ?? xmin + inset;
        const endX = () => current().upper ?? xmax - inset;
        const trackY = () => current().y;
        const endpointAttributes = (closed: boolean, finite: () => boolean) => ({
          ...jxgAttributes(document, output, true),
          name: "",
          withLabel: false,
          size: style.pointSize,
          face: "o",
          fillColor: style.fill,
          fillOpacity: closed ? 1 : 0,
          strokeColor: style.stroke,
          strokeWidth: Math.max(1.5, style.strokeWidth * 0.75),
          visible: () => !current().empty && finite()
        });
        const lowerPoint = board.create("point", [startX, trackY], endpointAttributes(lowerClosed, () => current().lower !== null));
        const upperPoint = board.create("point", [endX, trackY], endpointAttributes(upperClosed, () => current().upper !== null && current().upper !== current().lower));
        lowerPoint.fmeVisibility = () => !current().empty && current().lower !== null;
        upperPoint.fmeVisibility = () => !current().empty && current().upper !== null && current().upper !== current().lower;
        native = board.create("segment", [lowerPoint, upperPoint], {
          ...jxgAttributes(document, output, true),
          firstArrow: !hasLower,
          lastArrow: !hasUpper,
          visible: () => !current().empty && Math.abs(endX() - startX()) > 1e-12
        });
        native.fmeVisibility = () => !current().empty && Math.abs(endX() - startX()) > 1e-12;
        const emptyText = board.create("text", [() => (xmin + xmax) / 2, trackY, () => current().empty ? "∅" : ""], {
          display: "internal",
          fixed: true,
          visible: () => current().empty,
          fontSize: style.fontSize + 4,
          color: style.stroke,
          anchorX: "middle",
          anchorY: "middle",
          highlight: false
        });
        emptyText.fmeVisibility = () => current().empty;
        native.fmeChildren = [lowerPoint, upperPoint, emptyText];
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "point.free": {
        const at = pairParam(node, "coords");
        native = board.create("point", at, attributes);
        objects.set(output, native);
        valueResolvers.set(output, () => safeRuntimePoint(native!));
        break;
      }
      case "point.from_expressions": {
        const xExpression = expressionParam(node, "x");
        const yExpression = expressionParam(node, "y");
        native = board.create("point", [
          () => expressionValue(xExpression),
          () => expressionValue(yExpression)
        ], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => safeRuntimePoint(native!));
        break;
      }
      case "point.on_path": {
        const at = pairParam(node, "initial");
        const pathObject = objects.get(refs[0]!);
        if (!pathObject) throw new MathEngineError("UNDEFINED_INPUT", `Path '${refs[0]}' is not rendered.`);
        native = board.create("glider", [at[0], at[1], pathObject], attributes);
        objects.set(output, native);
        valueResolvers.set(output, () => safeRuntimePoint(native!));
        break;
      }
      case "point.midpoint": {
        native = board.create("midpoint", [pointNative(objects, refs[0]!), pointNative(objects, refs[1]!)], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => safeRuntimePoint(native!));
        break;
      }
      case "point.projection": {
        native = board.create("point", [
          () => projectPointToPath(pointOf(refs[0]!), valueOf(refs[1]!) as RuntimeValue).x,
          () => projectPointToPath(pointOf(refs[0]!), valueOf(refs[1]!) as RuntimeValue).y
        ], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => safeRuntimePoint(native!));
        break;
      }
      case "point.invert_in_circle": {
        const current = () => {
          const inversion = valueOf(refs[1]!);
          if (!isCircle(inversion)) throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", `Entity '${refs[1]}' is not circle2 at runtime.`);
          return invertPointInCircle(pointOf(refs[0]!), inversion);
        };
        native = board.create("point", [() => current().x, () => current().y], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "point.intersection_line_line": {
        native = board.create("intersection", [lineLikeNative(objects, refs[0]!), lineLikeNative(objects, refs[1]!), 0], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => safeRuntimePoint(native!));
        break;
      }
      case "point.intersection_line_circle":
      case "point.intersection_circle_circle": {
        node.outputs.forEach((id, index) => {
          const intersection = board.create("intersection", [lineLikeNative(objects, refs[0]!), lineLikeNative(objects, refs[1]!), index], jxgAttributes(document, id, true));
          objects.set(id, intersection);
          valueResolvers.set(id, () => safeRuntimePoint(intersection));
          bindEvents(id, intersection);
          createdIds.push(id);
        });
        return;
      }
      case "point.intersection_line_conic": {
        node.outputs.forEach((id, index) => {
          const current = () => {
            const line = lineLikeToLine(lineLikeOf(refs[0]!));
            const conic = valueOf(refs[1]!);
            if (!isConic(conic)) return point(Number.NaN, Number.NaN);
            return intersectLineConic(line, conic)[index]!;
          };
          const intersection = board.create("point", [() => current().x, () => current().y], jxgAttributes(document, id, true));
          objects.set(id, intersection);
          valueResolvers.set(id, () => safeRuntimePoint(intersection));
          bindEvents(id, intersection);
          createdIds.push(id);
        });
        return;
      }
      case "segment.through_points": {
        native = board.create("segment", [pointNative(objects, refs[0]!), pointNative(objects, refs[1]!)], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => segment(pointOf(refs[0]!), pointOf(refs[1]!)));
        break;
      }
      case "line.through_points": {
        native = board.create("line", [pointNative(objects, refs[0]!), pointNative(objects, refs[1]!)], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => lineFromPoints(pointOf(refs[0]!), pointOf(refs[1]!)));
        break;
      }
      case "ray.from_points": {
        native = board.create("line", [pointNative(objects, refs[0]!), pointNative(objects, refs[1]!)], {
          ...jxgAttributes(document, output, true),
          straightFirst: false,
          straightLast: true,
          lastArrow: true
        });
        objects.set(output, native);
        valueResolvers.set(output, () => ray(pointOf(refs[0]!), pointOf(refs[1]!)));
        break;
      }
      case "line.parallel_through": {
        native = board.create("parallel", [pointNative(objects, refs[0]!), lineLikeNative(objects, refs[1]!)], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => lineFromPointDirection(pointOf(refs[0]!), lineLikeToLine(lineLikeOf(refs[1]!)).direction));
        break;
      }
      case "line.perpendicular_through": {
        native = board.create("perpendicular", [pointNative(objects, refs[0]!), lineLikeNative(objects, refs[1]!)], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => {
          const source = lineLikeToLine(lineLikeOf(refs[1]!));
          return lineFromPointDirection(pointOf(refs[0]!), vector(-source.direction.y, source.direction.x));
        });
        break;
      }
      case "line.common_tangent": {
        const current = () => {
          const first = valueOf(refs[0]!);
          const second = valueOf(refs[1]!);
          if (!isCircle(first) || !isCircle(second)) throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", "line.common_tangent inputs must be circle2 at runtime.");
          return commonTangentLine(first, second, Number(node.params?.side1), Number(node.params?.side2));
        };
        const anchor = board.create("point", [() => current().point.x, () => current().point.y], { visible: false, fixed: true, withLabel: false });
        const directionPoint = board.create("point", [
          () => current().point.x + current().direction.x,
          () => current().point.y + current().direction.y
        ], { visible: false, fixed: true, withLabel: false });
        native = board.create("line", [anchor, directionPoint], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "vector.between_points": {
        native = board.create("arrow", [pointNative(objects, refs[0]!), pointNative(objects, refs[1]!)], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => subtractPoints(pointOf(refs[1]!), pointOf(refs[0]!)));
        break;
      }
      case "vector.components": {
        const [x, y] = pairParam(node, "components");
        valueResolvers.set(output, () => vector(x, y));
        return;
      }
      case "vector.polar": {
        valueResolvers.set(output, () => {
          const magnitude = expressionValue(node.params?.magnitude as string | number);
          const angle = expressionValue(node.params?.angle as string | number);
          return vector(magnitude * Math.cos(angle), magnitude * Math.sin(angle));
        });
        return;
      }
      case "vector.scale":
        valueResolvers.set(output, () => {
          const source = valueOf(refs[0]!);
          if (!isVector(source)) {
            throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", `Entity '${refs[0]}' is not a vector2 at runtime.`);
          }
          return scaleVector(source, expressionValue(node.params?.factor as string | number));
        });
        return;
      case "circle.center_radius": {
        const center = pointNative(objects, refs[0]!);
        const radius = refs[1]
          ? () => {
              const value = valueOf(refs[1]!);
              return typeof value === "number" ? value : Number.NaN;
            }
          : () => expressionValue(node.params?.radius as string | number);
        native = board.create("circle", [center, radius], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => circle(pointOf(refs[0]!), radius()));
        break;
      }
      case "circle.through_points": {
        native = board.create("circle", [pointNative(objects, refs[0]!), pointNative(objects, refs[1]!)], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => circle(pointOf(refs[0]!), distance(pointOf(refs[0]!), pointOf(refs[1]!))));
        break;
      }
      case "circle.through_three_points": {
        native = board.create("circumcircle", refs.map(ref => pointNative(objects, ref)), jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => {
          const centerObject = (native as { midpoint?: JxgObject }).midpoint;
          const center = centerObject ? safeRuntimePoint(centerObject) : undefined;
          if (!isPoint(center)) return undefined;
          return circle(center, distance(center, pointOf(refs[0]!)));
        });
        break;
      }
      case "circle.invert_in_circle": {
        const current = () => {
          const source = valueOf(refs[0]!);
          const inversion = valueOf(refs[1]!);
          if (!isCircle(source) || !isCircle(inversion)) throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", "circle.invert_in_circle inputs must be circle2 at runtime.");
          return invertCircleInCircle(source, inversion);
        };
        const center = board.create("point", [() => current().center.x, () => current().center.y], { visible: false, fixed: true, withLabel: false });
        native = board.create("circle", [center, () => current().radius], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "arc.center_points": {
        native = board.create("arc", [pointNative(objects, refs[0]!), pointNative(objects, refs[1]!), pointNative(objects, refs[2]!)], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => arcFromCenterPoints(pointOf(refs[0]!), pointOf(refs[1]!), pointOf(refs[2]!)));
        break;
      }
      case "arc.three_points": {
        const current = () => arcFromThreePoints(pointOf(refs[0]!), pointOf(refs[1]!), pointOf(refs[2]!));
        native = board.create("curve", [
          (t: number) => {
            const arc = current();
            const sweep = ((arc.endAngle - arc.startAngle) + Math.PI * 4) % (Math.PI * 2);
            const angle = arc.startAngle + sweep * t;
            return arc.center.x + arc.radius * Math.cos(angle);
          },
          (t: number) => {
            const arc = current();
            const start = ((arc.startAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const end = ((arc.endAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const sweep = start <= end ? end - start : Math.PI * 2 - (start - end);
            const angle = arc.startAngle + sweep * t;
            return arc.center.y + arc.radius * Math.sin(angle);
          },
          0,
          1
        ], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "sector.from_arc": {
        const current = () => sectorFromArc(valueOf(refs[0]!) as never);
        native = board.create("curve", [
          (t: number) => {
            const sector = current();
            if (!isSector(sector)) return Number.NaN;
            const arc = sector.arc;
            if (t < 0.02) return arc.center.x;
            if (t > 0.98) return arc.center.x;
            const start = ((arc.startAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const end = ((arc.endAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const sweep = start <= end ? end - start : Math.PI * 2 - (start - end);
            const angle = arc.startAngle + sweep * ((t - 0.02) / 0.96);
            return arc.center.x + arc.radius * Math.cos(angle);
          },
          (t: number) => {
            const sector = current();
            if (!isSector(sector)) return Number.NaN;
            const arc = sector.arc;
            if (t < 0.02) return arc.center.y;
            if (t > 0.98) return arc.center.y;
            const start = ((arc.startAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const end = ((arc.endAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const sweep = start <= end ? end - start : Math.PI * 2 - (start - end);
            const angle = arc.startAngle + sweep * ((t - 0.02) / 0.96);
            return arc.center.y + arc.radius * Math.sin(angle);
          },
          0,
          1
        ], { ...jxgAttributes(document, output, true), fillColor: attributes.fillColor, fillOpacity: 0.2 });
        objects.set(output, native);
        valueResolvers.set(output, () => {
          const arc = valueOf(refs[0]!);
          return isArc(arc) ? sectorFromArc(arc) : undefined;
        });
        break;
      }
      case "polygon.vertices": {
        native = board.create("polygon", refs.map(ref => pointNative(objects, ref)), jxgAttributes(document, output, true));
        const entity = document.entities.find(candidate => candidate.id === output);
        const style = entity ? styleForEntity(document, entity) : undefined;
        if (native && entity?.label && style?.labelVisible) {
          native.label = board.create("text", [
            () => native?.getTextAnchor?.(),
            () => entity.label
          ], {
            display: "internal",
            fixed: true,
            visible: entity.visible !== false,
            fontSize: style.fontSize,
            color: style.stroke,
            opacity: style.opacity,
            highlight: false,
            anchorX: "middle",
            anchorY: "middle",
            offset: style.labelOffset,
            cssStyle: "white-space:nowrap; paint-order:stroke; stroke:#ffffff; stroke-width:3px; stroke-linejoin:round;"
          });
        }
        objects.set(output, native);
        valueResolvers.set(output, () => ({ kind: "polygon2", vertices: refs.map(pointOf) }));
        break;
      }
      case "angle.three_points": {
        const entity = document.entities.find(candidate => candidate.id === output);
        const style = entity ? styleForEntity(document, entity) : undefined;
        const radius = numericParam(node, "radius", 0.6);
        const current = () => angleValue(pointOf(refs[0]!), pointOf(refs[1]!), pointOf(refs[2]!));
        native = board.create("angle", refs.map(ref => pointNative(objects, ref)), {
          ...jxgAttributes(document, output, true),
          name: "",
          withLabel: false,
          selection: "minor",
          radius
        });
        if (native && entity?.label && style?.labelVisible) {
          const authoredLabelRadius = typeof node.params?.labelRadius === "number" ? node.params.labelRadius : undefined;
          const labelPoint = () => {
            const [xmin, ymax, xmax, ymin] = view.boundingBox;
            const pixelsPerUnit = Math.min(
              Math.max(container.clientWidth, 1) / (xmax - xmin),
              Math.max(container.clientHeight, 1) / (ymax - ymin)
            );
            return angleLabelPoint(current(), radius, entity.label!, style.fontSize, pixelsPerUnit, authoredLabelRadius);
          };
          native.label = board.create("text", [
            () => labelPoint().x,
            () => labelPoint().y,
            entity.label
          ], {
            display: "internal",
            fixed: true,
            visible: entity.visible !== false,
            fontSize: style.fontSize,
            color: style.stroke,
            opacity: style.opacity,
            highlight: false,
            anchorX: "middle",
            anchorY: "middle",
            cssStyle: "white-space:nowrap; paint-order:stroke; stroke:#ffffff; stroke-width:3px; stroke-linejoin:round;"
          });
        }
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "marker.right_angle": {
        const current = () => {
          const angle = valueOf(refs[0]!);
          if (!isAngle(angle)) throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", `Entity '${refs[0]}' is not an angle at runtime.`);
          return rightAngleMarkerPolygon(angle, numericParam(node, "size"));
        };
        const markerVertices = [0, 1, 2, 3].map(index => board.create("point", [
          () => current().vertices[index]!.x,
          () => current().vertices[index]!.y
        ], { fixed: true, visible: false, name: "", withLabel: false }));
        native = board.create("polygon", markerVertices, jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "marker.segment_tick": {
        const current = () => {
          const source = valueOf(refs[0]!);
          if (!isSegment(source)) throw new MathEngineError("JSXGRAPH_DYNAMIC_TYPE", `Entity '${refs[0]}' is not a segment at runtime.`);
          return segmentTickMarker(
            source,
            numericParam(node, "position", 0.5),
            numericParam(node, "size")
          );
        };
        const from = board.create("point", [
          () => current().from.x,
          () => current().from.y
        ], { fixed: true, visible: false, name: "", withLabel: false });
        const to = board.create("point", [
          () => current().to.x,
          () => current().to.y
        ], { fixed: true, visible: false, name: "", withLabel: false });
        native = board.create("segment", [from, to], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "marker.parallel_chevron": {
        const current = () => parallelChevronMarker(
          pointOf(refs[0]!),
          lineLikeOf(refs[1]!),
          numericParam(node, "size")
        );
        node.outputs.forEach((id, index) => {
          const from = board.create("point", [
            () => current()[index]!.from.x,
            () => current()[index]!.from.y
          ], { fixed: true, visible: false, name: "", withLabel: false });
          const to = board.create("point", [
            () => current()[index]!.to.x,
            () => current()[index]!.to.y
          ], { fixed: true, visible: false, name: "", withLabel: false });
          const arm = board.create("segment", [from, to], jxgAttributes(document, id, true));
          objects.set(id, arm);
          valueResolvers.set(id, () => current()[index]!);
          bindEvents(id, arm);
          createdIds.push(id);
        });
        return;
      }
      case "conic.ellipse_foci":
      case "conic.parabola_focus_directrix":
      case "conic.hyperbola_foci": {
        const current = () => {
          if (node.command === "conic.ellipse_foci") {
            return ellipseFromFoci(pointOf(refs[0]!), pointOf(refs[1]!), expressionValue(node.params?.majorAxis as string | number));
          }
          if (node.command === "conic.parabola_focus_directrix") {
            return parabolaFromFocusDirectrix(pointOf(refs[0]!), lineLikeToLine(lineLikeOf(refs[1]!)));
          }
          return hyperbolaFromFoci(pointOf(refs[0]!), pointOf(refs[1]!), expressionValue(node.params?.difference as string | number));
        };
        native = board.create("curve", [
          (t: number) => {
            const samples = conicSamplePoints(current(), 120);
            const index = Math.min(samples.length - 1, Math.max(0, Math.floor(t * (samples.length - 1))));
            return samples[index]!.x;
          },
          (t: number) => {
            const samples = conicSamplePoints(current(), 120);
            const index = Math.min(samples.length - 1, Math.max(0, Math.floor(t * (samples.length - 1))));
            return samples[index]!.y;
          },
          0,
          1
        ], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "transform.translate_point": {
        native = board.create("point", [
          () => {
            const source = pointOf(refs[0]!);
            const delta = valueOf(refs[1]!);
            return isVector(delta) ? source.x + delta.x : Number.NaN;
          },
          () => {
            const source = pointOf(refs[0]!);
            const delta = valueOf(refs[1]!);
            return isVector(delta) ? source.y + delta.y : Number.NaN;
          }
        ], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => safeRuntimePoint(native!));
        break;
      }
      case "transform.rotate_point": {
        const current = () => rotatePoint(pointOf(refs[0]!), pointOf(refs[1]!), expressionValue(node.params?.angle as string | number));
        native = board.create("point", [() => current().x, () => current().y], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "transform.reflect_point_line": {
        const current = () => reflectPointAcrossLine(pointOf(refs[0]!), lineLikeToLine(lineLikeOf(refs[1]!)));
        native = board.create("point", [() => current().x, () => current().y], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "transform.dilate_point": {
        const current = () => dilatePoint(pointOf(refs[0]!), pointOf(refs[1]!), expressionValue(node.params?.factor as string | number));
        native = board.create("point", [() => current().x, () => current().y], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, current);
        break;
      }
      case "transform.translate":
        valueResolvers.set(output, () => translateTransform(valueOf(refs[0]!) as never));
        return;
      case "transform.rotate":
        valueResolvers.set(output, () => rotateTransform(pointOf(refs[0]!), expressionValue(node.params?.angle as string | number)));
        return;
      case "transform.reflect":
        valueResolvers.set(output, () => reflectTransform(lineLikeToLine(lineLikeOf(refs[0]!))));
        return;
      case "transform.dilate":
        valueResolvers.set(output, () => dilateTransform(pointOf(refs[0]!), expressionValue(node.params?.factor as string | number)));
        return;
      case "transform.apply": {
        const current = () => {
          const source = valueOf(refs[0]!);
          const transform = valueOf(refs[1]!);
          if (source === undefined || !isTransform(transform)) return undefined;
          return applyTransform(source, transform);
        };
        const sample = current();
        if (isPoint(sample)) {
          native = board.create("point", [() => {
            const value = current();
            return isPoint(value) ? value.x : Number.NaN;
          }, () => {
            const value = current();
            return isPoint(value) ? value.y : Number.NaN;
          }], jxgAttributes(document, output, true));
          objects.set(output, native);
          valueResolvers.set(output, () => {
            const value = current();
            return isPoint(value) ? value : undefined;
          });
          break;
        }
        if (isSegment(sample)) {
          const from = board.create("point", [
            () => {
              const value = current();
              return isSegment(value) ? value.from.x : Number.NaN;
            },
            () => {
              const value = current();
              return isSegment(value) ? value.from.y : Number.NaN;
            }
          ], { fixed: true, visible: false, name: "", withLabel: false });
          const to = board.create("point", [
            () => {
              const value = current();
              return isSegment(value) ? value.to.x : Number.NaN;
            },
            () => {
              const value = current();
              return isSegment(value) ? value.to.y : Number.NaN;
            }
          ], { fixed: true, visible: false, name: "", withLabel: false });
          native = board.create("segment", [from, to], jxgAttributes(document, output, true));
          objects.set(output, native);
          valueResolvers.set(output, () => {
            const value = current();
            return isSegment(value) ? value : undefined;
          });
          break;
        }
        if (isRay(sample)) {
          const from = board.create("point", [
            () => {
              const value = current();
              return isRay(value) ? value.from.x : Number.NaN;
            },
            () => {
              const value = current();
              return isRay(value) ? value.from.y : Number.NaN;
            }
          ], { fixed: true, visible: false, name: "", withLabel: false });
          const through = board.create("point", [
            () => {
              const value = current();
              return isRay(value) ? value.through.x : Number.NaN;
            },
            () => {
              const value = current();
              return isRay(value) ? value.through.y : Number.NaN;
            }
          ], { fixed: true, visible: false, name: "", withLabel: false });
          native = board.create("line", [from, through], {
            ...jxgAttributes(document, output, true),
            straightFirst: false,
            straightLast: true,
            lastArrow: true
          });
          objects.set(output, native);
          valueResolvers.set(output, () => {
            const value = current();
            return isRay(value) ? value : undefined;
          });
          break;
        }
        if (isLine(sample)) {
          const first = board.create("point", [
            () => {
              const value = current();
              return isLine(value) ? value.point.x : Number.NaN;
            },
            () => {
              const value = current();
              return isLine(value) ? value.point.y : Number.NaN;
            }
          ], { fixed: true, visible: false, name: "", withLabel: false });
          const second = board.create("point", [
            () => {
              const value = current();
              return isLine(value) ? value.point.x + value.direction.x : Number.NaN;
            },
            () => {
              const value = current();
              return isLine(value) ? value.point.y + value.direction.y : Number.NaN;
            }
          ], { fixed: true, visible: false, name: "", withLabel: false });
          native = board.create("line", [first, second], jxgAttributes(document, output, true));
          objects.set(output, native);
          valueResolvers.set(output, () => {
            const value = current();
            return isLine(value) ? value : undefined;
          });
          break;
        }
        if (isCircle(sample)) {
          const center = board.create("point", [
            () => {
              const value = current();
              return isCircle(value) ? value.center.x : Number.NaN;
            },
            () => {
              const value = current();
              return isCircle(value) ? value.center.y : Number.NaN;
            }
          ], { fixed: true, visible: false, name: "", withLabel: false });
          native = board.create("circle", [center, () => {
            const value = current();
            return isCircle(value) ? value.radius : Number.NaN;
          }], jxgAttributes(document, output, true));
          objects.set(output, native);
          valueResolvers.set(output, () => {
            const value = current();
            return isCircle(value) ? value : undefined;
          });
          break;
        }
        if (isPolygon(sample)) {
          const vertices = sample.vertices.map((_, index) => board.create("point", [
            () => {
              const value = current();
              return isPolygon(value) ? value.vertices[index]?.x ?? Number.NaN : Number.NaN;
            },
            () => {
              const value = current();
              return isPolygon(value) ? value.vertices[index]?.y ?? Number.NaN : Number.NaN;
            }
          ], { fixed: true, visible: false, name: "", withLabel: false }));
          native = board.create("polygon", vertices, jxgAttributes(document, output, true));
          const entity = document.entities.find(candidate => candidate.id === output);
          const style = entity ? styleForEntity(document, entity) : undefined;
          if (native && entity?.label && style?.labelVisible) {
            native.label = board.create("text", [
              () => native?.getTextAnchor?.(),
              () => entity.label
            ], {
              display: "internal",
              fixed: true,
              visible: entity.visible !== false,
              fontSize: style.fontSize,
              color: style.stroke,
              opacity: style.opacity,
              highlight: false,
              anchorX: "middle",
              anchorY: "middle",
              offset: style.labelOffset,
              cssStyle: "white-space:nowrap; paint-order:stroke; stroke:#ffffff; stroke-width:3px; stroke-linejoin:round;"
            });
          }
          objects.set(output, native);
          valueResolvers.set(output, () => {
            const value = current();
            return isPolygon(value) ? value : undefined;
          });
          break;
        }
        if (isArc(sample)) {
          native = board.create("curve", [
            (t: number) => {
              const value = current();
              if (!isArc(value)) return Number.NaN;
              const sweep = ((value.endAngle - value.startAngle) + Math.PI * 4) % (Math.PI * 2);
              return value.center.x + value.radius * Math.cos(value.startAngle + sweep * t);
            },
            (t: number) => {
              const value = current();
              if (!isArc(value)) return Number.NaN;
              const sweep = ((value.endAngle - value.startAngle) + Math.PI * 4) % (Math.PI * 2);
              return value.center.y + value.radius * Math.sin(value.startAngle + sweep * t);
            },
            0,
            1
          ], jxgAttributes(document, output, true));
          objects.set(output, native);
          valueResolvers.set(output, () => {
            const value = current();
            return isArc(value) ? value : undefined;
          });
          break;
        }
        if (isSector(sample)) {
          native = board.create("curve", [
            (t: number) => {
              const value = current();
              if (!isSector(value)) return Number.NaN;
              if (t < 0.02 || t > 0.98) return value.arc.center.x;
              const sweep = ((value.arc.endAngle - value.arc.startAngle) + Math.PI * 4) % (Math.PI * 2);
              const angle = value.arc.startAngle + sweep * ((t - 0.02) / 0.96);
              return value.arc.center.x + value.arc.radius * Math.cos(angle);
            },
            (t: number) => {
              const value = current();
              if (!isSector(value)) return Number.NaN;
              if (t < 0.02 || t > 0.98) return value.arc.center.y;
              const sweep = ((value.arc.endAngle - value.arc.startAngle) + Math.PI * 4) % (Math.PI * 2);
              const angle = value.arc.startAngle + sweep * ((t - 0.02) / 0.96);
              return value.arc.center.y + value.arc.radius * Math.sin(angle);
            },
            0,
            1
          ], jxgAttributes(document, output, true));
          objects.set(output, native);
          valueResolvers.set(output, () => {
            const value = current();
            return isSector(value) ? value : undefined;
          });
          break;
        }
        valueResolvers.set(output, current);
        return;
      }
      case "function.explicit": {
        const expression = stringParam(node, "expression");
        const domain = domainParam(node);
        native = board.create("functiongraph", [
          (x: number) => expressionValue(expression, { x }),
          domain[0],
          domain[1]
        ], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => ({ kind: "function1", expression, domain }));
        break;
      }
      case "curve.parametric": {
        const xExpression = stringParam(node, "xExpression");
        const yExpression = stringParam(node, "yExpression");
        const parameter = stringParam(node, "parameter", "t");
        const domain = domainParam(node);
        native = board.create("curve", [
          (t: number) => expressionValue(xExpression, { [parameter]: t }),
          (t: number) => expressionValue(yExpression, { [parameter]: t }),
          domain[0],
          domain[1]
        ], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => ({ kind: "curve2", xExpression, yExpression, parameter, domain }));
        break;
      }
      case "text.at": {
        const text = stringParam(node, "text");
        const at = refs[0] ? pointOf(refs[0]) : point(...pairParam(node, "at"));
        native = refs[0]
          ? board.create("text", [() => pointOf(refs[0]!).x, () => pointOf(refs[0]!).y, text], jxgAttributes(document, output, true))
          : board.create("text", [at.x, at.y, text], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => ({ kind: "text", text, at: refs[0] ? pointOf(refs[0]) : at }));
        break;
      }
      case "text.conditional": {
        const trueText = stringParam(node, "trueText");
        const falseText = stringParam(node, "falseText");
        const selectedText = () => valueOf(refs[0]!) === true ? trueText : falseText;
        const at = refs[1] ? pointOf(refs[1]) : point(...pairParam(node, "at"));
        native = refs[1]
          ? board.create("text", [() => pointOf(refs[1]!).x, () => pointOf(refs[1]!).y, selectedText], jxgAttributes(document, output, true))
          : board.create("text", [at.x, at.y, selectedText], jxgAttributes(document, output, true));
        objects.set(output, native);
        valueResolvers.set(output, () => ({ kind: "text", text: selectedText(), at: refs[1] ? pointOf(refs[1]) : at }));
        break;
      }
      case "measurement.distance":
        valueResolvers.set(output, () => distance(pointOf(refs[0]!), pointOf(refs[1]!)));
        return;
      case "measurement.segment_length":
        valueResolvers.set(output, () => {
          const value = valueOf(refs[0]!);
          return value === undefined ? undefined : valueLength(value);
        });
        return;
      case "measurement.angle":
        valueResolvers.set(output, () => angleValue(pointOf(refs[0]!), pointOf(refs[1]!), pointOf(refs[2]!)).radians);
        return;
      case "measurement.slope":
        valueResolvers.set(output, () => {
          const value = valueOf(refs[0]!);
          return value === undefined ? undefined : slope(value);
        });
        return;
      case "measurement.area":
        valueResolvers.set(output, () => {
          const value = valueOf(refs[0]!);
          if (isPolygon(value)) return polygonArea(value);
          if (isCircle(value)) return circleArea(value);
          if (isSector(value)) return sectorArea(value);
          return undefined;
        });
        return;
      case "measurement.perimeter":
        valueResolvers.set(output, () => {
          const value = valueOf(refs[0]!);
          if (isPolygon(value)) return polygonPerimeter(value);
          if (isCircle(value)) return circlePerimeter(value);
          if (isArc(value)) return arcLength(value);
          if (isSegment(value) || isVector(value)) return valueLength(value);
          return undefined;
        });
        return;
      default:
        throw new MathEngineError("JSXGRAPH_UNSUPPORTED_COMMAND", `JSXGraph renderer does not support '${node.command}'.`);
    }

    if (native) {
      bindEvents(output, native);
      createdIds.push(output);
    }
  };

  board.suspendUpdate?.();
  for (const nodeId of graph.order) {
    const node = nodeById.get(nodeId)!;
    try {
      constructNode(node);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      node.outputs.forEach(id => skipped.push({ id, reason: message }));
      warnings.push({
        code: "JSXGRAPH_RENDER_SKIPPED",
        severity: "warning",
        path: `$.construction.${node.id}`,
        message,
        actual: node.command,
        retryable: true
      });
    }
  }
  board.unsuspendUpdate?.();
  board.fullUpdate?.();

  updatePointLabels = (): void => {
    const viewport = labelViewport();
    const layout = currentPointLabelLayout();
    for (const entity of document.entities) {
      if (entity.type !== "point2" || !entity.label || !styleForEntity(document, entity).labelVisible) continue;
      const nativePoint = objects.get(entity.id);
      const placement = layout.get(entity.id);
      if (!nativePoint?.label || !placement) continue;
      const pointScreen = viewport.toScreen(pointOf(entity.id));
      nativePoint.label.setAttribute?.({
        anchorX: "middle",
        anchorY: "middle",
        offset: [placement.x - pointScreen[0], pointScreen[1] - placement.y]
      });
    }
  };
  updatePointLabels();
  board.fullUpdate?.();

  const stopSliderAnimation = (entityId: string): void => {
    const timer = sliderAnimationTimers.get(entityId);
    if (timer !== undefined) host.ownerDocument.defaultView?.clearTimeout(timer);
    sliderAnimationTimers.delete(entityId);
    objects.get(entityId)?.stopAnimation?.();
  };

  const syncSliderAnimations = (visibleIds: Set<string>): void => {
    for (const [entityId, animation] of sliderAnimations) {
      stopSliderAnimation(entityId);
      if (!animation.autoStart || !visibleIds.has(entityId)) continue;
      const native = objects.get(entityId);
      const producerId = graph.producerByEntity.get(entityId);
      const node = producerId ? nodeById.get(producerId) : undefined;
      if (!native?.startAnimation || !node) continue;
      native.setValue?.(animation.direction > 0 ? numericParam(node, "min") : numericParam(node, "max"));
      board.fullUpdate?.();
      const start = (): void => {
        sliderAnimationTimers.delete(entityId);
        native.startAnimation?.(
          animation.direction,
          animation.stepCount,
          animation.delayMs,
          animation.maxRounds
        );
      };
      const window = host.ownerDocument.defaultView;
      if (window && animation.startDelayMs > 0) {
        sliderAnimationTimers.set(entityId, window.setTimeout(start, animation.startDelayMs));
      } else {
        start();
      }
    }
  };

  const applyStage = (nextStage?: string): void => {
    stageId = nextStage;
    const visibleIds = visibleIdsForStage(nextStage);
    for (const entity of document.entities) setVisibility(objects.get(entity.id), visibleIds.has(entity.id));
    updatePointLabels();
    board.fullUpdate?.();
    syncSliderAnimations(visibleIds);
  };
  applyStage(stageId);

  let destroyed = false;
  let resizeObserver: ResizeObserver | undefined;
  let resizeFrame: number | undefined;
  let syncedWidth = 0;
  let syncedHeight = 0;
  const window = host.ownerDocument.defaultView;
  const syncBoardSize = (): void => {
    if (destroyed) return;
    const width = Math.round(host.clientWidth || container.clientWidth);
    const height = Math.round(host.clientHeight || container.clientHeight);
    if (width < 1 || height < 1 || (width === syncedWidth && height === syncedHeight)) return;
    syncedWidth = width;
    syncedHeight = height;
    if (board.updateContainerDims) board.updateContainerDims(width, height);
    else board.resizeContainer?.(width, height, true);
    updatePointLabels();
    board.fullUpdate?.();
  };
  const scheduleBoardSizeSync = (): void => {
    if (destroyed) return;
    if (!window?.requestAnimationFrame) {
      syncBoardSize();
      return;
    }
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;
      syncBoardSize();
    });
  };
  const ResizeObserverConstructor = window?.ResizeObserver;
  if (ResizeObserverConstructor) {
    resizeObserver = new ResizeObserverConstructor(scheduleBoardSizeSync);
    resizeObserver.observe(host);
  }
  const ready = new Promise<void>(resolve => {
    if (!window?.requestAnimationFrame) {
      syncBoardSize();
      resolve();
      return;
    }
    window.requestAnimationFrame(() => {
      syncBoardSize();
      resolve();
    });
  });
  const handle: JsxGraphRuntimeHandle = {
    board,
    document,
    view,
    ready,
    getNative: id => objects.get(id),
    getValue: id => valueOf(id),
    setPoint(entityId, coords) {
      const native = pointNative(objects, entityId);
      if (!isMovable(document, entityId)) throw new MathEngineError("INTERACTION_NOT_ALLOWED", `Point '${entityId}' is not movable.`);
      native.setPosition?.(JXG.COORDS_BY_USER ?? 0, coords);
      updatePointLabels();
      board.fullUpdate?.();
    },
    setScalar(entityId, value) {
      const native = objects.get(entityId);
      if (!native?.setValue) throw new MathEngineError("SCALAR_NOT_INTERACTIVE", `Scalar '${entityId}' is not an interactive slider.`);
      stopSliderAnimation(entityId);
      native.setValue(value);
      updatePointLabels();
      board.fullUpdate?.();
    },
    setStage: applyStage,
    exportSvg() {
      const root = board.renderer?.svgRoot ?? container.querySelector("svg");
      if (!root) throw new MathEngineError("JSXGRAPH_SVG_UNAVAILABLE", "The active JSXGraph renderer did not expose an SVG root.");
      return normalizeSvg(root.outerHTML);
    },
    exportDirectSvg(width = Math.max(1, host.clientWidth || 960), height = Math.max(1, host.clientHeight || 640)) {
      return renderDirectSvg(document, { viewId: view.id, width, height, stageId });
    },
    report() {
      const payload = {
        documentId: document.documentId,
        revision: document.revision,
        viewId: view.id,
        renderedEntities: createdIds,
        skipped
      };
      return {
        backend: view.renderer === "jsxgraph-canvas" ? "jsxgraph-canvas" : "jsxgraph-svg",
        viewId: view.id,
        width: Math.max(1, host.clientWidth || 0),
        height: Math.max(1, host.clientHeight || 0),
        renderedEntities: [...createdIds],
        skippedEntities: [...skipped],
        warnings: [...warnings],
        renderHash: stableHash(payload)
      };
    },
    destroy() {
      destroyed = true;
      resizeObserver?.disconnect();
      if (resizeFrame !== undefined) window?.cancelAnimationFrame(resizeFrame);
      for (const entityId of sliderAnimations.keys()) stopSliderAnimation(entityId);
      // JSXGraph throttles ResizeObserver work with setTimeout. An already queued
      // callback can otherwise run after freeBoard() has removed board.renderer.
      board.stopResizeObserver?.();
      board.updateContainerDims = () => board;
      JXG.JSXGraph.freeBoard(board);
      host.replaceChildren();
      objects.clear();
      valueResolvers.clear();
    }
  };

  return handle;
}
