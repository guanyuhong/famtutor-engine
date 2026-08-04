# Changelog

## Unreleased

- Added the renderer-independent `marker.segment_tick` L0 annotation atom for standard segment equality marks, with document-unit sizing and composable fractional placement.
- Added the renderer-independent `marker.parallel_chevron(anchor, lineLike, size)` L0 annotation atom. It returns two segment arms, canonicalizes endpoint direction, and composes into double-chevron conventions through repeated calls.

Math domain package (`@famtutor/math-runtime`) within FamTutor Engine.

## Unreleased

- add the atomic `marker.right_angle(angle)` annotation command across headless evaluation, Direct SVG, JSXGraph, protocol registration, and command coverage;
- render labels for angle entities in Direct SVG for parity with JSXGraph.
- keep lowercase `e` and `pi` as expression constants without shadowing conventional uppercase geometry point names such as `E`.
- align JSXGraph stage `reveal` semantics with Direct SVG: when present, it is the visible-entity whitelist, while `hide` removes from that set.
- add renderer-parity geometry styling primitives: `graphics2d.background`, pixel-based `labelOffset`, and independent `angle.three_points` `radius` / `labelRadius` controls;
- render angle sectors and text-aware angle labels consistently in Direct SVG and JSXGraph.
- add deterministic point-label collision avoidance with eight semantic `labelPlacement` anchors and optional pixel `labelOffset` fine-tuning, shared by Direct SVG and JSXGraph.
- keep polygon-vertex labels outside filled geometry, and apply the shared layout through JSXGraph's native point `Label` pixel offsets so mounted and Direct SVG placement stay aligned.
- map line/segment/ray labels to JSXGraph 1.12.2 native fractional path positioning (`position`, `distance`, centered anchors), mirror it in Direct SVG, and center polygon labels through JSXGraph `getTextAnchor()` / SVG polygon centroids.

- add safe `boolean.expression`, `point.from_expressions`, and `text.conditional` L0 commands;
- cover slider-driven conditional feedback in headless evaluation, Direct SVG, JSXGraph, simulation, and real Chromium Render Bundle mounting;
- promote textbook Case 04 from `expected-unsupported` to `accepted`.

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
