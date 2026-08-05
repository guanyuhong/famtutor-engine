# Textbook case corpus

Committed, offline-replayable textbook cases for FamTutor Engine. The corpus is internal source/test data and is not included in the npm packages.

## Current seed batch

- Book: `zjedu-math-8a-2013`
- Slices: Chapter 1 sections 1.1–1.6 and Chapter 2 section 2.1, with source-reviewed cases on printed pages 4–52 / PDF pages 7–55
- Cases: 38 total
- Accepted: 37
- Expected unsupported: 1
  - `09-identify-triangle-lines`: assessment submit/scoring/evidence loop

Case 04 is now accepted through safe `boolean.expression`, expression-driven points, and `text.conditional`; its browser regression changes a `3-4-5` state into `10-4-5` and verifies the feedback transition.

Section 1.4 adds three source-reviewed cases: CH1-19 establishes congruent figures by reflection and overlap, CH1-20 identifies corresponding vertices/edges/angles in Figure 1-18, and CH1-21 reproduces the fold about `AD` in Figures 1-19/1-20. Standard equal-length marks use the reusable `marker.segment_tick` geometry atom.

Sections 1.2, 1.3, 1.5, and 1.6 add CH1-11–18 and CH1-22–35. They follow the textbook sequence from condition/conclusion and counterexamples, through proof structure and auxiliary lines, to SSS/SAS/ASA/AAS and ruler-and-compass construction. Standard parallel marks use the reusable `marker.parallel_chevron(anchor, lineLike, size)` atom.

Chapter 2 starts with CH2-01–03 (global Case 36–38): comparing symmetry axes, reflecting a triangle across a line, and converting the river-side shortest-path problem into a straight segment. All three use existing transform and geometry primitives; no chapter-specific renderer branch was added.

Each case stores source metadata, generation provenance, an initial document, an ordered ChangeSet trace, expected assertions/interactions, status, and diagnostics. Accepted cases pin the SHA-256 fingerprint of the replayed canonical document.

## Verify

```bash
npm run test:corpus
```

The gate checks the textbook hash and page mapping, validates all cases against `famtutor.case.v1`, replays every trace twice, validates documents and assertions, creates direct SVG artifacts and Render Bundles, and writes `artifacts/corpus-report.json`.

The full browser gate additionally mounts demonstration, exploration, and guided-construction seed bundles through the public `mountMathRenderBundle` API:

```bash
npm run test:browser -w @famtutor/math-runtime
```

## Review all cases in the browser

```bash
npm run gallery
```

Then open <http://127.0.0.1:4173/gallery/>. The offline Gallery replays and mounts all 38 cases, exposes the 37 accepted / 1 expected-unsupported split, supports status focus, stage-by-stage review and reset, and keeps the Case 09 capability diagnostic visible.

## Layout

```text
corpus/books/<bookId>/
  book.json
  source-index.json
  knowledge-points.json
  cases/<seed>/case.json
```
