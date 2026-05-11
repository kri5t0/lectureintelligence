"""FastAPI processing microservice: parse uploads and generate flashcards."""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any

from bootstrap_env import load_missing_env_from_dotenv_files

load_missing_env_from_dotenv_files()

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from supabase import Client, create_client

from processing.run_job import run_process_job

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Lecture Intelligence Processing")


class ProcessRequest(BaseModel):
    upload_id: str
    storage_path: str
    file_type: str
    subject: str | None = None
    user_id: str


def _jwt_shape(s: str) -> bool:
    parts = s.split(".")
    return len(parts) == 3 and all(len(p) > 0 for p in parts)


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Supabase admin client (service role). Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."""
    url = os.environ["SUPABASE_URL"].strip()
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()
    if not _jwt_shape(key):
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY does not look like a JWT (three dot-separated segments). "
            "Use the service_role key from Supabase Dashboard → Project Settings → API, "
            "not NEXT_PUBLIC_SUPABASE_ANON_KEY."
        )
    try:
        return create_client(url, key)
    except Exception as e:
        msg = str(e).lower()
        if "invalid" in msg and "key" in msg:
            raise RuntimeError(
                "Supabase rejected this key. Use SUPABASE_SERVICE_ROLE_KEY from "
                "Dashboard → Project Settings → API (the **service_role** secret, "
                "often starting with eyJ…). It must match the project URL; do not paste the anon key."
            ) from e
        raise


def verify_internal_api_key(x_api_key: str | None = Header(default=None, alias="X-Api-Key")) -> None:
    expected = (os.environ.get("INTERNAL_API_KEY") or "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Server misconfigured: INTERNAL_API_KEY is not set.",
        )
    if not x_api_key or x_api_key.strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Api-Key")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _run_job_task(payload: dict[str, Any]) -> None:
    try:
        run_process_job(get_supabase_client(), payload)
    except Exception:
        logger.exception("Background processing failed for upload_id=%s", payload.get("upload_id"))


@app.post("/process")
def process(
    body: ProcessRequest,
    background_tasks: BackgroundTasks,
    _auth: None = Depends(verify_internal_api_key),
) -> dict[str, str]:
    """Accept a job from the Next.js app; work runs in a FastAPI background task."""
    background_tasks.add_task(_run_job_task, body.model_dump())
    return {"status": "queued"}
