import assert from "node:assert/strict";
import test from "node:test";
import { expandMacro, evaluateMathDocument, validateMathDocument } from "../dist/index.js";
import { renderDirectSvg } from "../dist/render/direct-svg.js";

function document(branch = "internal", points = { L: [-4, 0], V: [0, 3], R: [3, 0] }) {
  return {
    schema: "famtutor.math.document.v1", documentId: `angle-bisector-${branch}`, revision: 1, seed: 14,
    metadata: { title: "Angle bisector", locale: "en", purpose: "exploration" },
    entities: [
      { id: "L", type: "point2", role: "free" }, { id: "V", type: "point2", role: "free" }, { id: "R", type: "point2", role: "free" },
      { id: "bisector", type: "ray2", role: "derived" }
    ],
    construction: [
      { id: "op-L", command: "point.free", params: { coords: points.L }, outputs: ["L"] },
      { id: "op-V", command: "point.free", params: { coords: points.V }, outputs: ["V"] },
      { id: "op-R", command: "point.free", params: { coords: points.R }, outputs: ["R"] },
      { id: "op-bisector", command: "ray.angle_bisector", inputs: [{ ref: "L" }, { ref: "V" }, { ref: "R" }], params: { branch }, outputs: ["bisector"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-6, 6, 6, -4] }],
    assertions: []
  };
}

test("ray.angle_bisector selects the internal branch deterministically", () => {
  const doc = document("internal");
  const report = validateMathDocument(doc);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));
  const evaluation = evaluateMathDocument(doc);
  const direction = evaluation.entities.get("bisector").value.direction;
  assert.ok(direction.y < 0, "internal bisector must point into triangle LVR");
  const left = evaluation.entities.get("L").value;
  const vertex = evaluation.entities.get("V").value;
  const right = evaluation.entities.get("R").value;
  const unit = point => ({ x: (point.x - vertex.x) / Math.hypot(point.x - vertex.x, point.y - vertex.y), y: (point.y - vertex.y) / Math.hypot(point.x - vertex.x, point.y - vertex.y) });
  const ul = unit(left);
  const ur = unit(right);
  assert.ok(Math.abs((ul.x * direction.x + ul.y * direction.y) - (ur.x * direction.x + ur.y * direction.y)) < 1e-12);
  assert.ok(renderDirectSvg(doc, { width: 600, height: 420 }).svg.includes('data-entity-id="bisector"'));
});

test("ray.angle_bisector exposes the ordered external branch", () => {
  const doc = document("external");
  doc.assertions = [];
  const report = validateMathDocument(doc);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));
  const direction = evaluateMathDocument(doc).entities.get("bisector").value.direction;
  assert.ok(direction.x < 0, "L,V,R ordering selects the left-facing external bisector");
});

test("angle-bisector macro lowers to the branch-explicit L0 atom", () => {
  const doc = document("internal");
  doc.entities = doc.entities.slice(0, 3);
  doc.construction = doc.construction.slice(0, 3);
  doc.assertions = [];
  const expansion = expandMacro(doc, { macro: "macro.ray.angle_bisector", inputs: { A: "L", B: "V", C: "R" }, outputs: { bisector: "macroBisector" } });
  assert.equal(expansion.construction.length, 1);
  assert.equal(expansion.construction[0].command, "ray.angle_bisector");
  assert.deepEqual(expansion.construction[0].params, { branch: "internal" });
});

test("ray.angle_bisector fails closed for a degenerate branch", () => {
  const doc = document("internal", { L: [-1, 0], V: [0, 0], R: [1, 0] });
  const evaluation = evaluateMathDocument(doc);
  assert.equal(evaluation.entities.get("bisector").defined, false);
  assert.ok(evaluation.issues.some(issue => issue.code === "DEGENERATE_ANGLE_BISECTOR"));
});
