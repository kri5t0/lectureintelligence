"""Flashcard generation via Claude Sonnet 4."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any, Callable, TypeVar

import anthropic

from bootstrap_env import load_missing_env_from_dotenv_files

T = TypeVar("T")

_client: anthropic.Anthropic | None = None


def _maybe_load_dotenv() -> None:
    """
    If ANTHROPIC_API_KEY is unset, try KEY=value lines from common env files.
    Does not override variables already set in the process environment.
    """
    if os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return
    load_missing_env_from_dotenv_files()


def _get_client() -> anthropic.Anthropic:
    """Lazy client so importing this module (e.g. for fixture validation) does not require ANTHROPIC_API_KEY."""
    global _client
    if _client is None:
        _maybe_load_dotenv()
        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set for this process. The Anthropic console does not "
                "inject keys into PowerShell automatically.\n"
                "Fix one of:\n"
                "  • Same terminal, before running:  $env:ANTHROPIC_API_KEY = 'sk-ant-...'\n"
                "  • Or add a line to python/.env or repo-root .env / .env.local:\n"
                "      ANTHROPIC_API_KEY=sk-ant-...\n"
                "    (those files are gitignored; restart the command after saving.)"
            )
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


# Default: current Claude Sonnet on the Messages API (see Anthropic model overview).
# Deprecated IDs such as claude-sonnet-4-20250514 may return 404. Override if needed:
#   set ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
# Output budget: truncated JSON (Unterminated string) happens if this is too small for N cards.
_MAX_OUT_CAP = int(os.environ.get("ANTHROPIC_MAX_OUTPUT_TOKENS", "8192"))


def _flashcard_max_output_tokens(n_cards: int) -> int:
    cap = max(512, min(_MAX_OUT_CAP, 16384))
    # ~350–500 tokens per card including JSON syntax; keep headroom.
    need = max(2048, 420 * max(1, n_cards))
    return min(cap, need)


FLASHCARD_SYSTEM = """You are an expert university tutor creating revision flashcards.

Output ONLY valid JSON — no markdown fences, no preamble, no explanation.

Return a JSON array. Each object must have exactly these fields:
  - "question":   string — specific, tests a single concept
  - "answer":     string — 2–4 complete sentences, accurate and concise (each answer under ~450 characters so the full JSON fits)
  - "difficulty": integer — 1 (recall) to 5 (application/synthesis)
  - "tags":       array of 2–4 topic keyword strings

If a string must contain a double quote, escape it with a backslash. Do not put raw line breaks inside JSON string values.

