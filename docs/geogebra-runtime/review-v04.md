# PR10 repair and typed differential gate (v04)

This increment extends the original `@famtutor/core`, MathDocument and renderers. It is not full GeoGebra compatibility.

## Historical versus current evidence

The README's 7/8 result describes the original integration, not this increment. The b15c26de path branch subsequently passed its original eight and path nine sampled cases. Independent reproduction here confirmed that baseline, then reproduced all three PR10 reviews with five failing regressions.

The stricter comparator revealed another issue: the old capture had `triangle` observations with no area. The old comparator did not measure this type. Do not treat its historical 8/8 as complete numeric evidence. The original fixture is retained; fresh twelve-case evidence was independently captured in real GeoGebra 5.4.920.0 by Actions run 38397071472. Its exact bytes are SHA256 `c4fdf3b110dff20e6411ccff26697b32a72c528d4d8713db91f7c4fd72802d76`.

## Implemented in this increment

- Typed 2D vector tuples remain vectors and update Translate dependencies. They are not exposed as draggable points. Full vector editing remains a gap.
- Independent affine line equations lower through the existing safe AST and line primitive. Nonlinear and dependent equations fail explicitly; saved coefficients are not substituted for a defining expression.
- CircularArc/CircularSector lower their third point as a direction point through existing expression, arc and sector primitives. The strict native arc primitive is unchanged. Degenerate and 3D equivalence remain unverified.
- Direct SVG renders vector arrows with their source anchor.
- The comparator requires object type, runtime kind, defined state and numeric fields, including z for 3D observations. Unknown fields and projections fail. The numerical threshold remains 1e-7*(1+abs(expected)).
- SVG checks require appropriate geometric markup as well as render-report membership. This is structural verification, not pixel-identical visual certification. Requested event traces fail explicitly until a verified adapter exists.

## Reproduction and merge gate

Run `npm ci`, `npm run build`, `npm test`, `npm run verify`, `node scripts/geogebra/compare-reference.mjs`, and the three browser-acceptance scripts (original, path, review). Matrix extraction is `python scripts/geogebra/build-compatibility-matrix.py`; parser/coverage regressions are `python scripts/geogebra/test_matrix_extraction.py`.

Before submission, local Node tests passed 300/300; captured typed reference replay passed 12/12 and path replay 9/9; browser suites passed 18/18, 21/21 and 9/9. Full local HTTP verification was BLOCKED by the container browser policy (`ERR_BLOCKED_BY_ADMINISTRATOR` on 127.0.0.1), not passed. The PR workflow must run the unchanged full verification on the exact PR head, perform fresh real-engine capture/comparison, run all interaction suites, generate the pinned matrix and preserve commit/tree fingerprints. A green historical run cannot authorize this merge.

## Matrix scope and remaining work

The generator pins official manual e318ba503db08005e4713e6955d6b9ba5769a36c, integration 298e983cad5e2f87cab7a330e303487d297960c1, and source 325faee17884c7ced41d360d0f08ae919a38a955. The runtime-to-source/binary mapping is UNVERIFIED. Documented signatures and source declarations are distinct; alias/dispatch/semantic-overload and exported-platform classification remains incomplete.

Exact overload mappings in coverage-overrides.v1.json remain PARTIAL. Differential and interaction columns are populated only from required passing records bound to the tested source SHA. Unmapped entries stay UNMAPPED/NOT_RUN, not falsely implemented or missing. Source declarations and row counts are not compatibility percentages.

Next: complete source overload/export classification and evidence mapping; verify event ordering and richer geometry; implement nested command lowering through the existing graph before PointIn, full Angle semantics, 3D, dynamic text and remaining families. Each increment requires regression, independent reference and applicable interaction evidence. Author material is not redistributed. Arbitrary source scripts remain disabled pending a separate security design.
