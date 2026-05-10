# Parsing Pipeline

The parsing pipeline normalises all input formats into a consistent list of **chunks** — each chunk being a short, semantically coherent piece of text with metadata about its source. Everything downstream (flashcard generation, exam questions, concept maps) consumes this same chunk format.

## Chunk Schema

```python
{
    "source":        str,   # file path or URL
    "page_or_slide": int,   # 1-indexed
    "type":          str,   # "heading" | "body" | "notes" | "transcript"
    "text":          str,   # normalised text content
}
```

---

## Step 1 — PDF Parsing (PyMuPDF)

PyMuPDF (`fitz`) is the fastest and most accurate Python library for text extraction from PDFs. Unlike pdfplumber it exposes block-level layout data, which lets you distinguish headings from body text on lecture slides.

```bash
pip install pymupdf
```

```python
import fitz  # pymupdf

def parse_pdf(path: str) -> list[dict]:
    """
    Extract structured chunks from a PDF lecture file.
    Returns a list of chunk dicts sorted by reading order.
    """
    doc = fitz.open(path)
    chunks = []

    for page_num, page in enumerate(doc, start=1):
        # "blocks" returns list of (x0, y0, x1, y1, text, block_no, block_type)
        blocks = page.get_text("blocks")

        # Sort top-to-bottom, left-to-right (snap to 20pt rows to handle columns)
        blocks = sorted(blocks, key=lambda b: (round(b[1] / 20) * 20, b[0]))

        for block in blocks:
            text = block[4].strip()
            if not text or len(text) < 10:
                continue  # skip noise, page numbers, single chars

            # Heuristic: short line with no newline = likely a slide heading
            is_heading = len(text) < 80 and "\n" not in text

            chunks.append({
                "source":        path,
                "page_or_slide": page_num,
                "type":          "heading" if is_heading else "body",
                "text":          text,
            })

    doc.close()
    return chunks
```

### Handling scanned PDFs (image-only)

If `get_text()` returns empty strings, the PDF is a scanned image. Fall back to OCR:

```python
import fitz
import pytesseract  # pip install pytesseract
from PIL import Image  # pip install Pillow
import io

def parse_scanned_pdf(path: str) -> list[dict]:
    """OCR fallback for image-only PDFs."""
    doc = fitz.open(path)
    chunks = []

    for page_num, page in enumerate(doc, start=1):
        # Render page to a high-resolution image
        mat = fitz.Matrix(2.0, 2.0)  # 2x scale for better OCR
        pix = page.get_pixmap(matrix=mat)
        img = Image.open(io.BytesIO(pix.tobytes("png")))

        text = pytesseract.image_to_string(img)
        if text.strip():
            chunks.append({
                "source":        path,
                "page_or_slide": page_num,
                "type":          "body",
                "text":          text.strip(),
            })

    doc.close()
    return chunks

def parse_pdf_smart(path: str) -> list[dict]:
    """Try native text extraction; fall back to OCR if needed."""
    chunks = parse_pdf(path)
    total_text = sum(len(c["text"]) for c in chunks)
    if total_text < 100:  # likely scanned
        return parse_scanned_pdf(path)
    return chunks
```

---

## Step 2 — PowerPoint Parsing (python-pptx)

PPTX files carry richer structure than PDFs: each slide has a title, body text, and optional **speaker notes**. Speaker notes are often extremely valuable — many lecturers write detailed explanations there that never appear in the exported PDF.

```bash
pip install python-pptx
```

```python
from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER

def parse_pptx(path: str) -> list[dict]:
    """
    Extract structured chunks from a PowerPoint lecture file.
    Includes title, body text, and speaker notes per slide.
    """
    prs = Presentation(path)
    chunks = []

    for slide_num, slide in enumerate(prs.slides, start=1):
        title_text  = ""
        body_texts  = []
        notes_text  = ""

        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            if shape.shape_type == 13:   # MSO_SHAPE_TYPE.PICTURE
                continue

            text = shape.text_frame.text.strip()
            if not text:
                continue

            # Identify the title placeholder (idx 0 = title, idx 1 = body)
            if (shape.is_placeholder and
                    shape.placeholder_format.idx == 0):
                title_text = text
            else:
                body_texts.append(text)

        # Extract speaker notes (often the most valuable content)
        if slide.has_notes_slide:
            notes_tf = slide.notes_slide.notes_text_frame
            notes_text = notes_tf.text.strip()

        # Write chunks
        if title_text:
            chunks.append({
                "source": path, "page_or_slide": slide_num,
                "type": "heading", "text": title_text,
            })
        for bt in body_texts:
            if len(bt) >= 10:
                chunks.append({
                    "source": path, "page_or_slide": slide_num,
                    "type": "body", "text": bt,
                })
        if notes_text and len(notes_text) >= 20:
            chunks.append({
                "source": path, "page_or_slide": slide_num,
                "type": "notes", "text": notes_text,
            })

    return chunks
```

