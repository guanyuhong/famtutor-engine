import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CORE_VERSION,
  RuntimeRegistry
} from "../dist/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(root, "..");

test("CORE_VERSION matches package.json", () => {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(CORE_VERSION, packageJson.version);
  assert.equal(CORE_VERSION, "0.2.0");
});

test("Diagnostic / ChangeSet / RenderArtifact / RenderResult survive JSON round-trip", () => {
  const diagnostic = {
    code: "REVISION_CONFLICT",
    severity: "error",
    message: "conflict",
    path: "base.revision",
    expected: 1,
    actual: 2,
    retryable: true,
    suggestedFixes: [{ description: "reload" }]
  };
  const changeSet = {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "cs-1",
    base: { domain: "example", schema: "famtutor.example.document.v1", documentId: "d1", revision: 1 },
    operations: [{ op: "noop" }],
    metadata: { origin: "test" }
  };
  const artifact = {
    schema: "famtutor.engine.render-artifact.v1",
    document: changeSet.base,
    renderer: "direct-svg",
    mediaType: "image/svg+xml",
    encoding: "utf8",
    content: "<svg/>",
    digest: { algorithm: "sha256", value: "abc" },
    diagnostics: [diagnostic],
    metadata: { width: 1 }
  };
  const renderResult = { ok: true, artifact };
  const validationReport = { status: "partial", issues: [diagnostic] };
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostic)), diagnostic);
  assert.deepEqual(JSON.parse(JSON.stringify(changeSet)), changeSet);
  assert.deepEqual(JSON.parse(JSON.stringify(artifact)), artifact);
  assert.deepEqual(JSON.parse(JSON.stringify(renderResult)), renderResult);
  assert.deepEqual(JSON.parse(JSON.stringify(validationReport)), validationReport);
});

test("RuntimeRegistry registers, rejects duplicates, resolves unknown, and clones descriptors", async () => {
  const registry = new RuntimeRegistry();
  const descriptor = {
    name: "@famtutor/example",
    version: "0.0.0",
    domain: "example",
    documentSchemas: ["famtutor.example.document.v1"],
    operationSchemas: ["famtutor.example.operations.v1"],
    renderers: [{ id: "direct-svg", mediaTypes: ["image/svg+xml"], modes: ["artifact"] }]
  };
  const runtime = {
    async descriptor() { return descriptor; },
    async capabilities() { return { descriptor, items: [] }; },
    async validate() { return { status: "valid", issues: [] }; },
    async apply(document, changeSet) {
      return {
        ok: true,
        changeSetId: changeSet.changeSetId,
        base: changeSet.base,
        next: { ...changeSet.base, revision: changeSet.base.revision + 1 },
        document,
        diagnostics: []
      };
    },
    async render() {
      return {
        ok: true,
        artifact: {
          schema: "famtutor.engine.render-artifact.v1",
          document: { domain: "example", schema: "famtutor.example.document.v1", documentId: "x", revision: 1 },
          renderer: "direct-svg",
          mediaType: "image/svg+xml",
          encoding: "utf8",
          content: "<svg/>",
          digest: { algorithm: "sha256", value: "0" },
          diagnostics: []
        }
      };
    }
  };

  const registered = await registry.register(runtime);
  assert.deepEqual(registry.domains(), ["example"]);
  assert.equal(registry.listDescriptors().length, 1);

  registered.version = "mutated";
  registered.renderers[0].id = "mutated-renderer";
  const listed = registry.listDescriptors();
  assert.equal(listed[0].version, "0.0.0");
  assert.equal(listed[0].renderers[0].id, "direct-svg");

  await assert.rejects(() => registry.register(runtime), /already registered/);

  const unknown = await registry.resolve("physics");
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.diagnostics[0]?.code, "UNKNOWN_DOMAIN");
  }

  const found = await registry.resolve("example");
  assert.equal(found.ok, true);
  if (found.ok) {
    found.descriptor.domain = "mutated-domain";
    assert.equal(registry.listDescriptors()[0].domain, "example");
  }
});

test("core source and public declarations do not leak domain or host types", () => {
  const banned = /\b(point2|circle2|JSXGraph|CathyGO|cgo\.visual|VisualHandle)\b/;
  const scanDirs = [join(packageRoot, "src"), join(packageRoot, "dist")];
  for (const dir of scanDirs) {
    for (const name of readdirSync(dir, { recursive: true })) {
      const relative = String(name);
      if (!relative.endsWith(".ts") && !relative.endsWith(".js") && !relative.endsWith(".d.ts")) continue;
      const text = readFileSync(join(dir, relative), "utf8");
      assert.equal(banned.test(text), false, `${relative} contains banned domain/host tokens`);
    }
  }
});
