"""PDF parser — Step 1 of the parsing pipeline.

Extracts a list of chunk dicts from a PDF file, where each chunk follows
the schema defined in docs/parsing-pipeline.md:

    {
        "source":        str,   # file path or URL
        "page_or_slide": int,   # 1-indexed
        "type":          str,   # "heading" | "body" | "notes" | "transcript"
        "text":          str,   # normalised text content
    }

Public API:
    - parse_pdf(path)         : native text extraction via PyMuPDF (fast path)
    - parse_scanned_pdf(path) : OCR fallback via pytesseract for image-only PDFs
    - parse_pdf_smart(path)   : try native, fall back to OCR when text is sparse

Run directly to parse a file and print its chunk count:

    python -m parsers.pdf_parser path/to/file.pdf
    python python/parsers/pdf_parser.py path/to/file.pdf
"""

from __future__ import annotations

import io
import sys
from typing import List, TypedDict

import fitz  # pymupdf


class Chunk(TypedDict):
    source: str
    page_or_slide: int
    type: str
    text: str


# Below this total character count we assume the PDF is image-only / scanned
# and fall back to OCR. Mirrors the heuristic in docs/parsing-pipeline.md.
_NATIVE_TEXT_MIN_CHARS = 100

# Drop blocks shorter than this — page numbers, stray glyphs, decorative chars.
_MIN_BLOCK_CHARS = 10

# A short single-line block is most likely a slide / section heading.
_HEADING_MAX_CHARS = 80

# Snap y-coordinates to this row height to make the top-to-bottom sort
# robust against sub-pixel jitter and to handle two-column layouts well.
_ROW_SNAP_PT = 20

# Render scale for the OCR fallback. 2x ≈ 144 DPI from a 72 DPI page, which
# is the sweet spot for tesseract accuracy vs. memory.
_OCR_RENDER_SCALE = 2.0


def parse_pdf(path: str) -> List[Chunk]:
    """Extract structured chunks from a PDF using PyMuPDF's native text layer.

    Returns chunks in reading order (top-to-bottom, left-to-right per page).
    Returns an empty list for image-only / scanned PDFs — callers should use
    `parse_pdf_smart` to transparently fall back to OCR in that case.
    """
    doc = fitz.open(path)
    chunks: List[Chunk] = []

    try:
        for page_num, page in enumerate(doc, start=1):
            # blocks: (x0, y0, x1, y1, text, block_no, block_type)
            blocks = page.get_text("blocks")

            blocks = sorted(
                blocks,
                key=lambda b: (round(b[1] / _ROW_SNAP_PT) * _ROW_SNAP_PT, b[0]),
            )

            for block in blocks:
                text = block[4].strip()
                if len(text) < _MIN_BLOCK_CHARS:
                    continue

                is_heading = len(text) < _HEADING_MAX_CHARS and "\n" not in text

                chunks.append(
                    {
                        "source": path,
                        "page_or_slide": page_num,
                        "type": "heading" if is_heading else "body",
                        "text": text,
                    }
                )
    finally:
        doc.close()

    return chunks


def parse_scanned_pdf(path: str) -> List[Chunk]:
    """OCR fallback for image-only PDFs.

    Renders each page to a high-resolution bitmap and runs tesseract over it.
    Requires the optional dependencies `pytesseract` and `Pillow`, plus a
    system install of the `tesseract` binary.
    """
    try:
        import pytesseract
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "Scanned PDF detected but OCR dependencies are missing. "
            "Install them with: pip install pytesseract Pillow "
            "(and the tesseract binary on your system)."
        ) from exc

    doc = fitz.open(path)
    chunks: List[Chunk] = []

    try:
        mat = fitz.Matrix(_OCR_RENDER_SCALE, _OCR_RENDER_SCALE)
        for page_num, page in enumerate(doc, start=1):
            pix = page.get_pixmap(matrix=mat)
            img = Image.open(io.BytesIO(pix.tobytes("png")))

            text = pytesseract.image_to_string(img).strip()
            if text:
                chunks.append(
                    {
                        "source": path,
                        "page_or_slide": page_num,
                        "type": "body",
                        "text": text,
                    }
                )
    finally:
        doc.close()

    return chunks


def parse_pdf_smart(path: str) -> List[Chunk]:
    """Try native text extraction; fall back to OCR for scanned PDFs."""
    chunks = parse_pdf(path)
    total_text = sum(len(c["text"]) for c in chunks)
    if total_text < _NATIVE_TEXT_MIN_CHARS:
        return parse_scanned_pdf(path)
    return chunks


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python pdf_parser.py <path-to-pdf>", file=sys.stderr)
        sys.exit(2)

    pdf_path = sys.argv[1]
    parsed = parse_pdf_smart(pdf_path)
    print(len(parsed))
