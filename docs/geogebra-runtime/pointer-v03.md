# Issue 16 slice B: independent real pointer evidence

The original public program creates A, B, Midpoint(A,B) and Segment(A,B) in each independent engine. Real browser mouse actions perform down, four moves, up, down, four return moves, up. All DOM pointer/mouse/capture events, public add/update/remove/clear callbacks with callback-time state, engine-specific client/runtime channels and every post-action API state are retained. Native samples independently include canonical/evaluator/mounted/native-object surfaces. No XML import, setters during drag, oracle execution backend, or author assets are used.

## Before-repair evidence retained

Capture-only source1d365dae6ab1737854bf440bc66eca1fad387bbb, run38439527308, artifact11833984485, ZIP SHA2568904f8fb6dcc5241575066c25921cb93e89b958ecc958255b6dda489ae1b9bfe: both engines captured successfully, strict comparison FAILED. Native callbacks6 vs reference18, with old API/canonical state during movement despite moved native shapes. Native internal surface comparison found56 discrepancies. Initial outer-sized reference framing also yielded fractional-pixel targets, exposing view quantization differences; the failed raw experiment is not relabeled a pass.

## Bounded calibration and input mode

The accepted test configuration calibrates both views to30pixels/world-unit BEFORE construction using actual documented view dimensions, and asserts integer pointer targets. It never changes or rounds output coordinates or increases epsilon. Fractional-pixel behavior remains unverified outside this integer-pixel case.

Reference uses explicit enableRightClick=false, its default embedded mode. Upstream pinned EuclidianController.wrapMouseDraggedND establishes dragging mode and returns on the first movement when right-click is disabled. The native facade matches this with an explicit deferred gesture-activation policy, not deleted events. All attempted raw moves remain visible.

## Original-engine repair

Opt-in synchronous free-point input updates mutate only validated original MathDocument source coordinates/revision, without remounting the captured board. The default host end-only policy is unchanged; custom domain runtimes are explicitly rejected rather than bypassed. Invalid permissions/nonfinite input/undefined-topology changes are rejected atomically. Broader in-drag undefined transitions are a remaining gap.

The original evaluator optionally observes actual node completion, with isolated copies of node/output observations. The public facade emits ordered update callbacks at those completions. During the callback window, not-yet-updated dependent objects expose their previous committed observation, matching the measured reference behavior. Those temporary observations are NEVER used as computation inputs, never persisted and never revive undefined geometry. Final queries use the normal evaluator. A regression reproduced mutation through observer aliases and verifies observation isolation.

## Acceptance contract

After every single delivered mouse action, sample after two animation frames and native flush. Compare every declared state and the complete GLOBAL public callback sequence including each callback-time observation, preserving duplicates and order. Missing boundaries/callbacks, unknown callback fields, unknown steps, stale source/test hashes, wrong runtime, untrusted pointer delivery and two identical no-op traces fail closed. Raw DOM targets, timestamps, view transforms and extra platform-specific client/runtime channels are preserved but not claimed byte-identical between canvas and SVG. Client API compatibility remains NOT_IMPLEMENTED.

Original numeric tolerance1e-7 is unchanged. Twenty-five focused native/comparator tests passed locally; this is not independent oracle acceptance. Local reconstruction uses same-repo archives and checked source blobs after actual clone DNS failure, not a falsely claimed full current checkout. Final exact-SHA CI must run fresh independent captures, original regression gates and scoped same-matrix evidence before merge. Checked-source transport jobs create blobs only and are not test evidence.

Pins: manuale318ba503db08005e4713e6955d6b9ba5769a36c, integration298e983cad5e2f87cab7a330e303487d297960c1, source325faee17884c7ced41d360d0f08ae919a38a955; selected/observed runtime5.4.920.0. Source-to-binary mappingUNVERIFIED. Touch/pen/high-rate coalescing/constrained points/interruptions/mid-drag undefined/cross-format persistence remain NOT_RUN. This is a bounded pointer slice, not general interaction compatibility.
