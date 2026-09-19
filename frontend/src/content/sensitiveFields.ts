const SENSITIVE_PATTERN =
  /social\s*security|\bssn\b|bank\s*account|routing\s*number|\biban\b|account\s*number|password|\bpin\b|\botp\b|one[-\s]?time|verification\s*code|\bcvv\b|card\s*number|credit\s*card/i;

const SENSITIVE_AUTOCOMPLETE = new Set([
  "ssn",
  "current-password",
  "new-password",
  "one-time-code",
  "cc-number",
  "cc-csc",
]);

export function isSensitiveControl(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  question: string,
): boolean {
  if (el instanceof HTMLInputElement && el.type === "password") return true;
  const autocomplete = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  if (SENSITIVE_AUTOCOMPLETE.has(autocomplete)) return true;
  const identity = [el.name, el.id, el.getAttribute("title"), question].join(" ");
  return SENSITIVE_PATTERN.test(identity);
}

export const SENSITIVE_MANUAL_ENTRY_MESSAGE =
  "This field looks sensitive. Enter it privately on the page; the assistant will not speak or fill it.";
