"""Exam question generation via Claude (see docs/ai-pipeline.md)."""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import anthropic

from .flashcards import call_with_retry

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 3000

EXAM_SYSTEM = """You are an experienced university examiner writing exam questions.

Output ONLY valid JSON — no markdown fences, no preamble.

Return a JSON array. Each object must have:
  - "type":        "mcq" | "short" | "essay"
  - "question":    string — the full question text
  - "marks":       integer
  - "mark_scheme": string — specific enough for a student to self-assess

MCQ objects must also include:
  - "options":       array of exactly 4 strings
  - "correct_index": integer 0–3 (index into options)

Mark scheme quality standards:
  - MCQ: explain WHY the correct answer is right and why each distractor is wrong
  - Short answer: list 3–5 specific marking points; award 1 mark per point
  - Essay: use band descriptors (First: 70–100%, 2:1: 60–69%, 2:2: 50–59%, Third: 40–49%)

MCQ distractors must be plausible — not obviously wrong. Use common misconceptions."""

client = anthropic.Anthropic()


def _response_text(response: object) -> str:
    parts: list[str] = []
    for block in getattr(response, "content", ()) or ():
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "".join(parts).strip()


def _coerce_int(value: Any, field: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be an integer, not bool")
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value == int(value):
        return int(value)
    raise ValueError(f"{field} must be an integer")


def _validate_exam_questions(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, list):
        raise ValueError("exam questions JSON must be a list")

    allowed = {"mcq", "short", "essay"}
    out: list[dict[str, Any]] = []

    for i, item in enumerate(data):
        if not isinstance(item, dict):
            raise ValueError(f"question {i} must be an object")

        qtype = item.get("type")
        if qtype not in allowed:
            raise ValueError(f"question {i}: type must be mcq, short, or essay")

        for key in ("question", "mark_scheme"):
            val = item.get(key)
            if not isinstance(val, str) or not val.strip():
                raise ValueError(f"question {i}: {key} must be a non-empty string")

        marks = _coerce_int(item.get("marks"), f"question {i} marks")

        if qtype == "mcq":
            opts = item.get("options")
            if not isinstance(opts, list) or len(opts) != 4:
                raise ValueError(f"question {i}: MCQ must have options array of length 4")
            if not all(isinstance(o, str) and o.strip() for o in opts):
                raise ValueError(f"question {i}: each option must be a non-empty string")
            ci = item.get("correct_index")
            ci = _coerce_int(ci, f"question {i} correct_index")
            if ci < 0 or ci > 3:
                raise ValueError(f"question {i}: correct_index must be between 0 and 3")
            out.append(
                {
                    "type": "mcq",
                    "question": item["question"],
                    "marks": marks,
                    "mark_scheme": item["mark_scheme"],
                    "options": list(opts),
                    "correct_index": ci,
                }
            )
        else:
            if "options" in item or "correct_index" in item:
                raise ValueError(
                    f"question {i}: options and correct_index are only allowed for type mcq"
                )
            out.append(
                {
                    "type": qtype,
                    "question": item["question"],
                    "marks": marks,
                    "mark_scheme": item["mark_scheme"],
                }
            )

    return out


def _generate_exam_questions_once(
    chunks: list[dict],
    subject: str,
    level: str,
) -> list[dict[str, Any]]:
    combined = "\n\n".join(
        f"[{c['type'].upper()}] {c['text']}" for c in chunks[:10]
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=EXAM_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Subject: {subject}\n"
                    f"Level: {level}\n\n"
                    f"Lecture content:\n{combined}\n\n"
                    "Generate the following:\n"
                    "- 4 MCQ questions (2 marks each)\n"
                    "- 2 short-answer questions (5 marks each, ~150 words expected)\n"
                    "- 1 essay question (15 marks, ~600 words expected)\n\n"
                    "Include a full mark scheme for each question."
                ),
            }
        ],
    )

    text = _response_text(response)
    parsed = json.loads(text)
    return _validate_exam_questions(parsed)


def generate_exam_questions(
    chunks: list[dict],
    subject: str,
    level: str = "undergraduate",
) -> list[dict]:
    """
    Generate a mixed exam paper with MCQs, short-answer and essay questions.

    Args:
        chunks:  list of chunk dicts
        subject: e.g. "Contract Law"
        level:   "undergraduate" | "postgraduate" | "A-level"
    """
    return call_with_retry(_generate_exam_questions_once, chunks, subject, level)


def main() -> None:
    chunks = json.load(sys.stdin)
    subject = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.environ.get("SUBJECT", "General")
    )
    questions = generate_exam_questions(chunks, subject)
    for q in questions:
        preview = q["question"][:80]
        print(f"{q['type']}: {preview}")


if __name__ == "__main__":
    main()
