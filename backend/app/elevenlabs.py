from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger("eldermed.backend")

TOKEN_URL = "https://api.elevenlabs.io/v1/convai/conversation/token"
SIGNED_URL = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"


def request_conversation_credentials(
    client: Any,
    agent_id: str,
    api_key: str,
) -> tuple[str, str | None]:
    headers = {"xi-api-key": api_key}
    token_response = client.get(
        TOKEN_URL,
        params={"agent_id": agent_id},
        headers=headers,
    )
    if token_response.status_code >= 400:
        body_preview = (token_response.text or "")[:300]
        logger.error(
            "ElevenLabs token request failed with status %s for agent_id=%r: %s",
            token_response.status_code,
            agent_id,
            body_preview,
        )
        detail = "Could not create an ElevenLabs session."
        if token_response.status_code in (400, 404, 422):
            detail = (
                "ElevenLabs rejected the agent id or API key (HTTP "
                f"{token_response.status_code}). "
                "Set ELEVENLABS_AGENT_ID to the id that starts with agent_ "
                "(not the display name), then restart the backend."
            )
        elif token_response.status_code in (401, 403):
            detail = (
                "ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY in backend/.env "
                "and restart the backend."
            )
        raise HTTPException(status_code=502, detail=detail)

    token_body = token_response.json()
    conversation_token = token_body.get("token") or token_body.get("conversation_token")
    if not conversation_token:
        raise HTTPException(status_code=502, detail="Could not create an ElevenLabs session.")

    signed_url = None
    signed_response = client.get(
        SIGNED_URL,
        params={"agent_id": agent_id},
        headers=headers,
    )
    if signed_response.status_code < 400:
        signed_url = signed_response.json().get("signed_url")

    return str(conversation_token), str(signed_url) if signed_url else None
