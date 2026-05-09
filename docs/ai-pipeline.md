# AI Pipeline

This document covers the Claude API integration: turning parsed lecture chunks into flashcards, practice exam questions, concept maps, and study summaries.

All AI calls use **Claude Sonnet 4** (`claude-sonnet-4-20250514`). The model is chosen for its ability to understand academic register, generate rigorous exam-style questions, and reliably follow structured JSON output instructions.

---

## Client Setup

```python
import anthropic
import json
import os

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 2000
```

---

## Flashcard Generation

### System prompt

```python
FLASHCARD_SYSTEM = """You are an expert university tutor creating revision flashcards.

Output ONLY valid JSON — no markdown fences, no preamble, no explanation.

Return a JSON array of flashcard objects. Each object must have exactly these fields:
  - "question":   string  — a clear, specific question testing a single concept
  - "answer":     string  — a complete, accurate answer (2–4 sentences)
  - "difficulty": integer — 1 (pure recall) to 5 (application/synthesis)
  - "tags":       array of strings — 2–4 topic keywords

Vary difficulty: include 40% recall (1–2), 40% understanding (3), 20% application (4–5).
Questions should match the style of university exam questions for the given subject."""
```

### Generation function

```python
def generate_flashcards(
    chunks: list[dict],
    subject: str,
    n_cards: int = 12,
) -> list[dict]:
    """
    Generate Anki-compatible flashcards from a window of lecture chunks.

    Args:
        chunks:  list of chunk dicts (see parsing-pipeline.md)
        subject: e.g. "Pharmacology", "Contract Law", "Macroeconomics"
        n_cards: target number of cards (10–15 is optimal per chunk window)

    Returns:
        list of flashcard dicts with question/answer/difficulty/tags
    """
    combined = "\n\n".join(
        f"[{c['type'].upper()}] {c['text']}" for c in chunks[:8]
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=FLASHCARD_SYSTEM,
        messages=[{
            "role": "user",
            "content": (
                f"Subject: {subject}\n\n"
                f"Lecture content:\n{combined}\n\n"
                f"Generate {n_cards} flashcards covering the key concepts above."
            ),
        }],
    )

    return json.loads(response.content[0].text.strip())
```

### Example output

```json
[
  {
    "question": "What is the mechanism of action of beta-blockers?",
    "answer": "Beta-blockers competitively antagonise catecholamines at beta-adrenergic receptors. By blocking beta-1 receptors in the heart, they reduce heart rate and contractility, lowering cardiac output and blood pressure.",
    "difficulty": 2,
    "tags": ["beta-blockers", "pharmacodynamics", "cardiovascular"]
  },
  {
    "question": "A patient on propranolol presents with acute bronchospasm. Explain the mechanism and management.",
    "answer": "Propranolol is a non-selective beta-blocker that blocks both beta-1 (cardiac) and beta-2 (bronchial smooth muscle) receptors. Blockade of beta-2 receptors prevents bronchodilation, precipitating bronchospasm in susceptible patients. Management: stop propranolol, administer ipratropium (anticholinergic, beta-2-independent) rather than salbutamol.",
    "difficulty": 5,
    "tags": ["propranolol", "adverse effects", "bronchospasm", "clinical"]
  }
]
```

---

## Exam Question Generation

### System prompt

```python
EXAM_SYSTEM = """You are an experienced university examiner writing exam questions.

Output ONLY valid JSON — no markdown fences, no preamble.

Return a JSON array of question objects. Each object must have:
  - "type":          "mcq" | "short" | "essay"
  - "question":      string — the full question text
  - "marks":         integer
  - "mark_scheme":   string — detailed marking guidance

For MCQ questions also include:
  - "options":       array of exactly 4 strings (A, B, C, D)
  - "correct_index": integer 0–3

Mark schemes must be specific enough for a student to self-assess accurately.
Essay mark schemes should use band descriptors (e.g. first-class, 2:1, 2:2)."""
```

### Generation function

```python
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
    combined = "\n\n".join(
        f"[{c['type'].upper()}] {c['text']}" for c in chunks[:10]
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=3000,
        system=EXAM_SYSTEM,
        messages=[{
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
        }],
    )

    return json.loads(response.content[0].text.strip())
```

---

## Concept Map Generation

A concept map extracts the key entities from the lecture and the relationships between them. The frontend renders this as an interactive graph using D3.js.

### System prompt

```python
CONCEPT_MAP_SYSTEM = """You are an expert at creating concept maps from academic content.

Output ONLY valid JSON — no markdown fences, no preamble.

Return a JSON object with:
  - "nodes": array of { "id": string, "label": string, "type": "concept"|"process"|"example" }
  - "edges": array of { "source": string, "target": string, "label": string }

"id" must be a short slug (lowercase, hyphens, no spaces).
Extract 8–14 nodes and 10–18 edges. Include only significant relationships.
Edge labels should be short verb phrases (e.g. "inhibits", "is a type of", "causes")."""
```

### Generation function

```python
def generate_concept_map(chunks: list[dict], subject: str) -> dict:
    """Generate a concept map graph from lecture content."""
    combined = "\n\n".join(c["text"] for c in chunks[:12])

    response = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        system=CONCEPT_MAP_SYSTEM,
        messages=[{
            "role": "user",
            "content": (
                f"Subject: {subject}\n\n"
                f"Lecture content:\n{combined}\n\n"
                "Generate a concept map capturing the key concepts and their relationships."
            ),
        }],
    )

    return json.loads(response.content[0].text.strip())
```

### Example output

