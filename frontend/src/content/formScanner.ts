import { makeFieldId, makeOptionId, makePageVersion } from "../shared/ids";
import { WIDGET_HOST_ID, type FormFieldSnapshot, type FormFieldType, type FormFieldValue, type FormOptionSnapshot, type FormWarning, type GetCurrentFormResult } from "../shared/types";
import { toolFailure } from "../shared/errors";
import { isSensitiveControl, SENSITIVE_MANUAL_ENTRY_MESSAGE } from "./sensitiveFields";

export interface LocalOptionRef {
  option_id: string;
  label: string;
  element: HTMLElement;
}

export interface LocalFieldRef {
  field_id: string;
  question: string;
  help_text?: string;
  type: FormFieldType;
  required: boolean;
  sensitive: boolean;
  elements: HTMLElement[];
  options: LocalOptionRef[];
}

export interface FormScanResult {
  page_version: string;
  page_title: string;
  instructions?: string[];
  fields: FormFieldSnapshot[];
  warnings?: FormWarning[];
  localMap: Map<string, LocalFieldRef>;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function isAssistantHost(el: Element | null): boolean {
  return Boolean(el?.closest?.(`#${WIDGET_HOST_ID}`));
}

export function isVisible(el: HTMLElement, view: Window = window): boolean {
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if ((el as HTMLInputElement).type === "hidden") return false;
  const style = view.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isDisabled(el: HTMLElement): boolean {
  const control = el as HTMLInputElement;
  return Boolean(control.disabled || el.getAttribute("aria-disabled") === "true");
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function describedByText(el: HTMLElement, documentRef: Document): string | undefined {
  const describedBy = el.getAttribute("aria-describedby");
  if (!describedBy) return undefined;
  const parts = describedBy
    .split(/\s+/)
    .map((ref) => documentRef.getElementById(ref)?.textContent)
    .filter(Boolean)
    .join(" ");
  const text = normalizeText(parts);
  return text || undefined;
}

function associatedLabelText(el: HTMLElement, documentRef: Document): string {
  const id = el.getAttribute("id");
  if (id) {
    const label = documentRef.querySelector(`label[for="${cssEscape(id)}"]`);
    if (label) return normalizeText(label.textContent);
  }
  const wrapping = el.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, select, textarea").forEach((n) => n.remove());
    const text = normalizeText(clone.textContent);
    if (text) return text;
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return normalizeText(aria);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((ref) => documentRef.getElementById(ref)?.textContent)
      .filter(Boolean)
      .join(" ");
    if (parts) return normalizeText(parts);
  }
  const legend = el.closest("fieldset")?.querySelector("legend");
  if (legend) return normalizeText(legend.textContent);
  const title = el.getAttribute("title");
  if (title) return normalizeText(title);
  return normalizeText(el.getAttribute("placeholder") || el.getAttribute("name") || el.id);
}

function mapInputType(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): FormFieldType | null {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  const t = (el.type || "text").toLowerCase();
  if (t === "radio") return "radio";
  if (t === "checkbox") return "checkbox";
  if (t === "email") return "email";
  if (t === "tel") return "tel";
  if (t === "number") return "number";
  if (t === "date") return "date";
  if (t === "password") return "text";
  if (t === "text" || t === "search" || t === "url") return "text";
  return null;
}

function optionLabelForInput(input: HTMLInputElement, documentRef: Document): string {
  const wrapping = input.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input").forEach((n) => n.remove());
    const text = normalizeText(clone.textContent);
    if (text) return text;
  }
  if (input.id) {
    // Multiple labels can share the same for= attribute (e.g. an empty spacer label
    // followed by the real label). Pick the first one with non-empty text.
    const labels = documentRef.querySelectorAll(`label[for="${cssEscape(input.id)}"]`);
    for (const label of Array.from(labels)) {
      const text = normalizeText(label.textContent);
      if (text) return text;
    }
  }
  // Fall back to the input's own title, then aria-label, then value.
  const title = input.getAttribute("title");
  if (title && normalizeText(title)) return normalizeText(title);
  return normalizeText(input.getAttribute("aria-label") || input.value || "Option");
}

export function readCurrentValue(field: LocalFieldRef): FormFieldValue {
  if (field.type === "radio") {
    const checked = field.options.find((o) => (o.element as HTMLInputElement).checked);
    return checked ? checked.label : null;
  }
  if (field.type === "checkbox") {
    if (field.options.length > 1 && field.elements.length > 1) {
      const selected = field.options
        .filter((o) => (o.element as HTMLInputElement).checked)
        .map((o) => o.label);
      return selected.length ? selected : null;
    }
    const el = field.elements[0] as HTMLInputElement;
    return el.checked;
  }
  if (field.type === "select") {
    const select = field.elements[0] as HTMLSelectElement;
    const opt = select.selectedOptions[0];
    return opt ? normalizeText(opt.textContent) : null;
  }
  const el = field.elements[0] as HTMLInputElement | HTMLTextAreaElement;
  return el.value ? el.value : null;
}

function valueForSnapshot(field: LocalFieldRef): FormFieldValue {
  return readCurrentValue(field);
}

function collectControls(
  documentRef: Document,
): Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
  return Array.from(
    documentRef.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    ),
  ).filter((el) => {
    if (isAssistantHost(el)) return false;
    if (el instanceof HTMLInputElement) {
      const t = (el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "file"].includes(t)) {
        return false;
      }
    }
    return true;
  });
}

