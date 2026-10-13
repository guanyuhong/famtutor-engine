import { MathEngineError } from "../errors.js";
import type {
  AngleValue,
  Arc2Value,
  Circle2Value,
  Conic2Value,
  Line2Value,
  Point2Value,
  Polygon2Value,
  Ray2Value,
  RuntimeValue,
  Sector2Value,
  Segment2Value,
  Transform2Value,
  Vector2Value
} from "../types.js";
import { clamp } from "../util.js";

export const DEFAULT_TOLERANCE = 1e-9;

export function point(x: number, y: number): Point2Value {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new MathEngineError("NON_FINITE_GEOMETRY", "Point coordinates must be finite.", {
      actual: [x, y]
    });
  }
  return { kind: "point2", x, y };
}

export function vector(x: number, y: number): Vector2Value {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new MathEngineError("NON_FINITE_GEOMETRY", "Vector coordinates must be finite.", {
      actual: [x, y]
    });
  }
  return { kind: "vector2", x, y };
}

export function isPoint(value: unknown): value is Point2Value {
  return Boolean(value && typeof value === "object" && (value as Point2Value).kind === "point2");
}

export function isVector(value: unknown): value is Vector2Value {
  return Boolean(value && typeof value === "object" && (value as Vector2Value).kind === "vector2");
}

export function isLine(value: unknown): value is Line2Value {
  return Boolean(value && typeof value === "object" && (value as Line2Value).kind === "line2");
}

export function isSegment(value: unknown): value is Segment2Value {
  return Boolean(value && typeof value === "object" && (value as Segment2Value).kind === "segment2");
}

export function isRay(value: unknown): value is Ray2Value {
  return Boolean(value && typeof value === "object" && (value as Ray2Value).kind === "ray2");
}

export function isCircle(value: unknown): value is Circle2Value {
  return Boolean(value && typeof value === "object" && (value as Circle2Value).kind === "circle2");
}

export function isPolygon(value: unknown): value is Polygon2Value {
  return Boolean(value && typeof value === "object" && (value as Polygon2Value).kind === "polygon2");
}

export function regularPolygon(
  center: Point2Value,
  radius: number,
  vertexCount: number,
  rotation = Math.PI / 2
): Polygon2Value {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new MathEngineError("INVALID_REGULAR_POLYGON_RADIUS", "Regular polygon radius must be positive and finite.", { actual: radius });
  }
  if (!Number.isInteger(vertexCount) || vertexCount < 3 || vertexCount > 64) {
    throw new MathEngineError("INVALID_REGULAR_POLYGON_VERTEX_COUNT", "Regular polygon vertexCount must be an integer from 3 to 64.", { actual: vertexCount, expected: "3..64" });
  }
  if (!Number.isFinite(rotation)) {
    throw new MathEngineError("INVALID_REGULAR_POLYGON_ROTATION", "Regular polygon rotation must be finite.", { actual: rotation });
  }
  return {
    kind: "polygon2",
    vertices: Array.from({ length: vertexCount }, (_, index) => point(
      center.x + radius * Math.cos(rotation + 2 * Math.PI * index / vertexCount),
      center.y + radius * Math.sin(rotation + 2 * Math.PI * index / vertexCount)
    ))
  };
}

export function polygonDiagonals(value: Polygon2Value, fromVertex?: number): Segment2Value[] {
  const count = value.vertices.length;
  if (count < 3) throw new MathEngineError("INVALID_POLYGON", "Polygon diagonals require at least three vertices.");
  if (fromVertex !== undefined && (!Number.isInteger(fromVertex) || fromVertex < 0 || fromVertex >= count)) {
    throw new MathEngineError("INVALID_POLYGON_VERTEX_INDEX", "fromVertex must identify an existing zero-based polygon vertex.", { actual: fromVertex, expected: `0..${count - 1}` });
  }
  const diagonals: Segment2Value[] = [];
  for (let left = 0; left < count; left += 1) {
    for (let right = left + 1; right < count; right += 1) {
      const adjacent = right === left + 1 || (left === 0 && right === count - 1);
      if (adjacent) continue;
      if (fromVertex !== undefined && left !== fromVertex && right !== fromVertex) continue;
      diagonals.push(segment(value.vertices[left]!, value.vertices[right]!));
    }
  }
  return diagonals;
}

export function isAngle(value: unknown): value is AngleValue {
  return Boolean(value && typeof value === "object" && (value as AngleValue).kind === "angle");
}

export function isArc(value: unknown): value is Arc2Value {
  return Boolean(value && typeof value === "object" && (value as Arc2Value).kind === "arc2");
}

export function isSector(value: unknown): value is Sector2Value {
  return Boolean(value && typeof value === "object" && (value as Sector2Value).kind === "sector2");
}

export function isConic(value: unknown): value is Conic2Value {
  return Boolean(value && typeof value === "object" && (value as Conic2Value).kind === "conic2");
}

export function isTransform(value: unknown): value is Transform2Value {
  return Boolean(value && typeof value === "object" && (value as Transform2Value).kind === "transform2");
}

export function addPointVector(base: Point2Value, delta: Vector2Value): Point2Value {
  return point(base.x + delta.x, base.y + delta.y);
}

export function subtractPoints(to: Point2Value, from: Point2Value): Vector2Value {
  return vector(to.x - from.x, to.y - from.y);
}

export function scaleVector(value: Vector2Value, factor: number): Vector2Value {
  return vector(value.x * factor, value.y * factor);
}

export function dot(left: Vector2Value, right: Vector2Value): number {
  return left.x * right.x + left.y * right.y;
}

export function cross(left: Vector2Value, right: Vector2Value): number {
  return left.x * right.y - left.y * right.x;
}

export function norm(value: Vector2Value): number {
  return Math.hypot(value.x, value.y);
}

export function normalized(value: Vector2Value, tolerance = DEFAULT_TOLERANCE): Vector2Value {
  const length = norm(value);
  if (length <= tolerance) {
    throw new MathEngineError("DEGENERATE_VECTOR", "A zero-length vector cannot be normalized.");
  }
  return vector(value.x / length, value.y / length);
}

