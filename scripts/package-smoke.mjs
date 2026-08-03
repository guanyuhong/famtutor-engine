import { mkdir, rm, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const coreRoot = join(repoRoot, "packages/core");
const mathRoot = join(repoRoot, "packages/math");
const artifacts = join(repoRoot, "artifacts");
await mkdir(artifacts, { recursive: true });

async function packPackage(packageRoot, label) {
  await rm(join(packageRoot, "dist"), { recursive: true, force: true });
  const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", artifacts], {
    cwd: packageRoot,
    encoding: "utf8"
  });
  if (packed.status !== 0) throw new Error(`${label} npm pack failed:\n${packed.stdout}\n${packed.stderr}`);
  const info = JSON.parse(packed.stdout)[0];
  return join(artifacts, info.filename);
}

function assertTarContains(tarball, required) {
  const listed = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8" });
  if (listed.status !== 0) throw new Error(`tar list failed for ${tarball}: ${listed.stderr}`);
  const entries = new Set(listed.stdout.split("\n").filter(Boolean));
  for (const entry of required) {
    if (!entries.has(entry)) throw new Error(`${tarball} missing ${entry}`);
  }
}

const coreTarball = await packPackage(coreRoot, "core");
assertTarContains(coreTarball, [
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/protocol/famtutor.engine.runtime.v1.schema.json"
]);

const mathTarball = await packPackage(mathRoot, "math");
assertTarContains(mathTarball, [
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/protocol/famtutor.math.document.v1.schema.json",
  "package/bin/famtutor-math.mjs",
  "package/bin/famtutor-math-mcp.mjs"
]);

const consumer = await mkdtemp(join(tmpdir(), "famtutor-consumer-"));
const init = spawnSync("npm", ["init", "-y"], { cwd: consumer, encoding: "utf8" });
if (init.status !== 0) throw new Error(`npm init failed: ${init.stderr}`);
const pkgPath = join(consumer, "package.json");
const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
pkg.type = "module";
await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

const install = spawnSync("npm", ["install", coreTarball, mathTarball], {
  cwd: consumer,
  encoding: "utf8"
});
if (install.status !== 0) throw new Error(`consumer npm install failed:\n${install.stdout}\n${install.stderr}`);

const exampleSource = join(mathRoot, "examples/perpendicular-bisector.json");
await access(exampleSource);
const example = JSON.parse(await readFile(exampleSource, "utf8"));
await writeFile(join(consumer, "example.json"), JSON.stringify(example));

const probe = join(consumer, "probe.mjs");
await writeFile(probe, `
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { CORE_VERSION, RuntimeRegistry } from "@famtutor/core";
import {
  MATH_RUNTIME_VERSION,
  MathDomainRuntime,
  validateMathDocument,
  renderDirectSvg
} from "@famtutor/math-runtime";

const require = createRequire(import.meta.url);
const coreSchema = require("@famtutor/core/protocol/runtime-schema");
const mathSchema = require("@famtutor/math-runtime/protocol/document-schema");
if (!CORE_VERSION || !MATH_RUNTIME_VERSION) throw new Error("missing versions");
if (!coreSchema || typeof coreSchema !== "object") throw new Error("core schema subpath failed");
if (!mathSchema || typeof mathSchema !== "object") throw new Error("math schema subpath failed");

const document = JSON.parse(readFileSync(new URL("./example.json", import.meta.url), "utf8"));
const report = validateMathDocument(document);
if (report.status !== "valid") throw new Error("validate failed");
const rendered = renderDirectSvg(document, { width: 640, height: 420 });
if (!rendered.svg.startsWith("<svg")) throw new Error("svg render failed");

const runtime = new MathDomainRuntime();
const descriptor = await runtime.descriptor();
if (descriptor.domain !== "math") throw new Error("descriptor domain mismatch");
const registry = new RuntimeRegistry();
await registry.register(runtime);
console.log(JSON.stringify({
  ok: true,
  core: CORE_VERSION,
  math: MATH_RUNTIME_VERSION,
  svgBytes: rendered.svg.length
}));
`);

const run = spawnSync(process.execPath, [probe], { cwd: consumer, encoding: "utf8" });
if (run.status !== 0) throw new Error(`consumer probe failed:\n${run.stdout}\n${run.stderr}`);

const cli = spawnSync("npx", ["famtutor-math", "capabilities"], {
  cwd: consumer,
  encoding: "utf8"
});
if (cli.status !== 0) throw new Error(`CLI capabilities failed:\n${cli.stdout}\n${cli.stderr}`);
const capabilities = JSON.parse(cli.stdout);
if (!capabilities.runtime) throw new Error("CLI capabilities missing runtime version");

process.stdout.write(`Package smoke passed.\ncore=${coreTarball}\nmath=${mathTarball}\n${run.stdout}`);
