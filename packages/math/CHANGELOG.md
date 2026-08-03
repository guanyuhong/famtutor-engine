# Changelog

Math domain package (`@famtutor/math-runtime`) within FamTutor Engine.

## 0.3.0 — 2026-08-03

Engine PR4 — host-neutral Render Bundle + PR3 hardening:

- depend on `@famtutor/core@0.3.0`; real SHA-256 digests (`algorithm: "sha256"`); `stableHash` only for non-security cache keys;
- MountedRenderer: destroy shares apply queue; fingerprint idempotency; staging atomicity; `RENDER_INCOMPLETE`; InteractionAction payload envelope; interaction permissions;
- `createMathRenderBundle` / `validateMathRenderBundle` / `mountMathRenderBundle`;
- `math_export` format `render-bundle`; capabilities advertise MIME + limits;
- operations schema delete oneOf; Chromium live smoke covers bundle payload mount + SHA-256 known vector.

## 0.2.0 — 2026-08-03

Engine PR3 — live MountedRenderer + PR2 contract alignment:

- depend on `@famtutor/core@0.2.0`;
- deterministic `applyMathChangeSet` (no wall clock; optional `metadata.timestamp`);
- `AgentMathRuntime.apply` always delegates to `domainRuntime.apply`;
- `MathDomainRuntime.render` returns `RenderResult`; artifact mode is `direct-svg` only; mounted modes → `UNSUPPORTED_RENDER_MODE`;
- publish `famtutor.math.operations.v1.schema.json`;
- **`mountMathRenderer` / `MathMountedRenderer`**: rebuild+staging, camera/stage/selection restore, interaction → `set_params` ChangeSet, honest snapshots;
- Chromium live smoke + demo event log; strategy honestly reported as `rebuild` (no dirty-set yet).

## 0.1.2 — 2026-08-03

Engine PR2 — core contracts + publishing harden:

- depend on `@famtutor/core@0.1.0`; implement `MathDomainRuntime` and pure `applyMathChangeSet`;
- `AgentMathRuntime` remains the stateful session adapter (dry-run / undo / idempotency / DocumentStore);
- single `MATH_RUNTIME_VERSION` shared by Agent runtime, MCP, CLI, and protocol JSON;
- hardened clean-source package smoke via temporary consumer import by package name;
- package metadata: repository / homepage / bugs / `publishConfig.access`.

## 0.1.1 — 2026-08-03

Release baseline + L0 primitive closure expansion:

- **publish baseline**: pin TypeScript 5.8.3 via lockfile, local `tsc` for build/browser smoke, remove `private` so `npm pack` works, CI on Node 20/22;
- strengthen existing primitives: projection onto circle, path gliders on arc/polygon, stable intersection ordering, `measurement.area` / `measurement.perimeter`, `vector.components` / `vector.polar`;
- new entity types: `arc2`, `sector2`, `conic2`, `transform2`;
- new commands: arc/sector constructors, ellipse/parabola/hyperbola, `point.intersection_line_conic`, transform objects + `transform.apply`;
- L1 macros (perpendicular bisector, angle bisector, triangle centers, tangents) documented in `src/catalog/macros.ts` and intentionally **not** registered as L0 commands;
- **L1 `expand_macro` op** on `math_apply` — executable expansion to L0 construction with provenance;
- **repair diagnostics** — `error.suggestedFixes` / enriched validation issues for Agent auto-repair.

## 0.1.0 — 2026-08-03

Initial Agent-native 2D runtime:

- typed MathDocument protocol and semantic validation;
- 31 construction/measurement commands;
- safe mathematical expression parser and evaluator;
- deterministic construction DAG and headless numeric kernel;
- construction-aware and numeric assertion evidence;
- drag and scalar simulation with traces;
- deterministic direct-SVG renderer;
- interactive JSXGraph renderer and browser demo;
- in-memory transactional Agent API;
- dual-era MCP stdio server (modern 2026-07-28 plus legacy initialize clients);
- CLI, examples, unit/integration/browser/MCP tests.
