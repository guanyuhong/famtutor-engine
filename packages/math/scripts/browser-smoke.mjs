import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = join(root, "artifacts");
await mkdir(artifacts, { recursive: true });

const bundle = join(artifacts, "runtime.browser.amd.js");
const compiled = spawnSync("tsc", [
  "--target", "ES2022",
  "--module", "AMD",
  "--moduleResolution", "Node",
  "--outFile", bundle,
  "--lib", "ES2022,DOM",
  "--strict",
  "--esModuleInterop",
  "--skipLibCheck",
  join(root, "src/index.ts")
], { cwd: root, stdio: "inherit" });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

const candidates = [
  process.env.PLAYWRIGHT_PYTHON,
  "/opt/pyvenv/bin/python",
  "python3",
  "python"
].filter(Boolean);
let python;
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ["-c", "import playwright"], { stdio: "ignore" });
  if (probe.status === 0) {
    python = candidate;
    break;
  }
}
if (!python) {
  throw new Error("Python Playwright is required for the browser smoke test. Set PLAYWRIGHT_PYTHON to a Python executable with playwright installed.");
}
const result = spawnSync(python, [join(root, "scripts/browser-smoke.py")], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
