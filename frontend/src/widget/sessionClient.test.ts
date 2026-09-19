import { describe, expect, it, vi } from "vitest";
import { endConversationSafely, requestConversationSession, requestMicrophone } from "./sessionClient";

describe("conversation session client", () => {
  it("ends the session so microphone resources can be released", () => {
    const endSession = vi.fn();
    endConversationSafely(endSession);
    expect(endSession).toHaveBeenCalledOnce();
  });

  it("returns a safe error when the backend is missing", async () => {
    const result = await requestConversationSession("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_CONFIGURATION");
  });

  it("returns backend unavailable when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await requestConversationSession("http://localhost:8000");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("BACKEND_UNAVAILABLE");
    vi.unstubAllGlobals();
  });

  it("maps microphone denial", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });
    const result = await requestMicrophone();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/microphone/i);
    vi.unstubAllGlobals();
  });
});
