# Point-circle propagation and retained conic axes (Issue #13, PR #11)

This is an incremental repair of the original core/MathDocument/renderers, not an import-centered replacement engine. The originally recovered geometry repair was only an unreferenced blob; it was placed in the actual source tree at 2d1633665f0e8ab9e7225d44de6d2cf9fef5818d. That candidate passed complete Node/verify and historical typed reference replay, but fresh reference capture failed. It was NOT merged.

## Failures discovered and addressed

The original radius-zero circle failed translation, dilation and inversion with INVALID_RADIUS. Native browser regressions also exposed missing support for the existing `point.circle_center` primitive; its JSXGraph implementation now recomputes centers from live source values.

Fresh GeoGebra 5.4.920.0 run 38413449012 additionally established:

- Zero-factor conic dilation is undefined, including its Center. Radius still reads the copied source half-axis, not the last transformed radius.
- After an invalid radius input, Radius may remain defined because it reads conic classification/half-axis independently from the conic's defined flag.
- Reflect applied when the source conic is initially a single point dispatches to an implicit polynomial. Center of that output is unavailable. Treating it as a native circle was a false acceptance.

The new `conicAxisState` stores only classification and one half-axis, never coordinates. `setGeoGebraInput` advances that state before/after an input mutation using the existing DAG and evaluator. The opt-in `measurement.circle_radius` policy `undefinedPolicy: conic-axis-state` can read those axes from an undefined conic. The conic itself stays undefined and has no RuntimeValue, so downstream geometry is never reconstructed from retained coordinates. Default native undefined-dependency behavior is unchanged. JSON round trips persist this legitimate algebraic state.

The importer now rejects a declared implicit-polynomial inversion output with INVERSION_OUTPUT_TYPE_UNSUPPORTED. Fresh capture retains this explicit UNIMPLEMENTED probe and requires strict rejection, separately from mathematical compatibility passes. The kernel inversion tests and positive-radius-to-point-circle transition do NOT implement the public initial-point implicit-polynomial overload.

## Verification

```
npm ci && npm run build
node --test packages/math/test/point-circle-downstream.test.mjs packages/math/test/conic-axis-state.test.mjs
node scripts/geogebra/build-gallery.mjs
python scripts/geogebra/point-circle-browser-acceptance.py
python scripts/geogebra/capture-review.py --output artifacts/reviewed/fresh-reference
node scripts/geogebra/compare-reference.mjs artifacts/reviewed/fresh-reference/capture.json
```

At local development time, 18 focused native tests and 10 Chromium interaction checks passed. Debugging replay of the 14 successfully captured programs from the failed candidate also passed after the new repairs; that is NOT a complete successful capture or final-SHA acceptance. Final exact-SHA CI must run all original tests/verify, fresh independent capture, strict differential, browser suites and inventory extraction. Issues contain actual final evidence and merge decision.

## Fixed source references and limitations

Upstream source commit 325faee17884c7ced41d360d0f08ae919a38a955: `common/kernel/algos/AlgoRadius.java`, `common/kernel/kernelND/GeoQuadricND.java`, `common/kernel/kernelND/GeoConicND.java`, `common/plugin/GgbAPI.java` under `source/shared/common/src/main/java/org/geogebra/`. Required observed runtime 5.4.920.0; binary/source mapping UNVERIFIED.

Still incomplete: the initial-point implicit-polynomial inversion branch, generalized conic/line inversion outputs, Apps API raw subtype histories, broad nonlinear paths, exact point-circle pixel styling, WebKit and physical devices. Negative-radius native evaluation/state is covered; the existing MountedRenderer still rejects invalid edits atomically. Arbitrary scripts remain disabled. No author materials are redistributed. A green stage is not complete GeoGebra compatibility.
