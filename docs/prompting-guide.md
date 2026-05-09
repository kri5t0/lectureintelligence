# Prompting Guide

This document covers every prompt used in the platform, the reasoning behind each design decision, and patterns for iterating on prompts as the product scales.

All prompts target **Claude Sonnet 4** (`claude-sonnet-4-20250514`).

---

## Core Principles

### 1. Always demand structured JSON output

Parsing free-text responses is fragile. Every AI call that produces data (flashcards, questions, concept maps) should output only JSON. The system prompt must be explicit:

```
Output ONLY valid JSON — no markdown fences, no preamble, no explanation.
```

Never rely on stripping ` ```json ` fences in post-processing. A model that outputs fences is a prompt that needs fixing.

### 2. Specify the exact schema in the system prompt

Don't say "return an array of flashcard objects". Define every field, every type, every constraint:

```
Return a JSON array. Each object must have exactly these fields:
  - "question":   string
  - "answer":     string (2–4 sentences)
  - "difficulty": integer 1–5
  - "tags":       array of 2–4 strings
No other fields. No nested objects inside question or answer.
```

### 3. Give the model the right role

Opening with `"You are an expert [role]..."` consistently improves output quality for academic content. The role should match the output: a "university tutor" for flashcards, an "examiner" for exam questions.

### 4. Inject subject context into the user message

The system prompt stays static. The subject (`Pharmacology`, `Contract Law`) and any other dynamic context goes in the user message. This allows system prompt caching.

### 5. Separate concerns across calls

Do not ask one call to generate flashcards AND exam questions AND a concept map. The output quality degrades as the task gets broader. Three focused calls outperform one broad call.

---

## Prompt Library

### Flashcard Generation

```python
SYSTEM = """You are an expert university tutor creating revision flashcards.

Output ONLY valid JSON — no markdown fences, no preamble, no explanation.

Return a JSON array. Each object must have exactly these fields:
  - "question":   string — specific, tests a single concept
  - "answer":     string — 2–4 complete sentences, accurate and concise
  - "difficulty": integer — 1 (recall) to 5 (application/synthesis)
  - "tags":       array of 2–4 topic keyword strings

Difficulty distribution: 40% recall (1–2), 40% understanding (3), 20% application (4–5).
Write questions that match the register of university-level exam questions.
Do not generate trivial questions (e.g. "What is X?" when X was defined in one line).
Prefer questions that require the student to explain, compare, or apply."""

USER_TEMPLATE = """Subject: {subject}

Lecture content:
{combined_chunks}

Generate {n_cards} flashcards covering the key concepts above."""
```

**Tuning notes:**
- Reducing `n_cards` (e.g. to 8) increases per-card quality but reduces coverage
- For dense subjects (pharmacology, biochemistry), add: `"Include at least 3 mechanism-of-action questions"`
- For law: `"Where relevant, cite the case name or statute in the answer"`

---

### Exam Question Generation

```python
SYSTEM = """You are an experienced university examiner writing exam questions.

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

USER_TEMPLATE = """Subject: {subject}
Level: {level}

Lecture content:
{combined_chunks}

Generate:
- 4 MCQ questions (2 marks each)
- 2 short-answer questions (5 marks each, ~150 words expected)
- 1 essay question (15 marks, ~600 words expected)

Include a full mark scheme for each."""
```

**Tuning notes:**
- For postgraduate level, change the essay marks and descriptors accordingly
- For clinical subjects, add: `"At least 2 MCQs should present a clinical vignette (patient scenario)"`
- For quantitative subjects (maths, statistics), add: `"For calculation questions, include worked solutions in the mark scheme"`

---

### Concept Map Generation

```python
SYSTEM = """You are an expert at constructing concept maps from academic content.

Output ONLY valid JSON — no markdown fences, no preamble.

Return a JSON object with exactly:
  - "nodes": array of node objects
  - "edges": array of edge objects

Node objects:
  - "id":    string — lowercase slug (hyphens, no spaces), unique
  - "label": string — human-readable concept name (2–4 words max)
  - "type":  "concept" | "process" | "example"

Edge objects:
  - "source": string — id of source node
  - "target": string — id of target node
  - "label":  string — short verb phrase (e.g. "inhibits", "causes", "is a type of")

Constraints:
  - 8–14 nodes, 10–18 edges
  - Every node must have at least one edge
  - No isolated nodes
  - Prefer edges that show mechanism or causality over simple "related to" edges
  - "example" nodes should connect to their parent concept with "is an example of" """

USER_TEMPLATE = """Subject: {subject}

Lecture content:
{combined_chunks}

Generate a concept map capturing the key concepts and relationships from this lecture."""
```

**Tuning notes:**
- Increase node count for long lectures: `"10–18 nodes, 14–22 edges"` for 90+ minute recordings
- For introductory topics, the map should be a tree structure; for advanced topics a DAG is expected
- The D3.js renderer handles both; just adjust the node limit

---

### Study Summary Generation

```python
SYSTEM = """You are an expert university tutor writing lecture summaries for students.

Write a clear, accurate summary of the lecture content provided.
Use plain, accessible language but preserve technical terminology with brief inline definitions.

Structure:
1. Two-sentence overview (what this lecture is about and why it matters)
2. 4–6 bullet points, each covering one key concept (1–2 sentences each)
3. One sentence on what students should be able to do after studying this material

Do not use markdown headers or bold text — output plain text only.
Do not exceed 350 words."""

USER_TEMPLATE = """Subject: {subject}

Lecture content:
{combined_chunks}

