from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import Settings
from app.main import create_app


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str]]] = []

    def get(self, url: str, params: dict[str, str] | None = None, headers: dict[str, str] | None = None):
        self.calls.append((url, headers or {}))
        if "get-signed-url" in url:
            return FakeResponse(200, {"signed_url": "wss://api.elevenlabs.io/signed-demo"})
        return FakeResponse(200, {"token": "temporary-conversation-token", "conversation_id": "conv_demo"})

    def close(self) -> None:
        return None


def make_client(settings: Settings | None = None, http_client: Any | None = None) -> TestClient:
    app = create_app(settings=settings or Settings(), http_client=http_client)
    return TestClient(app)
