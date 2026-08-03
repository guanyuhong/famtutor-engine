# Textbook case corpus

Committed, offline-replayable textbook cases for FamTutor Engine. The corpus is internal source/test data and is not included in the npm packages.

## Current seed batch

- Book: `zjedu-math-8a-2013`
- Slice: 1.1 “认识三角形”, printed pages 4–9 / PDF pages 7–12
- Cases: 10 total
- Accepted: 8
- Expected unsupported: 2
  - `04-adjust-three-segments`: conditional construction and boolean feedback
  - `09-identify-triangle-lines`: assessment submit/scoring/evidence loop

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

## Layout

```text
corpus/books/<bookId>/
  book.json
  source-index.json
  knowledge-points.json
  cases/<seed>/case.json
```
