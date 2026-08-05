import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createMathRenderBundle, MathDomainRuntime, validateMathDocument } from "../dist/index.js";

const paths = [
  "../../../research/geogebra/cases/36-domain-and-range-of-special-functions/case.json",
  "../../../research/geogebra/cases/37-composition-and-inverse-of-functions/case.json",
  "../../../research/geogebra/cases/38-solving-systems-of-linear-equations/case.json",
  "../../../research/geogebra/cases/39-discriminant-and-roots-of-a-quadratic-equation/case.json"
];
const readJson = async url => JSON.parse(await readFile(url, "utf8"));

for (const relative of paths) test(`Wave 03 validates, renders every stage, and bundles: ${relative}`, async () => {
  const spec = await readJson(new URL(relative, import.meta.url));
  const document = spec.inputs.initialDocument;
  const validation = validateMathDocument(document);
  assert.equal(validation.status, "valid", JSON.stringify(validation.issues));
  assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true, JSON.stringify(validation.assertionEvidence));
  for (const stage of document.activities[0].stages) {
    const rendered = await new MathDomainRuntime().render(document, { renderer: "direct-svg", width: 800, height: 560, stageId: stage.id });
    assert.equal(rendered.ok, true, JSON.stringify({ stage: stage.id, diagnostics: rendered.diagnostics }));
  }
  const bundle = await createMathRenderBundle(document);
  assert.equal(bundle.ok, true, JSON.stringify(bundle.diagnostics));
});

test("Wave 03 function assertions survive parameter boundaries", async () => {
  const samples = [
    [paths[0], "x", [-4, -0.25, 0, 1.75, 2, 4]],
    [paths[1], "x", [-3, -1, 0, 1, 3]],
    [paths[3], "c", [-2, 0, 1, 1.25, 2]]
  ];
  for (const [relative, nodeId, values] of samples) {
    const spec = await readJson(new URL(relative, import.meta.url));
    for (const value of values) {
      const document = structuredClone(spec.inputs.initialDocument);
      document.construction.find(node => node.id === nodeId).params.value = value;
      const validation = validateMathDocument(document);
      assert.equal(validation.status, "valid", JSON.stringify({ relative, value, issues: validation.issues }));
      assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true);
    }
  }
});

test("material index resolves fourteen complete vertical packs", async () => {
  const indexUrl = new URL("../../../research/geogebra/math-g9-12/material-index.v1.json", import.meta.url);
  const index = await readJson(indexUrl);
  assert.equal(index.materials.length, 18);
  assert.equal(new Set(index.materials.map(item => item.materialId)).size, 18);
  for (const entry of index.materials.slice(10, 14)) {
    const materialUrl = new URL(entry.path, indexUrl);
    const material = await readJson(materialUrl);
    assert.equal(material.teachingAtoms.length, 5);
    assert.equal(material.quizSeeds.length, 5);
    assert.equal(material.quizSeeds.some(item => item.id.startsWith("quiz-assessment-")), true);
    const source = await readJson(new URL(material.sourceSnapshot, materialUrl));
    assert.equal(source.occurrences.some(item => item.occurrenceId === entry.occurrenceId), true);
    const engineCase = await readJson(new URL(material.engineCase.path, materialUrl));
    assert.equal(engineCase.inputs.initialDocument.documentId, material.engineCase.documentId);
  }
});

test("Wave 03 ledger records restrained adjacent capability decisions", async () => {
  const ledger = await readJson(new URL("../../../research/geogebra/math-g9-12/gap-ledger.v1.json", import.meta.url));
  const expected = new Map([
    ["function.piecewise", "closed-new-l0"],
    ["function.compose", "deferred"],
    ["function.inverse", "deferred"],
    ["table", "deferred-to-presentation-contract"],
    ["linear-system-solution-set", "deferred"],
    ["all-function-roots", "deferred"]
  ]);
  for (const [capability, status] of expected) assert.equal(ledger.gaps.some(gap => gap.capability === capability && gap.status === status), true, capability);
});
