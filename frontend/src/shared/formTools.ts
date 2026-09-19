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
const MAX_OPTIONS_RADIO = 5;
const MAX_QUESTION_LEN = 120;

interface SlimOption {
  option_id: string;
  label: string;
  selected?: true;
}

interface SlimField {
  field_id: string;
  question: string;
  type: string;
  required?: true;
  current_value?: FormFieldValue;
  options?: SlimOption[];
  options_total?: number;
}

interface SlimFormResult {
  success: true;
  page_version: string;
  page_title: string;
  instructions?: string[];
  fields: SlimField[];
  warnings?: Array<{ reason: string; message: string; field_label: string }>;
}

function slimFormResult(result: GetCurrentFormSuccess): SlimFormResult {
  const fields: SlimField[] = result.fields.map((field) => {
    const question =
      field.question.length > MAX_QUESTION_LEN
        ? field.question.slice(0, MAX_QUESTION_LEN - 1) + "…"
        : field.question;

    const slim: SlimField = {
      field_id: field.field_id,
      question,
      type: field.type,
    };

    if (field.required) slim.required = true;

    const cv = field.current_value;
    if (cv !== null && cv !== "" && cv !== false && !(Array.isArray(cv) && cv.length === 0)) {
      slim.current_value = cv;
    }

    if (field.options?.length) {
      const total = field.options.length;
      if (field.type === "select") {
        // Omit options for dropdowns entirely. The form-filler matches the
        // user's spoken answer against the live DOM — the agent does not need
        // option_ids. Only send the count so the agent knows to ask freely.
        slim.options_total = total;
      } else {
        // radio / checkbox: agent must read choices aloud, so include labels.
        const visible = field.options.slice(0, MAX_OPTIONS_RADIO);
        slim.options = visible.map((opt) => {
          const o: SlimOption = { option_id: opt.option_id, label: opt.label };
          if (opt.selected) o.selected = true;
          return o;
        });
        if (total > MAX_OPTIONS_RADIO) {
          slim.options_total = total;
        }
      }
    }

    return slim;
  });

  const slimResult: SlimFormResult = {
    success: true,
    page_version: result.page_version,
    page_title: result.page_title,
    fields,
  };
  if (result.instructions?.length) slimResult.instructions = result.instructions;
  if (result.warnings?.length) slimResult.warnings = result.warnings;
  return slimResult;
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
export function createFormClientTools(getTabId?: () => number | null) {
  return {
    get_current_form: async (): Promise<string> => {
      try {
        return asSlimFormPayload(await getCurrentFormResult(getTabId?.() ?? null));
      } catch {
        return JSON.stringify(
          toolFailure(
            "CONTENT_SCRIPT_UNAVAILABLE",
            "The form page is not connected to the extension.",
          ),
        );
      }
    },

    set_form_answer: async (parameters: Record<string, unknown>): Promise<string> => {
      try {
        return asToolPayload(await setFormAnswerResult(parameters, getTabId?.() ?? null));
      } catch {
        return asToolPayload(
          toolFailure(
            "CONTENT_SCRIPT_UNAVAILABLE",
            "The form page is not connected to the extension.",
          ),
        );
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
