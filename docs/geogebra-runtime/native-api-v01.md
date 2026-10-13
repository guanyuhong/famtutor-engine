# Native Apps API first slice — Issue #14

`createGeoGebraNativeApi()` is exported from the existing math package and browser entry. `evalCommand` compiles explicitly labelled command text directly through the existing safe numeric AST to original MathDocument nodes. Original DAG, evaluator, conic state and renderers execute it. It never calls `importGeoGebraXml`, never embeds GeoGebra as the native backend and never executes source JavaScript/GGBScript.

Recovered draft blob: 673638369533e5392c98d6524b7e2a5e97c604fd (19,818 bytes). Prior API test logs were not recovered. This iteration independently found and fixed scientific notation being rewritten as an identifier, and added bounded AST parsing. The original draft remains in the recovery checkpoint; PR #11 is predecessor history, not this stage's evidence.

## Scope

Finite explicitly labelled 2D points/vectors, numeric/boolean constants, bounded expressions, selected Midpoint/Vector/Line/Segment/Translate/Circle/Center/Radius overloads; typed public getters, finite input setters, basic add/update/remove/clear listeners, and a supported defined-state XML roundtrip. All declarations are partial capabilities, not complete signature or command-family compatibility.

The native API source includes an auxiliary XML state adapter. Command execution never goes through that adapter. XML byte equality and full cross-engine XML interchange are not claimed; the common program checks own-engine semantic roundtrip and return type.

## Reproduce

```
npm ci && npm run build
node --test packages/math/test/native-api.test.mjs scripts/geogebra/native-api-contract.test.mjs
mkdir -p artifacts/native-api
node scripts/geogebra/native-api/run-native.mjs artifacts/native-api/native.json
python scripts/geogebra/native-api/capture-reference.py --output artifacts/native-api/reference.json
node scripts/geogebra/native-api/compare.mjs artifacts/native-api/native.json artifacts/native-api/reference.json artifacts/native-api/comparison.json
python scripts/geogebra/native-api/browser.py
```

`program.mjs` is identical source executed independently by both engines. The comparator checks tagged returns, names/counts, exact object types and defined flags, numeric values/coordinates, dependencies, and ordered events with the original 1e-7 relative tolerance. Missing/extra fields and changed program/source SHAs fail. Undefined, NaN, null, strings, numbers and booleans are distinct.

## Pins and merge gate

Manual e318ba503db08005e4713e6955d6b9ba5769a36c; integration 298e983cad5e2f87cab7a330e303487d297960c1; upstream source 325faee17884c7ced41d360d0f08ae919a38a955. Required observed runtime 5.4.920.0, source/binary mapping UNVERIFIED. The main repository inventory retains unmatched/unverified overloads. Current acceptance status belongs to Issue #14 and final-SHA reports, not this prose.

Merge requires final-head native-api CI, original Node20/22 CI and reviewed compatibility CI. Local recovery was a same-repository archive plus checked runtime blobs, not a complete current git checkout. Final-SHA CI therefore supplies authoritative full-source testing. Local direct clone failed DNS resolution and the live reference loader could not load deployggb.js; neither was counted as passed.

## Explicit gaps

Broad nested commands, CAS, 3D, implicit multiplication, arbitrary labels/redefinition, nonfinite setters, general point-on-path/region operations, all conic dispatch outputs, arbitrary XML/styles/scripts, listener string callbacks/reentrant mutation, undo/redo and unlisted Apps API methods. Native pointer test measures commit/writeback, not every intermediate reference event. Reference pointer parity, WebKit and physical devices are NOT_RUN. Undefined-state algebra is tested independently; complete mounted undefined-state synchronization and conic-axis-state serialization are not yet certified. No source scripts, author assets, paid APIs or deployment are used.
