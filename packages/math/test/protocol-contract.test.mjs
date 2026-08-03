import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
  AgentMathRuntime,
  COMMAND_NAMES,
  ENTITY_TYPES,
  agentToolDefinitions,
  validateMathDocument
} from "../dist/index.js";

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("published JSON contracts stay synchronized with runtime registries", async () => {
  const schema = await load("../protocol/famtutor.math.document.v1.schema.json");
  const tools = await load("../protocol/famtutor.math.agent-tools.v1.json");
  const packageJson = await load("../package.json");

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schema.const, "famtutor.math.document.v1");
  assert.deepEqual(schema.$defs.entityType.enum, [...ENTITY_TYPES]);
  assert.deepEqual(schema.$defs.command.enum, [...COMMAND_NAMES]);
  assert.equal(tools.runtimeVersion, packageJson.version);
  assert.deepEqual(tools.tools, agentToolDefinitions());

  const runtime = new AgentMathRuntime();
  assert.deepEqual(runtime.listTools().map(tool => tool.name), tools.tools.map(tool => tool.name));
  assert.equal(new Set(tools.tools.map(tool => tool.name)).size, tools.tools.length);
});

test("every shipped JSON example conforms to semantic runtime validation", async () => {
  const examplesDirectory = new URL("../examples/", import.meta.url);
  const names = (await readdir(examplesDirectory)).filter(name => name.endsWith(".json")).sort();
  assert.ok(names.length >= 5);
  for (const name of names) {
    const document = JSON.parse(await readFile(new URL(name, examplesDirectory), "utf8"));
    const report = validateMathDocument(document);
    assert.equal(report.status, "valid", `${name}: ${JSON.stringify(report.issues)}`);
  }
});
