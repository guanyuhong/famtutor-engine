#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export function resolveTsc() {
  const scriptDir = fileURLToPath(new URL(".", import.meta.url));
  const searchRoots = [
    join(scriptDir, "../../.."),
    join(scriptDir, ".."),
    process.cwd()
  ];
  try {
    const typescriptEntry = require.resolve("typescript/package.json", { paths: searchRoots });
    return join(dirname(typescriptEntry), "bin", "tsc");
  } catch {
    throw new Error(
      "Pinned TypeScript not found. Run `npm ci` from the repository root (typescript@5.8.3)."
    );
  }
}
