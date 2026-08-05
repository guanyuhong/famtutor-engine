import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MathDomainRuntime, evaluateMathDocument, validateMathDocument } from "../dist/index.js";

const exampleUrl = new URL("../examples/jsxgraph-3d-foundation.json", import.meta.url);
const load = async () => JSON.parse(await readFile(exampleUrl, "utf8"));

test("graphics3d example validates and evaluates semantic 3D entities", async () => {
  const document = await load();
  const validation = validateMathDocument(document);
  assert.notEqual(validation.status, "invalid", JSON.stringify(validation.issues, null, 2));
  const evaluation = evaluateMathDocument(document);
  assert.equal(evaluation.issues.length, 0, JSON.stringify(evaluation.issues, null, 2));
  assert.deepEqual(evaluation.entities.get("A").value, { kind: "point3", x: 3, y: 0, z: 0 });
  assert.equal(evaluation.entities.get("plane").value.kind, "plane3");
  assert.equal(evaluation.entities.get("sphere").value.radius, 1.2);
  assert.equal(evaluation.entities.get("surface").value.kind, "surface3");
});

test("graphics3d has deterministic direct SVG fallback", async () => {
  const document = await load();
  const runtime = new MathDomainRuntime();
  const first = await runtime.render(document, { renderer: "direct-svg", viewId: "main3d", width: 800, height: 600 });
  const second = await runtime.render(document, { renderer: "direct-svg", viewId: "main3d", width: 800, height: 600 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.artifact.content, second.artifact.content);
  assert.match(first.artifact.content, /data-render-hash=/);
  assert.match(first.artifact.content, /<circle/);
  assert.match(first.artifact.content, /<path/);
});
