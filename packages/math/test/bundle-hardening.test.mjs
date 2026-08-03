import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  AgentMathRuntime,
  applyMathChangeSet,
  createMathRenderBundle,
  MathDomainRuntime,
  serializeRenderBundle,
  sha256Utf8,
  validateMathRenderBundle
} from "../dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const example = JSON.parse(readFileSync(join(root, "examples/perpendicular-bisector.json"), "utf8"));

test("applyMathChangeSet enforces changeSetId and max 128 operations", () => {
  const missingId = applyMathChangeSet(example, {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "  ",
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: example.documentId,
      revision: example.revision
    },
    operations: [{ op: "construct", command: "point.free", outputs: ["Z"], params: { coords: [0, 0] } }]
  });
  assert.equal(missingId.ok, false);
  assert.equal(missingId.diagnostics[0]?.code, "INVALID_CHANGE_SET_ID");

  const tooMany = applyMathChangeSet(example, {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "cs-many",
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: example.documentId,
      revision: example.revision
    },
    operations: Array.from({ length: 129 }, (_, i) => ({
      op: "construct",
      command: "point.free",
      outputs: [`P${i}`],
      params: { coords: [0, 0] }
    }))
  });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.diagnostics[0]?.code, "OPERATION_LIMIT");
});

test("DomainRuntime.render enforces dimension limits", async () => {
  const runtime = new MathDomainRuntime();
  const bad = await runtime.render(example, { width: 8, height: 640 });
  assert.equal(bad.ok, false);
  assert.equal(bad.diagnostics[0]?.code, "INVALID_RENDER_DIMENSION");
});

test("createMathRenderBundle is byte-identical and validates", async () => {
  const first = await createMathRenderBundle(example, { width: 960, height: 640 });
  const second = await createMathRenderBundle(example, { width: 960, height: 640 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(serializeRenderBundle(first.bundle), serializeRenderBundle(second.bundle));
  assert.equal(first.bundle.integrity.algorithm, "sha256");
  assert.equal(first.bundle.integrity.value.length, 64);
  assert.equal(first.bundle.fallback.digest.value, await sha256Utf8(first.bundle.fallback.content));
  const validated = await validateMathRenderBundle(first.bundle);
  assert.equal(validated.ok, true);

  const tampered = structuredClone(first.bundle);
  tampered.fallback.content += " ";
  const failed = await validateMathRenderBundle(tampered);
  assert.equal(failed.ok, false);
});

test("Agent math_export render-bundle returns MIME and digest", async () => {
  const agent = new AgentMathRuntime();
  const created = await agent.callTool("math_create", {
    document: example,
    replace: true
  });
  assert.equal(created.ok, true);
  const exported = await agent.callTool("math_export", {
    documentId: example.documentId,
    format: "render-bundle"
  });
  assert.equal(exported.ok, true);
  assert.equal(exported.contentType, "application/vnd.famtutor.render-bundle+json");
  assert.equal(typeof exported.digest, "string");
  assert.equal(String(exported.digest).length, 64);
});

test("incompatible math bundle does not claim mountability", async () => {
  const created = await createMathRenderBundle(example, { width: 960, height: 640 });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const bad = structuredClone(created.bundle);
  bad.requirements.domain = "physics";
  const failed = await validateMathRenderBundle(bad);
  assert.equal(failed.ok, false);
});

test("Agent idempotency rejects reused key with different payload", async () => {
  const agent = new AgentMathRuntime();
  await agent.callTool("math_create", { documentId: "idem-doc", title: "t", replace: true });
  const first = await agent.callTool("math_apply", {
    documentId: "idem-doc",
    idempotencyKey: "k1",
    operations: [{ op: "construct", command: "point.free", outputs: ["A"], params: { coords: [0, 0] } }]
  });
  assert.equal(first.ok, true);
  const conflict = await agent.callTool("math_apply", {
    documentId: "idem-doc",
    idempotencyKey: "k1",
    operations: [{ op: "construct", command: "point.free", outputs: ["B"], params: { coords: [1, 1] } }]
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error?.code, "IDEMPOTENCY_KEY_REUSED");
});