export function rightAngleMarkerPolygon(
  angle: AngleValue,
  size: number,
  tolerance = 1e-6
): Polygon2Value {
  if (!Number.isFinite(size) || size <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("INVALID_MARKER_SIZE", "Right-angle marker size must be finite and positive.", {
      actual: size
    });
  }
  const residual = Math.abs(angle.radians - Math.PI / 2);
  if (residual > tolerance) {
    throw new MathEngineError("NOT_RIGHT_ANGLE", "marker.right_angle requires an angle equal to 90 degrees.", {
      expected: Math.PI / 2,
      actual: angle.radians
    });
  }
  const firstDirection = normalized(subtractPoints(angle.from, angle.vertex));
  const secondDirection = normalized(subtractPoints(angle.to, angle.vertex));
  const firstCorner = addPointVector(angle.vertex, scaleVector(firstDirection, size));
  const secondCorner = addPointVector(angle.vertex, scaleVector(secondDirection, size));
  const outerCorner = addPointVector(firstCorner, scaleVector(secondDirection, size));
  return { kind: "polygon2", vertices: [angle.vertex, firstCorner, outerCorner, secondCorner] };
}

/**
 * Create one standard equality tick centered on a segment.
 *
 * `position` is the fractional distance from `source.from` to `source.to` and
 * `size` is the full tick length, both independent of renderer pixels.
 * Multiple-tick conventions are composed by calling this atom more than once
 * with different positions.
 */
export function segmentTickMarker(
  source: Segment2Value,
  position: number,
  size: number
): Segment2Value {
  if (!Number.isFinite(position) || position < 0 || position > 1) {
    throw new MathEngineError("INVALID_MARKER_POSITION", "Segment tick position must be between 0 and 1.", {
      actual: position
    });
  }
  if (!Number.isFinite(size) || size <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("INVALID_MARKER_SIZE", "Segment tick size must be finite and positive.", {
      actual: size
    });
  }
  const direction = normalized(subtractPoints(source.to, source.from));
  const normal = vector(-direction.y, direction.x);
  const center = point(
    source.from.x + (source.to.x - source.from.x) * position,
    source.from.y + (source.to.y - source.from.y) * position
  );
  const half = scaleVector(normal, size / 2);
  return segment(addPointVector(center, scaleVector(half, -1)), addPointVector(center, half));
}

/**
 * Create one renderer-independent parallel-line chevron.
 *
 * The anchor selects the marker location and the line-like input supplies only
 * orientation. Direction is canonicalized so reversing a segment's endpoints
 * does not flip the visual convention. A double chevron is two calls with two
 * nearby anchor points, keeping this L0 primitive atomic.
 */
export function parallelChevronMarker(
  anchor: Point2Value,
  source: Line2Value | Segment2Value | Ray2Value,
  size: number
): [Segment2Value, Segment2Value] {
  if (!Number.isFinite(size) || size <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("INVALID_MARKER_SIZE", "Parallel chevron size must be finite and positive.", {
      actual: size
    });
  }
  const line = lineLikeToLine(source);
  let tangent = normalized(line.direction);
  if (tangent.x < -DEFAULT_TOLERANCE || (Math.abs(tangent.x) <= DEFAULT_TOLERANCE && tangent.y < 0)) {
    tangent = scaleVector(tangent, -1);
  }
  const normal = vector(-tangent.y, tangent.x);
  const tip = addPointVector(anchor, scaleVector(tangent, size / 2));
  const back = addPointVector(anchor, scaleVector(tangent, -size / 2));
  const halfHeight = scaleVector(normal, size / 2);
  return [
    segment(addPointVector(back, halfHeight), tip),
    segment(addPointVector(back, scaleVector(halfHeight, -1)), tip)
  ];
}

export function distance(left: Point2Value, right: Point2Value): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function midpoint(left: Point2Value, right: Point2Value): Point2Value {
  return point((left.x + right.x) / 2, (left.y + right.y) / 2);
}

export function lineFromPointDirection(origin: Point2Value, directionValue: Vector2Value): Line2Value {
  const direction = normalized(directionValue);
  let a = -direction.y;
  let b = direction.x;
  let c = -(a * origin.x + b * origin.y);
  const normalLength = Math.hypot(a, b);
  a /= normalLength;
  b /= normalLength;
  c /= normalLength;
  if (a < -DEFAULT_TOLERANCE || (Math.abs(a) <= DEFAULT_TOLERANCE && b < 0)) {
    a *= -1;
    b *= -1;
    c *= -1;
  }
  return { kind: "line2", a, b, c, point: origin, direction };
}

export function lineFromPoints(left: Point2Value, right: Point2Value): Line2Value {
  const direction = subtractPoints(right, left);
  if (norm(direction) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_LINE", "A line requires two distinct points.");
  }
  return lineFromPointDirection(left, direction);
}

export function lineLikeToLine(value: RuntimeValue): Line2Value {
  if (isLine(value)) return value;
  if (isSegment(value)) return lineFromPoints(value.from, value.to);
  if (isRay(value)) return lineFromPoints(value.from, value.through);
  throw new MathEngineError("TYPE_MISMATCH", "Expected a line, segment, or ray.");
}

export function segment(from: Point2Value, to: Point2Value): Segment2Value {
  if (distance(from, to) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_SEGMENT", "A segment requires two distinct points.");
  }
  return { kind: "segment2", from, to };
}

export function ray(from: Point2Value, through: Point2Value): Ray2Value {
  const direction = subtractPoints(through, from);
  if (norm(direction) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_RAY", "A ray requires two distinct points.");
  }
  return { kind: "ray2", from, through, direction: normalized(direction) };
}

