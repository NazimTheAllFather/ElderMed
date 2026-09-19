import {
  HOST_MESSAGE_SOURCE,
  WIDGET_MESSAGE_SOURCE,
  type GetCurrentFormResult,
  type HostToWidgetMessage,
  type SetFormAnswerParams,
  type SetFormAnswerResult,
  type WidgetToHostMessage,
} from "./types";
import { toolFailure } from "./errors";

const TOOL_TIMEOUT_MS = 4000;

export function isEmbeddedInPageHost(): boolean {
  try {
    return typeof window !== "undefined" && window.parent != null && window.parent !== window;
  } catch {
    return false;
  }
}

function extensionOrigin(): string | null {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return new URL(chrome.runtime.getURL("/")).origin;
    }
  } catch {
    // ignore
  }
  return null;
}

function requestViaHost(
  tool: "get_current_form" | "set_form_answer",
  payload?: SetFormAnswerParams,
): Promise<GetCurrentFormResult | SetFormAnswerResult> {
  return new Promise((resolve) => {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(
        toolFailure(
          "CONTENT_SCRIPT_UNAVAILABLE",
          "The form page is not connected to the extension.",
        ),
      );
    }, TOOL_TIMEOUT_MS);

    const onMessage = (event: MessageEvent<HostToWidgetMessage>): void => {
      const expectedOrigin = extensionOrigin();
      // Host replies from the content script on the page origin, not the extension origin.
      if (!event.data || typeof event.data !== "object") return;
      const data = event.data;
      if (data.source !== HOST_MESSAGE_SOURCE || data.type !== "tool_response") return;
      if (data.requestId !== requestId) return;
      // Prefer same-window replies; allow page-origin responses from the host content script.
      if (expectedOrigin && event.origin === expectedOrigin) {
        // unexpected: host should reply from the page
      }
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(data.result);
    };

    window.addEventListener("message", onMessage);
    const message: WidgetToHostMessage = {
      source: WIDGET_MESSAGE_SOURCE,
      type: "tool_request",
      requestId,
      tool,
      ...(payload ? { payload } : {}),
    };
    window.parent.postMessage(message, "*");
  });
}

export async function requestCurrentFormViaHost(): Promise<GetCurrentFormResult> {
  return (await requestViaHost("get_current_form")) as GetCurrentFormResult;
}

export async function requestSetFormAnswerViaHost(
  params: SetFormAnswerParams,
): Promise<SetFormAnswerResult> {
  return (await requestViaHost("set_form_answer", params)) as SetFormAnswerResult;
}
