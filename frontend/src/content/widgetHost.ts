import {
  HOST_MESSAGE_SOURCE,
  WIDGET_HOST_ID,
  WIDGET_MESSAGE_SOURCE,
  type HostToWidgetMessage,
  type WidgetToHostMessage,
} from "../shared/types";
import { toolFailure } from "../shared/errors";
import { scanForm, toGetCurrentFormResult } from "./formScanner";
import { setFormAnswer } from "./formFiller";

const MARGIN = 16;
const COLLAPSED_SIZE = 56;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rectsOverlap(a: DOMRect, b: DOMRect, pad = 12): boolean {
  return !(
    a.right + pad < b.left ||
    a.left - pad > b.right ||
    a.bottom + pad < b.top ||
    a.top - pad > b.bottom
  );
}

function handleToolRequest(
  message: Extract<WidgetToHostMessage, { type: "tool_request" }>,
  frame: HTMLIFrameElement,
  documentRef: Document,
): void {
  let result;
  try {
    if (message.tool === "get_current_form") {
      result = toGetCurrentFormResult(scanForm(documentRef), documentRef);
      console.log("[ElderMed] get_current_form →", JSON.stringify(result).slice(0, 400));
    } else if (message.tool === "set_form_answer") {
      if (!message.payload) {
        result = toolFailure("INVALID_REQUEST", "set_form_answer requires a payload.");
      } else {
        console.log("[ElderMed] widgetHost set_form_answer payload:", message.payload);
        result = setFormAnswer(message.payload, documentRef);
        console.log("[ElderMed] widgetHost set_form_answer result:", result);
      }
    } else {
      result = toolFailure("INVALID_REQUEST", "Unsupported tool request.");
    }
  } catch {
    result = toolFailure("PAGE_SCAN_FAILED", "Content script failed while handling the request.");
  }

  const response: HostToWidgetMessage = {
    source: HOST_MESSAGE_SOURCE,
    type: "tool_response",
    requestId: message.requestId,
    result,
  };
  // Target the extension origin explicitly so the response is not addressable
  // by arbitrary page scripts, even though frame.contentWindow already scopes
  // the destination to the iframe window.
  const extensionOrigin = new URL(chrome.runtime.getURL("/")).origin;
  frame.contentWindow?.postMessage(response, extensionOrigin);
}

export function mountAssistantWidget(documentRef: Document = document): HTMLIFrameElement | null {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return null;
  if (documentRef.getElementById(WIDGET_HOST_ID)) {
    return documentRef.getElementById(WIDGET_HOST_ID)?.querySelector("iframe") ?? null;
  }

  const host = documentRef.createElement("div");
  host.id = WIDGET_HOST_ID;
  host.setAttribute("data-eldermed-ignore", "true");
  host.style.cssText = [
    "all: initial",
    "position: fixed",
    `bottom: ${MARGIN}px`,
    `right: ${MARGIN}px`,
    "left: auto",
    "top: auto",
    `width: ${COLLAPSED_SIZE}px`,
    `height: ${COLLAPSED_SIZE}px`,
    "z-index: 2147483000",
    "pointer-events: none",
  ].join(";");

  const shadow = host.attachShadow({ mode: "closed" });
  const frame = documentRef.createElement("iframe");
  frame.src = chrome.runtime.getURL("src/widget/index.html");
  frame.title = "ElderMed form assistant";
  frame.allow = "microphone; autoplay; screen-wake-lock";
  frame.setAttribute("aria-label", "Open form assistant");
  frame.style.cssText =
    "border: 0; width: 100%; height: 100%; background: transparent; pointer-events: auto; color-scheme: light;";
  shadow.appendChild(frame);
  documentRef.documentElement.appendChild(host);

  const position = { bottom: MARGIN, right: MARGIN, left: null as number | null };

  const applyPosition = (): void => {
    host.style.top = "auto";
    host.style.bottom = `${position.bottom}px`;
    if (position.left == null) {
      host.style.left = "auto";
      host.style.right = `${position.right}px`;
    } else {
      host.style.right = "auto";
      host.style.left = `${position.left}px`;
    }
  };

  const moveAwayFrom = (target: HTMLElement): void => {
    const fieldRect = target.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    if (!rectsOverlap(fieldRect, hostRect)) return;

    const width = hostRect.width || COLLAPSED_SIZE;
    const height = hostRect.height || COLLAPSED_SIZE;
    position.left = MARGIN;
    position.right = MARGIN;
    position.bottom = clamp(
      window.innerHeight - fieldRect.top - height - MARGIN,
      MARGIN,
      window.innerHeight - height - MARGIN,
    );
    if (
      rectsOverlap(
        fieldRect,
        new DOMRect(MARGIN, window.innerHeight - position.bottom - height, width, height),
      )
    ) {
      position.left = null;
      position.bottom = MARGIN;
    }
    applyPosition();
  };

  window.addEventListener("message", (event: MessageEvent<WidgetToHostMessage>) => {
    const data = event.data;
    if (!data || data.source !== WIDGET_MESSAGE_SOURCE) return;

    // Accept messages from our extension iframe. event.source can be null cross-origin
    // in some Chrome builds, so also allow chrome-extension origins for this extension.
    const fromFrame = event.source === frame.contentWindow;
    const fromExtension =
      typeof event.origin === "string" &&
      event.origin.startsWith("chrome-extension://") &&
      (!chrome.runtime?.id || event.origin.includes(chrome.runtime.id));
    if (!fromFrame && !fromExtension) return;

    if (data.type === "resize") {
      host.style.width = `${data.width}px`;
      host.style.height = `${data.height}px`;
      const active = documentRef.activeElement;
      if (active instanceof HTMLElement && !host.contains(active)) {
        moveAwayFrom(active);
      }
      return;
    }

    if (data.type === "drag") {
      const rect = host.getBoundingClientRect();
      const nextLeft = clamp(rect.left + data.dx, MARGIN, window.innerWidth - rect.width - MARGIN);
      const nextTop = clamp(rect.top + data.dy, MARGIN, window.innerHeight - rect.height - MARGIN);
      position.left = nextLeft;
      position.bottom = window.innerHeight - nextTop - rect.height;
      applyPosition();
      return;
    }

    if (data.type === "tool_request") {
      handleToolRequest(data, frame, documentRef);
    }
  });

  documentRef.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.closest("label"))
      ) {
        moveAwayFrom(target);
      }
    },
    true,
  );

  return frame;
}
