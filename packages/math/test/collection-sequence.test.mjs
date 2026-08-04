import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMathDocument,
  renderDirectSvg,
  validateMathDocument
} from "../dist/index.js";

function sequenceDocument() {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "collection-sequence-test",
    revision: 1,
    seed: 1,
    metadata: { title: "Collection sequence", locale: "zh-CN", purpose: "exploration" },
    entities: [
      { id: "n", type: "scalar", role: "free" },
      { id: "radius", type: "scalar", role: "derived", visible: false },
      { id: "inversionCenter", type: "point2", role: "free", visible: false },
      { id: "inversion", type: "circle2", role: "derived", visible: false },
      { id: "centers", type: "collection", role: "derived", visible: false },
      { id: "circles", type: "collection", role: "derived" },
      { id: "inverted", type: "collection", role: "derived" }
    ],
    construction: [
      { id: "make-n", command: "scalar.slider", params: { min: 3, max: 40, value: 6, step: 1 }, outputs: ["n"] },
      { id: "make-radius", command: "scalar.constant", params: { value: 0.35 }, outputs: ["radius"] },
      { id: "make-center", command: "point.free", params: { coords: [0, 0] }, outputs: ["inversionCenter"] },
      { id: "make-inversion", command: "circle.center_radius", inputs: [{ ref: "inversionCenter" }], params: { radius: 4 }, outputs: ["inversion"] },
      {
        id: "make-centers", command: "collection.sequence", inputs: [{ ref: "n" }], outputs: ["centers"],
        params: {
          itemType: "point2", variable: "i", from: 0, to: "n-1", maxItems: 40,
          template: { command: "point.from_expressions", params: { x: "2*cos(2*pi*i/n)", y: "2*sin(2*pi*i/n)" } }
        }
      },
      {
        id: "make-circles", command: "collection.map", inputs: [{ ref: "centers" }, { ref: "radius" }], outputs: ["circles"],
        params: {
          itemType: "circle2", variable: "p", maxItems: 40,
          template: { command: "circle.center_radius", inputs: [{ local: true }, { input: 1 }] }
        }
      },
      {
        id: "invert-circles", command: "collection.map", inputs: [{ ref: "circles" }, { ref: "inversion" }], outputs: ["inverted"],
        params: {
          itemType: "circle2", variable: "c", maxItems: 40,
          template: { command: "circle.invert_in_circle", inputs: [{ local: true }, { input: 1 }] }
        }
      }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-6, 6, 6, -6] }]
  };
}

test("collection.sequence and collection.map produce bounded homogeneous geometry", () => {
  const document = sequenceDocument();
  const validation = validateMathDocument(document);
  assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
  const six = evaluateMathDocument(document);
  assert.equal(six.issues.length, 0);
  assert.equal(six.entities.get("centers").value.items.length, 6);
  assert.equal(six.entities.get("circles").value.items.length, 6);
  assert.equal(six.entities.get("inverted").value.items.length, 6);
  assert.equal(six.entities.get("circles").value.itemType, "circle2");

  const twelve = evaluateMathDocument(document, { scalars: { n: 12 } });
  assert.equal(twelve.issues.length, 0);
  assert.equal(twelve.entities.get("centers").value.items.length, 12);
  assert.equal(twelve.entities.get("circles").value.items.length, 12);
});

test("collection rendering emits every concrete item without exposing helper entities", () => {
  const rendered = renderDirectSvg(sequenceDocument(), { width: 640, height: 480 });
  assert.equal(rendered.report.skippedEntities.length, 0);
  assert.equal((rendered.svg.match(/data-entity-id="circles\[/g) ?? []).length, 6);
  assert.equal((rendered.svg.match(/data-entity-id="inverted\[/g) ?? []).length, 6);
});

test("collection limits fail closed before unbounded expansion", () => {
  const document = sequenceDocument();
  document.construction.find(node => node.id === "make-centers").params.maxItems = 4;
  const result = evaluateMathDocument(document);
  assert.equal(result.entities.get("centers").defined, false);
  assert.equal(result.entities.get("centers").issue.code, "COLLECTION_LIMIT_EXCEEDED");
  assert.equal(result.entities.get("circles").defined, false);
});
