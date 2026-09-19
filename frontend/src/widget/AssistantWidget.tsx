import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { WIDGET_MESSAGE_SOURCE, type WidgetToHostMessage } from "../shared/types";
import { createFormClientTools, getApiBaseUrl, probeFormConnection } from "../shared/formTools";
import { getActiveTab } from "../shared/tabMessaging";
import {
  endConversationSafely,
  openMicrophoneOptionsPage,
  requestConversationSession,
  requestMicrophone,
} from "./sessionClient";
import micIconImg from "../assets/colored-logo.png";
import titleImage from "../assets/logo-with-name.svg"
function formatUnknownError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "ElevenLabs connection failure.";
}

function postToHost(message: WidgetToHostMessage): void {
  window.parent?.postMessage(message, "*");
}

function elevenLabsWorkletPaths() {
  const url = (file: string): string =>
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL(`elevenlabs-worklets/${file}`)
      : `/elevenlabs-worklets/${file}`;
  return {
    rawAudioProcessor: url("raw-audio-processor.js"),
    audioConcatProcessor: url("audio-concat-processor.js"),
  };
}

function MicIcon(): ReactNode {
  return (
    <img
      src={micIconImg}
      alt=""
      aria-hidden="true"
      style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
    />
  );
}
function PlayIcon(): ReactNode {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 3v18l17-9L5 3Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon(): ReactNode {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="2.5" fill="currentColor" />
    </svg>
  );
}

function MicMuteIcon({ muted }: { muted: boolean }): ReactNode {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5.5A3.5 3.5 0 0 0 12 15Z" fill="currentColor" stroke="none" />
      <path d="M18 11.5a6 6 0 0 1-12 0" />
      <line x1="12" y1="17.5" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
      {muted ? (
        <line x1="2.5" y1="21.5" x2="21.5" y2="2.5" stroke="#c0392b" strokeWidth="3.2" />
      ) : null}
    </svg>
  );
}
// function SpeakerIcon({ muted }: { muted: boolean }): ReactNode {
//   return (
//     <svg
//       width="20"
//       height="20"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//       aria-hidden="true"
//       focusable="false"
//     >
//       <path d="M4 9v6h4l5 5V4L8 9H4Z" fill="currentColor" stroke="none" />
//       {muted ? (
//         <>
//           <line x1="16" y1="9" x2="22" y2="15" stroke="#c0392b" strokeWidth="2.25" />
//           <line x1="22" y1="9" x2="16" y2="15" stroke="#c0392b" strokeWidth="2.25" />
//         </>
//       ) : (
//         <>
//           <path d="M16 8a5 5 0 0 1 0 8" />
//           <path d="M18.5 5.5a9 9 0 0 1 0 13" />
//         </>
//       )}
//     </svg>
//   );
// }
// function ConnectionIcon({ showError }: { showError: boolean }): ReactNode {
//   return (
//     <svg
//       width="24"
//       height="24"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2.5"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//       aria-hidden="true"
//       focusable="false"
//     >
//       <path d="M5 12.55a11 11 0 0 1 14.08 0" />
//       <path d="M1.42 9a16 16 0 0 1 21.16 0" />
//       <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
//       <line x1="12" y1="20" x2="12.01" y2="20" />
//       {showError ? (
//         <line x1="3" y1="21" x2="21" y2="3" stroke="#c0392b" strokeWidth="2.75" />
//       ) : null}
//     </svg>
//   );
// }

