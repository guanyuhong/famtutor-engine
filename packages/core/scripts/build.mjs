import { rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveTsc } from "./resolve-tsc.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../dist", import.meta.url), { recursive: true });

const tsc = resolveTsc();
const result = spawnSync(process.execPath, [tsc, "-p", fileURLToPath(new URL("../tsconfig.json", import.meta.url))], {
  cwd: root,
  stdio: "inherit"
});
if (result.status !== 0) process.exit(result.status ?? 1);
