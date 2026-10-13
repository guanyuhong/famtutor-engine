# GeoGebra Integration Preview — original FamTutor Engine

This work extends `guanyuhong/famtutor-engine`, based on main commit `8e6761154618e2ee02409fdf7179670690ba8480`. It does NOT import or depend on the separate `@famtutor/engine-native` prototype.

## Execution path

`local .ggb -> existing readZipEntries -> bounded XML compiler -> famtutor.math.document.v1 -> existing DAG/evaluator -> existing DirectSVG / JSXGraph / MountedRenderer`.

The production compiler is TypeScript in `packages/math/src/geogebra`. Node CLI and fixture/build utilities are `.mjs`; browser and official-reference automation use Python. Existing package names and document protocol remain unchanged. No npm release is published by this branch.

## Run

```sh
npm ci
npm run build
npm test
node scripts/geogebra/build-gallery.mjs
python3 -m http.server 4173 --bind 127.0.0.1
# Open http://127.0.0.1:4173/examples/geogebra/
```

The generated `examples/geogebra/index.html` is also self-contained and can be opened as a local file. It uses the original vendored JSXGraph renderer. GeoGebra is NOT the execution backend in this gallery.

Import a local file:

```sh
node scripts/geogebra/import.mjs /path/to/case.ggb --output artifacts/imported
node scripts/geogebra/import.mjs /path/to/geogebra.xml --output artifacts/imported
```

Strict import is the default. Exit 0 means the supported construction compiled, not that it is fully equivalent to the source applet. Exit 1 means rejection. `--allow-partial` produces an explicitly PARTIAL preview and exits 2. A rejection removes stale products in the output directory.

Outputs: `document.json`, `preview.svg`, `render-report.json`, `import-report.json`. The generated document is the ORIGINAL MathDocument format, not another native protocol. Source labels map to safe internal IDs via `result.labels`.

```ts
import {importGeoGebraXml, mountMathRenderer} from '@famtutor/math-runtime';
const imported = importGeoGebraXml(xml, {documentId: 'my-case', title: 'My case'});
if (imported.status !== 'ready' || !imported.document) {
  throw new Error(JSON.stringify(imported.diagnostics));
}
const renderer = await mountMathRenderer(host, imported.document, {JXG});
await renderer.dispatch({
  type: 'point.set', target: imported.labels.A,
  payload: {coords: [2, 3]}
});
// On host unmount: await renderer.destroy();
```

## Supported construction subset

A command name is not a promise of all overloads.

| Family | Supported inputs | Existing native primitives reused |
|---|---|---|
| Primitives | finite 2D homogeneous points, free line coefficients, vectors, numeric/boolean values, numeric sliders | point.free, line.through_points, vector.components, scalar.constant/slider |
| Expressions | safe explicit scalar/point/function expressions; degree conversion; log(base,value) | original safe AST; function.explicit and function.value_at |
| Linear geometry | two-point Line/Segment/Ray/Midpoint, point+line parallel/perpendicular, two-point perpendicular bisector, three-point angle bisector | existing point/line/segment/ray commands |
| Circle/arc/sector | center+radius, center+point, three points; supported arc and sector variants | original circle/arc/sector commands |
| Polygon | explicit vertices and optional edge outputs | polygon.vertices and segment.through_points |
| Conics | ellipse/hyperbola foci plus point or semiaxis; parabola focus+directrix | original conic2 types and evaluators |
| Intersections | infinite line-line, line-circle, circle-circle, line-conic; literal branch index 1/2 | original typed intersection algorithms |
| Transformations | supported point/vector/line/segment/ray/circle/arc/sector/polygon rotate, translate, reflect, dilate; limited circle inversion | original transform.apply and inversion |
| Measurement | supported distance, radius, area, slope, length, perimeter | original measurement commands |
| Paths/curves | Point(path) using saved position as native constraint state; finite constant-domain Curve(x(t),y(t),t,start,end) | point.on_path, curve.parametric |

Known exclusions: CAS; general equation parsing; user function calls; nested GeoGebra command expressions; implicit multiplication; PointIn; general Angle semantics; region constraints; general function/curve intersections; 3D commands; macros; arbitrary GGBScript/JavaScript; source animation orchestration; source-pixel-exact layout; general .ggb re-export.