// function AssistantIcon(): ReactNode {
//   return (
//     <svg
//       width="26"
//       height="26"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//       aria-hidden="true"
//       focusable="false"
//     >
//       {/* antenna */}
//       <line x1="12" y1="2" x2="12" y2="5" />
//       <circle cx="12" cy="2" r="1.4" fill="currentColor" stroke="none" />
//       {/* head */}
//       <rect x="4" y="5" width="16" height="13" rx="3" />
//       {/* eyes */}
//       <circle cx="9" cy="11" r="1.6" fill="currentColor" stroke="none" />
//       <circle cx="15" cy="11" r="1.6" fill="currentColor" stroke="none" />
//       {/* mouth grille */}
//       <line x1="8" y1="15" x2="16" y2="15" />
//       {/* side audio nubs */}
//       <line x1="4" y1="9" x2="2" y2="9" />
//       <line x1="20" y1="9" x2="22" y2="9" />
//       {/* legs/base */}
//       <line x1="9" y1="18" x2="9" y2="20" />
//       <line x1="15" y1="18" x2="15" y2="20" />
//     </svg>
//   );
// }
// function FormIcon({ failed }: { failed: boolean }): ReactNode {
//   return (
//     <svg
//       width="22"
//       height="22"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//       aria-hidden="true"
//       focusable="false"
//     >
//       <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
//       <path d="M14 2v6h6" />
//       <circle cx="8.5" cy="12.5" r="1" fill="currentColor" stroke="none" />
//       <circle cx="12" cy="12.5" r="1" fill="currentColor" stroke="none" />
//       <circle cx="15.5" cy="12.5" r="1" fill="currentColor" stroke="none" />
//       <circle cx="8.5" cy="16.5" r="1" fill="currentColor" stroke="none" />
//       {failed ? (
//         <line x1="4" y1="21" x2="20" y2="3" stroke="#c0392b" strokeWidth="2.5" />
//       ) : null}
//     </svg>
//   );
// }

export interface AssistantWidgetProps {
  variant: "floating" | "sidepanel";
}

type ClientTools = ReturnType<typeof createFormClientTools>;

