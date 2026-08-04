import test from "node:test";
import assert from "node:assert/strict";
import { COMMAND_NAMES, MACRO_NAMES, expandMacro, getMacroDefinition, macroCapabilities } from "../dist/index.js";

test("L1 macros are published but never registered as L0 commands", () => {
  assert.ok(MACRO_NAMES.length >= 7);
  assert.deepEqual(MACRO_NAMES.filter(name => COMMAND_NAMES.includes(name)), []);
  assert.ok(getMacroDefinition("macro.line.perpendicular_bisector"));
  assert.ok(getMacroDefinition("macro.ray.angle_bisector"));
  assert.ok(getMacroDefinition("macro.point.triangle_centroid"));
  assert.ok(getMacroDefinition("macro.line.tangent_at_circle_point"));
  const capabilities = macroCapabilities();
  assert.ok(capabilities.every(item => item.registeredAsL0 === false && item.layer === "L1"));
});

test("medial subdivision lowers the imported Tri tool to midpoint and polygon atoms", () => {
  const document = {
    schema: "famtutor.math.document.v1",
    documentId: "medial-macro-test",
    revision: 1,
    seed: 11,
    metadata: { title: "Medial subdivision", locale: "zh-CN", purpose: "authoring" },
    entities: [
      { id: "A", type: "point2", role: "free" },
      { id: "B", type: "point2", role: "free" },
      { id: "C", type: "point2", role: "free" }
    ],
    construction: [
      { id: "op-A", command: "point.free", params: { coords: [0, 3] }, outputs: ["A"] },
      { id: "op-B", command: "point.free", params: { coords: [-3, -2] }, outputs: ["B"] },
      { id: "op-C", command: "point.free", params: { coords: [3, -2] }, outputs: ["C"] }
    ],
    views: [{ id: "main", kind: "graphics2d", visible: true, renderer: "direct-svg", boundingBox: [-4, 4, 4, -3] }]
  };
  const expansion = expandMacro(document, {
    macro: "macro.polygon.medial_subdivision",
    inputs: { A: "A", B: "B", C: "C" },
    outputs: { D: "D", E: "E", F: "F", medial: "medial" },
    idPrefix: "tri"
  });
  assert.deepEqual(expansion.construction.map(node => node.command), [
    "point.midpoint", "point.midpoint", "point.midpoint", "polygon.vertices"
  ]);
  assert.deepEqual(expansion.outputs, { D: "D", E: "E", F: "F", medial: "medial" });
});
