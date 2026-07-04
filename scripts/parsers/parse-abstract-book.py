#!/usr/bin/env python3
"""
parse-abstract-book.py

Span-level PyMuPDF parser for Texas Branch ASM abstract book PDFs.
Produces a JSON bundle ready for scripts/import-meeting.ts.

Usage:
    python3 parse-abstract-book.py <input_pdf> <output_json>

The output meeting object has TBD placeholders; fill them in before seeding.
"""

import html
import json
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF required: pip install pymupdf")

try:
    import pytesseract
    from PIL import Image
    HAS_OCR = True
except ImportError:
    HAS_OCR = False

RUN_OCR = False  # OCR is opt-in via --ocr; rasterizing/OCR per italic title is slow at book scale

# ---------------------------------------------------------------------------
# PyMuPDF span flag bitmask
# ---------------------------------------------------------------------------
BOLD_FLAG        = 1 << 4  # 16
ITALIC_FLAG      = 1 << 1  # 2
SUPERSCRIPT_FLAG = 1 << 0  # 1

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Abstract codes seen in Texas Branch books: UO1, GO1, GP1, PP1, MP1, A-01, P-01
CODE_RE = re.compile(r'^([A-Z]{1,3}-?\d{1,3})$')

# Poster codes: contain P and a digit but not just "O" (oral)
POSTER_CODE_RE = re.compile(r'[A-Z]*P\d|^P\d', re.IGNORECASE)
ORAL_CODE_RE   = re.compile(r'[A-Z]*O\d|^O\d', re.IGNORECASE)

WITHDRAWN_RE = re.compile(r'\bwithdrawn\b', re.IGNORECASE)

CAREER_RE = re.compile(
    r'\b(career\s+talk|keynote|plenary|award\s+lecture|invited\s+speaker|goldschmidt|symposium\s+lecture)\b',
    re.IGNORECASE
)

HONORIFIC_RE = re.compile(
    r'^(Dr\.?|Prof\.?|Professor|Mr\.?|Mrs\.?|Ms\.?|Mx\.?)\s+',
    re.IGNORECASE
)

# Affiliation block lines: start with a digit (the ordinal number)
AFFIL_LINE_RE = re.compile(r'^\d')

# Affiliation entry splitter: digit(s) at a word boundary before a letter
AFFIL_SPLIT_RE = re.compile(r'(?<![a-zA-Z\d])(\d+)[.)]\s*|(?<![a-zA-Z\d])(\d+)(?=[A-Z])')


# ---------------------------------------------------------------------------
# Span helpers
# ---------------------------------------------------------------------------

def is_bold(span):        return bool(span.get('flags', 0) & BOLD_FLAG)
def is_italic(span):      return bool(span.get('flags', 0) & ITALIC_FLAG)
def is_superscript(span): return bool(span.get('flags', 0) & SUPERSCRIPT_FLAG)

def stext(span):
    return span.get('text', '').strip()

def line_text(spans):
    return ''.join(s.get('text', '') for s in spans).strip()

def all_bold(spans):
    non_empty = [s for s in spans if stext(s)]
    return bool(non_empty) and all(is_bold(s) for s in non_empty)

def any_bold(spans):
    return any(is_bold(s) and stext(s) for s in spans)

def any_superscript(spans):
    return any(is_superscript(s) and stext(s) for s in spans)


# ---------------------------------------------------------------------------
# HTML builder
# ---------------------------------------------------------------------------

def spans_to_html(spans):
    """
    Convert spans to HTML. Italic text becomes <em>. Superscript affiliation
    refs are stripped (they belong on the author, not the body/title text).
    Adjacent italic spans are merged into a single <em> run.
    """
    parts = []
    i = 0
    while i < len(spans):
        span = spans[i]
        t = span.get('text', '')
        if not t.strip():
            if t and parts:
                parts.append(' ')
            i += 1
            continue
        if is_superscript(span):
            i += 1
            continue
        escaped = html.escape(t)
        if is_italic(span):
            # Merge consecutive italic spans
            run = escaped
            j = i + 1
            while j < len(spans):
                ns = spans[j]
                nt = ns.get('text', '')
                if is_italic(ns) and not is_superscript(ns) and nt.strip():
                    run += html.escape(nt)
                    j += 1
                elif not nt.strip():
                    j += 1
                else:
                    break
            parts.append(f'<em>{run}</em>')
            i = j
        else:
            parts.append(escaped)
            i += 1
    return ''.join(parts).strip()


