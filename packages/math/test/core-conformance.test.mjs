import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  AgentMathRuntime,
  MATH_RUNTIME_VERSION,
  MCP_SERVER_INFO,
  MathDomainRuntime,
  applyMathChangeSet,
  createMathRenderBundle,
  deepClone,
  sha256Utf8,
  stableHash,
  validateMathRenderBundle
} from "../dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function emptyDoc(revision = 1) {
  return {
    schema: "famtutor.math.document.v1",
    documentId: "doc-core",
    revision,
    seed: 0,
    metadata: { title: "Core", locale: "zh-CN", purpose: "authoring" },
    entities: [],
    construction: [],
    views: [{
      id: "main",
      kind: "graphics2d",
      visible: true,
      renderer: "jsxgraph-svg",
      boundingBox: [-5, 5, 5, -5],
      axes: true,
      grid: false,
      keepAspectRatio: true
    }]
  };
}

test("version constants stay synchronized across package, protocol, descriptor, and MCP", async () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const tools = JSON.parse(readFileSync(join(root, "protocol/famtutor.math.agent-tools.v1.json"), "utf8"));
  const runtime = new MathDomainRuntime();
  const descriptor = await runtime.descriptor();
  assert.equal(MATH_RUNTIME_VERSION, "0.3.0");
  assert.equal(packageJson.version, MATH_RUNTIME_VERSION);
  assert.equal(tools.runtimeVersion, MATH_RUNTIME_VERSION);
  assert.equal(MCP_SERVER_INFO.version, MATH_RUNTIME_VERSION);
  assert.equal(descriptor.version, MATH_RUNTIME_VERSION);
  assert.equal(descriptor.domain, "math");
  assert.deepEqual(descriptor.documentSchemas, ["famtutor.math.document.v1"]);
  assert.ok(descriptor.renderers.every(renderer => Array.isArray(renderer.modes)));
});

test("MathDomainRuntime apply constructs a free point without mutating input", async () => {
  const runtime = new MathDomainRuntime();
  const document = emptyDoc(2);
  const snapshot = deepClone(document);
  const changeSet = {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "cs-1",
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: "doc-core",
      revision: 2
    },
    operations: [{
      op: "construct",
      command: "point.free",
      outputs: [{ id: "A", label: "A" }],
      params: { coords: [1, 2] }
    }],
    metadata: { timestamp: "2026-08-03T00:00:00.000Z" }
  };
  const result = await runtime.apply(document, changeSet);
  assert.equal(result.ok, true);
  assert.deepEqual(document, snapshot);
  assert.equal(result.document?.revision, 3);
  assert.equal(result.next?.revision, 3);
  assert.ok(result.created?.includes("A"));
  assert.equal(result.document?.provenance?.updatedAt, "2026-08-03T00:00:00.000Z");
});

test("applyMathChangeSet is deterministic for identical inputs", () => {
  const document = emptyDoc(1);
  const changeSet = {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "cs-det",
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: "doc-core",
      revision: 1
    },
    operations: [{
      op: "construct",
      command: "point.free",
      outputs: ["A"],
      params: { coords: [0, 0] }
    }],
    metadata: { timestamp: "2026-01-01T00:00:00.000Z" }
  };
  const first = applyMathChangeSet(document, changeSet);
  const second = applyMathChangeSet(document, changeSet);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(stableHash(first.document), stableHash(second.document));
});

