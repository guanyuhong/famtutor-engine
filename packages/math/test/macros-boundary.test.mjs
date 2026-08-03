import test from "node:test";
import assert from "node:assert/strict";
import { COMMAND_NAMES, MACRO_NAMES, getMacroDefinition, macroCapabilities } from "../dist/index.js";

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
