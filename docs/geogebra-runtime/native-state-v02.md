# Controlled native undefined-state slice (Issue #16, slice A)

This increment uses the original core, MathDocument, DAG, evaluator and renderers. `evalCommand` does not invoke XML import or a GeoGebra runtime backend. Reference GeoGebra remains an independent test oracle.

## Reproduction and repairs

Baseline main 7c5df0214d79ba195bcbb24a983e4c9fcef842ae. The actual pre-fix observations are checkpointed in state-v02-reproduction.json. With `O=(1,2); r=3; c=Circle(O,r); H=Center(c); q=Radius(c)`, r=-1 made the public API/evaluator undefined but left MountedRenderer at its old revision. Recovery additionally exposed the missing existing measurement.circle_radius renderer case. Undefined-state XML roundtrip lost retained axes. These were observed before the fixes, not assumed from old CI.

The native facade now opts into `undefinedEntities: "omit"`. Explicit mathematical undefined outputs have no native geometric object and appear in RenderReport.undefinedEntities; they are NOT silently skipped unsupported entries. The allowlist is narrow (radius and specified degenerate geometry errors plus dependent undefinedness); default host behavior remains unchanged. `measurement.circle_radius` uses the original evaluator so retained classification/half-axis is separate from undefined geometry. Structural validation was factored into a separate public helper; the original full validation has not been weakened.

## Native canonical persistence (NOT GeoGebra Apps API methods)

```ts
const api = createGeoGebraNativeApi();
api.evalCommand('O=(1,2)\nr=3\nc=Circle(O,r)\nH=Center(c)\nq=Radius(c)');
await api.mount(host, {jsxgraph: JXG});
api.setValue('r', -1);
await api.flush();
const saved = JSON.stringify(api.getSnapshot());
await api.destroy();
const restored = createGeoGebraNativeApi();
restored.restoreSnapshot(JSON.parse(saved));
await restored.mount(host, {jsxgraph: JXG});
restored.setCoords('O', 5, 6);
restored.setValue('r', 4);
await restored.flush();
// c is defined again, H=(5,6), q=4, computed from current inputs.
```

Snapshot schema famtutor.geogebra-native.snapshot.v1 persists the canonical document, label/definition bindings and serial. Callbacks and rendered/evaluated outputs are not saved. Validate finite bounded plain JSON, structure/DAG, bindings, admitted primitive scope and conic-axis state before replacement. `restoreSnapshot` is a silent native lifecycle operation, not a claimed GeoGebra event method; subsequent public edits retain their ordinary events. Undefined-state getXML now explicitly rejects unsupported lossy export and directs native consumers to getSnapshot. Full XML interchange is still unimplemented.

## Independent evidence

`state-browser.py` observes public API, original evaluator, MountedRenderer's own canonical document, renderer values and actual native objects through valid/undefined/save/restore/remount/edit/recovery and point-circle cycles. It checks absence of native shapes and RuntimeValue for undefined geometry, not stale coordinate equality. This is Chromium set_content, NOT reference-pointer parity.

The additional common program api-undefined-snapshot-continuation runs the same public operations in both engines. Native execution inserts a separately recorded canonical checkpoint at the undefined boundary and compares before/after observations, then its continuation is compared to uninterrupted reference execution. This validates continuation, NOT cross-engine snapshot formats. Existing trace fields, exception outcomes, ordered events and 1e-7 numerical tolerance remain unchanged.

Run build, `node --test packages/math/test/native-api-state.test.mjs`, `python scripts/geogebra/native-api/state-browser.py`, and the original native API parity workflow. That workflow now runs the new tests and writes state lifecycle proofs onto the SAME fixed-source matrix rows using state-coverage.py. State evidence is SHA-bound, all unmatched rows and PARTIAL statuses remain. getSnapshot/restoreSnapshot are listed as native extensions, not invented official rows.

## Pins and incomplete work

Manual e318ba503db08005e4713e6955d6b9ba5769a36c; integration298e983cad5e2f87cab7a330e303487d297960c1; source325faee17884c7ced41d360d0f08ae919a38a955; selected/required observed runtime5.4.920.0. Source-to-binary mapping UNVERIFIED. Official API reference: https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/ .

Issue16 remains open for independent reference pointer/intermediate-event traces, broader mathematical undefined classes, mid-drag recovery, WebKit/devices and full cross-engine state interchange. The first slice does not claim these pass. Source scripts remain unexecuted; no author material is redistributed. Final exact-SHA CI and live evidence, not the source-transport job or local-only counts, gate a merge.
