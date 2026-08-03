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
  assert.equal(CORE_VERSION, "0.1.0");
});

test("Diagnostic / ChangeSet / RenderArtifact survive JSON round-trip", () => {
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
    operations: [{ op: "noop" }]
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
  assert.deepEqual(JSON.parse(JSON.stringify(diagnostic)), diagnostic);
  assert.deepEqual(JSON.parse(JSON.stringify(changeSet)), changeSet);
  assert.deepEqual(JSON.parse(JSON.stringify(artifact)), artifact);
});

test("RuntimeRegistry registers, rejects duplicates, and returns diagnostics for unknown domains", async () => {
  const registry = new RuntimeRegistry();
  const descriptor = {
    name: "@famtutor/example",
    version: "0.0.0",
    domain: "example",
    documentSchemas: ["famtutor.example.document.v1"],
    operationSchemas: ["famtutor.example.operations.v1"],
    renderers: [{ id: "direct-svg", mediaTypes: ["image/svg+xml"] }]
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
        document,
        diagnostics: []
      };
    },
    async render() {
      return {
        schema: "famtutor.engine.render-artifact.v1",
        document: { domain: "example", schema: "famtutor.example.document.v1", documentId: "x", revision: 1 },
        renderer: "direct-svg",
        mediaType: "image/svg+xml",
        encoding: "utf8",
        content: "<svg/>",
        digest: { algorithm: "sha256", value: "0" },
        diagnostics: []
      };
    }
  };

  await registry.register(runtime);
  assert.deepEqual(registry.domains(), ["example"]);
  assert.equal(registry.listDescriptors().length, 1);

  await assert.rejects(() => registry.register(runtime), /already registered/);

  const unknown = await registry.resolve("physics");
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.diagnostics[0]?.code, "UNKNOWN_DOMAIN");
  }

  const found = await registry.resolve("example");
  assert.equal(found.ok, true);
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
