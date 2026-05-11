"""Export generated flashcards to an Anki .apkg deck."""

from __future__ import annotations

import argparse
import json
import random
import re
from pathlib import Path
from typing import Any

import genanki


LATEX_PRE = r"""\documentclass[12pt]{article}
\special{papersize=3in,5in}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\pagestyle{empty}
\setlength{\parindent}{0in}
\begin{document}
"""

LATEX_POST = r"""\end{document}"""


def _card_tags(card: dict[str, Any]) -> list[str]:
    tags = card.get("tags", [])
    if not isinstance(tags, list):
        return []
    return [tag.strip() for tag in tags if isinstance(tag, str) and tag.strip()]


def _anki_tags(tags: list[str]) -> list[str]:
    return [re.sub(r"\s+", "_", tag.strip()) for tag in tags if tag.strip()]


def export_anki_deck(
    cards: list[dict[str, Any]],
    deck_name: str,
    output_path: str,
) -> str:
    """
    Export flashcards as an Anki .apkg file.

    Args:
        cards: list of {question, answer, tags, ...} dicts
        deck_name: e.g. "Pharmacology - Week 3"
        output_path: e.g. "/tmp/pharmacology_wk3.apkg"

    Returns:
        path to the written .apkg file
    """
    model_id = random.randrange(1 << 30, 1 << 31)
    deck_id = random.randrange(1 << 30, 1 << 31)

    model = genanki.Model(
        model_id,
        "Lecture Intelligence Card",
        fields=[
            {"name": "Question"},
            {"name": "Answer"},
            {"name": "Tags"},
        ],
        templates=[
            {
                "name": "Card",
                "qfmt": "<div class='question'>{{Question}}</div>",
                "afmt": (
                    "{{FrontSide}}"
                    "<hr id='answer'>"
                    "<div class='answer'>{{Answer}}</div>"
                ),
            }
        ],
        css="""
            .card {
                font-family: Arial, sans-serif;
                font-size: 16px;
                text-align: left;
                padding: 20px;
            }
            .question, .answer { line-height: 1.5; }
            hr#answer { border: 0; border-top: 1px solid #ccc; margin: 1rem 0; }
        """,
        latex_pre=LATEX_PRE,
        latex_post=LATEX_POST,
    )

    deck = genanki.Deck(deck_id, deck_name)

    for card in cards:
        tags = _card_tags(card)
        note = genanki.Note(
            model=model,
            fields=[
                str(card["question"]),
                str(card["answer"]),
                ", ".join(tags),
            ],
            tags=_anki_tags(tags),
        )
        deck.add_note(note)

    genanki.Package(deck).write_to_file(output_path)
    return output_path


def _load_cards(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("cards JSON must be an array")
    if not all(isinstance(card, dict) for card in data):
        raise ValueError("every card must be a JSON object")
    return data


def _main() -> int:
    parser = argparse.ArgumentParser(description="Export flashcards to test_deck.apkg.")
    parser.add_argument("cards_json", help="Path to a JSON array of flashcard objects.")
    parser.add_argument("--deck-name", default="Test Deck", help="Name for the Anki deck.")
    args = parser.parse_args()

    cards = _load_cards(Path(args.cards_json))
    output_path = Path.cwd() / "test_deck.apkg"
    written = export_anki_deck(cards, args.deck_name, str(output_path))
    print(written)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
