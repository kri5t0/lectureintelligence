"""Load KEY=value pairs from local env files into os.environ (no overrides)."""

from __future__ import annotations

import os
from pathlib import Path


def load_missing_env_from_dotenv_files() -> None:
    """
    Merge variables from common dotenv paths into the process environment.

    Only sets keys that are not already present (shell / system wins).
    Used so `uvicorn main:app` picks up python/.env without extra tooling.
    """
    python_dir = Path(__file__).resolve().parent
    repo_root = python_dir.parent
    for path in (python_dir / ".env", repo_root / ".env", repo_root / ".env.local"):
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8-sig")
        except OSError:
            continue
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.lower().startswith("export "):
                line = line[7:].lstrip()
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if not key or key in os.environ:
                continue
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ[key] = value
