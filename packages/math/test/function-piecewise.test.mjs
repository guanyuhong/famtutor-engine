import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMathDocument, renderDirectSvg, validateMathDocument } from "../dist/index.js";

function documentWith(branches, x = 0) {
  return {
    schema: "famtutor.math.document.v1", documentId: "piecewise-test", revision: 1, seed: 1601,
    metadata: { title: "Piecewise function", locale: "en", purpose: "authoring" },
    entities: [
      { id: "x0", type: "scalar", role: "derived" },
      { id: "f", type: "function1", role: "derived" },
      { id: "y0", type: "scalar", role: "derived" }
    ],
    construction: [
      { id: "x", command: "scalar.constant", params: { value: x }, outputs: ["x0"] },
      { id: "f", command: "function.piecewise", params: { branches }, outputs: ["f"] },
      { id: "y", command: "function.value_at", inputs: [{ ref: "f" }, { ref: "x0" }], outputs: ["y0"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-4, 5, 4, -4], axes: true }]
  };
}

const branches = [
  { expression: "x+2", domain: [-3, 0], lowerClosed: true, upperClosed: false },
  { expression: "x^2", domain: [0, 3], lowerClosed: true, upperClosed: true }
];

test("function.piecewise evaluates the branch selected by endpoint membership", () => {
  const document = documentWith(branches, 0);
  assert.equal(validateMathDocument(document).status, "valid");
  assert.equal(evaluateMathDocument(document).entities.get("y0")?.value, 0);
  const rendered = renderDirectSvg(document, { width: 640, height: 420 });
  assert.equal(rendered.report.skippedEntities.length, 0);
  assert.match(rendered.svg, /data-piecewise-endpoint-for="f"/);
});

test("function.piecewise rejects ambiguous shared endpoints", () => {
  const invalid = branches.map(branch => ({ ...branch, upperClosed: true, lowerClosed: true }));
  const evaluation = evaluateMathDocument(documentWith(invalid, 0));
  assert.equal(evaluation.entities.get("f")?.defined, false);
  assert.equal(evaluation.issues.some(issue => issue.code === "PIECEWISE_OVERLAPPING_BRANCHES"), true);
});

test("function.value_at fails in a gap between piecewise branches", () => {
  const gapped = [
    { expression: "x", domain: [-3, -1] },
    { expression: "x", domain: [1, 3] }
  ];
  const evaluation = evaluateMathDocument(documentWith(gapped, 0));
  assert.equal(evaluation.entities.get("y0")?.defined, false);
  assert.equal(evaluation.issues.some(issue => issue.code === "FUNCTION_INPUT_OUTSIDE_BRANCHES"), true);
});

test("piecewise function composes with the generic inequality-region renderer", () => {
  const document = documentWith(branches, 0);
  document.entities.push({ id: "region", type: "region2", role: "derived" });
  document.construction.push({
    id: "region",
    command: "region.function_inequality",
    inputs: [{ ref: "f" }],
    params: { relation: "below", domain: [-3, 3], boundaryIncluded: true },
    outputs: ["region"]
  });
  const validation = validateMathDocument(document);
  assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
  const rendered = renderDirectSvg(document, { width: 640, height: 420 });
  assert.equal(rendered.report.skippedEntities.length, 0);
  assert.match(rendered.svg, /data-entity-id="region"/);
});