function collectInstructions(documentRef: Document): string[] | undefined {
  const banner = documentRef.querySelector(".demo-banner, [data-form-instructions]");
  const text = normalizeText(banner?.textContent);
  return text ? [text] : undefined;
}

export function scanForm(documentRef: Document = document): FormScanResult {
  const view = documentRef.defaultView ?? window;
  const all = collectControls(documentRef);
  const localMap = new Map<string, LocalFieldRef>();
  const snapshots: FormFieldSnapshot[] = [];
  const warnings: FormWarning[] = [];
  const consumed = new Set<Element>();
  const versionParts: string[] = [];

  const pushField = (field: LocalFieldRef, includeInSnapshot: boolean): void => {
    localMap.set(field.field_id, field);
    const optionSnaps: FormOptionSnapshot[] = field.options.map(({ option_id, label, element }) => ({
      option_id,
      label,
      selected:
        field.type === "select"
          ? (element as unknown as HTMLOptionElement).selected
          : (element as HTMLInputElement).checked,
    }));
    if (includeInSnapshot) {
      const snapshot: FormFieldSnapshot = {
        field_id: field.field_id,
        question: field.question,
        type: field.type,
        required: field.required,
        current_value: valueForSnapshot(field),
        ...(field.help_text ? { help_text: field.help_text } : {}),
        ...(optionSnaps.length ? { options: optionSnaps } : {}),
      };
      snapshots.push(snapshot);
      versionParts.push(field.field_id, field.type, ...optionSnaps.map((o) => o.option_id));
    }
  };

  for (const el of all) {
    if (consumed.has(el)) continue;

    if (el instanceof HTMLInputElement && el.type === "radio") {
      const name = el.name || el.id || `radio-${localMap.size}`;
      // Scope the group to the same form element so two <form>s with the same
      // radio name attribute are not collapsed into one field (B5).
      const ownerForm = el.form ?? el.closest("form");
      const group = all.filter(
        (c): c is HTMLInputElement =>
          c instanceof HTMLInputElement &&
          c.type === "radio" &&
          (c.name || c.id) === name &&
          (c.form ?? c.closest("form")) === ownerForm,
      );
      group.forEach((g) => consumed.add(g));

      const legendText = normalizeText(
        group[0].closest("fieldset")?.querySelector("legend")?.textContent,
      );
      const question = legendText || associatedLabelText(group[0], documentRef) || name;
      const field_id = makeFieldId(["radio", name, question]);
      const options: LocalOptionRef[] = group.map((input) => {
        const label = optionLabelForInput(input, documentRef);
        return {
          option_id: makeOptionId([field_id, input.value, label]),
          label,
          element: input,
        };
      });
      const field: LocalFieldRef = {
        field_id,
        question,
        help_text: describedByText(group[0], documentRef),
        type: "radio",
        required: group.some((g) => g.required),
        sensitive: isSensitiveControl(group[0], question),
        elements: group,
        options,
      };
      const visibleEnabled = group.some((g) => isVisible(g, view) && !isDisabled(g));
      if (field.sensitive) {
        warnings.push({
          reason: "SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY",
          message: SENSITIVE_MANUAL_ENTRY_MESSAGE,
          field_label: question,
        });
      }
      pushField(field, visibleEnabled && !field.sensitive);
      continue;
    }

    if (el instanceof HTMLInputElement && el.type === "checkbox" && el.name) {
      const name = el.name;
      const group = all.filter(
        (c): c is HTMLInputElement =>
          c instanceof HTMLInputElement && c.type === "checkbox" && c.name === name,
      );
      if (group.length > 1) {
        group.forEach((g) => consumed.add(g));
        const question = associatedLabelText(group[0], documentRef) || name;
        const field_id = makeFieldId(["checkbox-group", name, question]);
        const options: LocalOptionRef[] = group.map((input) => {
          const label = optionLabelForInput(input, documentRef);
          return {
            option_id: makeOptionId([field_id, input.value, label]),
            label,
            element: input,
          };
        });
        const field: LocalFieldRef = {
          field_id,
          question,
          help_text: describedByText(group[0], documentRef),
          type: "checkbox",
          required: group.some((g) => g.required),
          sensitive: isSensitiveControl(group[0], question),
          elements: group,
          options,
        };
        const visibleEnabled = group.some((g) => isVisible(g, view) && !isDisabled(g));
        if (field.sensitive) {
          warnings.push({
            reason: "SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY",
            message: SENSITIVE_MANUAL_ENTRY_MESSAGE,
            field_label: question,
          });
        }
        pushField(field, visibleEnabled && !field.sensitive);
        continue;
      }
    }

    consumed.add(el);
    const type = mapInputType(el);
    if (!type) continue;

    const question = associatedLabelText(el, documentRef) || el.name || el.id || type;
    const identity = el.name || el.id || `${type}-${localMap.size}`;
    const field_id = makeFieldId([type, identity, question]);
    const sensitive = isSensitiveControl(el, question);

    const options: LocalOptionRef[] = [];
    if (el instanceof HTMLSelectElement) {
      Array.from(el.options).forEach((opt) => {
        if (opt.disabled) return;
        const label = normalizeText(opt.textContent);
        options.push({
          option_id: makeOptionId([field_id, opt.value, label]),
          label,
          element: opt as unknown as HTMLElement,
        });
      });
    } else if (el instanceof HTMLInputElement && el.type === "checkbox") {
      options.push({
        option_id: makeOptionId([field_id, "checked", "true"]),
        label: "true",
        element: el,
      });
      options.push({
        option_id: makeOptionId([field_id, "checked", "false"]),
        label: "false",
        element: el,
      });
    }

    const field: LocalFieldRef = {
      field_id,
      question,
      help_text: describedByText(el, documentRef),
      type,
      required: Boolean((el as HTMLInputElement).required),
      sensitive,
      elements: [el],
      options,
    };
    if (sensitive) {
      warnings.push({
        reason: "SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY",
        message: SENSITIVE_MANUAL_ENTRY_MESSAGE,
        field_label: question,
      });
    }
    const include = isVisible(el, view) && !isDisabled(el) && !sensitive;
    pushField(field, include);
  }

  const page_title = normalizeText(documentRef.title) || "Untitled page";
  const instructions = collectInstructions(documentRef);
  const page_version = makePageVersion([page_title, ...versionParts]);

  return {
    page_version,
    page_title,
    ...(instructions ? { instructions } : {}),
    fields: snapshots,
    ...(warnings.length ? { warnings } : {}),
    localMap,
  };
}

export function toGetCurrentFormResult(scan: FormScanResult, documentRef?: Document): GetCurrentFormResult {
  if (scan.fields.length === 0) {
    const hasForm = Boolean(documentRef?.querySelector("form"));
    if (!hasForm && scan.localMap.size === 0) {
      return toolFailure("NO_SUPPORTED_FORM", "No supported form was found on this page.");
    }
    return toolFailure("NO_FORM_FIELDS", "No form fields were found on this page.");
  }
  return {
    success: true,
    page_version: scan.page_version,
    page_title: scan.page_title,
    ...(scan.instructions ? { instructions: scan.instructions } : {}),
    fields: scan.fields,
    ...(scan.warnings ? { warnings: scan.warnings } : {}),
  };
}

export function isFieldHidden(field: LocalFieldRef, view: Window = window): boolean {
  return field.elements.every((el) => !isVisible(el, view));
}

export function isFieldDisabled(field: LocalFieldRef): boolean {
  return field.elements.every((el) => isDisabled(el));
}

export function isFieldInteractable(field: LocalFieldRef, view: Window = window): boolean {
  return field.elements.some((el) => isVisible(el, view) && !isDisabled(el));
}

export function verifiedValueToString(value: FormFieldValue, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.join(", ");
  return value;
}
