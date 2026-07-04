# Abstract Book Parser

Reusable parser for Texas Branch ASM abstract book PDFs.

## Usage

```
python3 parse-abstract-book.py <input_pdf> <output_json>
```

## Output

Produces a JSON bundle with shape:
`{ meeting, topics, abstracts, withdrawn, parseFlags }`

The `meeting` dict has placeholders (`TBD`) for:

- `slug` (e.g., `"fall-2024"`)
- `name` (e.g., `"2024 Fall Meeting"`)
- `season`, `year`
- `meetingStartsAt`, `meetingEndsAt` (ISO dates, `YYYY-MM-DD`)
- `venueName`, `city`

Fill these in before seeding to production.

## Features

- Span-level PyMuPDF parse with font-flag recovery of italics (species) and superscript affiliation numbering
- Multi-affiliation author-ref mapping
- Title-italic drop detection via OCR (requires pytesseract + tesseract)
- Flagging of decisions for review (honorifics, lowercase names, career talks, etc.)
- Output ready for `scripts/import-meeting.ts`

## Dependencies

- `fitz` (PyMuPDF): `pip install pymupdf`
- `pytesseract`, `Pillow` (optional, for title-italic drop check): `pip install pytesseract pillow`
- `tesseract` (system binary, optional): `brew install tesseract` / `apt install tesseract-ocr`

## After parsing

1. Open the output JSON and fill in the `meeting` placeholders.
2. Review any entries in `parseFlags` (review_needed, title_ocr_available).
3. Manually verify `level` for poster abstracts; the parser sets `null` for all -- set to `"graduate"`, `"undergraduate"`, etc. as appropriate.
4. Run the seeder against local D1:
   ```
   npm run import:meeting -- scripts/seed-data/<slug>.json
   ```
