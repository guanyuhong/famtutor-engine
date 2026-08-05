import assert from "node:assert/strict";
import test from "node:test";
import { jxgAttributes } from "../dist/render/jsxgraph.js";

const document = {
  schema: "famtutor.math.document.v1",
  documentId: "jsxgraph-slider-label-offset",
  revision: 1,
  seed: 1401,
  metadata: { title: "Slider label offset", locale: "en", purpose: "authoring" },
  entities: [{ id: "a", type: "scalar", role: "free", label: "a" }],
  construction: [
    { id: "op-a", command: "scalar.slider", params: { min: -2, max: 2, value: 1 }, outputs: ["a"] }
  ],
  views: [
    { id: "main", kind: "graphics2d", visible: true, renderer: "jsxgraph-svg", boundingBox: [-5, 5, 5, -5], axes: true }
  ],
  styles: [{ targets: ["a"], style: { labelOffset: [14, -6], fontSize: 13 } }]
};

test("JSXGraph scalar sliders honor the shared labelOffset style", () => {
  const attributes = jxgAttributes(document, "a");
  assert.deepEqual(attributes.label.offset, [14, -6]);
  assert.equal(attributes.label.autoPosition, false);
  assert.equal(attributes.label.fontSize, 13);
});
