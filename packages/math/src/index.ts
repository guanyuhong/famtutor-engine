export * from "./types.js";
export * from "./errors.js";
export * from "./util.js";
export * from "./version.js";
export * from "./operations.js";
export * from "./apply-changeset.js";
export * from "./domain-runtime.js";

export type {
  JsonPrimitive,
  JsonValue as CoreJsonValue,
  JsonObject,
  DocumentRef,
  ChangeSet,
  Diagnostic,
  SuggestedFix,
  ValidationReport as CoreValidationReport,
  ApplyResult,
  RuntimeDescriptor,
  CapabilityQuery,
  CapabilityResult,
  RenderRequest,
  RenderArtifact,
  DomainRuntime
} from "@famtutor/core";
export {
  CORE_VERSION,
  RuntimeRegistry
} from "@famtutor/core";

export * from "./catalog/commands.js";
export * from "./catalog/macros.js";
export * from "./catalog/macro-expand.js";
export * from "./expression/index.js";

export * from "./kernel/geometry.js";
export * from "./kernel/dag.js";
export * from "./kernel/evaluate.js";
export * from "./kernel/assertions.js";
export * from "./kernel/simulate.js";
export * from "./kernel/clock.js";
export * from "./kernel/function.js";

export * from "./protocol/validate.js";

export * from "./render/style.js";
export * from "./render/direct-svg.js";
export * from "./render/jsxgraph.js";
export * from "./render/mounted-renderer.js";
export * from "./render/bundle.js";

export * from "./agent/store.js";
export * from "./agent/tools.js";
export * from "./agent/runtime.js";
export * from "./agent/repair.js";

export * from "./mcp/protocol.js";
