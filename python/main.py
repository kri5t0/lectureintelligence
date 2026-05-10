"""FastAPI processing microservice (parsing and AI wiring to be added)."""

from __future__ import annotations

import os
from functools import lru_cache

from fastapi import FastAPI
from pydantic import BaseModel
from supabase import Client, create_client

app = FastAPI(title="Lecture Intelligence Processing")


class ProcessRequest(BaseModel):
    upload_id: str
    storage_path: str
    file_type: str
    subject: str
    user_id: str


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Supabase admin client (service role). Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process")
async def process(_body: ProcessRequest) -> dict[str, str]:
    get_supabase_client()
    return {"status": "received"}
