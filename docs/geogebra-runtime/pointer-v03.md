# Native pointer parity — bounded slice B

Issue #16 / PR #18. Existing core, MathDocument, evaluator and renderers remain the engine; real GeoGebra is a separate test oracle. The predecessor mounted-undefined slice A is already accepted and is not repeated here.

## Construction and observation contract

The common original program creates A=(1,2), B=(6,5), M=Midpoint(A,B), s=Segment(A,B). Two independent browser runs deliver actual trusted mouse down/move/up input and a return gesture. The versioned5.4.920.0 codebase is selected before injection and the observed version is checked. Camera-only calibration before construction establishes30pixels per world unit with integer pointer target pixels. No derived coordinate is corrected/rounded; original numeric tolerance remains1e-7.

The declared base protocol observes the initial state and every explicit action after two animation frames (and native flush). All14 primary states and full ordered public callbacks include object names/types/defined state, coordinates/segment coefficients, values and callback-time dependency state. DOM/capture/mouse records and engine-specific client/runtime channels are preserved separately with their original sequence/timestamp/payload. Extra client channels are not claimed API-compatible. The comparator does not merge, deduplicate, reorder or drop callbacks and rejects endpoint-only/no-op traces.

## Source behavior and corrected activation

Opt-in synchronous free-point input edits the existing canonical document while preserving the captured board. Validation errors/custom-domain policies cannot be bypassed. Warning-only diagnostics do not reject otherwise valid input. Existing evaluator observations are isolated from mutation; progressive callback-time queries expose completed nodes and the appropriate prior state of still-pending dependents. Those observation copies never feed mathematics or persistence. Line/segment coordinate queries use the same staged input view, not future point coordinates.

An earlier implementation incorrectly skipped the first movement. Repeated real captures proved that a slow first movement is accepted by the reference, whereas multiple early moves can be ignored. Fixed upstream EuclidianController.shouldCancelDrag and EuclidianConstants.DRAGGING_DELAY specify the actual100ms press-to-drag deadline. The repaired native session uses elapsed time, no move counters and no queued positions. A release without accepted movement cannot replay a suppressed coordinate. See pointer-v03-activation.md for fixed sources, failed evidence and unit cases. Earlier conclusions attributing this to one-time mode initialization are superseded, not retained as accepted behavior.

## Repetition and evidence

pointer-repeatability.yml now triggers on runtime as well as harness changes. It always retains three independent base pairs and three separately labelled passive150ms diagnostic pairs. Every original early sample and raw event remains in each record. Positive-hold traces are explicitly ineligible for the original strict gate; they cannot replace a failed base replicate. A later passing replicate cannot erase a previous failure on the same code. Hashes bind source/tree/case/recorder and full raw records. Final acceptance and exact run/artifact identities are tracked in Issue16; no prior green commit is substituted.

The native activation unit suite verifies the100ms boundary and first slow/multiple early moves. The full original CI, strict API/construction/state regressions, independent pointer/warning runs, matrix proof and repetition results must be read at the final exact SHA before merge.

## Remaining limits

The old two-frame protocol does not itself guarantee equal elapsed press-to-move timing across independent browsers near100ms. Such differences stay visible and block any claim covering that observation. A separately scheduled profile would need explicit delivered-time bounds and its own evidence, not relabelled diagnostic data. Source-to-binary mapping is still UNVERIFIED despite the selected/observed runtime. Earlier right-click-disabled and fractional-pixel experiments remain failed records. Touch/pen, arbitrary input rates/coalescing, client event API, constrained paths, mid-drag undefined recovery, cancellations, WebKit/devices and complete format interchange remain gaps. Native snapshots and GeoGebra format interchange stay separate. No author materials, source scripts or paid services are used.
