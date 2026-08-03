#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AgentMathRuntime,
  commandCapabilities,
  renderDirectSvg,
  simulateMathDocument,
  validateMathDocument
} from "../dist/index.js";

function usage(code = 0) {
  const text = `FamTutor Agent-Native Math Runtime v0.1.0

Usage:
  famtutor-math validate <document.json>
  famtutor-math render <document.json> --out <scene.svg> [--width 960] [--height 640] [--view main]
  famtutor-math simulate <document.json> --action <action.json> [--out result.json]
  famtutor-math inspect <document.json>
  famtutor-math capabilities

Simulation action examples:
  {"type":"drag","target":"P","path":[[0,1],[0,3]],"samples":8}
  {"type":"set_value","target":"a","value":2.5,"samples":6}
`;
  process[code === 0 ? "stdout" : "stderr"].write(text);
  process.exit(code);
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

async function loadJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

const command = process.argv[2];
if (!command || command === "--help" || command === "-h") usage(0);

try {
  if (command === "capabilities") {
    process.stdout.write(JSON.stringify({
      runtime: "0.1.0",
      protocol: "famtutor.math.document.v1",
      commands: commandCapabilities()
    }, null, 2) + "\n");
  } else if (command === "validate") {
    const file = process.argv[3];
    if (!file) usage(2);
    const report = validateMathDocument(await loadJson(file));
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (report.status === "invalid") process.exitCode = 1;
  } else if (command === "render") {
    const file = process.argv[3];
    const out = option("--out");
    if (!file || !out) usage(2);
    const document = await loadJson(file);
    const result = renderDirectSvg(document, {
      viewId: option("--view", undefined),
      width: Number(option("--width", "960")),
      height: Number(option("--height", "640"))
    });
    await writeFile(resolve(out), result.svg);
    process.stdout.write(JSON.stringify(result.report, null, 2) + "\n");
  } else if (command === "simulate") {
    const file = process.argv[3];
    const actionPath = option("--action");
    if (!file || !actionPath) usage(2);
    const document = await loadJson(file);
    const action = await loadJson(actionPath);
    const result = simulateMathDocument(document, action);
    const out = option("--out");
    if (out) await writeFile(resolve(out), JSON.stringify(result, null, 2) + "\n");
    else process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (command === "inspect") {
    const file = process.argv[3];
    if (!file) usage(2);
    const document = await loadJson(file);
    const runtime = new AgentMathRuntime();
    await runtime.callTool("math_create", { document });
    const result = await runtime.callTool("math_inspect", { documentId: document.documentId, includeDocument: false });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    usage(2);
  }
} catch (error) {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
}
