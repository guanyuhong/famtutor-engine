import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRenderBundleCompatibility,
  createRenderBundle,
  serializeRenderBundle,
  verifyRenderBundleIntegrity
} from "../dist/index.js";

const documentRef = {
  domain: "example",
  schema: "famtutor.example.document.v1",
  documentId: "doc-1",
  revision: 1
};

const document = { title: "Example", revision: 1 };

const runtimeDescriptor = {
  name: "@famtutor/example",
  version: "0.3.0",
  domain: "example",
  documentSchemas: ["famtutor.example.document.v1"],
  operationSchemas: ["famtutor.example.operations.v1"],
  renderers: [{ id: "direct-svg", mediaTypes: ["image/svg+xml"], modes: ["artifact", "mounted"] }]
};

function baseInput(overrides = {}) {
  return {
    documentRef,
    document,
    assets: [],
    entrypoint: {
      renderer: "direct-svg",
      mode: "artifact",
      mediaType: "image/svg+xml"
    },
    requirements: {
      domain: "example",
      documentSchema: "famtutor.example.document.v1",
      runtime: {
        name: "@famtutor/example",
        versionRange: "^0.3.0"
      }
    },
    fallback: {
      mediaType: "image/svg+xml",
      encoding: "utf8",
      content: '<svg xmlns="http://www.w3.org/2000/svg"/>'
    },
    ...overrides
  };
}

test("createRenderBundle is deterministic", async () => {
  const first = await createRenderBundle(baseInput());
  const second = await createRenderBundle(baseInput());
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(serializeRenderBundle(first.bundle), serializeRenderBundle(second.bundle));
});

test("tampered bundle fails integrity verification", async () => {
  const created = await createRenderBundle(baseInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const tampered = structuredClone(created.bundle);
  tampered.document.content = { title: "Tampered", revision: 1 };
  const verified = await verifyRenderBundleIntegrity(tampered);
  assert.equal(verified.ok, false);
});

test("incompatible runtime is rejected", async () => {
  const created = await createRenderBundle(baseInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const incompatible = {
    ...runtimeDescriptor,
    domain: "other",
    version: "0.1.0"
  };
  const compatibility = checkRenderBundleCompatibility(created.bundle, incompatible);
  assert.equal(compatibility.ok, false);
});

test("compatible runtime passes compatibility check", async () => {
  const created = await createRenderBundle(baseInput());
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const verified = await verifyRenderBundleIntegrity(created.bundle);
  assert.equal(verified.ok, true);
  const compatibility = checkRenderBundleCompatibility(created.bundle, runtimeDescriptor);
  assert.equal(compatibility.ok, true);
});
