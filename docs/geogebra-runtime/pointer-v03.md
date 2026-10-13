# Issue 16 slice B: bounded independent real-pointer parity

Original program: `A=(1,2); B=(6,5); M=Midpoint(A,B); s=Segment(A,B)`. Each engine independently constructs it through public evalCommand. No XML import, source scripts or GeoGebra backend drives FamTutor. All math remains in the original core/MathDocument/DAG/evaluator/renderers.

## Raw experiment and boundary

Thirteen genuine mouse actions (approach, down, four moves, up; down, four return moves, up) produce fourteen sampled boundaries. Each move uses Playwright steps=1. Sampling follows two animation frames and native flush. No longer input delays were introduced after failures. Full DOM pointer/mouse/capture records, ordered public add/update/remove/clear callbacks including callback-time API state, and engine-specific client/runtime channels are preserved. Segment x/y/z coefficient queries are included after review, not removed from measurement.

Strict comparison covers all boundaries and the full global public callback sequence; no deduplication, sorting, batching, event omission or final-only comparison. Timestamp, canvas/SVG target identifiers and extra engine-specific client/runtime payloads remain raw platform evidence rather than byte-equality claims. The complete client-listener API is unimplemented. Original numerical tolerance is 1e-7.

Acceptance is limited to the documented default enableRightClick=true and views calibrated from actual dimensions to30pixels/world-unit before construction. Integer pixel targets are asserted; output coordinates are never rounded or patched. Touch, pen, high-rate coalescing, constrained points, cancellation, simultaneous mutations, and mid-drag undefined/recovery are NOT_RUN. Fractional pixel behavior and explicit enableRightClick=false remain failed/unaccepted experiments, not successful compatibility claims.

## Preserved failures and genuine fixes

1d365dae6ab1737854bf440bc66eca1fad387bbb capture-only run38439527308: both captures complete, strict FAILED. Native6/reference18 public callbacks;56 native surface-coherence errors exposed moving shapes with stale public/canonical state. Original outer-sized reference framing also exposed fractional-pixel quantization. Artifact11833984485 SHA2568904f8fb6dcc5241575066c25921cb93e89b958ecc958255b6dda489ae1b9bfe remains unchanged.

The original renderer now has opt-in continuous free-point input: validate the original source coordinates and commit them without remounting the captured board. Default host end-only behavior is preserved; custom domain policies are not bypassed. Invalid permissions/nonfinite input/error assertions/undefined topology reject atomically; warning-only diagnostics do not reject otherwise valid input.

The original evaluator provides isolated observations at actual node completion. During synchronous update callbacks the facade exposes previously committed observations only for still-pending producers, then replaces each upon actual completion. No retained observation is used as a solver input, serialized or used to revive undefined geometry. Observer-copy isolation prevents callers mutating source or computed values.

fdacddb12a31adb1840abc1f82aa78cc6d7c5e6b with explicit enableRightClick=false failed: native18/reference9 events and66 discrepancies (separate push had18/6). Earlier prose wrongly called false the default; official parameters specify true. At a5441e56 only that reference flag changed; identical cadence/actions/sampling in default mode passed14boundaries/18events per engine. These are separate configurations and the false-mode result stays FAILED. First-move activation is an empirical input phase of the bounded default case; the native input state represents it explicitly instead of filtering event logs. Source controller code is context, not proven binary mapping or a causal explanation for every runtime mode.

PR18 review4262192009 and4262192017 were independently reproduced (7native passes/2failures): pending line coefficients leaked final input state; warning-only validation rejected valid drags. Producer-boundary input observations and correct warning/error separation repair them. Nine native evaluation/input tests and nineteen comparator controls pass locally. The true browser warning-only variant retains the same public construction/actions and adds only a native MathDocument warning assertion before mounting; it is a native diagnostic regression, not a GeoGebra assertion API claim.

## Matrix and final gate

Pointer evidence overlays the SAME fixed-source canonical rows after existing native API and state evidence. getSnapshot/restoreSnapshot remain native extensions; format interchange is not pointer parity. Required final-SHA gates include full original Node20/22/strict/API/state suites, fresh independent pointer captures and all callback-time coefficient fields, native warning-pointer capture, comparator negative controls and exact-SHA matrix proof. Every row's PARTIAL/unmapped/NOT_RUN boundary remains visible. Intermediate green or historical results are not final acceptance.

The local container clone failed DNS and runtime was recovered from same-repository archives and checked source blobs, not falsely claimed as a complete current checkout. Exact-SHA CI supplies complete-source/live-reference execution. Source-byte transport jobs are not tests. Failure and passing logs/checkpoints are retained before each next stage.

Pins: manual e318ba503db08005e4713e6955d6b9ba5769a36c; integration298e983cad5e2f87cab7a330e303487d297960c1; source325faee17884c7ced41d360d0f08ae919a38a955. Reference codebase5.4.920.0 selected before inject and observed version checked. Source-to-binary mapping UNVERIFIED. No paid APIs, deployment, force push, data deletion or author-material redistribution.
