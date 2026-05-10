"""Parsers for normalising various lecture file formats into chunks.

See docs/parsing-pipeline.md for the full pipeline spec and chunk schema.

Submodules are imported lazily (PEP 562) so that running a submodule as a
script — e.g. ``python -m parsers.pdf_parser file.pdf`` — does not cause a
double-import of that submodule via this package's ``__init__``.
"""

from typing import TYPE_CHECKING, Any

__all__ = ["parse_pdf", "parse_scanned_pdf", "parse_pdf_smart"]


def __getattr__(name: str) -> Any:
    if name in __all__:
        from . import pdf_parser

        return getattr(pdf_parser, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


if TYPE_CHECKING:
    from .pdf_parser import parse_pdf, parse_scanned_pdf, parse_pdf_smart
