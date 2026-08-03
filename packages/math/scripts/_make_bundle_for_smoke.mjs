import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createMathRenderBundle, validateMathRenderBundle } from "../dist/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const document = JSON.parse(readFileSync(join(root, "../examples/perpendicular-bisector.json"), "utf8"));
const created = await createMathRenderBundle(document, { width: 960, height: 640 });
if (!created.ok) {
  console.error(JSON.stringify(created.diagnostics, null, 2));
  process.exit(1);
}
const validated = await validateMathRenderBundle(created.bundle);
if (!validated.ok) {
  console.error(JSON.stringify(validated.diagnostics, null, 2));
  process.exit(1);
}
process.stdout.write(JSON.stringify(created.bundle));
