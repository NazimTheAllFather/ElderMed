from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import Settings, get_settings
from .elevenlabs import request_conversation_credentials

logger = logging.getLogger("eldermed.backend")


class SessionResponse(BaseModel):
    conversation_token: str
    signed_url: str | None = None
    expires_in_seconds: int = Field(default=900)


class HealthResponse(BaseModel):
    status: str


def create_app(settings: Settings | None = None, http_client: Any | None = None) -> FastAPI:
    app = FastAPI(title="ElderMed credential service", version="1.0.0")
    resolved = settings or get_settings()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.allowed_origins,
        allow_origin_regex=r"^chrome-extension://[a-z]+$",
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/")
    def root() -> dict[str, str]:
        return {
            "service": "ElderMed credential API",
            "health": "/health",
            "demo_form": "http://127.0.0.1:5174/",
            "hint": "This is not the demo page. Start the form with npm run demo in frontend/, then open http://127.0.0.1:5174/",
        }

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.post("/api/elevenlabs/session", response_model=SessionResponse)
    def create_session(response: Response) -> SessionResponse:
        # Credentials must never be served from a cache.
        response.headers["Cache-Control"] = "no-store"
        if not resolved.elevenlabs_api_key or not resolved.elevenlabs_agent_id:
            logger.error("Session requested without required backend configuration.")
            raise HTTPException(
                status_code=503,
                detail="ElevenLabs backend configuration is missing.",
            )

        import httpx

        client = http_client or httpx.Client(timeout=20.0)
        owns_client = http_client is None
        try:
            conversation_token, signed_url = request_conversation_credentials(
                client,
                resolved.elevenlabs_agent_id,
                resolved.elevenlabs_api_key,
            )
            return SessionResponse(
                conversation_token=conversation_token,
                signed_url=signed_url,
                expires_in_seconds=900,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("ElevenLabs session request failed")
            raise HTTPException(status_code=502, detail="Could not create an ElevenLabs session.")
        finally:
            if owns_client:
                client.close()

    return app


app = create_app()
