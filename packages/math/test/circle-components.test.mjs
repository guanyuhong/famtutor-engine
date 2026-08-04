import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMathDocument,
  renderDirectSvg,
  validateMathDocument
} from "../dist/index.js";

function circleComponentDocument() {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "circle-components-test",
    revision: 1,
    seed: 43,
    metadata: { title: "Circle components", locale: "en", purpose: "demonstration" },
    entities: [
      { id: "O", type: "point2", role: "free", label: "O" },
      { id: "P", type: "point2", role: "free", label: "P" },
      { id: "c", type: "circle2", role: "derived", label: "c" },
      { id: "center", type: "point2", role: "derived", label: "center" },
      { id: "radius", type: "scalar", role: "measurement", label: "radius" }
    ],
    construction: [
      { id: "op-o", command: "point.free", outputs: ["O"], params: { coords: [-2, 1] } },
      { id: "op-p", command: "point.free", outputs: ["P"], params: { coords: [1, 5] } },
      { id: "op-circle", command: "circle.through_points", inputs: [{ ref: "O" }, { ref: "P" }], outputs: ["c"] },
      { id: "op-center", command: "point.circle_center", inputs: [{ ref: "c" }], outputs: ["center"] },
      { id: "op-radius", command: "measurement.circle_radius", inputs: [{ ref: "c" }], outputs: ["radius"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-7, 7, 5, -5] }]
  };
}

test("circle center and radius are reusable computed projections", () => {
  const document = circleComponentDocument();
  const report = validateMathDocument(document);
  assert.equal(report.status, "valid", JSON.stringify(report.issues));

  const evaluation = evaluateMathDocument(document);
  assert.equal(evaluation.issues.length, 0, JSON.stringify(evaluation.issues));
  assert.deepEqual(evaluation.entities.get("center")?.value, { kind: "point2", x: -2, y: 1 });
  assert.equal(evaluation.entities.get("radius")?.value, 5);

  const rendered = renderDirectSvg(document, { width: 640, height: 420 });
  assert.equal(rendered.report.skippedEntities.length, 0);
  assert.match(rendered.svg, /<circle/);
});
