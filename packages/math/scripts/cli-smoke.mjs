import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const bin = join(root, "bin/famtutor-math.mjs");
const example = join(root, "examples/perpendicular-bisector.json");
const artifacts = join(root, "artifacts");
await mkdir(artifacts, { recursive: true });

function run(args) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`CLI failed: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const validation = JSON.parse(run(["validate", example]));
if (validation.status !== "valid") throw new Error(`CLI validation status=${validation.status}`);

const svgPath = join(artifacts, "cli-render.svg");
const renderReport = JSON.parse(run(["render", example, "--out", svgPath, "--width", "840", "--height", "520"]));
const svg = await readFile(svgPath, "utf8");
if (!svg.startsWith("<svg") || renderReport.renderedEntities.length < 6) throw new Error("CLI render output invalid");

const actionPath = join(artifacts, "cli-action.json");
const simulationPath = join(artifacts, "cli-simulation.json");
await writeFile(actionPath, JSON.stringify({ type: "drag", target: "P", path: [[0, 1], [0, 4]], samples: 9 }, null, 2));
run(["simulate", example, "--action", actionPath, "--out", simulationPath]);
const simulation = JSON.parse(await readFile(simulationPath, "utf8"));
if (simulation.frames.length !== 9 || simulation.frames.some(frame => frame.assertions[0]?.status !== "passed")) {
  throw new Error("CLI simulation invariant failed");
}

const inspect = JSON.parse(run(["inspect", example]));
if (inspect.ok !== true || inspect.entities.length !== 6) throw new Error("CLI inspect failed");

import { COMMAND_NAMES } from "../dist/index.js";

const capabilities = JSON.parse(run(["capabilities"]));
if (capabilities.commands.length !== COMMAND_NAMES.length) {
  throw new Error(`CLI command count=${capabilities.commands.length}, expected ${COMMAND_NAMES.length}`);
}

process.stdout.write(`CLI smoke passed: validate, render, simulate, inspect, capabilities.\nSVG: ${svgPath}\n`);
