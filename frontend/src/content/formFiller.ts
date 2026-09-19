import type { SetFormAnswerParams, SetFormAnswerResult } from "../shared/types";
import { toolFailure } from "../shared/errors";
import {
  isFieldDisabled,
  isFieldHidden,
  isFieldInteractable,
  readCurrentValue,
  scanForm,
  verifiedValueToString,
  type LocalFieldRef,
  type LocalOptionRef,
} from "./formScanner";
import { SENSITIVE_MANUAL_ENTRY_MESSAGE } from "./sensitiveFields";

const recentOperations = new Map<string, SetFormAnswerResult>();
const MAX_RECENT_OPERATIONS = 50;
const HIGHLIGHT_CLASS = "eldermed-field-highlight";

function dispatchInputEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}

function valuesMatch(expected: string, actual: string | null): boolean {
  if (actual == null) return false;
  return normalize(expected) === normalize(actual);
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function resolveOption(
  field: LocalFieldRef,
  params: SetFormAnswerParams,
): { option: LocalOptionRef | null; error?: SetFormAnswerResult } {
  if (params.option_id) {
    const exact = field.options.find((o) => o.option_id === params.option_id);
    if (!exact) {
      return {
        option: null,
        error: toolFailure(
          "OPTION_DOES_NOT_BELONG_TO_FIELD",
          "option_id does not belong to this field.",
        ),
      };
    }
    return { option: exact };
  }

  const ans = normalize(params.answer);
  const labeled = field.options.filter((o) => normalize(o.label).length > 0);

  // 1. Exact match after normalization
  const exact = labeled.filter((o) => normalize(o.label) === ans);
  if (exact.length > 1) {
    return { option: null, error: toolFailure("AMBIGUOUS_OPTION", "Multiple options match that answer for this field.") };
  }
  if (exact.length === 1) return { option: exact[0] };

  // 2. Fuzzy: the option label appears inside the user's answer (e.g. "i'm married" → "Married")
  const labelInAnswer = labeled.filter((o) => ans.includes(normalize(o.label)) && normalize(o.label).length > 1);
  if (labelInAnswer.length === 1) {
    console.log("[ElderMed] fuzzy match (label-in-answer):", labelInAnswer[0].label, "for answer:", params.answer);
    return { option: labelInAnswer[0] };
  }

  // 3. Fuzzy: the user's answer appears inside the option label (e.g. "single" → "Single person")
  const answerInLabel = labeled.filter((o) => normalize(o.label).includes(ans) && ans.length > 1);
  if (answerInLabel.length === 1) {
    console.log("[ElderMed] fuzzy match (answer-in-label):", answerInLabel[0].label, "for answer:", params.answer);
    return { option: answerInLabel[0] };
  }

  console.warn("[ElderMed] OPTION_NOT_FOUND: answer", JSON.stringify(params.answer), "options:", labeled.map((o) => o.label));
  return {
    option: null,
    error: toolFailure("OPTION_NOT_FOUND", "No option on this field matches the requested answer."),
  };
}

function ensureHighlightStyle(documentRef: Document): void {
  if (documentRef.getElementById("eldermed-highlight-style")) return;
  const style = documentRef.createElement("style");
  style.id = "eldermed-highlight-style";
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 3px solid #0f6b5c !important;
      outline-offset: 3px !important;
    }
  `;
  documentRef.head.appendChild(style);
}

function highlightField(field: LocalFieldRef, documentRef: Document): void {
  const target = field.elements[0];
  if (!target) return;
  ensureHighlightStyle(documentRef);
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }
  target.classList.add(HIGHLIGHT_CLASS);
  target.setAttribute("data-eldermed-highlight", "true");
  window.setTimeout(() => {
    target.classList.remove(HIGHLIGHT_CLASS);
    target.removeAttribute("data-eldermed-highlight");
  }, 1600);
}

function applyToField(field: LocalFieldRef, params: SetFormAnswerParams): string {
  if (field.type === "radio") {
    const resolved = resolveOption(field, params);
    if (resolved.error) throw resolved.error;
    if (!resolved.option) {
      throw toolFailure("OPTION_NOT_FOUND", "No option on this field matches the requested answer.");
    }
    const input = resolved.option.element as HTMLInputElement;
    if (!input.checked) {
      input.click();
    }
    if (!input.checked) {
      input.checked = true;
      dispatchInputEvents(input);
    }
    return resolved.option.label;
  }

  if (field.type === "checkbox") {
    if (field.elements.length > 1) {
      const resolved = resolveOption(field, params);
      if (resolved.error) throw resolved.error;
      if (!resolved.option) {
        throw toolFailure("OPTION_NOT_FOUND", "No option on this field matches the requested answer.");
      }
      const input = resolved.option.element as HTMLInputElement;
      const wantChecked = !["false", "no", "0", "off"].includes(normalize(params.answer));
      if (input.checked !== wantChecked) {
        input.click();
      }
      if (input.checked !== wantChecked) {
        input.checked = wantChecked;
        dispatchInputEvents(input);
      }
      return verifiedValueToString(readCurrentValue(field), resolved.option.label);
    }

    const input = field.elements[0] as HTMLInputElement;
    let wantChecked: boolean;
    if (params.option_id) {
      const resolved = resolveOption(field, params);
      if (resolved.error) throw resolved.error;
      const label = normalize(resolved.option?.label ?? "");
      wantChecked = label === "true" || label === "yes";
    } else {
      wantChecked = ["true", "yes", "1", "on", "checked"].includes(normalize(params.answer));
    }
    if (input.checked !== wantChecked) {
      input.click();
    }
    if (input.checked !== wantChecked) {
      input.checked = wantChecked;
      dispatchInputEvents(input);
    }
    return input.checked ? "true" : "false";
  }

  if (field.type === "select") {
    const select = field.elements[0] as HTMLSelectElement;
    const resolved = resolveOption(field, params);
    if (resolved.error) throw resolved.error;
    if (!resolved.option) {
      throw toolFailure("OPTION_NOT_FOUND", "No option on this field matches the requested answer.");
    }
    const htmlOption = resolved.option.element as unknown as HTMLOptionElement;
    if (select.options.namedItem(htmlOption.value) !== htmlOption && htmlOption.parentElement !== select) {
      throw toolFailure("OPTION_DOES_NOT_BELONG_TO_FIELD", "The option does not belong to this select field.");
    }
    select.value = htmlOption.value;
    dispatchInputEvents(select);
    return resolved.option.label;
  }

  const input = field.elements[0] as HTMLInputElement | HTMLTextAreaElement;
  input.focus();
  setNativeValue(input, params.answer);
  dispatchInputEvents(input);
  return params.answer;
}

export function setFormAnswer(
  params: SetFormAnswerParams,
  documentRef: Document = document,
): SetFormAnswerResult {
  if (params.operation_id && recentOperations.has(params.operation_id)) {
    return recentOperations.get(params.operation_id)!;
  }

  if (!params.field_id || !params.page_version) {
    return toolFailure("INVALID_REQUEST", "field_id and page_version are required.");
  }

  const before = scanForm(documentRef);
  if (before.page_version !== params.page_version) {
    console.warn("[ElderMed] STALE_PAGE_VERSION: received", params.page_version, "current", before.page_version);
    return toolFailure("STALE_PAGE_VERSION", "The form changed. Read the page again.");
  }

  const field = before.localMap.get(params.field_id);
  if (!field) {
    console.warn("[ElderMed] FIELD_NOT_FOUND: field_id", params.field_id, "not in localMap. Available:", [...before.localMap.keys()]);
    return toolFailure("FIELD_NOT_FOUND", "Unknown field_id for the current page.");
  }

  if (field.sensitive) {
    return toolFailure("SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY", SENSITIVE_MANUAL_ENTRY_MESSAGE);
  }

  if (field.elements.length === 0) {
    return toolFailure("AMBIGUOUS_OPTION", "The field mapping is empty or ambiguous.");
  }

  const view = documentRef.defaultView ?? window;
  if (isFieldHidden(field, view)) {
    return toolFailure("FIELD_HIDDEN", "The target field is hidden.");
  }
  if (isFieldDisabled(field) || !isFieldInteractable(field, view)) {
    return toolFailure("FIELD_DISABLED", "The target field is disabled.");
  }

  const unsupported = !["text", "textarea", "number", "date", "email", "tel", "radio", "checkbox", "select"].includes(
    field.type,
  );
  if (unsupported) {
    return toolFailure("UNSUPPORTED_FIELD_TYPE", "This control type cannot be filled automatically.");
  }

  console.log("[ElderMed] setFormAnswer: field", params.field_id, "type", field.type, "answer", params.answer, "option_id", params.option_id);
  let expectedLabel: string;
  try {
    expectedLabel = applyToField(field, params);
  } catch (err) {
    if (err && typeof err === "object" && "success" in err && (err as SetFormAnswerResult).success === false) {
      console.warn("[ElderMed] applyToField error:", err);
      return err as SetFormAnswerResult;
    }
    console.warn("[ElderMed] applyToField threw:", err);
    return toolFailure("UPDATE_FAILED", "The DOM update could not be applied.");
  }

  highlightField(field, documentRef);

  const mid = scanForm(documentRef);
  const updated = mid.localMap.get(params.field_id);
  if (!updated) {
    return toolFailure("VERIFICATION_FAILED", "Field disappeared after update.");
  }
  const verified = verifiedValueToString(readCurrentValue(updated), expectedLabel);
  console.log("[ElderMed] verification: expected", expectedLabel, "answer", params.answer, "actual", verified);
  if (!valuesMatch(expectedLabel, verified) && !valuesMatch(params.answer, verified)) {
    if (
      !(
        verified &&
        normalize(verified)
          .split(",")
          .map((part) => part.trim())
          .includes(normalize(expectedLabel))
      )
    ) {
      console.warn("[ElderMed] VERIFICATION_FAILED: expected", expectedLabel, "but DOM has", verified);
      return toolFailure(
        "VERIFICATION_FAILED",
        "The requested value did not remain selected or entered.",
      );
    }
  }

  const after = scanForm(documentRef);
  const page_changed = after.page_version !== before.page_version;

  const result: SetFormAnswerResult = {
    success: true,
    field_id: params.field_id,
    verified_value: verified,
    page_changed,
  };

  if (params.operation_id) {
    if (recentOperations.size >= MAX_RECENT_OPERATIONS) {
      const oldest = recentOperations.keys().next().value;
      if (oldest !== undefined) recentOperations.delete(oldest);
    }
    recentOperations.set(params.operation_id, result);
  }

  return result;
}

/** Test helper to clear idempotency cache. */
export function clearOperationCache(): void {
  recentOperations.clear();
}