```json
{
  "nodes": [
    { "id": "beta-blocker",    "label": "Beta-blocker",          "type": "concept" },
    { "id": "beta-1-receptor", "label": "Beta-1 receptor",       "type": "concept" },
    { "id": "heart-rate",      "label": "Heart rate",            "type": "process" },
    { "id": "propranolol",     "label": "Propranolol",           "type": "example" }
  ],
  "edges": [
    { "source": "beta-blocker",    "target": "beta-1-receptor", "label": "antagonises" },
    { "source": "beta-1-receptor", "target": "heart-rate",      "label": "regulates" },
    { "source": "propranolol",     "target": "beta-blocker",    "label": "is a type of" }
  ]
}
```

---

## Study Summary Generation

A plain-language summary (250–400 words) of the lecture, useful for students who want a quick orientation before drilling flashcards.

```python
SUMMARY_SYSTEM = """You are an expert university tutor.
Write a clear, accurate summary of the lecture content provided.
Use plain language but preserve technical terminology with brief definitions.
Structure with: a 2-sentence overview, then 3–5 bullet points of key concepts.
Do not use markdown headers — output plain text only."""

def generate_summary(chunks: list[dict], subject: str) -> str:
    """Generate a plain-text lecture summary (250–400 words)."""
    combined = "\n\n".join(c["text"] for c in chunks[:10])

    response = client.messages.create(
        model=MODEL,
        max_tokens=600,
        system=SUMMARY_SYSTEM,
        messages=[{
            "role": "user",
            "content": (
                f"Subject: {subject}\n\n"
                f"Lecture content:\n{combined}\n\n"
                "Write a student-friendly summary of this lecture."
            ),
        }],
    )
    return response.content[0].text.strip()
```

---

## Anki Export (genanki)

After generating cards, allow students to export a `.apkg` file for use in Anki.

```python
import genanki  # pip install genanki
import random

def export_anki_deck(
    cards: list[dict],
    deck_name: str,
    output_path: str,
) -> str:
    """
    Export flashcards as an Anki .apkg file.

    Args:
        cards:       list of {question, answer, tags, ...} dicts
        deck_name:   e.g. "Pharmacology — Week 3"
        output_path: e.g. "/tmp/pharmacology_wk3.apkg"

    Returns:
        path to the written .apkg file
    """
    model_id = random.randrange(1 << 30, 1 << 31)
    deck_id  = random.randrange(1 << 30, 1 << 31)

    model = genanki.Model(
        model_id,
        "Lecture Intelligence Card",
        fields=[
            {"name": "Question"},
            {"name": "Answer"},
            {"name": "Tags"},
        ],
        templates=[{
            "name": "Card",
            "qfmt": "{{Question}}",
            "afmt": "{{FrontSide}}<hr id='answer'>{{Answer}}",
        }],
        css="""
            .card { font-family: Arial, sans-serif; font-size: 16px;
                    text-align: left; padding: 20px; }
            hr#answer { border-top: 1px solid #ccc; }
        """,
    )

    deck = genanki.Deck(deck_id, deck_name)

    for card in cards:
        note = genanki.Note(
            model=model,
            fields=[card["question"], card["answer"], ", ".join(card.get("tags", []))],
            tags=card.get("tags", []),
        )
        deck.add_note(note)

    genanki.Package(deck).write_to_file(output_path)
    return output_path
```

---

## Full Processing Job (Python FastAPI)

```python
# python/main.py
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import os

from parsers.pdf_parser   import parse_pdf_smart
from parsers.pptx_parser  import parse_pptx
from parsers.audio_parser import transcribe_lecture
from ai.flashcards        import generate_flashcards
from ai.exam_questions    import generate_exam_questions
from ai.concept_map       import generate_concept_map
from db                   import save_chunks, save_cards, update_upload_status

app = FastAPI()

class ProcessRequest(BaseModel):
    upload_id:    str
    storage_path: str
    file_type:    str
    subject:      str
    user_id:      str

@app.post("/process")
async def process_upload(
    req: ProcessRequest,
    x_api_key: str = Header(...),
):
    if x_api_key != os.environ["INTERNAL_API_KEY"]:
        raise HTTPException(status_code=401)

    try:
        # 1. Download file from Supabase Storage to /tmp
        local_path = download_from_storage(req.storage_path)

        # 2. Parse into chunks
        chunks = parse_upload(local_path)
        save_chunks(req.upload_id, req.user_id, chunks)

        # 3. Group chunks and generate AI outputs
        groups = group_chunks(chunks, window=8)
        all_cards = []

        for group in groups:
            cards    = generate_flashcards(group, req.subject)
            all_cards.extend(cards)

        # 4. Generate exam questions from full content
        exam_qs = generate_exam_questions(chunks, req.subject)

        # 5. Generate concept map
        concept_map = generate_concept_map(chunks, req.subject)

        # 6. Save everything
        save_cards(req.upload_id, req.user_id, all_cards)
        save_exam_questions(req.upload_id, req.user_id, exam_qs)
        save_concept_map(req.upload_id, req.user_id, concept_map)

        update_upload_status(req.upload_id, "done", len(all_cards))

    except Exception as e:
        update_upload_status(req.upload_id, "error")
        raise

    return {"status": "done", "card_count": len(all_cards)}
```

---

## Error Handling & Retry

Claude API calls can fail or return malformed JSON. Always wrap in a retry loop:

```python
import time

def call_with_retry(fn, *args, retries=3, **kwargs):
    """Retry an AI call up to `retries` times with exponential backoff."""
    for attempt in range(retries):
        try:
            return fn(*args, **kwargs)
        except (json.JSONDecodeError, anthropic.APIError) as e:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            print(f"Attempt {attempt+1} failed ({e}), retrying in {wait}s...")
            time.sleep(wait)
```

Usage:

```python
cards = call_with_retry(generate_flashcards, group, subject)
```