Write a student-friendly summary of this lecture."""
```

**Tuning notes:**
- For clinical summaries, add: `"End with a 'Clinical relevance' sentence"`
- For humanities/law: `"Cite relevant cases, legislation, or scholars by name"`

---

## Prompt Testing Protocol

Before shipping any prompt change to production, test it against a fixed set of lecture samples.

### Test suite structure

```
prompts/tests/
├── fixtures/
│   ├── pharmacology_chunks.json
│   ├── contract_law_chunks.json
│   ├── macroeconomics_chunks.json
│   └── neuroscience_chunks.json
└── eval.py
```

```python
# prompts/tests/eval.py
import json
from pathlib import Path
from ai.flashcards import generate_flashcards

FIXTURES_DIR = Path("prompts/tests/fixtures")

def evaluate_flashcard_prompt():
    results = []

    for fixture_path in FIXTURES_DIR.glob("*.json"):
        with open(fixture_path) as f:
            chunks = json.load(f)

        subject = fixture_path.stem.replace("_chunks", "").replace("_", " ").title()

        try:
            cards = generate_flashcards(chunks, subject)

            # Validation checks
            assert isinstance(cards, list), "Must return a list"
            assert len(cards) >= 8, f"Too few cards: {len(cards)}"

            for card in cards:
                assert "question" in card
                assert "answer" in card
                assert "difficulty" in card
                assert "tags" in card
                assert 1 <= card["difficulty"] <= 5
                assert len(card["tags"]) >= 2
                assert len(card["answer"]) > 40, "Answer too short"

            difficulty_dist = [c["difficulty"] for c in cards]
            pct_hard = sum(1 for d in difficulty_dist if d >= 4) / len(difficulty_dist)

            results.append({
                "fixture":    fixture_path.stem,
                "card_count": len(cards),
                "pct_hard":   round(pct_hard, 2),
                "pass":       True,
            })

        except (AssertionError, Exception) as e:
            results.append({"fixture": fixture_path.stem, "pass": False, "error": str(e)})

    for r in results:
        status = "✓" if r["pass"] else "✗"
        print(f"{status} {r['fixture']}: {r.get('card_count', 'N/A')} cards, "
              f"{r.get('pct_hard', 'N/A')*100:.0f}% hard, "
              f"{r.get('error', 'ok')}")

if __name__ == "__main__":
    evaluate_flashcard_prompt()
```

### Acceptance criteria

| Metric | Threshold |
|---|---|
| Cards generated per fixture | ≥ 10 |
| Valid JSON (no parse errors) | 100% |
| Cards with difficulty ≥ 4 | 15–25% |
| Answer length ≥ 40 chars | 100% |
| Tags count ≥ 2 | 100% |

---

## Token Budgeting

| Call | Input tokens (est.) | Output tokens (est.) | Cost (Sonnet 4) |
|---|---|---|---|
| Flashcard generation (8 chunks) | ~2,000 | ~1,500 | ~$0.012 |
| Exam questions (10 chunks) | ~2,500 | ~2,200 | ~$0.018 |
| Concept map (12 chunks) | ~2,800 | ~800 | ~$0.009 |
| Study summary (10 chunks) | ~2,500 | ~500 | ~$0.007 |
| **Total per upload (50-slide PDF)** | ~35,000 | ~20,000 | **~$0.13** |

At £6.99/month with ~20 uploads/month: revenue £6.99, AI cost ~£2.60. Healthy margin before infrastructure.

---

## Handling JSON Parse Failures

Claude very rarely produces invalid JSON, but it happens. Always wrap parses in a retry:

```python
import json
import re
import time
import anthropic

def safe_json_parse(text: str) -> any:
    """
    Parse JSON from a Claude response, stripping any accidental fences.
    Raises json.JSONDecodeError if parsing fails after cleanup.
    """
    # Strip any markdown fences the model accidentally included
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)

def call_with_retry(fn, *args, retries: int = 3, **kwargs):
    """Retry an AI call with exponential backoff on failure."""
    for attempt in range(retries):
        try:
            return fn(*args, **kwargs)
        except (json.JSONDecodeError, anthropic.APIError, AssertionError) as e:
            if attempt == retries - 1:
                raise RuntimeError(f"AI call failed after {retries} attempts: {e}") from e
            time.sleep(2 ** attempt)
```

---

## Subject-Specific Prompt Variants

Different academic disciplines require different emphases. Maintain a `prompt_config.py` file with per-subject overrides:

```python
# python/prompt_config.py

SUBJECT_CONFIGS = {
    "medicine": {
        "flashcard_suffix": (
            "Include at least 3 mechanism-of-action questions. "
            "At least 2 questions should present clinical scenarios. "
            "Use USMLE-style question stems where appropriate."
        ),
        "exam_suffix": "At least 3 MCQs must use patient vignette format.",
        "n_cards": 15,
    },
    "law": {
        "flashcard_suffix": (
            "Where applicable, name the relevant case or statute in the answer. "
            "Include questions on the ratio decidendi, not just the outcome."
        ),
        "exam_suffix": (
            "Short-answer questions should be problem questions (hypothetical scenarios), "
            "not essay questions."
        ),
        "n_cards": 10,
    },
    "economics": {
        "flashcard_suffix": (
            "Include questions requiring students to interpret graphs or "
            "apply models to real-world scenarios."
        ),
        "exam_suffix": "Include at least 1 calculation question.",
        "n_cards": 12,
    },
}

def get_config(subject: str) -> dict:
    """Get prompt config for a subject, defaulting to generic."""
    subject_lower = subject.lower()
    for key, config in SUBJECT_CONFIGS.items():
        if key in subject_lower:
            return config
    return {"flashcard_suffix": "", "exam_suffix": "", "n_cards": 12}
```
