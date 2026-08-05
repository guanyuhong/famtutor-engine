import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createMathRenderBundle, MathDomainRuntime, validateMathDocument } from "../dist/index.js";

const paths = [
  "../../../research/geogebra/cases/40-solving-linear-inequalities/case.json",
  "../../../research/geogebra/cases/41-systems-of-linear-inequalities/case.json",
  "../../../research/geogebra/cases/42-solving-nonlinear-systems-of-equations-and-inequalities/case.json",
  "../../../research/geogebra/cases/43-using-the-quadratic-formula-to-solve-quadratic-equations/case.json"
];
const readJson = async url => JSON.parse(await readFile(url, "utf8"));

for (const relative of paths) test(`Wave 04 validates, renders every stage, and bundles: ${relative}`, async () => {
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

test("Wave 04 test-point assertions survive representative slider positions", async () => {
  for (const relative of paths.slice(0, 2)) {
    const spec = await readJson(new URL(relative, import.meta.url));
    for (const [x, y] of [[-4,-3],[-2,2],[0,1],[2,4],[4,-1]]) {
      const document = structuredClone(spec.inputs.initialDocument);
      document.construction.find(node => node.id === "x").params.value = x;
      document.construction.find(node => node.id === "y").params.value = y;
      const validation = validateMathDocument(document);
      assert.equal(validation.status, "valid", JSON.stringify({ relative, x, y, issues: validation.issues }));
      assert.equal(validation.assertionEvidence.every(item => item.status === "passed"), true);
    }
  }
});

test("material index resolves eighteen complete vertical packs", async () => {
  const indexUrl = new URL("../../../research/geogebra/math-g9-12/material-index.v1.json", import.meta.url);
  const index = await readJson(indexUrl);
  assert.equal(index.materials.length, 18);
  assert.equal(new Set(index.materials.map(item => item.materialId)).size, 18);
  for (const entry of index.materials.slice(14, 18)) {
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

test("Wave 04 ledger keeps adjacent primitives restrained", async () => {
  const ledger = await readJson(new URL("../../../research/geogebra/math-g9-12/gap-ledger.v1.json", import.meta.url));
  const expected = new Map([
    ["solution-set-1d", "deferred"],
    ["region.intersection", "deferred"],
    ["function.intersections", "closed-compose-existing"],
    ["all-function-roots", "deferred"],
    ["quadratic-formula-roots", "closed-compose-existing"]
  ]);
  for (const [capability, status] of expected) assert.equal(ledger.gaps.some(gap => gap.capability === capability && gap.status === status), true, capability);
});
