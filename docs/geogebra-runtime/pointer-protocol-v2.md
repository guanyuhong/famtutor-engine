# Issue16 / PR18: measured symmetric pointer input protocol v2

This protocol fixes an experiment design defect, not a numeric tolerance. The v1
collector serialized large native-only internal snapshots and wrote JSON between
inputs. Its equal action lists/two-frame waits did not deliver equal elapsed
press times. All v1 failed traces, unstable repetitions and passive-delay probes
remain historical FAILED or DIAGNOSTIC_ONLY. They are not reclassified by v2.

## Source and recovery

Starting head55c0014fc9b3a8faeef56acc3f4d8a59e096f09a, tree8043e2ee74e0b37d1e15b0fdd17afbbc8209e54e.
Checkpoint06 was compared file by file; its alternate activation patch was NOT
applied. Remote19d5d990's100ms input rule remains. Original core, MathDocument,
DAG, evaluator and renderers are reused. Real GeoGebra is oracle-only.

## Declared protocol2.0.1

`protocol.json` is the complete versioned program, action schedule and windows.
Every trial has its own actual trusted DOM pointerdown clock. Timed mouse actions
are scheduled against that anchor; every actual arrival must satisfy its declared
window. Multiple pre100ms moves, post100ms moves, slow first move, short release
and return gesture are separate cases. Exact100ms is covered by native timing
unit tests; a browser dispatch exactly at100ms is NOT claimed.

Both engines use the SAME in-page public-only observer and per-action sampling
call. All tagged values, names, object types/defined state, callback order and
callback-time dependencies remain. Each observation records its runtime cost;
controller calls record dispatch/acknowledgment times. Actual per-input paired
skew and elapsed delivery bounds are separate admission gates. No native flush,
document copy, evaluator call or render audit occurs during primary input. Large
trace transfer, screenshots and JSON writes happen AFTER all gesture inputs.
A final150ms no-input quiescence sample retains late callbacks; it does not insert
passive holds between inputs. Every attempt is retained, with no retry-to-green.

Canvas/SVG DOM targets and extra engine/client events remain raw and ordered;
they are not silently claimed identical. The common ordered public API callback
channel is compared in full. Timings are checked, not removed from the evidence.
Original numeric tolerance remains1e-7. Equal final coordinates are insufficient.

Native internal-surface checks run as a separate instrumented replay and cannot
stand in for real-reference capture. They compare public observations, original
MathDocument/evaluator, mounted document, renderer values and actual objects.
Unrelated undefined circles and dependent centers must remain absent; legitimate
half-axis state remains; no cached geometry is used as a construction result.

## Before/after and current local results (not final-SHA acceptance)

Before runtime repair, the unrelated negative-radius circle blocked a valid
free-point input. New unit tests2PASS/1FAIL; actual trusted mouse replay recorded
pointer_input_rejected. The repair at773b8dc10333817f2f1cfe2f6360a6bf9351dd74
admits only unchanged unrelated known domain-undefined branches. Affected invalid
topology, structural/unknown errors and host assertions still reject atomically.
New tests6/6 and selected existing+new tests38/38 passed locally.

Protocol2.0.0 draft recorded a short-press arrival59.1ms outside its15..55ms
window. That failure is preserved. Version2.0.1 removes a redundant RPC AFTER the
deadline; no window/tolerance is widened. Local12 independent primary native
trials met the declared windows. Separate4-case instrumented audit passed;
protocol guards15/15 and coverage guards8/8 passed. Local real-reference loading
failed DNS; none of these local results are a live dual-engine acceptance.

## Required current-source execution

The pointer and native API CI jobs now use v2 for pointer measurement. This is an
explicit protocol migration; old v1 tests/scripts/failed artifacts/diagnostic
workflow remain. Existing Node20/22, fullverify, construction/API/state regression
gates remain mandatory. Each current-source gate runs all3 repetitions of all4
cases independently in both engines, compares complete traces and records a
separate native audit. A timing miss fails admission, even if sampled values are
equal; a later successful repetition never erases it. Final-SHA evidence and
review resolution are required before merge. This document does not approve it.

The same canonical matrix gets a separate `pointerProtocolV2` proof on existing
rows, preserving prior accepted state/API scope and PARTIAL/unmapped/NOT_RUN rows.
No snapshot extension is invented as a GeoGebra API. Broad input rates, affected
mid-drag undefined/cancellation, fractional pixels, touch/pen, client-listener
semantics and cross-format persistence remain incomplete.

Reference codebase5.4.920.0 is selected before inject and checked after load.
Official source325faee17884c7ced41d360d0f08ae919a38a955; existing manual/integration
pins unchanged. Source-to-runtime binary mapping remains UNVERIFIED. No scripts
or author materials are imported; no deployment, force push, paid API or credentials.
