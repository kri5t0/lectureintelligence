"""Audio/video parser — Step 3 of the parsing pipeline.

Transcribes lecture media with OpenAI Whisper and groups segments into ~2-minute
chunks. Chunk schema matches docs/parsing-pipeline.md:

    {
        "source":        str,
        "page_or_slide": int,   # 1-indexed chunk index
        "type":          "transcript",
        "text":          str,
    }

Public API:
    - extract_audio(path)     : mono 16 kHz MP3 via ffmpeg (skipped for .mp3/.m4a/.wav)
    - transcribe_lecture(path): Whisper verbose_json + ~120s chunk grouping
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, List, TypedDict

import openai


class Chunk(TypedDict):
    source: str
    page_or_slide: int
    type: str
    text: str


_VIDEO_SUFFIXES = frozenset({".mp4", ".mov", ".mkv", ".webm"})
_AUDIO_SUFFIXES = frozenset({".mp3", ".m4a", ".wav"})

_CHUNK_SECONDS = 120.0

_client: openai.OpenAI | None = None


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        _client = openai.OpenAI()
    return _client


def _ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "ffmpeg is not installed or not on PATH. "
            "Install ffmpeg and ensure the `ffmpeg` executable is discoverable "
            "from this process (e.g. add it to PATH on Windows, or use your "
            "package manager on Linux/macOS)."
        )


def _segment_end(segment: Any) -> float:
    if isinstance(segment, dict):
        return float(segment["end"])
    return float(getattr(segment, "end"))


def _segment_text(segment: Any) -> str:
    if isinstance(segment, dict):
        return str(segment["text"]).strip()
    return str(getattr(segment, "text", "")).strip()


def extract_audio(video_path: str) -> str:
    """Extract mono MP3 at 16 kHz via ffmpeg, or return the path if already audio."""
    suffix = Path(video_path).suffix.lower()
    if suffix in _AUDIO_SUFFIXES:
        return video_path

    _ensure_ffmpeg()
    audio_path = str(Path(video_path).with_suffix(".mp3"))
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-q:a",
        "4",
        audio_path,
    ]
    try:
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "ffmpeg is not installed or not on PATH. "
            "Install ffmpeg and ensure the `ffmpeg` executable is discoverable."
        ) from exc
    return audio_path


def transcribe_lecture(path: str) -> List[Chunk]:
    """Transcribe media with Whisper; group segments into ~CHUNK_SECONDS chunks."""
    media_path = path
    suffix = Path(media_path).suffix.lower()

    if suffix in _VIDEO_SUFFIXES:
        media_path = extract_audio(path)
    elif suffix not in _AUDIO_SUFFIXES:
        raise ValueError(
            f"Unsupported media extension {suffix!r}; expected one of "
            f"{sorted(_VIDEO_SUFFIXES | _AUDIO_SUFFIXES)}"
        )

    client = _get_client()
    with open(media_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    raw_segments = getattr(transcript, "segments", None) or []
    chunks: List[Chunk] = []
    current_texts: list[str] = []
    chunk_start_t = 0.0

    for seg in raw_segments:
        text = _segment_text(seg)
        if text:
            current_texts.append(text)
        seg_end = _segment_end(seg)
        if seg_end - chunk_start_t >= _CHUNK_SECONDS:
            if current_texts:
                chunks.append(
                    {
                        "source": path,
                        "page_or_slide": len(chunks) + 1,
                        "type": "transcript",
                        "text": " ".join(current_texts).strip(),
                    }
                )
                current_texts = []
            chunk_start_t = seg_end

    if current_texts:
        chunks.append(
            {
                "source": path,
                "page_or_slide": len(chunks) + 1,
                "type": "transcript",
                "text": " ".join(current_texts).strip(),
            }
        )

    return chunks


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(
            "Usage: python -m parsers.audio_parser <path-to-media>",
            file=sys.stderr,
        )
        sys.exit(2)
    file_path = sys.argv[1]
    out_chunks = transcribe_lecture(file_path)
    print(len(out_chunks))
    if out_chunks:
        print(out_chunks[0]["text"])
