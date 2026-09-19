import type { ToolErrorCode, ToolFailure } from "./types";

export function toolFailure(error: ToolErrorCode, message: string): ToolFailure {
  return { success: false, error, message };
}

export function isChromeRuntimeAvailable(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
}
