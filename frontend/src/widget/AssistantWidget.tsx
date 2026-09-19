import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import { WIDGET_MESSAGE_SOURCE, type WidgetToHostMessage } from "../shared/types";
import { createFormClientTools, getApiBaseUrl, probeFormConnection } from "../shared/formTools";
import { getActiveTab } from "../shared/tabMessaging";
import {
  endConversationSafely,
  openMicrophoneOptionsPage,
  requestConversationSession,
  requestMicrophone,
} from "./sessionClient";

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
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
      />
    </svg>
  );
}

export interface AssistantWidgetProps {
  variant: "floating" | "sidepanel";
}

function ConversationPanel({
  variant,
  boundTabIdRef,
  fillingStatus,
}: AssistantWidgetProps & {
  boundTabIdRef: React.MutableRefObject<number | null>;
  fillingStatus: string | null;
}) {
  const apiBaseUrl = getApiBaseUrl();
  const [expanded, setExpanded] = useState(variant === "sidepanel");
  const [statusMessage, setStatusMessage] = useState(
    "Press Start Assistant to begin. Microphone access is requested only then.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formLinkMessage, setFormLinkMessage] = useState("Form link not checked yet.");
  const [formLinked, setFormLinked] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [busy, setBusy] = useState(false);
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
  const agentState = conversation.isSpeaking ? "speaking" : "listening";

  const notifySize = useCallback(
    (nextExpanded: boolean) => {
      if (variant !== "floating") return;
      postToHost({
        source: WIDGET_MESSAGE_SOURCE,
        type: "resize",
        expanded: nextExpanded,
        width: nextExpanded ? 360 : 56,
        height: nextExpanded ? 520 : 56,
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
    setFormLinked(formProbe.ok);
    setFormLinkMessage(formProbe.detail);
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
        });
      } else if (session.credentials.signed_url) {
        conversationRef.current.startSession({
          signedUrl: session.credentials.signed_url,
          connectionType: "websocket",
          workletPaths,
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
  }, [apiBaseUrl, boundTabIdRef]);

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
          <h1>ElderMed</h1>
          <p className="subtitle">Voice form assistant</p>
        </div>
        {variant === "floating" ? (
          <button type="button" className="icon-button" onClick={() => setExpanded(false)} aria-label="Minimize assistant">
            Minimize
          </button>
        ) : null}
      </header>

      <section className="status-grid" aria-live="polite">
        <div>
          <span className="label">Connection</span>
          <strong className={`pill pill-${connectionState}`}>
            {connectionState === "connected"
              ? "Connected"
              : connectionState === "connecting"
                ? "Connecting"
                : "Disconnected"}
          </strong>
        </div>
        <div>
          <span className="label">Assistant</span>
          <strong className="pill">
            {connectionState === "connected"
              ? agentState === "speaking"
                ? "Speaking"
                : "Listening"
              : "Idle"}
          </strong>
        </div>
        <div>
          <span className="label">Form</span>
          <strong className={`pill ${formLinked ? "pill-connected" : "pill-disconnected"}`}>
            {formLinked ? "Linked" : "Not linked"}
          </strong>
        </div>
      </section>

      <p className="privacy">{formLinkMessage}</p>
      <p className="privacy">
        Privacy: microphone starts only after Start Assistant. Audio goes to ElevenLabs, not the ElderMed
        backend.
      </p>

      <section className="controls">
        <button
          type="button"
          className="primary"
          onClick={startAssistant}
          disabled={busy || connectionState === "connected" || connectionState === "connecting"}
        >
          Start Assistant
        </button>
        <button
          type="button"
          className="secondary"
          onClick={endAssistant}
          disabled={busy || connectionState === "disconnected"}
        >
          End Assistant
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => conversation.setMuted(!conversation.isMuted)}
          disabled={connectionState !== "connected"}
          aria-pressed={conversation.isMuted}
        >
          {conversation.isMuted ? "Unmute" : "Mute"}
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
        <p>{fillingStatus || lastTranscript || conversation.message || statusMessage}</p>
      </section>
    </div>
  );
}

function FormToolsRegistrar({
  getTabId,
  onFilling,
  onFilled,
}: {
  getTabId: () => number | null;
  onFilling: () => void;
  onFilled: () => void;
}) {
  const tools = useMemo(
    () => createFormClientTools(getTabId, onFilling, onFilled),
    [getTabId, onFilling, onFilled],
  );
  useConversationClientTool("get_current_form", tools.get_current_form);
  useConversationClientTool("set_form_answer", tools.set_form_answer);
  return null;
}

function FormToolsProvider({
  variant,
  children,
}: {
  variant: AssistantWidgetProps["variant"];
  children?: ReactNode;
}) {
  const boundTabIdRef = useRef<number | null>(null);
  const getTabId = useCallback(() => boundTabIdRef.current, []);
  const [fillingStatus, setFillingStatus] = useState<string | null>(null);
  const onFilling = useCallback(() => setFillingStatus("Filling field…"), []);
  const onFilled = useCallback(() => setFillingStatus(null), []);
  return (
    <ConversationProvider>
      <FormToolsRegistrar getTabId={getTabId} onFilling={onFilling} onFilled={onFilled} />
      <ConversationPanel variant={variant} boundTabIdRef={boundTabIdRef} fillingStatus={fillingStatus} />
      {children}
    </ConversationProvider>
  );
}

export function AssistantWidget({ variant }: AssistantWidgetProps) {
  return <FormToolsProvider variant={variant} />;
}
