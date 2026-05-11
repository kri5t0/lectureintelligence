"""AI generation helpers for the lecture processing pipeline."""

# Lazy exports so `python -m ai.flashcards` does not trigger the runpy double-import warning.
__all__ = [
    "call_with_retry",
    "generate_flashcards",
    "generate_exam_questions",
    "generate_concept_map",
    "validate_stored_flashcards",
]


def __getattr__(name: str):
    if name not in __all__:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    if name == "generate_exam_questions":
        from . import exam_questions

        return exam_questions.generate_exam_questions
    if name == "generate_concept_map":
        from . import concept_map

        return concept_map.generate_concept_map
    from . import flashcards

    return getattr(flashcards, name)