export function angleBisectorRay(
  left: Point2Value,
  vertex: Point2Value,
  right: Point2Value,
  branch: "internal" | "external"
): Ray2Value {
  const leftVector = subtractPoints(left, vertex);
  const rightVector = subtractPoints(right, vertex);
  const leftNorm = norm(leftVector);
  const rightNorm = norm(rightVector);
  if (leftNorm <= DEFAULT_TOLERANCE || rightNorm <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_ANGLE", "An angle bisector requires both arms to have nonzero length.");
  }
  const leftUnit = scaleVector(leftVector, 1 / leftNorm);
  const rightUnit = scaleVector(rightVector, 1 / rightNorm);
  const direction = branch === "internal"
    ? vector(leftUnit.x + rightUnit.x, leftUnit.y + rightUnit.y)
    : vector(leftUnit.x - rightUnit.x, leftUnit.y - rightUnit.y);
  if (norm(direction) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError(
      "DEGENERATE_ANGLE_BISECTOR",
      branch === "internal"
        ? "The internal bisector is undefined for opposite angle arms."
        : "The external bisector is undefined for coincident angle arms."
    );
  }
  return ray(vertex, addPointVector(vertex, normalized(direction)));
}

export function circle(center: Point2Value, radius: number, allowPointCircle = false): Circle2Value {
  if (!Number.isFinite(radius) || (allowPointCircle ? radius < 0 : radius <= DEFAULT_TOLERANCE)) {
    throw new MathEngineError("INVALID_RADIUS", "Circle radius must be finite and positive, or zero with explicit allowPointCircle.", {
      actual: radius
    });
  }
  return { kind: "circle2", center, radius };
}

export function circumcircle(a: Point2Value, b: Point2Value, c: Point2Value): Circle2Value {
  const determinant = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(determinant) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_CIRCUMCIRCLE", "Three collinear points do not define a circle.");
  }
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / determinant;
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / determinant;
  const center = point(ux, uy);
  return circle(center, distance(center, a));
}

export function projectPointToLine(source: Point2Value, target: Line2Value): Point2Value {
  const signed = target.a * source.x + target.b * source.y + target.c;
  return point(source.x - target.a * signed, source.y - target.b * signed);
}

export function projectPointToSegment(source: Point2Value, target: Segment2Value): Point2Value {
  const direction = subtractPoints(target.to, target.from);
  const denominator = dot(direction, direction);
  if (denominator <= DEFAULT_TOLERANCE) return target.from;
  const t = clamp(dot(subtractPoints(source, target.from), direction) / denominator, 0, 1);
  return point(target.from.x + direction.x * t, target.from.y + direction.y * t);
}

export function projectPointToRay(source: Point2Value, target: Ray2Value): Point2Value {
  const direction = target.direction;
  const t = Math.max(0, dot(subtractPoints(source, target.from), direction));
  return point(target.from.x + direction.x * t, target.from.y + direction.y * t);
}

export function projectPointToCircle(source: Point2Value, target: Circle2Value): Point2Value {
  const direction = subtractPoints(source, target.center);
  if (norm(direction) <= DEFAULT_TOLERANCE) {
    return point(target.center.x + target.radius, target.center.y);
  }
  const unit = normalized(direction);
  return point(target.center.x + unit.x * target.radius, target.center.y + unit.y * target.radius);
}

export function normalizeAngle(radians: number): number {
  let value = radians % (Math.PI * 2);
  if (value < 0) value += Math.PI * 2;
  return value;
}

export function angleOfPoint(center: Point2Value, target: Point2Value): number {
  return Math.atan2(target.y - center.y, target.x - center.x);
}

export function pointOnCircle(center: Point2Value, radius: number, angle: number): Point2Value {
  return point(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle));
}

/** Inclusive CCW sweep from startAngle to endAngle in [0, 2π). */
export function angleInArcSweep(angle: number, startAngle: number, endAngle: number, tolerance = DEFAULT_TOLERANCE): boolean {
  const theta = normalizeAngle(angle);
  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(endAngle);
  if (Math.abs(start - end) <= tolerance) return true;
  if (start <= end) return theta + tolerance >= start && theta - tolerance <= end;
  return theta + tolerance >= start || theta - tolerance <= end;
}

export function clampAngleToArc(angle: number, startAngle: number, endAngle: number): number {
  const theta = normalizeAngle(angle);
  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(endAngle);
  if (angleInArcSweep(theta, start, end)) return theta;
  const distStart = Math.min(normalizeAngle(theta - start), normalizeAngle(start - theta));
  const distEnd = Math.min(normalizeAngle(theta - end), normalizeAngle(end - theta));
  return distStart <= distEnd ? start : end;
}

export function arcFromCenterPoints(center: Point2Value, start: Point2Value, end: Point2Value): Arc2Value {
  const radius = distance(center, start);
  if (radius <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_ARC", "Arc radius must be positive.");
  }
  if (!almostEqual(radius, distance(center, end))) {
    throw new MathEngineError("DEGENERATE_ARC", "Arc endpoints must lie on the same circle about the center.");
  }
  const startAngle = angleOfPoint(center, start);
  const endAngle = angleOfPoint(center, end);
  return {
    kind: "arc2",
    center,
    radius,
    start: pointOnCircle(center, radius, startAngle),
    end: pointOnCircle(center, radius, endAngle),
    startAngle,
    endAngle
  };
}

export function arcFromThreePoints(a: Point2Value, b: Point2Value, c: Point2Value): Arc2Value {
  const circ = circumcircle(a, b, c);
  const startAngle = angleOfPoint(circ.center, a);
  const midAngle = angleOfPoint(circ.center, b);
  const endAngle = angleOfPoint(circ.center, c);
  if (!angleInArcSweep(midAngle, startAngle, endAngle)) {
    return {
      kind: "arc2",
      center: circ.center,
      radius: circ.radius,
      start: pointOnCircle(circ.center, circ.radius, startAngle),
      end: pointOnCircle(circ.center, circ.radius, endAngle),
      startAngle: endAngle,
      endAngle: startAngle
    };
  }
  return {
    kind: "arc2",
    center: circ.center,
    radius: circ.radius,
    start: pointOnCircle(circ.center, circ.radius, startAngle),
    end: pointOnCircle(circ.center, circ.radius, endAngle),
    startAngle,
    endAngle
  };
}