# ---------------------------------------------------------------------------
# Author line parser
# ---------------------------------------------------------------------------

def parse_author_line(spans):
    """
    Parse a line of author names with superscript affiliation refs.
    Returns (authors, review_flags).
      authors: [{ name: str, affil_refs: [str] }]
      review_flags: ['honorific_stripped:Name', 'lowercase_name:Name', ...]
    """
    authors = []
    review_flags = []
    current_parts = []
    current_refs = []

    def flush():
        if not current_parts:
            return
        raw = ' '.join(current_parts).strip().rstrip(',').strip()
        name, stripped = _strip_honorific(raw)
        flags = []
        if stripped:
            flags.append(f'honorific_stripped:{name}')
        if _is_lowercase_name(name):
            flags.append(f'lowercase_name:{name}')
        authors.append({'name': name, 'affil_refs': [str(r) for r in current_refs]})
        review_flags.extend(flags)
        current_parts.clear()
        current_refs.clear()

    for span in spans:
        raw_t = span.get('text', '')
        t = raw_t.strip()
        if not t:
            continue

        if is_superscript(span):
            # "1", "1,2", "1,2,3"
            nums = [x.strip() for x in t.split(',') if x.strip().isdigit()]
            current_refs.extend(int(n) for n in nums)
            continue

        # Plain separators
        if t in (',', ';'):
            flush()
            continue
        if t.lower() in ('and', '&'):
            flush()
            continue

        # A single span may contain "LastName1, LastName2" -- split it
        if ',' in t and not is_italic(span):
            parts = t.split(',')
            for idx, part in enumerate(parts):
                part = part.strip()
                if not part:
                    continue
                current_parts.append(part)
                if idx < len(parts) - 1:
                    flush()
        else:
            current_parts.append(raw_t.strip())

    flush()
    return authors, review_flags


def _strip_honorific(name):
    m = HONORIFIC_RE.match(name)
    if m:
        return name[m.end():].strip(), True
    return name, False


def _is_lowercase_name(name):
    parts = name.split()
    return bool(parts) and all(p.islower() for p in parts if p.isalpha())


# ---------------------------------------------------------------------------
# Affiliation block parser
# ---------------------------------------------------------------------------

def parse_affiliations(raw_lines):
    """
    Parse numbered affiliation block from a list of text lines.
    Handles: "1Department of Bio" / "1. Dept" / "1) Dept" / "1 Dept A 2 Dept B"
    Returns [{ num: str|None, text: str }].
    """
    combined = ' '.join(raw_lines).strip()
    if not combined:
        return []

    # Find all (number, start_of_text) pairs
    positions = []
    for m in AFFIL_SPLIT_RE.finditer(combined):
        num = m.group(1) or m.group(2)
        positions.append((num, m.end()))

    if not positions:
        return [{'num': None, 'text': combined}]

    affiliations = []
    for i, (num, start) in enumerate(positions):
        end = positions[i + 1][1] - len(positions[i + 1][0]) - 1 if i + 1 < len(positions) else len(combined)
        text = combined[start:end].strip().rstrip(',; ')
        if text:
            affiliations.append({'num': str(num), 'text': text})

    return affiliations if affiliations else [{'num': None, 'text': combined}]


# ---------------------------------------------------------------------------
# Topic header heuristic
# ---------------------------------------------------------------------------

def is_topic_header(full_text, spans):
    """
    All-bold, not starting with an abstract code or digit, reasonably short.
    Topic headers are Title Case or ALL CAPS short phrases.
    """
    if not all_bold(spans):
        return False
    t = full_text.strip()
    if not t or t[0].isdigit():
        return False
    first_token = t.split()[0].rstrip('.') if t.split() else ''
    if CODE_RE.match(first_token):
        return False
    if len(t) > 100:
        return False
    # Must look like a heading: most words capitalized, no sentence-ending period
    words = [w for w in t.split() if len(w) > 3]
    if not words:
        return False
    cap_count = sum(1 for w in words if w[0].isupper() or w.isupper())
    return cap_count / len(words) >= 0.6


