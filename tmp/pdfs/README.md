# Textbook page renderings (visual check cache)

These PNGs are **local visual check materials** for the Zhejiang Education Press Grade 8 Math Vol. A PDF under `books/`. They are not npm pack assets and are not part of the Engine runtime.

## Naming

| Pattern | Meaning |
|---|---|
| `math8a-page-NNN.png` | PDF page NNN (1-based), cover through early Ch.1 |
| `math8a-ch2-049.png` etc. | Chapter start / marker pages for Ch.2–5 |
| `math8a-pages-001-022.txt` | OCR/text extraction scratch (unreliable for Chinese; visual review required) |

## Pilot slice

Section **1.1 认识三角形**: printed pages **4–9** ↔ PDF pages **7–12**  
(`pdfPage = printedPage + 3` for this copy; recorded in `docs/TEXTBOOK_CASE_SYSTEM.md`).

Regenerate (example):

```bash
pdftoppm -f 7 -l 12 -png -r 110 'books/义务教育教科书·数学八年级上册.pdf' tmp/pdfs/math8a-page
```
