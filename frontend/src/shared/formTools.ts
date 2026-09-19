import type {
  FormFieldValue,
  GetCurrentFormResult,
  GetCurrentFormSuccess,
  SetFormAnswerParams,
  SetFormAnswerResult,
} from "./types";
import { requestCurrentForm, requestSetFormAnswer } from "./tabMessaging";
import {
  isEmbeddedInPageHost,
  requestCurrentFormViaHost,
  requestSetFormAnswerViaHost,
} from "./hostBridge";
import { toolFailure } from "./errors";

/**
 * ElevenLabs silently truncates large client tool responses before the LLM
 * receives them (~4 KB observed limit).  A full 31-field Virginia DSS form
 * with county/state dropdowns can reach 10–15 KB.
 *
 * This function produces a slimmed snapshot:
 *  - Strips help_text (not useful in spoken context)
 *  - Omits current_value when null / empty / false (agent assumes empty)
 *  - Omits selected:false from options (agent assumes unselected)
 *  - Omits required:false (agent assumes optional)
 *  - For select (dropdown) fields: omits options entirely; only options_total
 *    is sent so the agent knows to ask the user to speak freely. The
 *    form-filler resolves the spoken answer against the live DOM.
 *  - For radio/checkbox fields: caps at MAX_OPTIONS_RADIO; adds options_total
 *    when truncated.
 *  - Truncates long question text at MAX_QUESTION_LEN characters.
 */
/**
 * Compact payload key names. field_id and page_version use their full names so
 * the AI can pass them directly to set_form_answer without any mental mapping.
 *
 *  field_id     = pass as field_id in set_form_answer
 *  page_version = pass as page_version in set_form_answer
 *  q            = question (truncated)
 *  t            = type
 *  r            = required (only present when true)
 *  cv           = current_value (only present when non-empty)
 *  o            = options array  (radio/checkbox only; each: {l, option_id?, sel?})
 *  ot           = options_total  (select: total count; radio: total when >MAX)
 *
 * Fields array comes first so the LLM receives field data even if the string
 * is truncated before the trailing metadata.
 */
const MAX_OPTIONS_RADIO = 4;
const MAX_QUESTION_LEN = 80;

interface CompactOption {
  l: string;         // label
  option_id?: string; // option_id (radio/checkbox only, for use in set_form_answer)
  sel?: true;        // currently selected
}

interface CompactField {
  field_id: string;  // pass as field_id in set_form_answer
  q: string;         // question
  t: string;         // type
  r?: true;          // required
  cv?: FormFieldValue; // current_value
  o?: CompactOption[];
  ot?: number;       // options_total
}

interface CompactFormResult {
  fields: CompactField[];
  page_version: string; // pass as page_version in set_form_answer
}

function isPlaceholderValue(cv: FormFieldValue): boolean {
  if (cv === null || cv === "" || cv === false) return true;
  if (Array.isArray(cv) && cv.length === 0) return true;
  // Dropdown placeholder strings like "--", "---", "Select...", "Choose one"
  if (typeof cv === "string") {
    const t = cv.trim();
    if (/^-+$/.test(t)) return true; // "--", "---", etc.
    if (/^(select|choose|pick)\b/i.test(t)) return true;
  }
  return false;
}

function slimFormResult(result: GetCurrentFormSuccess): CompactFormResult {
  const fields: CompactField[] = [];

  for (const field of result.fields) {
    const q =
      field.question.length > MAX_QUESTION_LEN
        ? field.question.slice(0, MAX_QUESTION_LEN - 1) + "…"
        : field.question;

    const slim: CompactField = { field_id: field.field_id, q, t: field.type };

    if (field.required) slim.r = true;

    const cv = field.current_value;
    if (!isPlaceholderValue(cv)) {
      slim.cv = cv;
    }

    if (field.options?.length) {
      const total = field.options.length;
      if (field.type === "select") {
        slim.ot = total;
      } else {
        // radio / checkbox: filter empty-label options (decorative/hidden inputs).
        // If ALL options have empty labels the field has no speakable choices —
        // skip it entirely so the LLM is not confused by a radio with no options.
        const labeled = field.options.filter((opt) => opt.label.trim() !== "");
        if (labeled.length === 0) continue; // skip this field
        const visible = labeled.slice(0, MAX_OPTIONS_RADIO);
        slim.o = visible.map((opt) => {
          const o: CompactOption = { l: opt.label, option_id: opt.option_id };
          if (opt.selected) o.sel = true;
          return o;
        });
        if (labeled.length > MAX_OPTIONS_RADIO) slim.ot = labeled.length;
      }
    }

    fields.push(slim);
  }

  // Fields array first so the LLM receives field data even under aggressive truncation.
  return { fields, page_version: result.page_version };
}

