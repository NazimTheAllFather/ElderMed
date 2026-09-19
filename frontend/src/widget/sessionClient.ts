import type { SessionCredentials } from "../shared/types";

export type SessionRequestResult =
  | { ok: true; credentials: SessionCredentials }
  | { ok: false; error: string; code: "MISSING_CONFIGURATION" | "BACKEND_UNAVAILABLE" | "CONNECTION_FAILED" };

export async function requestConversationSession(apiBaseUrl: string): Promise<SessionRequestResult> {
  if (!apiBaseUrl) {
    return {
      ok: false,
      code: "MISSING_CONFIGURATION",
      error: "Missing VITE_API_BASE_URL. Copy frontend/.env.example to frontend/.env and rebuild.",
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/elevenlabs/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    if (!response.ok) {
      return {
        ok: false,
        code: response.status === 503 ? "MISSING_CONFIGURATION" : "BACKEND_UNAVAILABLE",
        error: "The assistant backend is unavailable. Start it on port 8000 and try again.",
      };
    }

    const data = (await response.json()) as Partial<SessionCredentials>;
    if (!data.conversation_token && !data.signed_url) {
      return {
        ok: false,
        code: "CONNECTION_FAILED",
        error: "The backend did not return a conversation credential.",
      };
    }

    return {
      ok: true,
      credentials: {
        conversation_token: String(data.conversation_token ?? ""),
        signed_url: data.signed_url ? String(data.signed_url) : undefined,
        expires_in_seconds:
          typeof data.expires_in_seconds === "number" ? data.expires_in_seconds : 900,
      },
    };
  } catch {
    return {
      ok: false,
      code: "BACKEND_UNAVAILABLE",
      error: "Could not reach the ElderMed backend at the configured API URL.",
    };
  }
}

export async function requestMicrophone(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotFoundError") {
      return { ok: false, error: "No microphone was found. Plug one in and try Start Assistant again." };
    }
    if (name === "NotReadableError") {
      return {
        ok: false,
        error: "The microphone is already in use by another app. Close that app and try again.",
      };
    }
    return {
      ok: false,
      error:
        "Microphone permission denied. Chrome often blocks the mic in the side panel. Close this panel, use the green button on the form, or tap Grant microphone below.",
    };
  }
}

export function openMicrophoneOptionsPage(): void {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
}

export function endConversationSafely(endSession: () => void): void {
  endSession();
}