---

## Step 3 — Audio/Video Transcription (Whisper)

Transcription turns lecture recordings into searchable, chunkable text. Use OpenAI's Whisper API — it handles heavy accents, technical vocabulary, and background noise better than open-source alternatives.

```bash
pip install openai ffmpeg-python
# ffmpeg must also be installed on the system: apt install ffmpeg
```

```python
import subprocess
import openai
from pathlib import Path

client = openai.OpenAI()  # reads OPENAI_API_KEY from env

def extract_audio(video_path: str) -> str:
    """Extract mono MP3 from a video file using ffmpeg."""
    audio_path = str(Path(video_path).with_suffix(".mp3"))
    subprocess.run(
        ["ffmpeg", "-i", video_path,
         "-vn",                    # no video
         "-acodec", "libmp3lame",
         "-ac", "1",               # mono (smaller, sufficient for speech)
         "-ar", "16000",           # 16kHz sample rate
         "-q:a", "4",
         audio_path, "-y"],
        check=True, capture_output=True
    )
    return audio_path

def transcribe_lecture(audio_or_video_path: str) -> list[dict]:
    """
    Transcribe a lecture recording.
    Groups Whisper segments into ~2-minute topic chunks.
    """
    path = audio_or_video_path

    # Extract audio if this is a video file
    if Path(path).suffix.lower() in {".mp4", ".mov", ".mkv", ".webm"}:
        path = extract_audio(path)

    with open(path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    CHUNK_SECONDS = 120  # group into ~2-minute blocks
    chunks   = []
    current  = []
    start_t  = 0.0

    for seg in transcript.segments:
        current.append(seg["text"])
        if seg["end"] - start_t >= CHUNK_SECONDS:
            chunks.append({
                "source":        audio_or_video_path,
                "page_or_slide": len(chunks) + 1,
                "type":          "transcript",
                "text":          " ".join(current).strip(),
                "start_sec":     start_t,
                "end_sec":       seg["end"],
            })
            current = []
            start_t = seg["end"]

    if current:  # flush remainder
        chunks.append({
            "source":        audio_or_video_path,
            "page_or_slide": len(chunks) + 1,
            "type":          "transcript",
            "text":          " ".join(current).strip(),
        })

    return chunks
```

---

## Step 4 — Unified Dispatcher

A single entry point that routes to the correct parser based on file extension:

```python
from pathlib import Path

def parse_upload(path: str) -> list[dict]:
    """Route an uploaded file to the correct parser."""
    ext = Path(path).suffix.lower()

    if ext == ".pdf":
        return parse_pdf_smart(path)
    elif ext in {".pptx", ".ppt"}:
        return parse_pptx(path)
    elif ext in {".mp4", ".mov", ".mkv", ".webm", ".mp3", ".m4a", ".wav"}:
        return transcribe_lecture(path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
```

---

## Step 5 — Chunk Grouping for AI

Before sending chunks to the AI, group related consecutive chunks into windows of 6–10 chunks. This gives the model enough context to generate meaningful questions without exceeding the prompt budget.

```python
def group_chunks(chunks: list[dict], window: int = 8) -> list[list[dict]]:
    """
    Slide a window over chunks, stepping by window//2 for overlap.
    This ensures no concept falls entirely at a window boundary.
    """
    step = window // 2
    groups = []
    for i in range(0, len(chunks), step):
        group = chunks[i : i + window]
        if len(group) >= 3:  # skip tiny trailing groups
            groups.append(group)
    return groups
```

---

## Writing Chunks to Supabase

```python
from supabase import create_client
import os

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

def save_chunks(upload_id: str, user_id: str, chunks: list[dict]):
    """Persist parsed chunks to the database."""
    rows = [
        {
            "upload_id":     upload_id,
            "user_id":       user_id,
            "type":          c["type"],
            "text":          c["text"],
            "page_or_slide": c.get("page_or_slide"),
        }
        for c in chunks
    ]
    supabase.table("chunks").insert(rows).execute()

    # Update upload status
    supabase.table("uploads").update({
        "status":      "processing_ai",
        "chunk_count": len(chunks),
    }).eq("id", upload_id).execute()
```

---

## Python Requirements

Use a supported Python (e.g. 3.11–3.13) in a venv. On Windows, **pymupdf 1.24.14** ships prebuilt wheels (`cp39-abi3`); **1.24.5** often forces a source build that downloads MuPDF and can fail mid-download.

```
# python/requirements.txt
fastapi==0.111.0
uvicorn[standard]==0.30.1
pymupdf==1.24.14
python-pptx==0.6.23
openai==1.35.0
anthropic==0.29.0
supabase==2.5.0
ffmpeg-python==0.2.0
genanki==0.13.0
python-multipart==0.0.9
```
