import { MathEngineError } from "../errors.js";
import type {
  Line3Value,
  Plane3Value,
  Point3Value,
  Segment3Value,
  Sphere3Value,
  Vector3Value
} from "../types.js";
import { DEFAULT_TOLERANCE } from "./geometry.js";

function finite3(x: number, y: number, z: number, label: string): void {
  if (![x, y, z].every(Number.isFinite)) {
    throw new MathEngineError("NON_FINITE_GEOMETRY", `${label} coordinates must be finite.`, { actual: [x, y, z] });
  }
}

export function point3(x: number, y: number, z: number): Point3Value {
  finite3(x, y, z, "Point3");
  return { kind: "point3", x, y, z };
}

export function vector3(x: number, y: number, z: number): Vector3Value {
  finite3(x, y, z, "Vector3");
  return { kind: "vector3", x, y, z };
}

export function isPoint3(value: unknown): value is Point3Value {
  return Boolean(value && typeof value === "object" && (value as Point3Value).kind === "point3");
}
export function isVector3(value: unknown): value is Vector3Value {
  return Boolean(value && typeof value === "object" && (value as Vector3Value).kind === "vector3");
}
export function isLine3(value: unknown): value is Line3Value {
  return Boolean(value && typeof value === "object" && (value as Line3Value).kind === "line3");
}
export function isSegment3(value: unknown): value is Segment3Value {
  return Boolean(value && typeof value === "object" && (value as Segment3Value).kind === "segment3");
}
export function isPlane3(value: unknown): value is Plane3Value {
  return Boolean(value && typeof value === "object" && (value as Plane3Value).kind === "plane3");
}

export function subtractPoints3(to: Point3Value, from: Point3Value): Vector3Value {
  return vector3(to.x - from.x, to.y - from.y, to.z - from.z);
}

export function cross3(a: Vector3Value, b: Vector3Value): Vector3Value {
  return vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

export function norm3(value: Vector3Value): number {
  return Math.hypot(value.x, value.y, value.z);
}

export function normalized3(value: Vector3Value): Vector3Value {
  const length = norm3(value);
  if (length <= DEFAULT_TOLERANCE) throw new MathEngineError("DEGENERATE_VECTOR", "A zero-length 3D vector cannot be normalized.");
  return vector3(value.x / length, value.y / length, value.z / length);
}

export function line3FromPoints(from: Point3Value, to: Point3Value): Line3Value {
  return { kind: "line3", point: from, direction: normalized3(subtractPoints3(to, from)) };
}

export function segment3(from: Point3Value, to: Point3Value): Segment3Value {
  if (norm3(subtractPoints3(to, from)) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_SEGMENT", "A 3D segment requires two distinct points.");
  }
  return { kind: "segment3", from, to };
}

export function plane3ThroughPoints(a: Point3Value, b: Point3Value, c: Point3Value): Plane3Value {
  const basisU = subtractPoints3(b, a);
  const basisV = subtractPoints3(c, a);
  const normal = cross3(basisU, basisV);
  if (norm3(normal) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_PLANE", "A plane requires three non-collinear points.");
  }
  return { kind: "plane3", origin: a, basisU, basisV, normal: normalized3(normal) };
}

export function sphere3(center: Point3Value, radius: number): Sphere3Value {
  if (!Number.isFinite(radius) || radius <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("INVALID_RADIUS", "A sphere radius must be finite and positive.", { actual: radius });
  }
  return { kind: "sphere3", center, radius };
}
