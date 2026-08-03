import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  MATH_RUNTIME_VERSION,
  MCP_SERVER_INFO,
  MathDomainRuntime,
  applyMathChangeSet,
  deepClone
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
  assert.equal(MATH_RUNTIME_VERSION, "0.1.2");
  assert.equal(packageJson.version, MATH_RUNTIME_VERSION);
  assert.equal(tools.runtimeVersion, MATH_RUNTIME_VERSION);
  assert.equal(MCP_SERVER_INFO.version, MATH_RUNTIME_VERSION);
  assert.equal(descriptor.version, MATH_RUNTIME_VERSION);
  assert.equal(descriptor.domain, "math");
  assert.deepEqual(descriptor.documentSchemas, ["famtutor.math.document.v1"]);
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
    }]
  };
  const result = await runtime.apply(document, changeSet);
  assert.equal(result.ok, true);
  assert.deepEqual(document, snapshot);
  assert.equal(result.document?.revision, 3);
  assert.equal(result.next?.revision, 3);
  assert.ok(result.created?.includes("A"));
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

test("Direct SVG render produces a core RenderArtifact", async () => {
  const runtime = new MathDomainRuntime();
  const document = emptyDoc(1);
  document.entities.push({ id: "A", type: "point2", role: "free", label: "A" });
  document.construction.push({
    id: "op-A",
    command: "point.free",
    outputs: ["A"],
    params: { coords: [0, 0] }
  });
  const artifact = await runtime.render(document, { width: 320, height: 240 });
  assert.equal(artifact.schema, "famtutor.engine.render-artifact.v1");
  assert.equal(artifact.mediaType, "image/svg+xml");
  assert.equal(artifact.encoding, "utf8");
  assert.ok(artifact.content.startsWith("<svg"));
  assert.ok(artifact.digest.value);
  assert.equal(artifact.document.domain, "math");
});
