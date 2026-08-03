import { mkdir, rm, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = join(root, "artifacts");
const unpack = join(artifacts, "package-smoke");
await mkdir(artifacts, { recursive: true });
await rm(unpack, { recursive: true, force: true });
await mkdir(unpack, { recursive: true });

const packed = spawnSync("npm", ["pack", "--json", "--pack-destination", artifacts], { cwd: root, encoding: "utf8" });
if (packed.status !== 0) throw new Error(`npm pack failed:\n${packed.stdout}\n${packed.stderr}`);
const info = JSON.parse(packed.stdout)[0];
const tarball = join(artifacts, info.filename);
const extracted = spawnSync("tar", ["-xzf", tarball, "-C", unpack], { encoding: "utf8" });
if (extracted.status !== 0) throw new Error(`tar extraction failed: ${extracted.stderr}`);
const packageRoot = join(unpack, "package");
const module = await import(`file://${join(packageRoot, "dist/index.js")}`);
const example = JSON.parse(await readFile(join(packageRoot, "examples/perpendicular-bisector.json"), "utf8"));
const report = module.validateMathDocument(example);
if (report.status !== "valid") throw new Error(`Packed module validation failed: ${JSON.stringify(report)}`);
const rendered = module.renderDirectSvg(example, { width: 640, height: 420 });
if (!rendered.svg.startsWith("<svg")) throw new Error("Packed module SVG render failed");
process.stdout.write(`Package smoke passed: ${tarball} (${info.size} bytes, ${info.entryCount} files).\n`);
