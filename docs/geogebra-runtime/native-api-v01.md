# Native Apps API first slice — Issue #14 / PR #15

`createGeoGebraNativeApi()` is exported from the existing math package and browser entry. Public `evalCommand` / `evalCommandGetLabels` compile explicitly labelled command text through the existing safe AST to original MathDocument construction nodes. The original DAG, evaluator, conic state and renderers execute it. No XML importer, GeoGebra execution backend, alternate mathematical kernel or source JavaScript interpreter is used for command execution.

## Recovery and actual corrections

Recovered unreferenced draft blob `673638369533e5392c98d6524b7e2a5e97c604fd` (19,818 bytes). Prior API test logs were not recovered. The source is now committed in PR #15 rather than existing only as a blob. The first native tests exposed regex-based identifier rewriting and missing AST bounds; the implementation now lowers tokens/AST nodes with finite resource limits.

Fresh real-engine execution then exposed a mistaken assumption in the initial local scientific-notation test: GeoGebra command text reads `1e3` as Euler juxtaposition rather than 1000. The public lexical lowering now distinguishes that syntax from uppercase scientific literals without changing the original kernel parser. Existing reference cases are retained, and a separate lexical program probes both cases and signed forms.

The live trace also established that two-point lines/segments expose unnormalized homogeneous coefficients through coordinate queries, missing-name getValue returns zero, invalid object coordinate queries throw, and default checkbox x/y use screen coordinates. The API projection uses current kernel input values/vector primitives; no saved coordinates are substituted. newConstruction/setXML listener behavior follows the observed target runtime, not an inferred generic reset event.

PR review additionally exposed anonymous helper leaks after deletion. Backward reachability from remaining public definitions now collects orphaned inputs while preserving live dependencies; a repeated create/delete regression verifies bounded growth. The reference applet selects the versioned codebase before injection and still checks the observed runtime version. A regression enforces this ordering.

## Run

```
npm ci && npm run build
node --test packages/math/test/native-api.test.mjs scripts/geogebra/native-api-contract.test.mjs
mkdir -p artifacts/native-api
node scripts/geogebra/native-api/run-native.mjs artifacts/native-api/native.json
python scripts/geogebra/native-api/capture-reference.py --output artifacts/native-api/reference.json
node scripts/geogebra/native-api/compare.mjs artifacts/native-api/native.json artifacts/native-api/reference.json artifacts/native-api/comparison.json
python scripts/geogebra/native-api/browser.py
```

A minimal independent native program:

```js
import {createGeoGebraNativeApi} from '@famtutor/math-runtime';
const api = createGeoGebraNativeApi();
api.evalCommand('A=(1,2)\nB=(4,6)\nM=Midpoint(A,B)');
api.setCoords('A',-2,3);
console.log(api.getObjectType('M'), api.getXcoord('M'), api.getYcoord('M'));
// point 1 4.5
```

## Evidence contract

`program.mjs` is identical source executed independently by both engines. The comparator checks tagged returns, object names/counts, types/defined flags, numeric values/coordinates, dependencies and exact ordered events. `undefined`, NaN, null, strings, numbers, booleans and exceptions are distinct. Exception normalization removes only the unstable compiled Java class prefix; raw exceptions remain in each engine's diagnostics. Numeric tolerance remains 1e-7. Missing cases/steps, wrong calls, absent state/event evidence and changed source/program identities fail closed.

The state test compares a supported own-engine semantic roundtrip and return type, not XML text equality or arbitrary cross-engine interchange. The native pointer suite performs actual mouse dragging and verifies public queries, canonical state, dependent values and remount/editing. Reference pointer event parity is separately NOT_RUN.

## Fixed-source matrix

The existing full inventory generator is retained. `native-api-overrides.v1.json` adds exact API/command-overload mappings; `native-api/coverage.py` overlays the native entrypoint evidence on those SAME canonical rows without relabeling importer evidence. Final CI retains `artifacts/native-api/inventory/matrix.json`, CSV and hashes. Unmatched rows remain visible. Mapping tests reject stale SHA, failed/missing checks, version drift and signature drift. Implementation remains PARTIAL even where sampled checks pass.

Pins: manual `e318ba503db08005e4713e6955d6b9ba5769a36c`; integration `298e983cad5e2f87cab7a330e303487d297960c1`; upstream source `325faee17884c7ced41d360d0f08ae919a38a955`. Required runtime/codebase: `https://www.geogebra.org/apps/5.4.920.0/web3d/`. Source-to-binary mapping is still UNVERIFIED. Relevant upstream files are GgbAPI.java, ExpressionNodeEvaluator.java and the integration Apps API/Embedding documentation at these pins.

## Acceptance and retained gaps

Merge requires final-head native API parity CI, original Node20/22 CI and reviewed compatibility CI. Failure at `8eca721b` was incomplete capture caused by unmeasured coordinate exceptions; `9483c6be` captured every original program and exposed the lexical/default-checkbox mismatch. Neither is final approval. Actual final SHA and reports belong to Issue #14.

Remaining gaps include broader nested commands, CAS/3D, implicit syntax outside the tested lexical forms, arbitrary labels/redefinition, nonfinite setters, constrained path/region edits, generalized conic dispatch, getValue expression strings, arbitrary XML/styles/scripts, listener string callbacks/reentrant mutations, undo/redo, intermediate reference pointer events, WebKit/devices, complete mounted undefined-state synchronization and conic-axis history serialization. A callable method or a sampled pass is not whole-signature compatibility. Local recovery is an archive plus checked runtime files, not a full latest checkout; exact-SHA CI is the authoritative full-source gate. No paid API, deployment, force push or author material redistribution is used.
