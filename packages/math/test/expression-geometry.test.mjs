import test from "node:test";
import assert from "node:assert/strict";
import {
  MathEngineError,
  circle,
  distance,
  evaluateBooleanExpression,
  evaluateNumericExpression,
  intersectCircles,
  intersectLineCircle,
  intersectLines,
  lineFromPoints,
  parseExpression,
  point,
  projectPointToCircle,
  projectPointToLine,
  vector
} from "../dist/index.js";

test("safe expression parser evaluates arithmetic, functions, booleans and @-identifiers", () => {
  const values = new Map([
    ["a", 2],
    ["entity-with-dash", 3]
  ]);
  const resolve = name => values.get(name);
  assert.equal(evaluateNumericExpression("2 + 3*4^2", resolve), 50);
  assert.ok(Math.abs(evaluateNumericExpression("a*sin(pi/2) + @entity-with-dash", resolve) - 5) < 1e-12);
  assert.equal(evaluateBooleanExpression("a >= 2 && @entity-with-dash != 4", resolve), true);
  assert.equal(parseExpression("1+2").type, "binary");
});

test("safe expression language rejects JavaScript syntax and unknown functions", () => {
  for (const source of ["window.alert(1)", "x;process.exit()", "[1,2]", "(()=>1)()", "new Function()"] ) {
    assert.throws(() => parseExpression(source), MathEngineError, source);
  }
  assert.throws(() => evaluateNumericExpression("constructor(1)", () => undefined), /Unknown function/);
  assert.throws(() => evaluateNumericExpression("1/0", () => undefined), /Division by zero/);
});

test("numeric geometry handles projections and exact intersections", () => {
  const A = point(-2, 0);
  const B = point(2, 0);
  const vertical = lineFromPoints(point(0, -2), point(0, 2));
  const horizontal = lineFromPoints(A, B);
  const I = intersectLines(horizontal, vertical);
  assert.deepEqual(I, point(0, 0));

  const C = circle(point(0, 0), 2);
  const [L1, L2] = intersectLineCircle(horizontal, C);
  assert.ok(Math.abs(distance(L1, point(-2, 0))) < 1e-12 || Math.abs(distance(L1, point(2, 0))) < 1e-12);
  assert.ok(Math.abs(distance(L2, point(-2, 0))) < 1e-12 || Math.abs(distance(L2, point(2, 0))) < 1e-12);

  const [P, Q] = intersectCircles(circle(point(-1, 0), 2), circle(point(1, 0), 2));
  assert.ok(Math.abs(P.x) < 1e-12 && Math.abs(Q.x) < 1e-12);
  assert.ok(Math.abs(P.y + Q.y) < 1e-12);

  const projectedLine = projectPointToLine(point(1, 3), horizontal);
  assert.deepEqual(projectedLine, point(1, 0));
  const projectedCircle = projectPointToCircle(point(3, 0), C);
  assert.deepEqual(projectedCircle, point(2, 0));
  assert.deepEqual(vector(3, 4), { kind: "vector2", x: 3, y: 4 });
});

test("degenerate geometry fails closed", () => {
  assert.throws(() => lineFromPoints(point(1, 1), point(1, 1)), /distinct points/);
  assert.throws(() => circle(point(0, 0), 0), /positive/);
  assert.throws(() => intersectLines(lineFromPoints(point(0, 0), point(1, 0)), lineFromPoints(point(0, 1), point(1, 1))), /Parallel/);
});
