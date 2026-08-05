import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createMathRenderBundle, MathDomainRuntime, validateMathDocument } from "../dist/index.js";

const paths = [
  "../../../research/geogebra/cases/32-representations-of-relations-and-functions/case.json",
  "../../../research/geogebra/cases/33-increasing-and-decreasing-functions/case.json",
  "../../../research/geogebra/cases/34-graphing-absolute-value-functions-and-inequalities/case.json",
  "../../../research/geogebra/cases/35-graphing-to-solve-quadratic-equations/case.json"
];
const readJson = async url => JSON.parse(await readFile(url, "utf8"));

for (const relative of paths) test(`Wave 02 validates, renders every stage, and bundles: ${relative}`, async () => {
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

test("material index retains ten complete Wave 01-02 vertical packs", async () => {
  const indexUrl = new URL("../../../research/geogebra/math-g9-12/material-index.v1.json", import.meta.url);
  const index = await readJson(indexUrl);
  assert.equal(index.materials.length, 18);
  for (const entry of index.materials.slice(6, 10)) {
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

test("capability audit preserves or deliberately evolves Wave 02 decisions", async () => {
  const ledger = await readJson(new URL("../../../research/geogebra/math-g9-12/gap-ledger.v1.json", import.meta.url));
  assert.equal(ledger.gaps.some(gap => gap.capability === "table" && gap.status === "deferred-to-presentation-contract"), true);
  assert.equal(ledger.gaps.some(gap => gap.capability === "piecewise-function" && gap.status === "superseded-by-function.piecewise"), true);
  assert.equal(ledger.gaps.some(gap => gap.capability === "function.piecewise" && gap.status === "closed-new-l0"), true);
  assert.equal(ledger.gaps.some(gap => gap.capability === "solution-set-1d" && gap.status === "deferred"), true);
  assert.equal(ledger.gaps.some(gap => gap.capability === "all-function-roots" && gap.status === "deferred"), true);
});
