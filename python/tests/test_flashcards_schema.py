"""Offline tests: stored fixtures must match the flashcard JSON schema."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from ai.flashcards import validate_stored_flashcards

_FIXTURES = Path(__file__).resolve().parent.parent / "ai" / "fixtures"


class TestFlashcardFixtures(unittest.TestCase):
    def test_sample_flashcards_json_matches_schema(self) -> None:
        path = _FIXTURES / "sample_flashcards.json"
        self.assertTrue(path.is_file(), f"missing fixture: {path}")
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        cards = validate_stored_flashcards(data)
        self.assertEqual(len(cards), 2)
        self.assertIn("beta-blockers", cards[0]["tags"])

    def test_sample_request_chunks_are_non_empty(self) -> None:
        path = _FIXTURES / "sample_request.json"
        self.assertTrue(path.is_file(), f"missing fixture: {path}")
        with path.open(encoding="utf-8") as f:
            payload = json.load(f)
        chunks = payload["chunks"]
        texts = [c.get("text", "").strip() for c in chunks]
        self.assertTrue(all(texts), "every chunk must have non-empty text for generation")


if __name__ == "__main__":
    unittest.main()