export function sectorFromArc(arc: Arc2Value): Sector2Value {
  return { kind: "sector2", arc };
}

export function arcSweepRadians(arc: Arc2Value): number {
  const start = normalizeAngle(arc.startAngle);
  const end = normalizeAngle(arc.endAngle);
  if (Math.abs(start - end) <= DEFAULT_TOLERANCE) return 0;
  return start <= end ? end - start : Math.PI * 2 - (start - end);
}

export function arcLength(arc: Arc2Value): number {
  return arc.radius * arcSweepRadians(arc);
}

export function sectorArea(sector: Sector2Value): number {
  return 0.5 * sector.arc.radius ** 2 * arcSweepRadians(sector.arc);
}

export function projectPointToArc(source: Point2Value, target: Arc2Value): Point2Value {
  const angle = clampAngleToArc(angleOfPoint(target.center, source), target.startAngle, target.endAngle);
  return pointOnCircle(target.center, target.radius, angle);
}

export function projectPointToPolygon(source: Point2Value, target: Polygon2Value): Point2Value {
  if (target.vertices.length < 2) {
    throw new MathEngineError("DEGENERATE_POLYGON", "Polygon projection requires at least two vertices.");
  }
  let best = target.vertices[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < target.vertices.length; index += 1) {
    const from = target.vertices[index]!;
    const to = target.vertices[(index + 1) % target.vertices.length]!;
    if (distance(from, to) <= DEFAULT_TOLERANCE) continue;
    const candidate = projectPointToSegment(source, segment(from, to));
    const candidateDistance = distance(source, candidate);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

export function projectPointToPath(source: Point2Value, target: RuntimeValue): Point2Value {
  if (isLine(target)) return projectPointToLine(source, target);
  if (isSegment(target)) return projectPointToSegment(source, target);
  if (isRay(target)) return projectPointToRay(source, target);
  if (isCircle(target)) return projectPointToCircle(source, target);
  if (isArc(target)) return projectPointToArc(source, target);
  if (isPolygon(target)) return projectPointToPolygon(source, target);
  throw new MathEngineError("UNSUPPORTED_PATH", "Point-on-path supports line, segment, ray, circle, arc, and polygon.");
}

/** Invert a point in a circle. The inversion center itself has no finite image. */
export function invertPointInCircle(source: Point2Value, inversion: Circle2Value): Point2Value {
  const delta = subtractPoints(source, inversion.center);
  const distanceSquared = dot(delta, delta);
  if (distanceSquared <= DEFAULT_TOLERANCE ** 2) {
    throw new MathEngineError("INVERSION_CENTER_UNDEFINED", "The inversion center has no finite inverse point.", {
      actual: [source.x, source.y],
      retryable: true
    });
  }
  return addPointVector(inversion.center, scaleVector(delta, inversion.radius ** 2 / distanceSquared));
}

/**
 * Invert a circle in another circle.
 *
 * A source circle through the inversion center maps to a line and is rejected
 * because this command has the intentionally narrow `circle2 -> circle2`
 * contract. This keeps entity typing deterministic without introducing a
 * generalized-circle union before a real downstream need exists.
 */
export function invertCircleInCircle(source: Circle2Value, inversion: Circle2Value): Circle2Value {
  const centerDelta = subtractPoints(source.center, inversion.center);
  const denominator = dot(centerDelta, centerDelta) - source.radius ** 2;
  if (Math.abs(denominator) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("INVERSION_OUTPUT_NOT_CIRCLE", "A circle through the inversion center maps to a line, not circle2.", {
      actual: {
        source: [source.center.x, source.center.y, source.radius],
        inversion: [inversion.center.x, inversion.center.y, inversion.radius]
      },
      expected: "source circle not passing through inversion center",
      retryable: true
    });
  }
  const scale = inversion.radius ** 2 / denominator;
  return circle(
    addPointVector(inversion.center, scaleVector(centerDelta, scale)),
    Math.abs(scale) * source.radius,
    source.radius === 0 && inversion.radius > 0 // Preserve an admitted point circle, not a singular inversion.
  );
}

/**
 * Select one oriented common tangent of two circles.
 *
 * `side1` and `side2` are signed contact sides (`-1` or `1`). Calling this
 * atom for all four sign pairs yields the four common tangents of strictly
 * disjoint circles; impossible branches fail with `COMMON_TANGENT_UNDEFINED`.
 */
export function commonTangentLine(
  first: Circle2Value,
  second: Circle2Value,
  side1: number,
  side2: number
): Line2Value {
  if (![side1, side2].every(side => side === -1 || side === 1)) {
    throw new MathEngineError("INVALID_TANGENT_SIDE", "Common-tangent sides must be -1 or 1.", {
      actual: [side1, side2],
      expected: [-1, 1]
    });
  }
  const between = subtractPoints(second.center, first.center);
  const centerDistance = norm(between);
  if (centerDistance <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("CONCENTRIC_CIRCLES", "Concentric circles do not define a unique common-tangent branch.");
  }
  const signedRadiusDelta = side1 * first.radius - side2 * second.radius;
  const cosine = signedRadiusDelta / centerDistance;
  if (Math.abs(cosine) > 1 + DEFAULT_TOLERANCE) {
    throw new MathEngineError("COMMON_TANGENT_UNDEFINED", "The selected common-tangent branch does not exist for these circles.", {
      actual: { centerDistance, signedRadiusDelta, side1, side2 },
      retryable: true
    });
  }
  const axis = scaleVector(between, 1 / centerDistance);
  const boundedCosine = clamp(cosine, -1, 1);
  const sine = Math.sqrt(Math.max(0, 1 - boundedCosine ** 2));
  const normalVector = vector(
    axis.x * boundedCosine - axis.y * sine,
    axis.y * boundedCosine + axis.x * sine
  );
  const firstContact = addPointVector(first.center, scaleVector(normalVector, side1 * first.radius));
  return lineFromPointDirection(firstContact, vector(-normalVector.y, normalVector.x));
}

/** Stable order: increasing signed parameter t along the line direction. Tangent → duplicate point. */
export function intersectLineCircle(lineValue: Line2Value, circleValue: Circle2Value): [Point2Value, Point2Value] {
  const foot = projectPointToLine(circleValue.center, lineValue);
  const centerDistance = distance(foot, circleValue.center);
  const deltaSquared = circleValue.radius ** 2 - centerDistance ** 2;
  if (deltaSquared < -DEFAULT_TOLERANCE) {
    throw new MathEngineError("NO_INTERSECTION", "The line and circle do not intersect.");
  }
  const delta = Math.sqrt(Math.max(0, deltaSquared));
  const direction = lineValue.direction;
  const first = point(foot.x - direction.x * delta, foot.y - direction.y * delta);
  const second = point(foot.x + direction.x * delta, foot.y + direction.y * delta);
  const tFirst = dot(subtractPoints(first, lineValue.point), direction);
  const tSecond = dot(subtractPoints(second, lineValue.point), direction);
  return tFirst <= tSecond ? [first, second] : [second, first];
}

/** Stable order: increasing polar angle about the first circle center. Tangent → duplicate point. */
export function intersectCircles(left: Circle2Value, right: Circle2Value): [Point2Value, Point2Value] {
  const delta = subtractPoints(right.center, left.center);
  const d = norm(delta);
  if (d <= DEFAULT_TOLERANCE && Math.abs(left.radius - right.radius) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("COINCIDENT_CIRCLES", "Coincident circles have infinitely many intersections.");
  }
  if (d > left.radius + right.radius + DEFAULT_TOLERANCE || d < Math.abs(left.radius - right.radius) - DEFAULT_TOLERANCE) {
    throw new MathEngineError("NO_INTERSECTION", "The circles do not intersect.");
  }
  if (d <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("NO_INTERSECTION", "Concentric circles do not intersect.");
  }
  const a = (left.radius ** 2 - right.radius ** 2 + d ** 2) / (2 * d);
  const hSquared = left.radius ** 2 - a ** 2;
  const h = Math.sqrt(Math.max(0, hSquared));
  const unit = vector(delta.x / d, delta.y / d);
  const base = point(left.center.x + unit.x * a, left.center.y + unit.y * a);
  const perpendicular = vector(-unit.y, unit.x);
  const first = point(base.x - perpendicular.x * h, base.y - perpendicular.y * h);
  const second = point(base.x + perpendicular.x * h, base.y + perpendicular.y * h);
  const angleFirst = angleOfPoint(left.center, first);
  const angleSecond = angleOfPoint(left.center, second);
  return angleFirst <= angleSecond ? [first, second] : [second, first];
}

export function intersectLines(left: Line2Value, right: Line2Value): Point2Value {
  const determinant = left.a * right.b - right.a * left.b;
  if (Math.abs(determinant) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("PARALLEL_LINES", "Parallel or coincident lines do not have a unique intersection.");
  }
  const x = (left.b * right.c - right.b * left.c) / determinant;
  const y = (left.c * right.a - right.c * left.a) / determinant;
  return point(x, y);
}

export function angleAt(from: Point2Value, vertex: Point2Value, to: Point2Value): number {
  const left = subtractPoints(from, vertex);
  const right = subtractPoints(to, vertex);
  const leftNorm = norm(left);
  const rightNorm = norm(right);
  if (leftNorm <= DEFAULT_TOLERANCE || rightNorm <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_ANGLE", "An angle requires three points with nonzero arms.");
  }
  const cosine = clamp(dot(left, right) / (leftNorm * rightNorm), -1, 1);
  return Math.acos(cosine);
}

export function angleValue(from: Point2Value, vertex: Point2Value, to: Point2Value): AngleValue {
  return { kind: "angle", from, vertex, to, radians: angleAt(from, vertex, to) };
}

export function rotatePoint(source: Point2Value, center: Point2Value, radians: number): Point2Value {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = source.x - center.x;
  const dy = source.y - center.y;
  return point(center.x + dx * cosine - dy * sine, center.y + dx * sine + dy * cosine);
}

export function reflectPointAcrossLine(source: Point2Value, target: Line2Value): Point2Value {
  const projection = projectPointToLine(source, target);
  return point(2 * projection.x - source.x, 2 * projection.y - source.y);
}

export function dilatePoint(source: Point2Value, center: Point2Value, factor: number): Point2Value {
  return point(center.x + (source.x - center.x) * factor, center.y + (source.y - center.y) * factor);
}

export function polygonArea(value: Polygon2Value): number {
  let sum = 0;
  for (let index = 0; index < value.vertices.length; index += 1) {
    const current = value.vertices[index]!;
    const next = value.vertices[(index + 1) % value.vertices.length]!;
    sum += current.x * next.y - current.y * next.x;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(value: Polygon2Value): number {
  let sum = 0;
  for (let index = 0; index < value.vertices.length; index += 1) {
    const current = value.vertices[index]!;
    const next = value.vertices[(index + 1) % value.vertices.length]!;
    sum += distance(current, next);
  }
  return sum;
}

export function circlePerimeter(value: Circle2Value): number {
  return 2 * Math.PI * value.radius;
}

export function circleArea(value: Circle2Value): number {
  return Math.PI * value.radius ** 2;
}

export function ellipseFromFoci(focus1: Point2Value, focus2: Point2Value, majorAxis: number): Conic2Value {
  const linearEccentricity = distance(focus1, focus2) / 2;
  const a = majorAxis / 2;
  if (a <= linearEccentricity + DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_CONIC", "Ellipse major axis 2a must be greater than the interfocal distance.");
  }
  return { kind: "conic2", conicKind: "ellipse", focus1, focus2, parameter: majorAxis };
}

export function parabolaFromFocusDirectrix(focus: Point2Value, directrix: Line2Value): Conic2Value {
  if (Math.abs(signedDistancePointLine(focus, directrix)) <= DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_CONIC", "Parabola focus cannot lie on the directrix.");
  }
  return { kind: "conic2", conicKind: "parabola", focus1: focus, directrix, parameter: 0 };
}

export function hyperbolaFromFoci(focus1: Point2Value, focus2: Point2Value, difference: number): Conic2Value {
  const linearEccentricity = distance(focus1, focus2) / 2;
  const a = Math.abs(difference) / 2;
  if (a <= DEFAULT_TOLERANCE || a >= linearEccentricity - DEFAULT_TOLERANCE) {
    throw new MathEngineError("DEGENERATE_CONIC", "Hyperbola |2a| must be positive and less than the interfocal distance.");
  }
  return { kind: "conic2", conicKind: "hyperbola", focus1, focus2, parameter: Math.abs(difference) };
}

function ellipseAxes(conic: Conic2Value): { center: Point2Value; axis: Vector2Value; a: number; b: number } {
  if (conic.conicKind !== "ellipse" || !conic.focus2) {
    throw new MathEngineError("TYPE_MISMATCH", "Expected an ellipse conic.");
  }
  const center = midpoint(conic.focus1, conic.focus2);
  const c = distance(conic.focus1, conic.focus2) / 2;
  const a = conic.parameter / 2;
  const b = Math.sqrt(Math.max(0, a * a - c * c));
  const axis = normalized(subtractPoints(conic.focus2, conic.focus1));
  return { center, axis, a, b };
}

function pointOnEllipse(conic: Conic2Value, theta: number): Point2Value {
  const { center, axis, a, b } = ellipseAxes(conic);
  const perp = vector(-axis.y, axis.x);
  return point(
    center.x + a * Math.cos(theta) * axis.x + b * Math.sin(theta) * perp.x,
    center.y + a * Math.cos(theta) * axis.y + b * Math.sin(theta) * perp.y
  );
}

function sampleConic(conic: Conic2Value, count = 180): Point2Value[] {
  if (conic.conicKind === "ellipse") {
    const samples: Point2Value[] = [];
    for (let index = 0; index < count; index += 1) {
      samples.push(pointOnEllipse(conic, (Math.PI * 2 * index) / count));
    }
    return samples;
  }
  if (conic.conicKind === "parabola" && conic.directrix) {
    const focus = conic.focus1;
    const foot = projectPointToLine(focus, conic.directrix);
    const axis = normalized(subtractPoints(focus, foot));
    const perp = vector(-axis.y, axis.x);
    const p = distance(focus, foot);
    const samples: Point2Value[] = [];
    for (let index = -count; index <= count; index += 1) {
      const t = index / 8;
      const vertex = midpoint(focus, foot);
      samples.push(point(vertex.x + t * t * (p / 2) * axis.x + t * p * perp.x, vertex.y + t * t * (p / 2) * axis.y + t * p * perp.y));
    }
    return samples;
  }
  if (conic.conicKind === "hyperbola" && conic.focus2) {
    const center = midpoint(conic.focus1, conic.focus2);
    const c = distance(conic.focus1, conic.focus2) / 2;
    const a = conic.parameter / 2;
    const b = Math.sqrt(Math.max(0, c * c - a * a));
    const axis = normalized(subtractPoints(conic.focus2, conic.focus1));
    const perp = vector(-axis.y, axis.x);
    const samples: Point2Value[] = [];
    for (let index = -count; index <= count; index += 1) {
      if (index === 0) continue;
      const t = index / 20;
      const cosh = Math.cosh(t);
      const sinh = Math.sinh(t);
      samples.push(point(center.x + a * cosh * axis.x + b * sinh * perp.x, center.y + a * cosh * axis.y + b * sinh * perp.y));
      samples.push(point(center.x - a * cosh * axis.x + b * sinh * perp.x, center.y - a * cosh * axis.y + b * sinh * perp.y));
    }
    return samples;
  }
  throw new MathEngineError("DEGENERATE_CONIC", "Conic definition is incomplete.");
}

export function conicSamplePoints(conic: Conic2Value, count = 180): Point2Value[] {
  return sampleConic(conic, count);
}

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) <= DEFAULT_TOLERANCE) {
    if (Math.abs(b) <= DEFAULT_TOLERANCE) return [];
    return [-c / b];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -DEFAULT_TOLERANCE) return [];
  if (Math.abs(discriminant) <= DEFAULT_TOLERANCE) return [-b / (2 * a)];
  const root = Math.sqrt(Math.max(0, discriminant));
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function onEllipse(pointValue: Point2Value, conic: Conic2Value, tolerance = 1e-6): boolean {
  if (!conic.focus2) return false;
  return almostEqual(distance(pointValue, conic.focus1) + distance(pointValue, conic.focus2), conic.parameter, tolerance);
}

function onParabola(pointValue: Point2Value, conic: Conic2Value, tolerance = 1e-6): boolean {
  if (!conic.directrix) return false;
  return almostEqual(distance(pointValue, conic.focus1), Math.abs(signedDistancePointLine(pointValue, conic.directrix)), tolerance);
}

function onHyperbola(pointValue: Point2Value, conic: Conic2Value, tolerance = 1e-6): boolean {
  if (!conic.focus2) return false;
  return almostEqual(Math.abs(distance(pointValue, conic.focus1) - distance(pointValue, conic.focus2)), conic.parameter, tolerance);
}

export function pointOnConic(pointValue: Point2Value, conic: Conic2Value, tolerance = 1e-6): boolean {
  if (conic.conicKind === "ellipse") return onEllipse(pointValue, conic, tolerance);
  if (conic.conicKind === "parabola") return onParabola(pointValue, conic, tolerance);
  return onHyperbola(pointValue, conic, tolerance);
}

/** Up to two intersections, ordered by increasing line parameter t. Missing slots duplicate when tangent. */
export function intersectLineConic(lineValue: Line2Value, conic: Conic2Value): [Point2Value, Point2Value] {
  const origin = lineValue.point;
  const direction = lineValue.direction;
  const candidates: Point2Value[] = [];

  if (conic.conicKind === "ellipse" && conic.focus2) {
    const { center, axis, a, b } = ellipseAxes(conic);
    const perp = vector(-axis.y, axis.x);
    // Map line points into ellipse-aligned coordinates.
    const toLocal = (p: Point2Value): [number, number] => {
      const delta = subtractPoints(p, center);
      return [dot(delta, axis), dot(delta, perp)];
    };
    const o = toLocal(origin);
    const dLocal = [dot(direction, axis), dot(direction, perp)] as const;
    // (ox + t dx)^2 / a^2 + (oy + t dy)^2 / b^2 = 1
    const A = (dLocal[0] * dLocal[0]) / (a * a) + (dLocal[1] * dLocal[1]) / (b * b);
    const B = 2 * ((o[0] * dLocal[0]) / (a * a) + (o[1] * dLocal[1]) / (b * b));
    const C = (o[0] * o[0]) / (a * a) + (o[1] * o[1]) / (b * b) - 1;
    for (const t of quadraticRoots(A, B, C)) {
      candidates.push(point(origin.x + direction.x * t, origin.y + direction.y * t));
    }
  } else if (conic.conicKind === "parabola" && conic.directrix) {
    // |P-F| = dist(P, directrix) → square both sides and solve quadratic in t.
    const focus = conic.focus1;
    const line = conic.directrix;
    // Signed distance from point(origin + t d) to line: a(ox+tdx)+b(oy+tdy)+c
    const s0 = line.a * origin.x + line.b * origin.y + line.c;
    const s1 = line.a * direction.x + line.b * direction.y;
    const fx = origin.x - focus.x;
    const fy = origin.y - focus.y;
    // (fx + t dx)^2 + (fy + t dy)^2 = (s0 + t s1)^2
    const A = direction.x * direction.x + direction.y * direction.y - s1 * s1;
    const B = 2 * (fx * direction.x + fy * direction.y - s0 * s1);
    const C = fx * fx + fy * fy - s0 * s0;
    for (const t of quadraticRoots(A, B, C)) {
      const candidate = point(origin.x + direction.x * t, origin.y + direction.y * t);
      if (onParabola(candidate, conic, 1e-5)) candidates.push(candidate);
    }
  } else if (conic.conicKind === "hyperbola" && conic.focus2) {
    const focus1 = conic.focus1;
    const focus2 = conic.focus2;
    const twoA = conic.parameter;
    // | |P-F1| - |P-F2| | = 2a ; sample densely along clipped parameter range and refine via definition.
    for (let index = -80; index <= 80; index += 1) {
      const t = index / 4;
      const candidate = point(origin.x + direction.x * t, origin.y + direction.y * t);
      if (almostEqual(Math.abs(distance(candidate, focus1) - distance(candidate, focus2)), twoA, 1e-3)) {
        if (!candidates.some(existing => pointsAlmostEqual(existing, candidate, 1e-4))) candidates.push(candidate);
      }
    }
    // Keep at most two farthest-parameter solutions after sorting.
  }

  const unique = deduplicatePoints(candidates, 1e-6);
  unique.sort((left, right) =>
    dot(subtractPoints(left, origin), direction) - dot(subtractPoints(right, origin), direction)
  );
  if (unique.length === 0) {
    throw new MathEngineError("NO_INTERSECTION", "The line and conic do not intersect.");
  }
  if (unique.length === 1) return [unique[0]!, unique[0]!];
  return [unique[0]!, unique[1]!];
}

export function translateTransform(delta: Vector2Value): Transform2Value {
  return { kind: "transform2", transformKind: "translate", vector: delta };
}

export function rotateTransform(center: Point2Value, angle: number): Transform2Value {
  return { kind: "transform2", transformKind: "rotate", center, angle };
}

export function reflectTransform(line: Line2Value): Transform2Value {
  return { kind: "transform2", transformKind: "reflect", line };
}

export function dilateTransform(center: Point2Value, factor: number): Transform2Value {
  if (!Number.isFinite(factor)) {
    throw new MathEngineError("INVALID_PARAMETER", "Dilation factor must be finite.", { actual: factor });
  }
  return { kind: "transform2", transformKind: "dilate", center, factor };
}

export function applyTransformToPoint(source: Point2Value, transform: Transform2Value): Point2Value {
  if (transform.transformKind === "translate" && transform.vector) {
    return addPointVector(source, transform.vector);
  }
  if (transform.transformKind === "rotate" && transform.center && transform.angle !== undefined) {
    return rotatePoint(source, transform.center, transform.angle);
  }
  if (transform.transformKind === "reflect" && transform.line) {
    return reflectPointAcrossLine(source, transform.line);
  }
  if (transform.transformKind === "dilate" && transform.center && transform.factor !== undefined) {
    return dilatePoint(source, transform.center, transform.factor);
  }
  throw new MathEngineError("DEGENERATE_TRANSFORM", "Transform definition is incomplete.");
}

export function applyTransform(value: RuntimeValue, transform: Transform2Value): RuntimeValue {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (isPoint(value)) return applyTransformToPoint(value, transform);
  if (isVector(value)) {
    if (transform.transformKind === "translate") return value;
    const origin = point(0, 0);
    const mapped = applyTransformToPoint(addPointVector(origin, value), transform);
    const originImage = applyTransformToPoint(origin, transform);
    return subtractPoints(mapped, originImage);
  }
  if (isSegment(value)) {
    return segment(applyTransformToPoint(value.from, transform), applyTransformToPoint(value.to, transform));
  }
  if (isRay(value)) {
    return ray(applyTransformToPoint(value.from, transform), applyTransformToPoint(value.through, transform));
  }
  if (isLine(value)) {
    const p1 = applyTransformToPoint(value.point, transform);
    const p2 = applyTransformToPoint(addPointVector(value.point, value.direction), transform);
    return lineFromPoints(p1, p2);
  }
  if (isCircle(value)) {
    const center = applyTransformToPoint(value.center, transform);
    if (transform.transformKind === "dilate" && transform.factor !== undefined) {
      if (transform.factor === 0) throw new MathEngineError("DEGENERATE_TRANSFORM", "Zero conic dilation has no finite transformed conic.");
      return circle(center, Math.abs(value.radius * transform.factor), value.radius === 0);
    }
    return circle(center, value.radius, value.radius === 0);
  }
  if (isPolygon(value)) {
    return { kind: "polygon2", vertices: value.vertices.map(vertex => applyTransformToPoint(vertex, transform)) };
  }
  if (isArc(value)) {
    return arcFromCenterPoints(
      applyTransformToPoint(value.center, transform),
      applyTransformToPoint(value.start, transform),
      applyTransformToPoint(value.end, transform)
    );
  }
  if (isSector(value)) {
    return sectorFromArc(applyTransform(value.arc, transform) as Arc2Value);
  }
  throw new MathEngineError("UNSUPPORTED_TRANSFORM_TARGET", "transform.apply supports point, vector, line-like, circle, polygon, arc, and sector.");
}

export function valueLength(value: RuntimeValue): number {
  if (isSegment(value)) return distance(value.from, value.to);
  if (isVector(value)) return norm(value);
  if (isCircle(value)) return value.radius;
  if (isAngle(value)) return value.radians;
  if (typeof value === "number") return Math.abs(value);
  throw new MathEngineError("TYPE_MISMATCH", "The value has no scalar length.");
}

export function slope(value: RuntimeValue): number {
  const line = lineLikeToLine(value);
  if (Math.abs(line.direction.x) <= DEFAULT_TOLERANCE) return Number.POSITIVE_INFINITY;
  return line.direction.y / line.direction.x;
}

export function signedDistancePointLine(source: Point2Value, target: Line2Value): number {
  return target.a * source.x + target.b * source.y + target.c;
}

export function distancePointPath(source: Point2Value, target: RuntimeValue): number {
  if (isLine(target)) return Math.abs(signedDistancePointLine(source, target));
  if (isSegment(target)) return distance(source, projectPointToSegment(source, target));
  if (isRay(target)) return distance(source, projectPointToRay(source, target));
  if (isCircle(target)) return Math.abs(distance(source, target.center) - target.radius);
  if (isArc(target)) return distance(source, projectPointToArc(source, target));
  if (isPolygon(target)) return distance(source, projectPointToPolygon(source, target));
  throw new MathEngineError("TYPE_MISMATCH", "Expected a supported path.");
}

export function almostEqual(left: number, right: number, tolerance = DEFAULT_TOLERANCE): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= tolerance * scale;
}

export function pointsAlmostEqual(left: Point2Value, right: Point2Value, tolerance = DEFAULT_TOLERANCE): boolean {
  return distance(left, right) <= tolerance * Math.max(1, Math.abs(left.x), Math.abs(left.y), Math.abs(right.x), Math.abs(right.y));
}

export type BoundingBox = [number, number, number, number];

function insideBoundingBox(pointValue: Point2Value, box: BoundingBox, tolerance = 1e-8): boolean {
  const [xmin, ymax, xmax, ymin] = box;
  return pointValue.x >= xmin - tolerance && pointValue.x <= xmax + tolerance && pointValue.y >= ymin - tolerance && pointValue.y <= ymax + tolerance;
}

function deduplicatePoints(points: Point2Value[], tolerance = 1e-8): Point2Value[] {
  const output: Point2Value[] = [];
  for (const candidate of points) {
    if (!output.some(existing => pointsAlmostEqual(existing, candidate, tolerance))) output.push(candidate);
  }
  return output;
}

export function clipLineToBoundingBox(lineValue: Line2Value, box: BoundingBox): [Point2Value, Point2Value] | null {
  const [xmin, ymax, xmax, ymin] = box;
  const candidates: Point2Value[] = [];
  if (Math.abs(lineValue.b) > DEFAULT_TOLERANCE) {
    candidates.push(point(xmin, -(lineValue.a * xmin + lineValue.c) / lineValue.b));
    candidates.push(point(xmax, -(lineValue.a * xmax + lineValue.c) / lineValue.b));
  }
  if (Math.abs(lineValue.a) > DEFAULT_TOLERANCE) {
    candidates.push(point(-(lineValue.b * ymin + lineValue.c) / lineValue.a, ymin));
    candidates.push(point(-(lineValue.b * ymax + lineValue.c) / lineValue.a, ymax));
  }
  const inside = deduplicatePoints(candidates.filter(candidate => insideBoundingBox(candidate, box)));
  if (inside.length < 2) return null;
  let best: [Point2Value, Point2Value] = [inside[0]!, inside[1]!];
  let bestDistance = distance(best[0], best[1]);
  for (let left = 0; left < inside.length; left += 1) {
    for (let right = left + 1; right < inside.length; right += 1) {
      const currentDistance = distance(inside[left]!, inside[right]!);
      if (currentDistance > bestDistance) {
        best = [inside[left]!, inside[right]!];
        bestDistance = currentDistance;
      }
    }
  }
  return best;
}

export function clipRayToBoundingBox(rayValue: Ray2Value, box: BoundingBox): [Point2Value, Point2Value] | null {
  const carrier = lineFromPoints(rayValue.from, rayValue.through);
  const clipped = clipLineToBoundingBox(carrier, box);
  if (!clipped) return null;
  const valid = clipped.filter(candidate => dot(subtractPoints(candidate, rayValue.from), rayValue.direction) >= -1e-8);
  if (insideBoundingBox(rayValue.from, box)) valid.push(rayValue.from);
  const uniquePoints = deduplicatePoints(valid);
  if (uniquePoints.length < 2) return null;
  uniquePoints.sort((left, right) =>
    dot(subtractPoints(left, rayValue.from), rayValue.direction) -
    dot(subtractPoints(right, rayValue.from), rayValue.direction)
  );
  return [uniquePoints[0]!, uniquePoints[uniquePoints.length - 1]!];
}
