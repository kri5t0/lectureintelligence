"""Background job: storage → parse → Claude flashcards → chunks + cards tables."""

from __future__ import annotations

import logging
import os
import tempfile
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from supabase import Client

from ai.flashcards import generate_flashcards
from parsers import parse_upload

logger = logging.getLogger(__name__)

BUCKET = "uploads"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mark_error(client: Client, upload_id: str, message: str) -> None:
    truncated = (message or "Unknown error")[:2000]
    try:
        (
            client.table("uploads")
            .update(
                {
                    "status": "error",
                    "error_message": truncated,
                    "updated_at": _utc_now_iso(),
                }
            )
            .eq("id", upload_id)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to mark upload %s error: %s", upload_id, exc)


def _sanitize_db_text(s: str, *, max_len: int | None = None) -> str:
    """Strip NULs; Postgres `text` rejects U+0000 (common in PDF extract)."""
    out = (s or "").replace("\x00", "")
    if max_len is not None:
        out = out[:max_len]
    return out


def _suffix_from_path(storage_path: str, file_type: str) -> str:
    suf = Path(storage_path).suffix.lower()
    if suf:
        return suf
    ft = (file_type or "").lower().strip()
    return {
        "pdf": ".pdf",
        "pptx": ".pptx",
        "audio": ".mp3",
    }.get(ft, ".bin")


def _clear_existing_rows(client: Client, upload_id: str) -> None:
    """Idempotent retries: remove prior chunks/cards for this upload."""
    try:
        client.table("cards").delete().eq("upload_id", upload_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not clear cards for %s: %s", upload_id, exc)
    try:
        client.table("chunks").delete().eq("upload_id", upload_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not clear chunks for %s: %s", upload_id, exc)


def run_process_job(client: Client, payload: dict[str, Any]) -> None:
    """
    Full pipeline for one upload row.

    Expects service-role Supabase client (bypasses RLS). Payload keys match
    ``ProcessRequest`` from ``main.py``.
    """
    upload_id = str(payload["upload_id"])
    storage_path = str(payload["storage_path"])
    file_type = str(payload.get("file_type") or "")
    subject = (payload.get("subject") or "").strip() or "General"
    user_id = str(payload["user_id"])

    try:
        try:
            file_bytes = client.storage.from_(BUCKET).download(storage_path)
        except Exception as exc:  # noqa: BLE001
            _mark_error(client, upload_id, f"Storage download failed: {exc}")
            return

        if not file_bytes or not isinstance(file_bytes, (bytes, bytearray)):
            _mark_error(client, upload_id, "Storage download returned empty payload.")
            return

        suffix = _suffix_from_path(storage_path, file_type)
        tmp_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name

            chunks = parse_upload(tmp_path)
        except ValueError as exc:
            _mark_error(client, upload_id, str(exc))
            return
        except Exception as exc:  # noqa: BLE001
            _mark_error(client, upload_id, f"Parse failed: {exc}\n{traceback.format_exc()}")
            return
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

        if not chunks:
            _mark_error(client, upload_id, "No text could be extracted from this file.")
            return

        (
            client.table("uploads")
            .update({"status": "processing_ai", "updated_at": _utc_now_iso()})
            .eq("id", upload_id)
            .execute()
        )

        _clear_existing_rows(client, upload_id)

        chunk_rows = [
            {
                "upload_id": upload_id,
                "user_id": user_id,
                "type": str(c.get("type") or "body"),
                "text": _sanitize_db_text(str(c.get("text") or ""), max_len=50000),
                "page_or_slide": c.get("page_or_slide"),
            }
            for c in chunks
            if _sanitize_db_text(str(c.get("text") or "")).strip()
        ]
        if chunk_rows:
            client.table("chunks").insert(chunk_rows).execute()

        n_cards = int(os.environ.get("N_CARDS", "12"))
        n_cards = max(1, min(n_cards, 24))

        try:
            cards_out = generate_flashcards(chunks, subject, n_cards=n_cards)
        except Exception as exc:  # noqa: BLE001
            _mark_error(
                client,
                upload_id,
                f"Flashcard generation failed: {exc}\n{traceback.format_exc()}",
            )
            return

        if not cards_out:
            _mark_error(client, upload_id, "Flashcard generation returned no cards.")
            return

        card_rows = []
        for c in cards_out:
            tags = c.get("tags") or []
            if not isinstance(tags, list):
                tags = [str(tags)]
            card_rows.append(
                {
                    "upload_id": upload_id,
                    "user_id": user_id,
                    "question": _sanitize_db_text(str(c.get("question") or ""), max_len=20000),
                    "answer": _sanitize_db_text(str(c.get("answer") or ""), max_len=20000),
                    "tags": [_sanitize_db_text(str(t), max_len=500) for t in tags][:32],
                    "difficulty": int(c.get("difficulty") or 3),
                }
            )

        client.table("cards").insert(card_rows).execute()

        (
            client.table("uploads")
            .update(
                {
                    "status": "done",
                    "chunk_count": len(chunk_rows),
                    "card_count": len(card_rows),
                    "error_message": None,
                    "updated_at": _utc_now_iso(),
                }
            )
            .eq("id", upload_id)
            .execute()
        )
        logger.info(
            "Processed upload %s: %s chunks, %s cards",
            upload_id,
            len(chunk_rows),
            len(card_rows),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected failure for upload %s", upload_id)
        _mark_error(client, upload_id, f"Unexpected: {exc}\n{traceback.format_exc()}")
