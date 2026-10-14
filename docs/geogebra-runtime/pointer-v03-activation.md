# Slice B: elapsed-time pointer activation repair

PR #18 / Issue #16 remain pending acceptance. This repair does not reclassify previous failed traces as passes.

## Independent before evidence

At source 54cf36f30dc0a44fada5b8c67a227fe41226b380, run38487213171/artifact11859904270 executed six independent browser pairs, all with actual trusted down/move/up input and the existing program. ZIP SHA2565171072eb43ffd90f3b3fb407aeec99e79c0e38436830bbbf7357aa357af382e.

The unchanged two-frame protocol's three replicates were FAILED, PASSED, FAILED (native18 callbacks each; reference12,18,15). A separate diagnostic condition inserted a passive150ms wait after each unchanged early sample: all three native traces still had18 callbacks, while all three reference traces had24. All14 early samples, raw channels and late observations remain saved. Late waits did not alter the already observed reference state without a new input. Diagnostic traces are explicitly ineligible for the original strict gate; no successful replicate erases any failure.

## Root cause and source

The previous native implementation skipped the first move by ordinal. Fixed upstream source uses a press-to-drag deadline instead: EuclidianController.shouldCancelDrag compares current time to lastMousePressedTime+draggingDelay; EuclidianConstants.DRAGGING_DELAY is100 milliseconds. This explains both multiple early suppressed moves and a slow first move being accepted. The constant is reference semantics, not fitted to a case or event count.

Pinned official source commit325faee17884c7ced41d360d0f08ae919a38a955:
- source/shared/common/src/main/java/org/geogebra/common/euclidian/EuclidianController.java (draggingDelay, shouldCancelDrag, lastMousePressedTime)
- source/shared/common/src/main/java/org/geogebra/common/euclidian/EuclidianConstants.java (DRAGGING_DELAY)

Observed runtime5.4.920.0 remains independent of the source pin; source-to-binary mapping is UNVERIFIED.

## Actual repair

The existing MountedRenderer pointer session now records its press time and checks elapsed time. Every move before the reference deadline is rejected as input; the first eligible move is processed immediately. The session contains no deferred coordinates, no callbacks are synthesized, and expiry does not replay a saved position. Releasing without an accepted move cannot commit a suppressed coordinate. The existing free-point input validator, original MathDocument, evaluator and renderers remain authoritative. Default non-opt-in host behavior is unchanged.

Pure timing tests8/8 pass locally (pre-boundary multiple moves, slow first move, exact100ms boundary, return press reset, call-count independence, default zero delay, invalid clock data). Full build/engine/real-pointer acceptance must be checked at the subsequent exact commit, not inferred from those focused tests or byte-transport success.

## Remaining acceptance

Independent runs of the old protocol have not supplied equivalent elapsed input timing near the100ms boundary. Keep their failures and all raw callbacks. Do not solve timing jitter by deleting events, changing comparison tolerance, hardcoding a move index, copying oracle coordinates, or relabeling the passive diagnostic as the original test. A separately declared timed input profile requires its own measured delivery bounds and independent evidence before any bounded acceptance. Broad rates/modes, client events, constrained paths, fractional pixels and mid-drag topology remain gaps.
