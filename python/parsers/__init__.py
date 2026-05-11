"""Unified upload parser — routes by file extension (see docs/parsing-pipeline.md)."""

from __future__ import annotations

from pathlib import Path


def parse_upload(path: str) -> list[dict]:
    """Route an uploaded file to the correct parser."""
    ext = Path(path).suffix.lower()

    if ext == ".pdf":
        from parsers.pdf_parser import parse_pdf_smart

        return parse_pdf_smart(path)
    elif ext in {".pptx", ".ppt"}:
        from parsers.pptx_parser import parse_pptx

        return parse_pptx(path)
    elif ext in {".mp4", ".mov", ".mkv", ".webm", ".mp3", ".m4a", ".wav"}:
        from parsers.audio_parser import transcribe_lecture

        return transcribe_lecture(path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