Difficulty distribution: 40% recall (1–2), 40% understanding (3), 20% application (4–5).
Where the answer or question contains equations, formulae, chemical notation, or mathematical symbols, write them using LaTeX. Use \\(...\\) for inline expressions and \\[...\\] for display expressions. Plain text for everything else — do not wrap non-mathematical content in LaTeX.
Write questions that match the register of university-level exam questions.
Do not generate trivial questions (e.g. "What is X?" when X was defined in one line).
Prefer questions that require the student to explain, compare, or apply."""


def call_with_retry(
    fn: Callable[..., T],
    *args: Any,
    retries: int = 3,
    **kwargs: Any,
) -> T:
    """Retry an AI call up to `retries` times with exponential backoff."""
    for attempt in range(retries):
        try:
            return fn(*args, **kwargs)
        except (
            json.JSONDecodeError,
            anthropic.APIError,
            AssertionError,
            ValueError,
        ) as e:
            if attempt == retries - 1:
                raise
            wait = 2**attempt
            print(
                f"Attempt {attempt + 1} failed ({e!r}), retrying in {wait}s...",
                file=sys.stderr,
            )
            time.sleep(wait)
    raise RuntimeError("call_with_retry: unreachable")  # pragma: no cover


def _safe_json_parse(text: str) -> Any:
    """
    Parse JSON from a model response, stripping accidental markdown fences.
    Raises json.JSONDecodeError if parsing fails after cleanup.
    """
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _validate_flashcards(data: Any) -> list[dict[str, Any]]:
    """Ensure parsed JSON matches the flashcard schema; raises AssertionError on failure."""
    assert isinstance(data, list), "response must be a JSON array"
    assert len(data) > 0, "flashcard array is empty"
    for i, card in enumerate(data):
        assert isinstance(card, dict), f"card {i} must be an object"
        keys = set(card.keys())
        assert keys == {
            "question",
            "answer",
            "difficulty",
            "tags",
        }, f"card {i} must have exactly keys question, answer, difficulty, tags"
        q, a, diff, tags = (
            card["question"],
            card["answer"],
            card["difficulty"],
            card["tags"],
        )
        assert isinstance(q, str) and q.strip(), f"card {i} question must be a non-empty string"
        assert isinstance(a, str) and a.strip(), f"card {i} answer must be a non-empty string"
        assert isinstance(diff, int) and 1 <= diff <= 5, (
            f"card {i} difficulty must be an integer 1–5"
        )
        assert isinstance(tags, list), f"card {i} tags must be an array"
        assert all(isinstance(t, str) and t.strip() for t in tags), (
            f"card {i} tags must be non-empty strings"
        )
        assert 2 <= len(tags) <= 4, f"card {i} must have 2–4 tags"
    return data


def validate_stored_flashcards(data: Any) -> list[dict[str, Any]]:
    """
    Validate JSON-decoded flashcards against the same schema as Claude output.
    Use for tests and for checking fixtures without calling the API.
    """
    return _validate_flashcards(data)


def _generate_flashcards_once(
    chunks: list[dict[str, Any]],
    subject: str,
    n_cards: int,
) -> list[dict[str, Any]]:
    combined = "\n\n".join(
        f"[{str(c.get('type', 'body')).upper()}] {c.get('text', '').strip()}"
        for c in chunks[:8]
        if str(c.get("text", "")).strip()
    )
    if not combined.strip():
        raise AssertionError("no non-empty chunk text to generate flashcards from")

    user_content = (
        f"Subject: {subject}\n\n"
        f"Lecture content:\n{combined}\n\n"
        f"Generate {n_cards} flashcards covering the key concepts above."
    )

    max_tokens = _flashcard_max_output_tokens(n_cards)
    response = _get_client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        temperature=0.2,
        system=FLASHCARD_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    raw = response.content[0].text
    parsed = _safe_json_parse(raw)
    return _validate_flashcards(parsed)


def generate_flashcards(
    chunks: list[dict[str, Any]],
    subject: str,
    n_cards: int = 12,
) -> list[dict[str, Any]]:
    """
    Generate Anki-compatible flashcards from a window of lecture chunks.

    Args:
        chunks:  list of chunk dicts (see parsing-pipeline.md)
        subject: e.g. "Pharmacology", "Contract Law", "Macroeconomics"
        n_cards: target number of cards (10–15 is optimal per chunk window)

    Returns:
        list of flashcard dicts with question/answer/difficulty/tags
    """
    return call_with_retry(_generate_flashcards_once, chunks, subject, n_cards)


def _load_stdin_payload() -> tuple[list[dict[str, Any]], str, int]:
    payload = json.load(sys.stdin)
    if isinstance(payload, list):
        chunks = payload
        subject = os.environ.get("SUBJECT", "").strip()
        if not subject:
            print(
                "When stdin is a JSON array of chunks, set SUBJECT in the environment.",
                file=sys.stderr,
            )
            raise SystemExit(2)
        n_cards = int(os.environ.get("N_CARDS", "12"))
        return chunks, subject, n_cards
    if not isinstance(payload, dict):
        print("Stdin JSON must be an object or an array of chunks.", file=sys.stderr)
        raise SystemExit(2)
    try:
        chunks = payload["chunks"]
        subject = str(payload["subject"])
    except (KeyError, TypeError) as e:
        print(f"Missing or invalid 'chunks' / 'subject': {e}", file=sys.stderr)
        raise SystemExit(2) from e
    if not isinstance(chunks, list):
        print("'chunks' must be a JSON array.", file=sys.stderr)
        raise SystemExit(2)
    n_cards = int(payload.get("n_cards", 12))
    return chunks, subject, n_cards


if __name__ == "__main__":
    chunks_in, subject_in, n_in = _load_stdin_payload()
    cards_out = generate_flashcards(chunks_in, subject_in, n_cards=n_in)
    json.dump(cards_out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
