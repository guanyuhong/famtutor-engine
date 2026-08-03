import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../bin/famtutor-math-mcp.mjs", import.meta.url));
const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const pending = new Map();
let stderr = "";
child.stderr.on("data", chunk => { stderr += chunk; });
lines.on("line", line => {
  const response = JSON.parse(line);
  const resolver = pending.get(String(response.id));
  if (resolver) {
    pending.delete(String(response.id));
    resolver(response);
  }
});

function send(id, method, params = {}) {
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP request ${id} timed out. stderr=${stderr}`)), 10000);
    pending.set(String(id), response => { clearTimeout(timer); resolve(response); });
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return promise;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const modernMeta = {
  _meta: {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "smoke", version: "1.0.0" },
    "io.modelcontextprotocol/clientCapabilities": {}
  }
};

try {
  const discover = await send("discover", "server/discover", modernMeta);
  assert(discover.result?.resultType === "complete", "Modern discovery missing resultType");
  assert(discover.result?.supportedVersions?.includes("2026-07-28"), "Modern version not advertised");

  const list = await send("list", "tools/list", modernMeta);
  assert(list.result?.resultType === "complete", "Modern tools/list missing resultType");
  assert(list.result?.tools?.length === 9, `Expected 9 tools, got ${list.result?.tools?.length}`);

  const create = await send("create", "tools/call", {
    ...modernMeta,
    name: "math_create",
    arguments: { documentId: "mcp-demo", title: "MCP Demo", purpose: "authoring" }
  });
  assert(create.result?.isError === false, `math_create failed: ${JSON.stringify(create)}`);
  assert(create.result?.structuredContent?.ok === true, "Structured content missing from math_create");

  const apply = await send("apply", "tools/call", {
    ...modernMeta,
    name: "math_apply",
    arguments: {
      documentId: "mcp-demo",
      expectedRevision: 1,
      operations: [
        { op: "construct", command: "point.free", outputs: [{ id: "A", label: "A" }], params: { coords: [-2, 0] } },
        { op: "construct", command: "point.free", outputs: [{ id: "B", label: "B" }], params: { coords: [2, 0] } },
        { op: "construct", command: "segment.through_points", outputs: ["AB"], inputs: [{ ref: "A" }, { ref: "B" }] }
      ]
    }
  });
  assert(apply.result?.isError === false, `math_apply failed: ${JSON.stringify(apply)}`);
  assert(apply.result?.structuredContent?.revision === 2, "math_apply revision mismatch");

  const validate = await send("validate", "tools/call", {
    ...modernMeta,
    name: "math_validate",
    arguments: { documentId: "mcp-demo" }
  });
  assert(validate.result?.structuredContent?.validation?.status === "valid", "MCP-created document invalid");

  const legacyInit = await send("legacy-init", "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "legacy-smoke", version: "1.0.0" }
  });
  assert(legacyInit.result?.protocolVersion === "2025-06-18", "Legacy initialize failed");
  const legacyList = await send("legacy-list", "tools/list", {});
  assert(!Object.hasOwn(legacyList.result ?? {}, "resultType"), "Legacy tools/list unexpectedly includes resultType");
  assert(legacyList.result?.tools?.length === 9, "Legacy tools/list count mismatch");
  process.stdout.write("MCP smoke passed: modern 2026-07-28 and legacy 2025-06-18.\n");
} finally {
  child.stdin.end();
  child.kill("SIGTERM");
}