function ConversationPanel({
  variant,
  clientTools,
  boundTabIdRef,
}: AssistantWidgetProps & {
  clientTools: ClientTools;
  boundTabIdRef: React.MutableRefObject<number | null>;
}) {
  const apiBaseUrl = getApiBaseUrl();
  const [expanded, setExpanded] = useState(variant === "sidepanel");
  const [statusMessage, setStatusMessage] = useState(
    "Press Start Assistant to begin. Microphone access is requested only then.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // const [formLinkMessage, setFormLinkMessage] = useState("Form link not checked yet.");
  // const [formLinked, setFormLinked] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  // const [hasAttemptedConnection, setHasAttemptedConnection] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const conversation = useConversation({
    onConnect: () =>
      setStatusMessage("Connected. Speak naturally; confirm each answer before it is filled."),
    onDisconnect: () => setStatusMessage("Disconnected. Microphone released."),
    onError: (error) => {
      const message = formatUnknownError(error);
      setStatusMessage(message);
      setErrorMessage(message);
    },
    onMessage: (message) => {
      const text =
        typeof message === "object" && message && "message" in message
          ? String((message as { message?: string }).message ?? "")
          : "";
      if (text) setLastTranscript(text);
    },
    onModeChange: (payload) => {
      const value =
        typeof payload === "object" && payload && "mode" in payload
          ? String((payload as { mode: string }).mode)
          : String(payload);
      if (value === "speaking") setStatusMessage("Agent is speaking.");
      if (value === "listening") setStatusMessage("Agent is listening.");
    },
    onStatusChange: (payload) => {
      const status =
        typeof payload === "object" && payload && "status" in payload
          ? String((payload as { status: string }).status)
          : String(payload);
      if (status === "disconnected") {
        setStatusMessage("Disconnected. Microphone released.");
      }
    },
  });

  // useConversation returns a new object every render; keep a stable ref for lifecycle cleanup.
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const connectionState =
    conversation.status === "connected"
      ? "connected"
      : conversation.status === "connecting"
        ? "connecting"
        : "disconnected";
  //const agentState = conversation.isSpeaking ? "speaking" : "listening";

  const notifySize = useCallback(
    (nextExpanded: boolean) => {
      if (variant !== "floating") return;
      postToHost({
        source: WIDGET_MESSAGE_SOURCE,
        type: "resize",
        expanded: nextExpanded,
        width: nextExpanded ? 400 : 92,
        height: nextExpanded ? 600 : 92,
      });
    },
    [variant],
  );

  useEffect(() => {
    notifySize(expanded);
  }, [expanded, notifySize]);

  useEffect(() => {
    const end = (): void => {
      try {
        endConversationSafely(() => conversationRef.current.endSession());
      } catch {
        // Extension context may already be gone.
      }
    };
    window.addEventListener("pagehide", end);
    window.addEventListener("beforeunload", end);
    return () => {
      window.removeEventListener("pagehide", end);
      window.removeEventListener("beforeunload", end);
      end();
    };
  }, []);

  const startAssistant = useCallback(async () => {
    setErrorMessage(null);
    // setHasAttemptedConnection(true);
    if (!apiBaseUrl) {
      setErrorMessage("Missing VITE_API_BASE_URL. Copy frontend/.env.example to frontend/.env and rebuild.");
      setStatusMessage("Missing backend configuration.");
      return;
    }

    setBusy(true);
    setStatusMessage("Requesting microphone permission.");
    const mic = await requestMicrophone();
    if (!mic.ok) {
      setErrorMessage(mic.error);
      setStatusMessage("Microphone permission denied.");
      setBusy(false);
      return;
    }

    // Bind the session to the tab that is active right now (side-panel path).
    // The floating-widget path routes through the iframe host bridge and is
    // already bound to the initiating document; storing the tab ID there is
    // harmless but not strictly required.
    setStatusMessage("Checking form page connection.");
    const activeTab = await getActiveTab();
    boundTabIdRef.current = activeTab?.id ?? null;

    const formProbe = await probeFormConnection();
    // setFormLinked(formProbe.ok);
    // setFormLinkMessage(formProbe.detail);
    if (!formProbe.ok) {
      setErrorMessage(
        `${formProbe.detail} Reload the ElderMed extension, then hard-refresh this demo tab (Ctrl+Shift+R).`,
      );
      setStatusMessage("Form page not linked.");
      setBusy(false);
      return;
    }

    setStatusMessage("Requesting a temporary conversation credential.");
    const session = await requestConversationSession(apiBaseUrl);
    if (!session.ok) {
      setErrorMessage(session.error);
      setStatusMessage(session.error);
      setBusy(false);
      return;
    }

    setStatusMessage("Connecting to assistant.");
    try {
      const workletPaths = elevenLabsWorkletPaths();
      if (session.credentials.conversation_token) {
        conversationRef.current.startSession({
          conversationToken: session.credentials.conversation_token,
          connectionType: "webrtc",
          workletPaths,
          clientTools,
        });
      } else if (session.credentials.signed_url) {
        conversationRef.current.startSession({
          signedUrl: session.credentials.signed_url,
          connectionType: "websocket",
          workletPaths,
          clientTools,
        });
      } else {
        throw new Error("No conversation credential was returned.");
      }
    } catch (err) {
      const message = formatUnknownError(err);
      setErrorMessage(message);
      setStatusMessage(message);
    } finally {
      setBusy(false);
    }
  }, [apiBaseUrl, clientTools, boundTabIdRef]);

  const endAssistant = useCallback(() => {
    setBusy(true);
    try {
      endConversationSafely(() => conversationRef.current.endSession());
      boundTabIdRef.current = null;
      setStatusMessage("Assistant ended. Microphone released.");
      setLastTranscript("");
    } catch (err) {
      setStatusMessage(formatUnknownError(err));
    } finally {
      setBusy(false);
    }
  }, [boundTabIdRef]);

  const onDragStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (variant !== "floating") return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDragMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    postToHost({
      source: WIDGET_MESSAGE_SOURCE,
      type: "drag",
      dx: event.clientX - dragRef.current.x,
      dy: event.clientY - dragRef.current.y,
    });
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const onDragEnd = (): void => {
    dragRef.current = null;
  };

  if (variant === "floating" && !expanded) {
    const sessionActive = connectionState === "connected" || connectionState === "connecting";
    return (
      <button
        type="button"
        className={`launcher${sessionActive ? " launcher-active" : ""}`}
        onClick={() => setExpanded(true)}
        aria-label={
          sessionActive
            ? "Open form assistant — microphone is active"
            : "Open form assistant"
        }
      >
        <MicIcon />
        {sessionActive && <span className="mic-dot" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <div className={`panel ${variant === "floating" ? "panel-floating" : ""}`}>
      <header
        className="header"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
        <div>
        <div>
          <img
            src={titleImage}
            alt="ElderMed"
            style={{ height: "250px", width: "auto", display: "block" }}
          />
              <p className="subtitle">"When in need, just ask!"</p>

        </div>
        </div>
                {variant === "floating" ? (
          <button
            type="button"
            className="icon-button"
            onClick={() => setExpanded(false)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Minimize assistant"
            title="Minimize"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </header>
{/* 
      <section className="status-grid" aria-live="polite">
        <div
          className={`icon-status icon-status-${connectionState}`}
          title={
            connectionState === "connected"
              ? "Connected"
              : connectionState === "connecting"
                ? "Connecting"
                : hasAttemptedConnection
                  ? "Disconnected"
                  : "Not started"
          }
          aria-label={`Connection: ${connectionState}`}
        >
          <ConnectionIcon showError={hasAttemptedConnection && connectionState === "disconnected"} />
          <span className="status-dot" aria-hidden="true" />
        </div>

        <div
          className={`icon-status icon-status-${connectionState === "connected" ? agentState : "idle"}`}
          title={
            connectionState === "connected"
              ? agentState === "speaking"
                ? "Speaking"
                : "Listening"
              : "Idle"
          }
          aria-label={`Assistant: ${connectionState === "connected" ? agentState : "idle"}`}
        >
          <AssistantIcon />
          <span className="status-dot" aria-hidden="true" />
        </div>

        <div
          className={`icon-status ${formLinked ? "icon-status-connected" : "icon-status-disconnected"}`}
          title={formLinked ? "Form linked" : "Form not linked"}
          aria-label={formLinked ? "Form linked" : "Form not linked"}
        >
        <FormIcon failed={hasAttemptedConnection && !formLinked} />
          <span className="status-dot" aria-hidden="true" />
        </div>
      </section> */}

      {/* <p className="privacy">{formLinkMessage}</p> */}
      <p className="privacy">
        
      </p>
          
    <section className="controls">
      <button
        type="button"
        className="primary"
        onClick={startAssistant}
        disabled={busy || connectionState === "connected" || connectionState === "connecting"}
        aria-label="Start assistant"
      >
        <PlayIcon />
        <span>Start</span>
      </button>
      
      <button
        type="button"
        className="secondary"
        onClick={endAssistant}
        disabled={busy || connectionState === "disconnected"}
        aria-label="End assistant"
      >
        <StopIcon />
        <span>End</span>
      </button>
            <button
        type="button"
        className="secondary"
        onClick={() => {
          const next = !conversation.isMuted;
          if (typeof (conversation as any).setMicMuted === "function") {
            (conversation as any).setMicMuted(next);
          } else {
            conversation.setMuted(next);
          }
        }}
        disabled={connectionState !== "connected"}
        aria-pressed={conversation.isMuted}
        aria-label={conversation.isMuted ? "Unmute" : "Mute"}
      >
        <MicMuteIcon muted={conversation.isMuted} />
        <span>{conversation.isMuted ? "Unmute" : "Mute"}</span>
      </button>
    </section>      
          {errorMessage ? (
            <div className="error" role="alert">
              <p>{errorMessage}</p>
              {errorMessage.toLowerCase().includes("microphone") ? (
                <button type="button" className="secondary" onClick={openMicrophoneOptionsPage}>
                  Grant microphone
                </button>
              ) : null}
            </div>
          ) : null}

          <section className="transcript">
            <span className="label">Status / last transcript</span>
            <p>{lastTranscript || conversation.message || statusMessage}</p>
          </section>
        </div>
      );
    }

function FormToolsProvider({
  variant,
  children,
}: {
  variant: AssistantWidgetProps["variant"];
  children?: ReactNode;
}) {
  // Stores the tab ID captured at session start (side-panel path only).
  // The floating-widget path is already bound to the host document via the
  // iframe postMessage bridge and does not use this ref.
  const boundTabIdRef = useRef<number | null>(null);
  const getTabId = useCallback(() => boundTabIdRef.current, []);
  const clientTools = useMemo(() => createFormClientTools(getTabId), [getTabId]);
  return (
    <ConversationProvider clientTools={clientTools}>
      <ConversationPanel variant={variant} clientTools={clientTools} boundTabIdRef={boundTabIdRef} />
      {children}
    </ConversationProvider>
  );
}

export function AssistantWidget({ variant }: AssistantWidgetProps) {
  return <FormToolsProvider variant={variant} />;
}