import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMathDocument,
  expandMacro,
  invertCircleInCircle,
  invertPointInCircle,
  simulateMathDocument,
  validateMathDocument
} from "../dist/index.js";

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function circleDocument() {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "circle-inversion-tangents",
    revision: 1,
    seed: 71,
    metadata: { title: "Circle inversion and common tangents", locale: "en", purpose: "demonstration" },
    entities: [
      { id: "O1", type: "point2", role: "free" },
      { id: "O2", type: "point2", role: "free" },
      { id: "r1", type: "scalar", role: "free" },
      { id: "r2", type: "scalar", role: "free" },
      { id: "circle1", type: "circle2", role: "derived" },
      { id: "circle2", type: "circle2", role: "derived" }
    ],
    construction: [
      { id: "op-o1", command: "point.free", outputs: ["O1"], params: { coords: [0, 0] } },
      { id: "op-o2", command: "point.free", outputs: ["O2"], params: { coords: [7, 0] } },
      { id: "op-r1", command: "scalar.constant", outputs: ["r1"], params: { value: 2 } },
      { id: "op-r2", command: "scalar.constant", outputs: ["r2"], params: { value: 1 } },
      { id: "op-c1", command: "circle.center_radius", inputs: [{ ref: "O1" }, { ref: "r1" }], outputs: ["circle1"] },
      { id: "op-c2", command: "circle.center_radius", inputs: [{ ref: "O2" }, { ref: "r2" }], outputs: ["circle2"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-3, 5, 10, -5] }]
  };
}

test("point and circle inversion are involutions away from the inversion center", () => {
  const inversion = { kind: "circle2", center: { kind: "point2", x: 1, y: -2 }, radius: 3 };
  const sourcePoint = { kind: "point2", x: 5, y: 1 };
  const pointImage = invertPointInCircle(sourcePoint, inversion);
  const pointRoundTrip = invertPointInCircle(pointImage, inversion);
  close(pointRoundTrip.x, sourcePoint.x);
  close(pointRoundTrip.y, sourcePoint.y);

  const sourceCircle = { kind: "circle2", center: { kind: "point2", x: 6, y: -2 }, radius: 2 };
  const circleImage = invertCircleInCircle(sourceCircle, inversion);
  const circleRoundTrip = invertCircleInCircle(circleImage, inversion);
  close(circleRoundTrip.center.x, sourceCircle.center.x);
  close(circleRoundTrip.center.y, sourceCircle.center.y);
  close(circleRoundTrip.radius, sourceCircle.radius);
});

test("point.projection exposes closest-point semantics for polygon boundaries", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "closest-polygon",
    revision: 1,
    seed: 72,
    metadata: { title: "Closest polygon point", locale: "en", purpose: "demonstration" },
    entities: [
      { id: "A", type: "point2", role: "free" },
      { id: "B", type: "point2", role: "free" },
      { id: "C", type: "point2", role: "free" },
      { id: "P", type: "point2", role: "free" },
      { id: "triangle", type: "polygon2", role: "derived" },
      { id: "nearest", type: "point2", role: "derived" }
    ],
    construction: [
      { id: "op-a", command: "point.free", outputs: ["A"], params: { coords: [0, 0] } },
      { id: "op-b", command: "point.free", outputs: ["B"], params: { coords: [4, 0] } },
      { id: "op-c", command: "point.free", outputs: ["C"], params: { coords: [0, 3] } },
      { id: "op-p", command: "point.free", outputs: ["P"], params: { coords: [1, 1] } },
      { id: "op-triangle", command: "polygon.vertices", inputs: [{ ref: "A" }, { ref: "B" }, { ref: "C" }], outputs: ["triangle"] },
      { id: "op-nearest", command: "point.projection", inputs: [{ ref: "P" }, { ref: "triangle" }], outputs: ["nearest"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-1, 4, 5, -1] }]
  };
  const report = validateMathDocument(document);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));
  const nearest = evaluateMathDocument(document).entities.get("nearest")?.value;
  assert.deepEqual(nearest, { kind: "point2", x: 1, y: 0 });
});

test("CommonTangents expands to four L0 oriented tangent branches", () => {
  const document = circleDocument();
  const expansion = expandMacro(document, {
    macro: "macro.line.common_tangents",
    inputs: { circle1: "circle1", circle2: "circle2" },
    idPrefix: "common"
  });
  assert.deepEqual(expansion.construction.map(node => node.command), Array(4).fill("line.common_tangent"));
  document.entities.push(...expansion.entities);
  document.construction.push(...expansion.construction);
  const report = validateMathDocument(document);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));
  const evaluation = evaluateMathDocument(document);
  assert.equal(evaluation.issues.length, 0, JSON.stringify(evaluation.issues));

  const lines = Object.values(expansion.outputs).map(id => evaluation.entities.get(id)?.value);
  assert.equal(new Set(lines.map(line => `${line.a.toFixed(9)},${line.b.toFixed(9)},${line.c.toFixed(9)}`)).size, 4);
  for (const line of lines) {
    close(Math.abs(line.c), 2);
    close(Math.abs(line.a * 7 + line.c), 1);
  }
});

test("common tangents and inversions stay defined across a safe drag path", () => {
  const document = circleDocument();
  const expansion = expandMacro(document, {
    macro: "macro.line.common_tangents",
    inputs: { circle1: "circle1", circle2: "circle2" }
  });
  document.entities.push(...expansion.entities);
  document.construction.push(...expansion.construction);
  const simulation = simulateMathDocument(document, {
    type: "drag",
    target: "O2",
    path: [[7, 0], [8, 1], [9, -1]],
    samples: 13
  }, { observe: ["distance(O1,O2)"], timestampBase: 0 });
  assert.equal(simulation.frames.length, 13);
  assert.equal(simulation.issues.length, 0, JSON.stringify(simulation.issues));
  assert.ok(simulation.frames.every(frame => typeof frame.observations[0]?.value === "number"));
});
