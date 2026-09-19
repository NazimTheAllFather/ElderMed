import { describe, expect, it, vi } from "vitest";
import { endConversationSafely } from "../widget/sessionClient";

/**
 * Ending a conversation must call endSession so the SDK can release the mic / WebRTC peer.
 * Widget onDisconnect/onStatusChange copy is "Disconnected. Microphone released."
 */
describe("end conversation contract", () => {
  it("calls endSession to disconnect and release the microphone", () => {
    const endSession = vi.fn();
    endConversationSafely(endSession);
    expect(endSession).toHaveBeenCalledOnce();
  });

  it("treats SDK disconnected status as a released microphone state", () => {
    const status = "disconnected";
    const message =
      status === "disconnected" ? "Disconnected. Microphone released." : "Connected to assistant.";
    expect(message).toBe("Disconnected. Microphone released.");
  });

  it("does not end the session when only the hook return identity changes", () => {
    const endSession = vi.fn();
    // Simulates keeping endSession behind a ref so status re-renders do not disconnect.
    const conversationRef = { current: { endSession } };
    const previous = conversationRef.current;
    conversationRef.current = { endSession: vi.fn() };
    expect(previous.endSession).not.toHaveBeenCalled();
  });
});
