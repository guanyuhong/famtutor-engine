#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { inspectGgb } from "./inspector.mjs";
import { buildCapabilityPlan } from "./planner.mjs";
import { buildGeometryCatalog } from "./geometry-catalog.mjs";

function usage() {
  return `FamTutor GeoGebra research tools

Usage:
  node scripts/geogebra/cli.mjs inspect <file.ggb> [more.ggb ...] [--output <file-or-directory>]
  node scripts/geogebra/cli.mjs plan <public-index.json> [--output <plan.json>] [--top <count>]
  node scripts/geogebra/cli.mjs geometry-catalog <public-index.json> [--output <catalog.json>] [--first-wave <count>]

Safety:
  - inspect is offline-only and never executes GGBScript or JavaScript.
  - this tool does not download GeoGebra resources.
  - raw .ggb files should remain outside the repository until licensing is confirmed.
`;
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") options.output = argv[++index];
    else if (value === "--top") options.top = Number(argv[++index]);
    else if (value === "--first-wave") options.firstWave = Number(argv[++index]);
    else if (value === "--manifest-dir") options.manifestDir = argv[++index];
    else if (value === "--material-id") options.materialId = argv[++index];
    else if (value === "--source-url") options.sourceUrl = argv[++index];
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value.startsWith("--")) throw new Error(`Unknown option '${value}'.`);
    else positional.push(value);
  }
  return { positional, options };
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function inspectCommand(files, options) {
  if (files.length === 0) throw new Error("inspect requires at least one .ggb file.");
  const manifests = [];
  for (const file of files) {
    const buffer = await fs.readFile(file);
    manifests.push(inspectGgb(buffer, {
      fileName: path.basename(file),
      materialId: files.length === 1 ? options.materialId : undefined,
      sourceUrl: files.length === 1 ? options.sourceUrl : undefined
    }));
  }
  if (!options.output) {
    process.stdout.write(`${JSON.stringify(files.length === 1 ? manifests[0] : manifests, null, 2)}\n`);
    return;
  }
  if (files.length === 1 && options.output.endsWith(".json")) {
    await writeJson(options.output, manifests[0]);
    return;
  }
  await fs.mkdir(options.output, { recursive: true });
  for (const manifest of manifests) {
    const stem = path.basename(manifest.source.fileName ?? "construction", path.extname(manifest.source.fileName ?? ""));
    await writeJson(path.join(options.output, `${stem}.manifest.json`), manifest);
  }
}

async function planCommand(file, options) {
  if (!file) throw new Error("plan requires a public-index JSON file.");
  const index = JSON.parse(await fs.readFile(file, "utf8"));
  const plan = buildCapabilityPlan(index, {
    topCandidates: Number.isInteger(options.top) && options.top > 0 ? options.top : 40
  });
  if (options.output) await writeJson(options.output, plan);
  else process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

async function geometryCatalogCommand(file, options) {
  if (!file) throw new Error("geometry-catalog requires a public-index JSON file.");
  const index = JSON.parse(await fs.readFile(file, "utf8"));
  const manifests = [];
  if (options.manifestDir) {
    const names = (await fs.readdir(options.manifestDir)).filter(name => name.endsWith(".manifest.json")).sort();
    for (const name of names) manifests.push(JSON.parse(await fs.readFile(path.join(options.manifestDir, name), "utf8")));
  }
  const catalog = buildGeometryCatalog(index, {
    firstWaveSize: Number.isInteger(options.firstWave) && options.firstWave > 0 ? options.firstWave : 12,
    manifests
  });
  if (options.output) await writeJson(options.output, catalog);
  else process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, options } = parseArgs(rest);
  if (options.help || !command) {
    process.stdout.write(usage());
    return;
  }
  if (command === "inspect") await inspectCommand(positional, options);
  else if (command === "plan") await planCommand(positional[0], options);
  else if (command === "geometry-catalog") await geometryCatalogCommand(positional[0], options);
  else throw new Error(`Unknown command '${command}'.\n\n${usage()}`);
}

main().catch(error => {
  process.stderr.write(`${error.code ? `${error.code}: ` : ""}${error.message}\n`);
  if (error.details) process.stderr.write(`${JSON.stringify(error.details)}\n`);
  process.exitCode = 1;
});
