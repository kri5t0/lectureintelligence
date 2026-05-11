"""Mocked smoke tests: flashcards, exam questions, and concept map generation paths."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

_FIXTURES = Path(__file__).resolve().parent.parent / "ai" / "fixtures"


def _text_block(text: str) -> object:
    return type("TB", (), {"type": "text", "text": text})()


def _client_that_returns_json(obj: object) -> MagicMock:
    raw = json.dumps(obj)
    resp = MagicMock(content=[_text_block(raw)])
    inner = MagicMock()
    inner.messages.create.return_value = resp
    return inner


class TestAIGenerationSmoke(unittest.TestCase):
    def test_generate_flashcards_mocked(self) -> None:
        cards = [
            {
                "question": "What is a beta-blocker?",
                "answer": "A drug that blocks beta-adrenergic receptors. "
                "It reduces heart rate and is used for hypertension and angina.",
                "difficulty": 2,
                "tags": ["pharmacology", "cardiovascular"],
            }
        ]
        mock_inner = _client_that_returns_json(cards)

        with patch("ai.flashcards._get_client", return_value=mock_inner):
            from ai.flashcards import generate_flashcards

            path = _FIXTURES / "sample_request.json"
            with path.open(encoding="utf-8") as f:
                payload = json.load(f)
            out = generate_flashcards(payload["chunks"], "Pharmacology", n_cards=1)

        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["difficulty"], 2)
        mock_inner.messages.create.assert_called_once()

    def test_generate_exam_questions_mocked(self) -> None:
        exam = [
            {
                "type": "mcq",
                "question": "Which receptor?",
                "marks": 2,
                "mark_scheme": "A is correct because…",
                "options": ["Beta-1", "Alpha-1", "M2", "H2"],
                "correct_index": 0,
            },
            {
                "type": "short",
                "question": "Explain the mechanism.",
                "marks": 5,
                "mark_scheme": "Point 1… Point 2…",
            },
            {
                "type": "short",
                "question": "List two adverse effects.",
                "marks": 5,
                "mark_scheme": "One mark per valid effect.",
            },
            {
                "type": "essay",
                "question": "Discuss clinical use in heart failure.",
                "marks": 15,
                "mark_scheme": "First: … 2:1: …",
            },
        ]
        mock_inner = _client_that_returns_json(exam)

        with patch("ai.exam_questions._get_client", return_value=mock_inner):
            from ai.exam_questions import generate_exam_questions

            path = _FIXTURES / "sample_request.json"
            with path.open(encoding="utf-8") as f:
                payload = json.load(f)
            out = generate_exam_questions(
                payload["chunks"], "Pharmacology", level="undergraduate"
            )

        self.assertEqual(len(out), 4)
        self.assertEqual(out[0]["type"], "mcq")
        self.assertEqual(out[0]["correct_index"], 0)
        self.assertNotIn("options", out[1])
        mock_inner.messages.create.assert_called_once()

    def test_generate_concept_map_mocked(self) -> None:
        cmap = {
            "nodes": [
                {"id": "a", "label": "Concept A", "type": "concept"},
                {"id": "b", "label": "Process B", "type": "process"},
            ],
            "edges": [
                {"source": "a", "target": "b", "label": "drives"},
            ],
        }
        wrapped = "```json\n" + json.dumps(cmap) + "\n```"
        resp = MagicMock(content=[_text_block(wrapped)])
        mock_inner = MagicMock()
        mock_inner.messages.create.return_value = resp

        with patch("ai.concept_map._get_client", return_value=mock_inner):
            from ai.concept_map import generate_concept_map

            path = _FIXTURES / "sample_request.json"
            with path.open(encoding="utf-8") as f:
                payload = json.load(f)
            out = generate_concept_map(payload["chunks"], "Pharmacology")

        self.assertEqual(set(out.keys()), {"nodes", "edges"})
        self.assertEqual(len(out["edges"]), 1)
        mock_inner.messages.create.assert_called_once()

    def test_lazy_package_exports(self) -> None:
        import ai

        self.assertTrue(callable(ai.generate_flashcards))
        self.assertTrue(callable(ai.generate_exam_questions))
        self.assertTrue(callable(ai.generate_concept_map))


if __name__ == "__main__":
    unittest.main()
