import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMathDocument, renderDirectSvg, validateMathDocument } from "../dist/index.js";

function regionDocument(domain = [-3, 3], relation = "above") {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "function-region-test",
    revision: 1,
    seed: 1502,
    metadata: { title: "Function inequality", locale: "en", purpose: "authoring" },
    entities: [
      { id: "f", type: "function1", role: "derived" },
      { id: "solution", type: "region2", role: "derived" }
    ],
    construction: [
      { id: "op-f", command: "function.explicit", params: { expression: "abs(x)-1", domain: [-4, 4] }, outputs: ["f"] },
      { id: "op-region", command: "region.function_inequality", inputs: [{ ref: "f" }], params: { relation, domain, boundaryIncluded: false }, outputs: ["solution"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-4, 4, 4, -3], axes: true }],
    styles: [{ targets: ["solution"], style: { token: "accent", fillOpacity: 0.2 } }]
  };
}

test("region.function_inequality preserves its function boundary semantics and renders", () => {
  const document = regionDocument();
  assert.equal(validateMathDocument(document).status, "valid");
  const value = evaluateMathDocument(document).entities.get("solution")?.value;
  assert.equal(value.kind, "region2");
  assert.equal(value.relation, "above");
  assert.equal(value.boundaryIncluded, false);
  const rendered = renderDirectSvg(document, { width: 600, height: 400 });
  assert.equal(rendered.report.skippedEntities.length, 0);
  assert.match(rendered.svg, /data-entity-id="solution"/);
  assert.match(rendered.svg, /data-region-boundary-for="solution"/);
  assert.match(rendered.svg, /stroke-dasharray="8 6"/);
  assert.match(rendered.svg, /data-entity-id="solution"[^>]*stroke="none"/);
});

test("region.function_inequality rejects domains outside the boundary function", () => {
  const evaluation = evaluateMathDocument(regionDocument([-5, 3]));
  assert.equal(evaluation.entities.get("solution")?.defined, false);
  assert.equal(evaluation.issues.some(issue => issue.code === "FUNCTION_REGION_OUTSIDE_DOMAIN"), true);
});
