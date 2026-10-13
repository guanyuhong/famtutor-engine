/**
 * Browser AMD smoke entry.
 * Omits value re-exports from @famtutor/core so the AMD outFile stays self-contained.
 * Node / npm consumers should import from "./index.js" instead.
 */
export * from "./types.js";
export * from "./errors.js";
export * from "./util.js";
export * from "./version.js";
export * from "./operations.js";
export * from "./apply-changeset.js";
export * from "./domain-runtime.js";

export * from "./catalog/commands.js";
export * from "./catalog/macros.js";
export * from "./catalog/macro-expand.js";
export * from "./expression/index.js";

export * from "./kernel/geometry.js";
export * from "./kernel/path-parameter.js";
export * from "./kernel/path-state.js";
export * from "./kernel/dag.js";
export * from "./kernel/evaluate.js";
export * from "./kernel/assertions.js";
export * from "./kernel/simulate.js";
export * from "./kernel/function.js";

export * from "./protocol/validate.js";

export * from "./render/style.js";
export * from "./render/direct-svg.js";
export * from "./render/jsxgraph.js";
export * from "./render/mounted-renderer.js";

// Agent / MCP / RenderBundle stay Node-only — they import @famtutor/core value APIs
// that cannot be inlined into the self-contained AMD smoke outFile.

export * from "./geogebra/import.js";
export { GgbImportError } from "./geogebra/xml.js";
