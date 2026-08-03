import { rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../dist", import.meta.url), { recursive: true });

const result = spawnSync("tsc", ["-p", new URL("../tsconfig.json", import.meta.url).pathname], {
  stdio: "inherit"
});
if (result.status !== 0) process.exit(result.status ?? 1);
