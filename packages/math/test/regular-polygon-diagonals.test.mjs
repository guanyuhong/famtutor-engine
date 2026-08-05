import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMathDocument, renderDirectSvg, validateMathDocument } from "../dist/index.js";

function document(vertexCount = 6, fromVertex) {
  const diagonalParams = { maxItems: 64 };
  if (fromVertex !== undefined) diagonalParams.fromVertex = fromVertex;
  return {
    schema: "famtutor.math.document.v1",
    documentId: `regular-${vertexCount}-${fromVertex ?? "all"}`,
    revision: 1,
    seed: 23,
    metadata: { title: "regular polygon diagonals", locale: "en", purpose: "authoring" },
    entities: [
      { id: "O", type: "point2", role: "free" },
      { id: "r", type: "scalar", role: "derived" },
      { id: "n", type: "scalar", role: "free" },
      { id: "poly", type: "polygon2", role: "derived" },
      { id: "diagonals", type: "collection", role: "derived" }
    ],
    construction: [
      { id: "O", command: "point.free", params: { coords: [0, 0] }, outputs: ["O"] },
      { id: "r", command: "scalar.constant", params: { value: 3 }, outputs: ["r"] },
      { id: "n", command: "scalar.slider", params: { min: 3, max: 10, value: vertexCount, step: 1 }, outputs: ["n"] },
      { id: "poly", command: "polygon.regular", inputs: [{ ref: "O" }, { ref: "r" }, { ref: "n" }], params: { maxVertices: 10 }, outputs: ["poly"] },
      { id: "diagonals", command: "polygon.diagonals", inputs: [{ ref: "poly" }], params: diagonalParams, outputs: ["diagonals"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-4, 4, 4, -4] }]
  };
}

test("regular polygon exposes the complete bounded diagonal collection", () => {
  for (const n of [3, 4, 5, 8, 10]) {
    const doc = document(n);
    assert.equal(validateMathDocument(doc).status, "valid");
    const result = evaluateMathDocument(doc);
    assert.equal(result.issues.length, 0, JSON.stringify(result.issues));
    const diagonals = result.entities.get("diagonals")?.value;
    assert.equal(diagonals.items.length, n * (n - 3) / 2);
    assert.match(renderDirectSvg(doc).svg, /<svg/);
  }
});

test("diagonals from one vertex have n-3 members and invalid bounds fail closed", () => {
  const result = evaluateMathDocument(document(9, 0));
  assert.equal(result.entities.get("diagonals")?.value.items.length, 6);
  const invalid = document(7);
  invalid.construction.find(node => node.id === "poly").params.maxVertices = 6;
  assert.equal(evaluateMathDocument(invalid).entities.get("poly").issue.code, "REGULAR_POLYGON_BOUND_EXCEEDED");
});
