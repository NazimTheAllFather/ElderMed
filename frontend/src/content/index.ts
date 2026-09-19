import { MessageType, type ExtensionMessage } from "../shared/types";
import { toolFailure } from "../shared/errors";
import { scanForm, toGetCurrentFormResult } from "./formScanner";
import { setFormAnswer } from "./formFiller";
import { mountAssistantWidget } from "./widgetHost";

let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;
let lastPageVersion = "";

function rescan(): void {
  try {
    const scan = scanForm(document);
    lastPageVersion = scan.page_version;
  } catch {
    // Keep the previous snapshot; the next tool call will surface PAGE_SCAN_FAILED.
  }
}

function observeForm(): void {
  if (observer || !document.body) return;
  observer = new MutationObserver(() => {
    if (typeof window === "undefined") return;
    if (debounceTimer != null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      rescan();
    }, 250);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden", "style", "class", "aria-hidden", "value", "checked"],
  });
}

function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  try {
    if (!message || typeof message !== "object" || !("type" in message)) {
      sendResponse(toolFailure("INVALID_REQUEST", "Unrecognized message."));
      return false;
    }

    switch (message.type) {
      case MessageType.PING:
        sendResponse({ ok: true });
        return false;
      case MessageType.GET_CURRENT_FORM: {
        const scan = scanForm(document);
        lastPageVersion = scan.page_version;
        sendResponse(toGetCurrentFormResult(scan, document));
        return false;
      }
      case MessageType.SET_FORM_ANSWER: {
        sendResponse(setFormAnswer(message.payload, document));
        return false;
      }
      default:
        sendResponse(toolFailure("INVALID_REQUEST", "Unsupported message type."));
        return false;
    }
  } catch {
    sendResponse(toolFailure("PAGE_SCAN_FAILED", "Content script failed while handling the request."));
    return false;
  }
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(handleMessage);
}

if (typeof document !== "undefined" && import.meta.env.MODE !== "test") {
  const start = (): void => {
    mountAssistantWidget(document);
    observeForm();
    rescan();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

export { handleMessage, lastPageVersion };