/**
 * ElevenLabs client tools must return string | number | void.
 * Structured form payloads are JSON-encoded for the agent.
 * get_current_form uses the slimmed snapshot to stay within the LLM context limit.
 */
function asSlimFormPayload(result: GetCurrentFormResult): string {
  if (result.success) return JSON.stringify(slimFormResult(result));
  return JSON.stringify(result);
}

function asToolPayload(result: SetFormAnswerResult): string {
  return JSON.stringify(result);
}

function isUnavailable(result: { success: boolean; error?: string }): boolean {
  return result.success === false && result.error === "CONTENT_SCRIPT_UNAVAILABLE";
}

async function getCurrentFormResult(boundTabId: number | null): Promise<GetCurrentFormResult> {
  if (isEmbeddedInPageHost()) {
    const hostResult = await requestCurrentFormViaHost();
    if (!isUnavailable(hostResult)) return hostResult;
    // Fall back to tabs messaging if the page host bridge is stale.
  }
  return requestCurrentForm(boundTabId);
}

async function setFormAnswerResult(
  parameters: Record<string, unknown>,
  boundTabId: number | null,
): Promise<SetFormAnswerResult> {
  const payload: SetFormAnswerParams = {
    field_id: String(parameters.field_id ?? ""),
    answer: String(parameters.answer ?? ""),
    option_id: parameters.option_id == null ? undefined : String(parameters.option_id),
    page_version: String(parameters.page_version ?? ""),
    operation_id:
      parameters.operation_id == null ? undefined : String(parameters.operation_id),
  };
  if (isEmbeddedInPageHost()) {
    const hostResult = await requestSetFormAnswerViaHost(payload);
    if (!isUnavailable(hostResult)) return hostResult;
  }
  return requestSetFormAnswer(payload, boundTabId);
}

/**
 * Client tools registered with ElevenLabs. Names must match the agent dashboard exactly.
 *
 * @param getTabId  Optional getter that returns the tab ID captured when the session
 *                  started.  Used by the side-panel path to prevent tool calls from
 *                  targeting a different tab if the user switches tabs mid-session.
 *                  The floating-widget path is already bound to the host document and
 *                  does not need this.
 */
export function createFormClientTools(
  getTabId?: () => number | null,
  onFilling?: () => void,
  onFilled?: () => void,
) {
  return {
    get_current_form: async (): Promise<string> => {
      console.log("[ElderMed] client tool get_current_form called by ElevenLabs AI");
      try {
        const payload = asSlimFormPayload(await getCurrentFormResult(getTabId?.() ?? null));
        console.log("[ElderMed] get_current_form → returning to AI:", payload);
        return payload;
      } catch (err) {
        const failure = JSON.stringify(
          toolFailure(
            "CONTENT_SCRIPT_UNAVAILABLE",
            "The form page is not connected to the extension.",
          ),
        );
        console.warn("[ElderMed] get_current_form failed:", err, "→ returning:", failure);
        return failure;
      }
    },

    set_form_answer: async (parameters: Record<string, unknown>): Promise<string> => {
      console.log("[ElderMed] client tool set_form_answer called by ElevenLabs AI, params:", parameters);
      onFilling?.();
      try {
        const result = asToolPayload(await setFormAnswerResult(parameters, getTabId?.() ?? null));
        console.log("[ElderMed] set_form_answer → returning to AI:", result);
        onFilled?.();
        return result;
      } catch (err) {
        const failure = asToolPayload(
          toolFailure(
            "CONTENT_SCRIPT_UNAVAILABLE",
            "The form page is not connected to the extension.",
          ),
        );
        console.warn("[ElderMed] set_form_answer failed:", err, "→ returning:", failure);
        onFilled?.();
        return failure;
      }
    },
  };
}

/** Used by the widget UI to verify page linkage before / during a session. */
export async function probeFormConnection(): Promise<{ ok: boolean; detail: string }> {
  try {
    // Probe always uses the active tab (no bound session yet at this point).
    const result = await getCurrentFormResult(null);
    if (result.success) {
      const count = result.fields.length;
      return {
        ok: true,
        detail: `Form linked (${count} field${count === 1 ? "" : "s"}).`,
      };
    }
    return { ok: false, detail: result.message || result.error };
  } catch {
    return { ok: false, detail: "The form page is not connected to the extension." };
  }
}

export function getApiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!url) return null;
  return url.replace(/\/$/, "");
}
