import {
  MessageType,
  type ContentScriptResponse,
  type ExtensionMessage,
  type GetCurrentFormResult,
  type SetFormAnswerParams,
  type SetFormAnswerResult,
} from "./types";
import { toolFailure } from "./errors";

const UNSUPPORTED_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com",
];

export function isSupportedTabUrl(url: string | undefined): boolean {
  if (!url) return false;
  return !UNSUPPORTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function scoreTab(tab: chrome.tabs.Tab): number {
  const url = tab.url ?? "";
  let score = 0;
  if (tab.active) score += 10;
  if (/https?:\/\/(127\.0\.0\.1|localhost):5174\b/i.test(url)) score += 50;
  if (isSupportedTabUrl(url)) score += 5;
  return score;
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return null;

  const focused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focused[0] && isSupportedTabUrl(focused[0].url)) return focused[0];

  const current = await chrome.tabs.query({ active: true, currentWindow: true });
  if (current[0] && isSupportedTabUrl(current[0].url)) return current[0];

  const all = await chrome.tabs.query({});
  const supported = all.filter((tab) => isSupportedTabUrl(tab.url));
  if (supported.length === 0) return focused[0] ?? current[0] ?? null;
  supported.sort((a, b) => scoreTab(b) - scoreTab(a));
  return supported[0] ?? null;
}

async function sendToTab<T extends ContentScriptResponse>(
  tabId: number,
  message: ExtensionMessage,
): Promise<T> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as T | undefined;
    if (!response) {
      return toolFailure(
        "CONTENT_SCRIPT_UNAVAILABLE",
        "The form page is not connected to the extension.",
      ) as T;
    }
    return response;
  } catch {
    return toolFailure(
      "CONTENT_SCRIPT_UNAVAILABLE",
      "The form page is not connected to the extension.",
    ) as T;
  }
}

async function isContentScriptReady(tabId: number): Promise<boolean> {
  const ping = await sendToTab(tabId, { type: MessageType.PING });
  return "ok" in ping && ping.ok === true;
}

/** Inject declared content scripts when the page was open before the extension loaded. */
export async function ensureContentScript(tabId: number): Promise<boolean> {
  if (await isContentScriptReady(tabId)) return true;
  if (!chrome.scripting?.executeScript) return false;

  try {
    const files = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? [];
    if (files.length === 0) return false;
    await chrome.scripting.executeScript({
      target: { tabId },
      files,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    return isContentScriptReady(tabId);
  } catch {
    return false;
  }
}

/**
 * Resolve the tab to use for a messaging call.
 *
 * When a session is already bound to a specific tab (side-panel path), pass
 * that `boundTabId` so the call is never re-routed to a different tab if the
 * user switches tabs mid-session.  Omit it (or pass null) to fall back to the
 * active-tab heuristic used before a session is bound.
 */
async function resolveTab(boundTabId: number | null): Promise<chrome.tabs.Tab | null> {
  if (boundTabId != null) {
    if (typeof chrome === "undefined" || !chrome.tabs?.get) return null;
    try {
      const tab = await chrome.tabs.get(boundTabId);
      if (isSupportedTabUrl(tab.url)) return tab;
    } catch {
      // Tab was closed or id is stale; fall through to error path below.
    }
    return null;
  }
  return getActiveTab();
}

export async function requestCurrentForm(boundTabId: number | null = null): Promise<GetCurrentFormResult> {
  const tab = await resolveTab(boundTabId);
  if (!tab?.id) {
    return toolFailure("NO_ACTIVE_TAB", "No active browser tab was found.");
  }
  if (!isSupportedTabUrl(tab.url)) {
    return toolFailure(
      "UNSUPPORTED_PAGE",
      "This page cannot be inspected by the extension.",
    );
  }

  if (!(await ensureContentScript(tab.id))) {
    return toolFailure(
      "CONTENT_SCRIPT_UNAVAILABLE",
      "The form page is not connected to the extension. Refresh the demo tab, then try again.",
    );
  }

  return sendToTab<GetCurrentFormResult>(tab.id, {
    type: MessageType.GET_CURRENT_FORM,
  });
}

export async function requestSetFormAnswer(
  params: SetFormAnswerParams,
  boundTabId: number | null = null,
): Promise<SetFormAnswerResult> {
  const tab = await resolveTab(boundTabId);
  if (!tab?.id) {
    return toolFailure("NO_ACTIVE_TAB", "No active browser tab was found.");
  }
  if (!isSupportedTabUrl(tab.url)) {
    return toolFailure(
      "UNSUPPORTED_PAGE",
      "This page cannot be modified by the extension.",
    );
  }

  if (!(await ensureContentScript(tab.id))) {
    return toolFailure(
      "CONTENT_SCRIPT_UNAVAILABLE",
      "The form page is not connected to the extension. Refresh the demo tab, then try again.",
    );
  }

  return sendToTab<SetFormAnswerResult>(tab.id, {
    type: MessageType.SET_FORM_ANSWER,
    payload: params,
  });
}
