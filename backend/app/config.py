from __future__ import annotations

import os
from functools import lru_cache

from pathlib import Path

from dotenv import load_dotenv

# override=True so edits to backend/.env win after a process restart
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)


class Settings:
    def __init__(self) -> None:
        self.elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
        self.elevenlabs_agent_id = os.getenv("ELEVENLABS_AGENT_ID", "").strip()
        origins = os.getenv(
            "ALLOWED_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174",
        )
        self.allowed_origins = [item.strip() for item in origins.split(",") if item.strip()]
        self.environment = os.getenv("ENVIRONMENT", "development").strip() or "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
