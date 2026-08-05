import { mkdir, rm, access, mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = join(root, "artifacts");
await mkdir(artifacts, { recursive: true });
await rm(join(root, "dist"), { recursive: true, force: true });

const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", artifacts], {
  cwd: root,
  encoding: "utf8"
});
if (packed.status !== 0) throw new Error(`npm pack failed:\n${packed.stdout}\n${packed.stderr}`);
const info = JSON.parse(packed.stdout)[0];
const tarball = join(artifacts, info.filename);

const listed = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8" });
if (listed.status !== 0) throw new Error(`tar list failed: ${listed.stderr}`);
const entries = listed.stdout.split("\n").filter(Boolean);
const required = [
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/protocol/famtutor.engine.runtime.v1.schema.json",
  "package/protocol/famtutor.render.bundle.v1.schema.json"
];
for (const entry of required) {
  if (!entries.includes(entry)) throw new Error(`Packed tarball missing ${entry}`);
}

const consumer = await mkdtemp(join(tmpdir(), "famtutor-core-consumer-"));
const init = spawnSync("npm", ["init", "-y"], { cwd: consumer, encoding: "utf8" });
if (init.status !== 0) throw new Error(`npm init failed: ${init.stderr}`);
const pkgPath = join(consumer, "package.json");
const require = createRequire(import.meta.url);
const fs = await import("node:fs/promises");
const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
pkg.type = "module";
await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

const install = spawnSync("npm", ["install", tarball], { cwd: consumer, encoding: "utf8" });
if (install.status !== 0) throw new Error(`npm install failed:\n${install.stdout}\n${install.stderr}`);

const probe = join(consumer, "probe.mjs");
await fs.writeFile(probe, `
import { CORE_VERSION, RuntimeRegistry } from "@famtutor/core";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const schema = require("@famtutor/core/protocol/runtime-schema");
if (!CORE_VERSION) throw new Error("missing CORE_VERSION");
if (!schema.$id) throw new Error("missing schema subpath");
const registry = new RuntimeRegistry();
if (registry.domains().length !== 0) throw new Error("registry should start empty");
console.log("core consumer ok", CORE_VERSION);
`);
const run = spawnSync(process.execPath, [probe], { cwd: consumer, encoding: "utf8" });
if (run.status !== 0) throw new Error(`consumer probe failed:\n${run.stdout}\n${run.stderr}`);
process.stdout.write(`Core package smoke passed: ${tarball}\n${run.stdout}`);
