from app.config import Settings

from conftest import FakeClient, make_client


def test_health_ok() -> None:
    client = make_client()
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_session_returns_temporary_credentials_not_api_key() -> None:
    settings = Settings()
    settings.elevenlabs_api_key = "test-secret-key-value"
    settings.elevenlabs_agent_id = "agent_test"
    fake = FakeClient()
    client = make_client(settings=settings, http_client=fake)

    response = client.post("/api/elevenlabs/session")
    assert response.status_code == 200
    body = response.json()
    assert body["conversation_token"] == "temporary-conversation-token"
    assert body["signed_url"] == "wss://api.elevenlabs.io/signed-demo"
    assert body["expires_in_seconds"] == 900
    assert "test-secret-key-value" not in response.text
    assert "xi-api-key" not in response.text.lower()


def test_session_response_not_cached() -> None:
    """Credential responses must carry Cache-Control: no-store (B1)."""
    settings = Settings()
    settings.elevenlabs_api_key = "test-secret-key-value"
    settings.elevenlabs_agent_id = "agent_test"
    client = make_client(settings=settings, http_client=FakeClient())
    response = client.post("/api/elevenlabs/session")
    assert response.status_code == 200
    cc = response.headers.get("cache-control", "")
    assert "no-store" in cc.lower(), f"Expected Cache-Control: no-store, got: {cc!r}"


def test_session_missing_configuration() -> None:
    settings = Settings()
    settings.elevenlabs_api_key = ""
    settings.elevenlabs_agent_id = ""
    client = make_client(settings=settings, http_client=FakeClient())
    response = client.post("/api/elevenlabs/session")
    assert response.status_code == 503
    assert "secret" not in response.text.lower()
    assert "xi-api-key" not in response.text.lower()
