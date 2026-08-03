import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const candidates = [
  process.env.JSONSCHEMA_PYTHON,
  "/opt/pyvenv/bin/python",
  "python3",
  "python"
].filter(Boolean);
let python;
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ["-c", "import jsonschema"], { stdio: "ignore" });
  if (probe.status === 0) {
    python = candidate;
    break;
  }
}
if (!python) throw new Error("Python jsonschema is required. Set JSONSCHEMA_PYTHON to an executable with jsonschema installed.");
const result = spawnSync(python, [join(root, "scripts/schema-smoke.py")], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