test("applied documents remain canonical JSON through Render Bundle validation", async () => {
  const document = emptyDoc(1);
  const result = applyMathChangeSet(document, {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "cs-json-safe",
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: "doc-core",
      revision: 1
    },
    operations: [
      { op: "construct", command: "point.free", outputs: ["A"], params: { coords: [0, 0] } },
      { op: "construct", command: "point.free", outputs: ["B"], params: { coords: [2, 0] } },
      { op: "construct", command: "segment.through_points", outputs: ["AB"], inputs: [{ ref: "A" }, { ref: "B" }] },
      { op: "expand_macro", macro: "macro.line.perpendicular_bisector", inputs: { A: "A", B: "B" }, idPrefix: "json_safe" }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.document, JSON.parse(JSON.stringify(result.document)));
  const created = await createMathRenderBundle(result.document);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const validated = await validateMathRenderBundle(created.bundle);
  assert.equal(validated.ok, true);
});

test("base revision mismatch returns REVISION_CONFLICT without throwing", () => {
  const document = emptyDoc(5);
  const result = applyMathChangeSet(document, {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "cs-conflict",
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: "doc-core",
      revision: 4
    },
    operations: [{
      op: "construct",
      command: "point.free",
      outputs: ["A"],
      params: { coords: [0, 0] }
    }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "REVISION_CONFLICT");
  assert.equal(document.revision, 5);
  assert.ok(result.document);
  assert.equal("next" in result && result.next, false);
});

test("illegal operation fails atomically and leaves no half-built document", () => {
  const document = emptyDoc(1);
  const result = applyMathChangeSet(document, {
    schema: "famtutor.engine.change-set.v1",
    changeSetId: "cs-bad",
    base: {
      domain: "math",
      schema: "famtutor.math.document.v1",
      documentId: "doc-core",
      revision: 1
    },
    operations: [{
      op: "construct",
      command: "point.free",
      outputs: ["A"],
      params: { coords: [0, 0] }
    }, {
      op: "construct",
      command: "not.a.command",
      outputs: ["B"],
      params: { coords: [1, 1] }
    }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "UNKNOWN_COMMAND");
  assert.equal(document.entities.length, 0);
  assert.equal(result.document?.entities.length, 0);
});

test("Direct SVG render produces a core RenderResult artifact", async () => {
  const runtime = new MathDomainRuntime();
  const document = emptyDoc(1);
  document.entities.push({ id: "A", type: "point2", role: "free", label: "A" });
  document.construction.push({
    id: "op-A",
    command: "point.free",
    outputs: ["A"],
    params: { coords: [0, 0] }
  });
  const rendered = await runtime.render(document, { width: 320, height: 240 });
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  assert.equal(rendered.artifact.schema, "famtutor.engine.render-artifact.v1");
  assert.equal(rendered.artifact.renderer, "direct-svg");
  assert.equal(rendered.artifact.mediaType, "image/svg+xml");
  assert.equal(rendered.artifact.encoding, "utf8");
  assert.ok(rendered.artifact.content.startsWith("<svg"));
  assert.equal(rendered.artifact.digest.value, await sha256Utf8(rendered.artifact.content));
  assert.equal(rendered.artifact.digest.algorithm, "sha256");
});

test("DomainRuntime.render rejects mounted renderer modes", async () => {
  const runtime = new MathDomainRuntime();
  const rendered = await runtime.render(emptyDoc(1), { renderer: "jsxgraph-svg" });
  assert.equal(rendered.ok, false);
  if (rendered.ok) return;
  assert.equal(rendered.diagnostics[0]?.code, "UNSUPPORTED_RENDER_MODE");
});

test("AgentMathRuntime.apply delegates to injected domainRuntime.apply", async () => {
  let called = 0;
  const fake = {
    async descriptor() {
      return {
        name: "fake",
        version: "0",
        domain: "math",
        documentSchemas: ["famtutor.math.document.v1"],
        operationSchemas: [],
        renderers: []
      };
    },
    async capabilities() { return { descriptor: await this.descriptor(), items: [] }; },
    async validate() { return { status: "valid", issues: [] }; },
    async apply(document, changeSet) {
      called += 1;
      const next = deepClone(document);
      next.revision = document.revision + 1;
      return {
        ok: true,
        changeSetId: changeSet.changeSetId,
        base: changeSet.base,
        next: {
          domain: "math",
          schema: "famtutor.math.document.v1",
          documentId: next.documentId,
          revision: next.revision
        },
        document: next,
        created: [],
        removed: [],
        diagnostics: []
      };
    },
    async render() {
      return { ok: false, diagnostics: [{ code: "NO", severity: "error", message: "no" }] };
    }
  };
  const agent = new AgentMathRuntime({ domainRuntime: fake });
  const created = await agent.callTool("math_create", { documentId: "d1", title: "t" });
  assert.equal(created.ok, true);
  const applied = await agent.callTool("math_apply", {
    documentId: "d1",
    operations: [{ op: "construct", command: "point.free", outputs: ["A"], params: { coords: [0, 0] } }]
  });
  assert.equal(applied.ok, true);
  assert.equal(called, 1);
});

test("operations schema covers every MathOperation discriminant", () => {
  const schema = JSON.parse(readFileSync(join(root, "protocol/famtutor.math.operations.v1.schema.json"), "utf8"));
  const defs = Object.keys(schema.$defs).filter(name => ![
    "entityRefInput", "literalInput", "commandInput", "constructOutput"
  ].includes(name));
  assert.deepEqual(defs.sort(), [
    "add_assertion",
    "construct",
    "delete",
    "expand_macro",
    "remove_assertion",
    "set_clock",
    "set_control",
    "set_entity",
    "set_interaction",
    "set_params",
    "set_style",
    "set_view"
  ].sort());
  assert.equal(schema.$id, "https://famtutor.ai/schemas/famtutor.math.operations.v1.schema.json");
});