Point(path) has a known transport difference when its parent path changes. The compiler emits `PATH_PARAMETER_DIFFERENCE`. Intersection branch ordering and continuation are also not generally equivalent. Do not convert a warning-free initial screenshot into a full compatibility claim.

## Real reference data and tests

`packages/math/test/geogebra-fixtures/reference-capture.v1.json` contains exact XML from eight ORIGINAL programs executed in real GeoGebra 5.4.920.0, plus independent observed values before and after edits. The loader verifies its SHA256. Capture run: `38374361407`; capture script commit: `c4463f0c5c03f7c83de8322627c7bbfaddd74ccb`.

These fixtures are not reconstructed author materials. The runtime version was observed; this is not a reproducibly built/pinned GeoGebra binary distribution.

```sh
node --test packages/math/test/geogebra-import.test.mjs
node scripts/geogebra/compare-reference.mjs
python3 -m pip install -r requirements-smoke.txt
python3 -m playwright install chromium
python3 scripts/geogebra/browser-acceptance.py
```

Local verification of the reviewed source repairs: 222 Node tests pass (9 core, 201 math including 47 new import tests, 12 offline GeoGebra tests). The browser suite has 18 checks including all eight mounts, real pointer drag written back to the canonical document, scalar update, reset, export, teardown and mobile layout. Browser checks use the compiled single-file page via Chromium `set_content`, not HTTP deployment, WebKit, or a physical phone.

Differential results: 7/8 cases pass at the sampled states; 16 states and 64 object observations total. The bisector case FAILS after A moves. Reference P=(0.5,0.5); native P=(0.3846153846153846,-0.07692307692307693). The native runtime projects saved world coordinates, while GeoGebra transports a path parameter. The strict comparison command deliberately exits 1. CI preserves this failure; native regression success is NOT compatibility approval.

The full textbook corpus gate additionally requires the original `books/` PDF. That copyrighted reference PDF is not included in the downloadable code snapshot. A full repository checkout retains it; local source-only corpus verification is therefore blocked, not passed.

## Actual author material inspection

The explicitly supplied author profile is the source for the next benchmark expansion: https://www.geogebra.org/u/orchiming . A bounded retrieval of material `udmtcdnh` yielded an actual archive, SHA256 `fc6ed28120015c441292673fddefbfbc1a0a5d253aa5d7c4d64a1a0523b45579`.

It contains 27 declared objects. Only 11 can currently be imported into a partial preview. Missing pieces include PointIn, nested commands, 3D rotation/folding, dynamic text and source scripts. Strict mode rejects the original. It is NOT reported as a runnable complete original case. Author code/images/archive are not included in this branch's fixture distribution; no author script was executed by the importer.

## Repairs to existing code (not gallery-only substitutes)

- Expression parser: exponentiation precedence above unary +/- (`-2^2 == -4`).
- MountedRenderer: consume `event.position` from real drag-end events, with legacy array fallback. Previously the point moved visually but canonical document revision could remain unchanged.
- MountedRenderer: permit scalar.constant edits only with explicit set_value permission, retaining denial of derived outputs.
- JSXGraph function sampling: protect the plotting domain; domain-error samples are NaN gaps instead of aborting curve label placement. No zero-value substitution.
- Gallery lifecycle: await the existing renderer's asynchronous destruction before replacing it.

## Safety and next increments

The XML reader rejects DTDs/external entities, malformed input, duplicates and excessive size/depth. ZIP parsing reuses the existing CRC/path/expansion checks. Unsupported dependent objects are never replaced with cached coordinates. Scripts/macros block strict import. Limits are guardrails, not a claim that untrusted model rendering is a complete security sandbox.

Next implementation order: source-compatible path parameterization with pointer round-trip tests; nested command lowering; semantic Angle/PointIn coverage; bounded intersections and branch continuity; selected 3D folding primitives; declarative translation of specific safe script actions. Keep source fidelity, math correctness, visual quality and runtime behavior separate, as required by AGENTS.md.

Official references: https://geogebra.github.io/docs/reference/en/File_Format/ ; https://geogebra.github.io/docs/reference/en/XML/ ; https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/ ; https://geogebra.github.io/docs/manual/en/commands/Point/ ; https://geogebra.github.io/docs/manual/en/commands/Intersect/ .
