import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MathDomainRuntime,
  createMathRenderBundle,
  evaluateAssertions,
  evaluateMathDocument,
  validateMathRenderBundle
} from "../packages/math/dist/index.js";
import { canonicalizeJson } from "../packages/core/dist/index.js";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const bookId = "zjedu-math-8a-2013";
export const bookRoot = join(repoRoot, "corpus/books", bookId);
export const casesRoot = join(bookRoot, "cases");

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function listCasePaths() {
  const entries = await readdir(casesRoot, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => join(casesRoot, entry.name, "case.json"))
    .sort();
}

export async function loadCases() {
  return Promise.all((await listCasePaths()).map(readJson));
}

export function documentFingerprint(document) {
  return createHash("sha256").update(canonicalizeJson(document)).digest("hex");
}

export async function replayCase(caseSpec) {
  const runtime = new MathDomainRuntime();
  let document = structuredClone(caseSpec.inputs.initialDocument);
  const diagnostics = [];
  for (const [index, changeSet] of caseSpec.trace.changeSets.entries()) {
    const result = await runtime.apply(document, changeSet);
    if (!result.ok || !result.document) {
      diagnostics.push(...(result.diagnostics ?? []));
      return { ok: false, stage: "trace", index, document, diagnostics };
    }
    document = result.document;
  }
  return { ok: true, document, diagnostics };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkCaseAssertion(caseSpec, document, assertion, evaluation) {
  switch (assertion.kind) {
    case "entity-exists": {
      const ids = new Set(document.entities.map(entity => entity.id));
      for (const id of assertion.entityIds ?? []) {
        assert(ids.has(id), `${caseSpec.caseId}: expected entity '${id}'`);
      }
      return;
    }
    case "entity-types": {
      const entities = new Map(document.entities.map(entity => [entity.id, entity]));
      for (const [id, type] of Object.entries(assertion.types ?? {})) {
        assert(entities.get(id)?.type === type, `${caseSpec.caseId}: expected ${id} to have type ${type}`);
      }
      return;
    }
    case "runtime-assertions-pass": {
      assert((document.assertions?.length ?? 0) > 0, `${caseSpec.caseId}: no runtime math assertions`);
      const evidence = evaluateAssertions(document, evaluation);
      const failed = evidence.filter(item => item.status !== "passed");
      assert(failed.length === 0, `${caseSpec.caseId}: math assertions failed: ${JSON.stringify(failed)}`);
      return;
    }
    case "activity-stages": {
      const stages = document.activities?.flatMap(activity => activity.stages ?? []) ?? [];
      assert(stages.length >= assertion.minimum, `${caseSpec.caseId}: expected at least ${assertion.minimum} activity stages`);
      const stageIds = stages.map(stage => stage.id);
      assert(new Set(stageIds).size === stageIds.length, `${caseSpec.caseId}: activity stage ids must be unique`);
      const entityIds = new Set(document.entities.map(entity => entity.id));
      for (const stage of stages) {
        for (const field of ["reveal", "hide", "focus"]) {
          for (const entityId of stage[field] ?? []) {
            assert(entityIds.has(entityId), `${caseSpec.caseId}: stage '${stage.id}' ${field} references missing entity '${entityId}'`);
          }
        }
      }
      return;
    }
    case "static-render":
    case "render-bundle":
      return;
    default:
      throw new Error(`${caseSpec.caseId}: unknown case assertion kind '${assertion.kind}'`);
  }
}

export async function verifyAcceptedCase(caseSpec) {
  const first = await replayCase(caseSpec);
  assert(first.ok, `${caseSpec.caseId}: first replay failed: ${JSON.stringify(first.diagnostics)}`);
  const second = await replayCase(caseSpec);
  assert(second.ok, `${caseSpec.caseId}: second replay failed: ${JSON.stringify(second.diagnostics)}`);

  const firstFingerprint = documentFingerprint(first.document);
  const secondFingerprint = documentFingerprint(second.document);
  assert(firstFingerprint === secondFingerprint, `${caseSpec.caseId}: replay is not deterministic`);
  assert(firstFingerprint === caseSpec.expected.documentFingerprint,
    `${caseSpec.caseId}: fingerprint mismatch; expected ${caseSpec.expected.documentFingerprint}, got ${firstFingerprint}`);

  const runtime = new MathDomainRuntime();
  const validation = await runtime.validate(first.document);
  assert(validation.status !== "invalid", `${caseSpec.caseId}: document validation failed: ${JSON.stringify(validation.issues)}`);

  const evaluation = evaluateMathDocument(first.document);
  const evaluationErrors = evaluation.issues.filter(issue => issue.severity === "error");
  assert(evaluationErrors.length === 0, `${caseSpec.caseId}: evaluation failed: ${JSON.stringify(evaluationErrors)}`);
  for (const expected of caseSpec.expected.assertions) {
    checkCaseAssertion(caseSpec, first.document, expected, evaluation);
  }

  for (const interaction of caseSpec.expected.interactions) {
    const matched = (first.document.interactions ?? []).some(policy =>
      policy.target === interaction.target && policy.permissions.includes(interaction.permission)
    );
    assert(matched, `${caseSpec.caseId}: missing ${interaction.permission} interaction for ${interaction.target}`);
  }

  const rendered = await runtime.render(first.document, { width: 720, height: 480 });
  assert(rendered.ok, `${caseSpec.caseId}: direct SVG render failed: ${JSON.stringify(rendered.diagnostics)}`);
  assert(rendered.artifact.content.startsWith("<svg"), `${caseSpec.caseId}: direct SVG artifact is malformed`);

  const stages = first.document.activities?.flatMap(activity => activity.stages ?? []) ?? [];
  for (const stage of stages) {
    const stageRender = await runtime.render(first.document, { width: 720, height: 480, stageId: stage.id });
    assert(stageRender.ok, `${caseSpec.caseId}: stage '${stage.id}' direct SVG render failed: ${JSON.stringify(stageRender.diagnostics)}`);
    assert(stageRender.artifact.content.startsWith("<svg"), `${caseSpec.caseId}: stage '${stage.id}' SVG artifact is malformed`);
    assert(stageRender.artifact.document.revision === first.document.revision,
      `${caseSpec.caseId}: stage '${stage.id}' render changed document revision`);
  }

  const created = await createMathRenderBundle(first.document, { width: 720, height: 480 });
  assert(created.ok, `${caseSpec.caseId}: Render Bundle creation failed: ${JSON.stringify(created.diagnostics)}`);
  const bundleValidation = await validateMathRenderBundle(created.bundle);
  assert(bundleValidation.ok, `${caseSpec.caseId}: Render Bundle validation failed: ${JSON.stringify(bundleValidation.diagnostics)}`);

  return {
    caseId: caseSpec.caseId,
    status: "accepted",
    fingerprint: firstFingerprint,
    changeSets: caseSpec.trace.changeSets.length,
    entities: first.document.entities.length,
    interactions: caseSpec.expected.interactions.length,
    artifactDigest: rendered.artifact.digest.value,
    bundleDigest: created.bundle.integrity.value,
    document: first.document,
    bundle: created.bundle
  };
}

export async function verifyExpectedUnsupportedCase(caseSpec) {
  const first = await replayCase(caseSpec);
  assert(first.ok, `${caseSpec.caseId}: partial trace failed before expected capability boundary`);
  const second = await replayCase(caseSpec);
  assert(second.ok, `${caseSpec.caseId}: second partial replay failed`);
  const fingerprint = documentFingerprint(first.document);
  assert(fingerprint === documentFingerprint(second.document), `${caseSpec.caseId}: partial replay is not deterministic`);

  const runtime = new MathDomainRuntime();
  const validation = await runtime.validate(first.document);
  assert(validation.status !== "invalid", `${caseSpec.caseId}: partial document is invalid before expected failure`);
  for (const interaction of caseSpec.expected.interactions) {
    const matched = (first.document.interactions ?? []).some(policy =>
      policy.target === interaction.target && policy.permissions.includes(interaction.permission)
    );
    assert(matched, `${caseSpec.caseId}: partial trace is missing ${interaction.permission} for ${interaction.target}`);
  }

  const created = await createMathRenderBundle(first.document, { width: 720, height: 480 });
  assert(created.ok, `${caseSpec.caseId}: partial document did not reach the expected later failure stage`);
  const bundleValidation = await validateMathRenderBundle(created.bundle);
  assert(bundleValidation.ok, `${caseSpec.caseId}: partial bundle is invalid before expected failure`);

  const failure = caseSpec.expected.expectedFailure;
  assert(failure, `${caseSpec.caseId}: expectedFailure is missing`);
  const diagnostic = caseSpec.diagnostics.find(item => item.code === failure.code);
  assert(diagnostic, `${caseSpec.caseId}: expected diagnostic '${failure.code}' is missing`);
  return {
    caseId: caseSpec.caseId,
    status: "expected-unsupported",
    partialFingerprint: fingerprint,
    reachedThrough: "bundle",
    failureStage: failure.stage,
    diagnosticCode: failure.code,
    requiredCapabilities: caseSpec.requiredCapabilities
  };
}

export async function validateCorpusSources(cases) {
  const book = await readJson(join(bookRoot, "book.json"));
  const sourceIndex = await readJson(join(bookRoot, "source-index.json"));
  const pdfPath = join(repoRoot, book.pdf.path);
  const actualHash = createHash("sha256").update(await readFile(pdfPath)).digest("hex");
  assert(actualHash === book.pdf.sha256, `textbook SHA-256 mismatch: ${actualHash}`);
  assert(book.pdf.pageCount === 177, "textbook pageCount must be 177");
  assert(sourceIndex.pageMapping.pdfPageOffsetFromPrinted === 3, "source page offset must be +3");

  const seen = new Set();
  for (const caseSpec of cases) {
    assert(!seen.has(caseSpec.caseId), `duplicate caseId '${caseSpec.caseId}'`);
    seen.add(caseSpec.caseId);
    assert(caseSpec.source.bookId === book.bookId, `${caseSpec.caseId}: bookId mismatch`);
    assert(caseSpec.source.pdfName === book.pdf.fileName, `${caseSpec.caseId}: pdfName mismatch`);
    assert(caseSpec.source.pdfSha256 === actualHash, `${caseSpec.caseId}: pdfSha256 mismatch`);
    assert(caseSpec.source.printedPages.length === caseSpec.source.pdfPages.length,
      `${caseSpec.caseId}: source page arrays must align`);
    caseSpec.source.printedPages.forEach((printed, index) => {
      assert(caseSpec.source.pdfPages[index] === printed + 3,
        `${caseSpec.caseId}: printed page ${printed} must map to PDF page ${printed + 3}`);
    });
  }
  return { actualHash, book, sourceIndex };
}
