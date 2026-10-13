/** Intrinsic path coordinates. These are native internal parameters, NOT GeoGebra's normalized PathParameter command. */
import type { Point2Value, RuntimeValue } from "../types.js";
import { MathEngineError } from "../errors.js";
import { isLine, isSegment, isRay, isCircle, point, projectPointToPath } from "./geometry.js";

function requireFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new MathEngineError("INVALID_PATH_PARAMETER", `${name} must be finite.`);
  return value;
}
function requireScale(scale: number): number {
  requireFinite(scale, "Path scale");
  if (scale <= 0) throw new MathEngineError("INVALID_PATH_PARAMETER", "Path scale must be positive.");
  return scale;
}
/** Line: signed coefficient in its oriented frame. Segment/ray: affine fraction. Circle: angle in radians. */
export function pathParameterAt(source: Point2Value, path: RuntimeValue, scale = 1): number {
  requireFinite(source.x, "x"); requireFinite(source.y, "y");
  requireScale(scale);
  if (isLine(path)) return requireFinite(((source.x-path.point.x)*path.direction.x + (source.y-path.point.y)*path.direction.y)/scale, "Parameter");
  if (isSegment(path) || isRay(path)) {
    const end = isSegment(path) ? path.to : path.through;
    const dx=end.x-path.from.x, dy=end.y-path.from.y;
    const denominator=dx*dx+dy*dy;
    if (!(denominator>0)) throw new MathEngineError("DEGENERATE_PATH", "Cannot parameterize a collapsed linear path.");
    const t=requireFinite(((source.x-path.from.x)*dx+(source.y-path.from.y)*dy)/denominator, "Parameter");
    return isSegment(path) ? Math.max(0,Math.min(1,t)) : Math.max(0,t);
  }
  if (isCircle(path)) {
    const projected=projectPointToPath(source,path);
    return Math.atan2(projected.y-path.center.y,projected.x-path.center.x);
  }
  throw new MathEngineError("UNSUPPORTED_PATH_PARAMETER", "Intrinsic parameters currently support lines, segments, rays and circles.");
}
export function pointAtPathParameter(path: RuntimeValue, parameter: number, scale = 1): Point2Value {
  requireFinite(parameter, "Parameter"); requireScale(scale);
  let x: number, y: number;
  if (isLine(path)) {
    x=path.point.x+parameter*scale*path.direction.x; y=path.point.y+parameter*scale*path.direction.y;
  } else if (isSegment(path) || isRay(path)) {
    const t=isSegment(path)?Math.max(0,Math.min(1,parameter)):Math.max(0,parameter);
    const end=isSegment(path)?path.to:path.through;
    x=path.from.x+t*(end.x-path.from.x); y=path.from.y+t*(end.y-path.from.y);
  } else if (isCircle(path)) {
    x=path.center.x+path.radius*Math.cos(parameter); y=path.center.y+path.radius*Math.sin(parameter);
  } else throw new MathEngineError("UNSUPPORTED_PATH_PARAMETER", "Intrinsic parameters currently support lines, segments, rays and circles.");
  return point(requireFinite(x,"x"),requireFinite(y,"y"));
}
