# Point-circle propagation (Issue #13, PR #11)

The restored geometry source repair changes blob `788161a0c415235f2b8c434a29d69a87df163c17` to `cf3ba049d47be053b9ed9bd48a64b27b62a826e7`. The previous ingestion job had only created an unreferenced blob. This revision puts the source repair in the actual tree.

Independent local reproduction: admitted radius-zero circles failed translation, dilation and circle inversion with INVALID_RADIUS before the repair. Ten new native tests pass after the repair, including dependency updates, negative-radius undefined propagation, recovery, JSON roundtrip and singular inversion rejection. Browser testing additionally exposed missing `point.circle_center` support in the existing JSXGraph renderer; this revision implements that existing primitive in that renderer. Ten new native Chromium checks pass, including radius collapse/recovery, real parent-pointer writeback and canonical JSON remount. These local checks do not replace final-SHA CI.

## Reproduction

```
npm ci
npm run build
node --test packages/math/test/point-circle-downstream.test.mjs
node scripts/geogebra/build-gallery.mjs
python scripts/geogebra/point-circle-browser-acceptance.py
python scripts/geogebra/capture-review.py --output artifacts/reviewed/fresh-reference
node scripts/geogebra/compare-reference.mjs artifacts/reviewed/fresh-reference/capture.json
```

The last two commands independently execute original programs in observed GeoGebra 5.4.920.0. The unchanged strict comparator measures Center/Radius dependent objects through radius collapse, parent motion, inversion singularity/recovery, and zero dilation. A failure blocks acceptance. Real-engine access is blocked in the chat container; final-SHA CI must supply this evidence and unchanged full `npm run verify`, not an older green run.

## Boundaries

No tolerance increase, cached-coordinate fallback, imported author material, replacement kernel or embedded GeoGebra execution backend. Raw GeoGebra conic Apps API type histories are captured separately and explicitly marked not yet verified by a native Apps API facade. GeoGebra's single-point conic reports `point` through getObjectType; it must not be confused with an ordinary point in future API testing. Reference source: geogebra/geogebra commit 325faee17884c7ced41d360d0f08ae919a38a955, GgbAPI.getObjectType and GeoConicND.getTypeString. The runtime-to-source binary mapping is still UNVERIFIED.

The new browser suite uses Chromium set_content, not WebKit or a physical device. Negative-radius model propagation is tested in the evaluator; the existing MountedRenderer retains its atomic invalid-edit rejection policy. Generalized-circle inversion output, full conic type-history API behavior, and exact point-circle pixel styling remain separate gaps. Final tested SHA, reports and merge decision are tracked in Issue #13; do not close before acceptance and merge.