# ---------------------------------------------------------------------------
# Format inference from abstract code
# ---------------------------------------------------------------------------

def infer_format(code):
    if not code:
        return 'oral'
    c = code.upper().replace('-', '')
    if POSTER_CODE_RE.search(c):
        return 'poster'
    if ORAL_CODE_RE.search(c):
        return 'oral'
    # No O or P: ambiguous, default oral and let reviewer decide
    return 'oral'


# ---------------------------------------------------------------------------
# OCR title-italic drop check
# ---------------------------------------------------------------------------

def ocr_title_region(doc, page_num, bbox):
    if not HAS_OCR:
        return None
    try:
        mat = fitz.Matrix(2, 2)
        clip = fitz.Rect(bbox)
        pix = doc[page_num].get_pixmap(matrix=mat, clip=clip)
        img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        return pytesseract.image_to_string(img, config='--psm 6').strip()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

class AbstractBookParser:
    def __init__(self, pdf_path):
        self.doc = fitz.open(pdf_path)
        self.parse_flags = []

    def _flag(self, flag, context=''):
        entry = {'flag': flag}
        if context:
            entry['context'] = context
        self.parse_flags.append(entry)

    def _extract_lines(self):
        lines = []
        for page_num, page in enumerate(self.doc):
            blocks = page.get_text('rawdict', flags=fitz.TEXT_PRESERVE_WHITESPACE)['blocks']
            for block in blocks:
                if block.get('type') != 0:
                    continue
                for para_line in block.get('lines', []):
                    spans = para_line.get('spans', [])
                    if not any(s.get('text', '').strip() for s in spans):
                        continue
                    lines.append({
                        'page': page_num,
                        'spans': spans,
                        'bbox': para_line.get('bbox'),
                    })
        return lines

    def parse(self):
        lines = self._extract_lines()
        topics, abstracts, withdrawn = self._segment(lines)
        return {
            'meeting': {
                'slug': 'TBD',
                'name': 'TBD',
                'season': 'TBD',
                'year': 'TBD',
                'status': 'archived',
                'meetingStartsAt': 'TBD',
                'meetingEndsAt': 'TBD',
                'venueName': 'TBD',
                'city': 'TBD',
            },
            'topics': topics,
            'abstracts': abstracts,
            'withdrawn': withdrawn,
            'parseFlags': self.parse_flags,
        }

    def _segment(self, lines):
        topics = []
        abstracts = []
        withdrawn = []
        current_topic = None
        current = None
        # state: 'authors' | 'affiliations' | 'body'
        state = None

        def flush():
            nonlocal current
            if current is None:
                return
            ab = current
            current = None

            # Assemble title HTML from accumulated parts
            ab['title_html'] = ' '.join(ab.pop('_title_html_parts')).strip()

            # Join body lines with a single space (abstract body is one paragraph)
            ab['body_html'] = ' '.join(ab.pop('_body_parts')).strip()

            # Parse affiliation block
            ab['affiliations'] = parse_affiliations(ab.pop('_affil_raw'))

            # Career talk check
            if CAREER_RE.search(ab['title_html'] + ' ' + ab['body_html']):
                ab['_rflags'].append('career_talk')

            # Emit review flags
            if ab['_rflags']:
                self._flag('review_needed', '; '.join(ab['_rflags']) + f' [{ab.get("code") or "no-code"}]')

            # Remove internal keys
            del ab['_rflags']

            if WITHDRAWN_RE.search(ab['title_html']) or WITHDRAWN_RE.search(ab['body_html']):
                withdrawn.append(ab)
            else:
                abstracts.append(ab)

        def start_abstract(code, title_html_parts, title_has_italics, page_num, bbox):
            nonlocal current, state
            flush()
            state = 'authors'

            review_flags = []
            if RUN_OCR and HAS_OCR and title_has_italics and bbox:
                ocr = ocr_title_region(self.doc, page_num, bbox)
                if ocr:
                    review_flags.append('title_ocr_available')

            current = {
                'code': code or None,
                'level': None,
                'format': infer_format(code),
                'topic': current_topic,
                'title_html': '',          # filled in flush()
                '_title_html_parts': title_html_parts,
                'authors': [],
                'affiliations': [],
                '_affil_raw': [],
                'body_html': '',           # filled in flush()
                '_body_parts': [],
                '_rflags': review_flags,
            }

        for line in lines:
            spans = line['spans']
            full = line_text(spans)

            # Topic header
            if is_topic_header(full, spans):
                flush()
                state = None
                name = full.strip()
                if name not in topics:
                    topics.append(name)
                current_topic = name
                continue

            # Bold line: potential title
            if any_bold(spans):
                first_span = next((s for s in spans if stext(s)), None)
                if first_span:
                    first_tok = stext(first_span).rstrip('.')
                    code_match = CODE_RE.match(first_tok)

                    # Definite title: has a code, OR all-bold + short + not digit-starting
                    is_title = (
                        code_match or
                        (all_bold(spans) and 5 < len(full) < 200 and not full[0].isdigit())
                    )

                    if is_title and state != 'body':
                        # Also treat a new bold line while in 'body' state as a new abstract
                        pass
                    if is_title:
                        code = ''
                        title_spans = []
                        for span in spans:
                            t = stext(span)
                            if t and CODE_RE.match(t.rstrip('.')):
                                code = t.rstrip('.').strip()
                            else:
                                title_spans.append(span)

                        title_html = spans_to_html(title_spans)
                        has_italics = any(is_italic(s) and stext(s) for s in title_spans)
                        start_abstract(code, [title_html], has_italics, line['page'], line.get('bbox'))
                        continue

                    # Continuation of an ongoing title (multi-line bold title)
                    if current and state == 'authors' and all_bold(spans):
                        current['_title_html_parts'].append(spans_to_html(spans))
                        continue

            # ---------- Lines within a current abstract ----------
            if current is not None:

                if state == 'authors':
                    # Author line: has superscripts, or comma-separated short names
                    if any_superscript(spans) or (',' in full and len(full) < 350 and not full[0].isdigit()):
                        authors, rflags = parse_author_line(spans)
                        current['authors'].extend(authors)
                        current['_rflags'].extend(rflags)
                        continue
                    # No author signals -> drop into affiliations
                    state = 'affiliations'

                if state == 'affiliations':
                    if AFFIL_LINE_RE.match(full):
                        current['_affil_raw'].append(full)
                        continue
                    # First non-affiliation line -> body
                    state = 'body'

                # Body
                body_html = spans_to_html(spans)
                if body_html:
                    current['_body_parts'].append(body_html)
                continue

        flush()
        return topics, abstracts, withdrawn


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    global RUN_OCR
    args = [a for a in sys.argv[1:] if a != '--ocr']
    RUN_OCR = '--ocr' in sys.argv[1:]

    if len(args) != 2:
        print(f'Usage: python3 {Path(sys.argv[0]).name} <input_pdf> <output_json> [--ocr]', file=sys.stderr)
        sys.exit(1)

    pdf_path, out_path = args[0], args[1]

    if not Path(pdf_path).exists():
        sys.exit(f'PDF not found: {pdf_path}')

    if not HAS_OCR:
        print('Note: pytesseract/Pillow not installed -- title-italic OCR check skipped.', file=sys.stderr)

    parser = AbstractBookParser(pdf_path)
    result = parser.parse()

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    n_topics    = len(result['topics'])
    n_abstracts = len(result['abstracts'])
    n_withdrawn = len(result['withdrawn'])
    n_flags     = len(result['parseFlags'])

    print(f'Topics:    {n_topics}')
    print(f'Abstracts: {n_abstracts}')
    print(f'Withdrawn: {n_withdrawn}')
    print(f'Flags:     {n_flags}')
    print(f'Output:    {out_path}')

    if result['parseFlags']:
        print(f'\nParse flags (first 10 of {n_flags}):')
        for entry in result['parseFlags'][:10]:
            ctx = f' -- {entry["context"]}' if entry.get('context') else ''
            print(f'  {entry["flag"]}{ctx}')
        if n_flags > 10:
            print(f'  ... {n_flags - 10} more in the output JSON')


if __name__ == '__main__':
    main()
