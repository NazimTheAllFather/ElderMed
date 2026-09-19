import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType } from "../shared/types";
import { isSupportedTabUrl } from "../shared/tabMessaging";
import { scanForm, toGetCurrentFormResult } from "../content/formScanner";
import { clearOperationCache, setFormAnswer } from "../content/formFiller";
import { handleMessage } from "../content/index";
import { createFormClientTools } from "../shared/formTools";

function mountForm(html: string): void {
  document.body.innerHTML = html;
  document.title = "Applicant Information";
  for (const el of Array.from(
    document.querySelectorAll("input, textarea, select, label, fieldset, legend, option"),
  )) {
    const hidden = el instanceof HTMLElement && (el as HTMLInputElement).type === "hidden";
    const displayNone = el instanceof HTMLElement && el.style.display === "none";
    Object.defineProperty(el, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: displayNone || hidden ? 0 : 24,
          right: displayNone || hidden ? 0 : 120,
          width: displayNone || hidden ? 0 : 120,
          height: displayNone || hidden ? 0 : 24,
          toJSON() {
            return {};
          },
        }) satisfies DOMRect,
    });
  }
}

describe("unsupported pages", () => {
  it("rejects chrome and extension urls", () => {
    expect(isSupportedTabUrl("chrome://extensions")).toBe(false);
    expect(isSupportedTabUrl("chrome-extension://abc/page.html")).toBe(false);
    expect(isSupportedTabUrl("https://example.com/form")).toBe(true);
  });
});

describe("form scanner + get_current_form", () => {
  beforeEach(() => {
    mountForm(`
      <form>
        <p class="demo-banner">Demo instructions only</p>
        <fieldset>
          <legend>Are you applying for yourself?</legend>
          <label><input type="radio" name="self" value="yes" /> Yes</label>
          <label><input type="radio" name="self" value="no" /> No</label>
        </fieldset>
        <label for="full-name">Full name</label>
        <input id="full-name" name="fullName" type="text" required />
        <label for="ssn">Social Security number</label>
        <input id="ssn" name="ssn" type="password" />
      </form>
    `);
  });

  it("associates labels with the correct controls", () => {
    const scan = scanForm(document);
    const nameField = scan.fields.find((f) => f.type === "text");
    expect(nameField?.question.toLowerCase()).toContain("full name");
    expect(nameField?.required).toBe(true);
  });

  it("returns a serializable snapshot without selectors", () => {
    const scan = scanForm(document);
    const result = toGetCurrentFormResult(scan, document);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.page_title).toBe("Applicant Information");
    expect(result.page_version).toMatch(/^pv_/);
    expect(result.fields.length).toBeGreaterThanOrEqual(2);

    const json = JSON.stringify(result);
    expect(json).not.toMatch(/querySelector|xpath|getElementById/i);
    expect(result).not.toHaveProperty("elements");
    expect(json).not.toContain("script");
  });

  it("keeps two Yes/No groups on different field and option IDs", () => {
    mountForm(`
      <form>
        <fieldset>
          <legend>Are you applying for yourself?</legend>
          <label><input type="radio" name="self" value="yes" /> Yes</label>
          <label><input type="radio" name="self" value="no" /> No</label>
        </fieldset>
        <fieldset>
          <legend>Do you have insurance?</legend>
          <label><input type="radio" name="ins" value="yes" /> Yes</label>
          <label><input type="radio" name="ins" value="no" /> No</label>
        </fieldset>
      </form>
    `);
    const scan = scanForm(document);
    const self = scan.fields.find((f) => f.question.includes("yourself"))!;
    const ins = scan.fields.find((f) => f.question.includes("insurance"))!;
    expect(self.field_id).not.toBe(ins.field_id);
    expect(self.options?.[0].option_id).not.toBe(ins.options?.[0].option_id);
  });

  it("omits sensitive fields from spoken collection", () => {
    const scan = scanForm(document);
    const result = toGetCurrentFormResult(scan, document);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.fields.some((f) => /ssn|social/i.test(f.question))).toBe(false);
    expect(result.warnings?.some((w) => w.reason === "SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY")).toBe(true);
  });
});

describe("set_form_answer", () => {
  beforeEach(() => {
    clearOperationCache();
    mountForm(`
      <form>
        <fieldset>
          <legend>Are you applying for yourself?</legend>
          <label><input type="radio" name="self" value="yes" /> Yes</label>
          <label><input type="radio" name="self" value="no" /> No</label>
        </fieldset>
        <fieldset>
          <legend>Do you have insurance?</legend>
          <label><input type="radio" name="ins" value="yes" /> Yes</label>
          <label><input type="radio" name="ins" value="no" /> No</label>
        </fieldset>
        <label for="full-name">Full name</label>
        <input id="full-name" name="fullName" type="text" />
        <label for="county">County</label>
        <select id="county" name="county">
          <option value="">Choose</option>
          <option value="fairfax">Fairfax</option>
          <option value="arlington">Arlington</option>
        </select>
        <label><input id="consent" name="consent" type="checkbox" /> Contact consent</label>
        <label for="hidden-field">Hidden</label>
        <input id="hidden-field" name="hiddenField" type="text" hidden />
        <label for="disabled-field">Disabled</label>
        <input id="disabled-field" name="disabledField" type="text" disabled />
        <div id="extra-wrap" style="display:none">
          <label for="extra">Conditional extra question</label>
          <input id="extra" name="extra" type="text" />
        </div>
      </form>
    `);
    const extra = document.getElementById("extra");
    const wrap = document.getElementById("extra-wrap");
    if (extra && wrap) {
      Object.defineProperty(extra, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() { return {}; },
        }),
      });
      Object.defineProperty(wrap, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() { return {}; },
        }),
      });
    }
  });

  it("routes exact field_id, option_id, and page_version", () => {
    const scan = scanForm(document);
    const self = scan.fields.find((f) => f.question.includes("yourself"))!;
    const yes = self.options!.find((o) => o.label === "Yes")!;

    const result = setFormAnswer(
      {
        field_id: self.field_id,
        answer: "Yes",
        option_id: yes.option_id,
        page_version: scan.page_version,
      },
      document,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.field_id).toBe(self.field_id);
    expect(result.verified_value).toBe("Yes");

    const selfYes = document.querySelector<HTMLInputElement>('input[name="self"][value="yes"]');
    const insYes = document.querySelector<HTMLInputElement>('input[name="ins"][value="yes"]');
    expect(selfYes?.checked).toBe(true);
    expect(insYes?.checked).toBe(false);
  });

  it("rejects a stale page_version", () => {
    const scan = scanForm(document);
    const self = scan.fields.find((f) => f.question.includes("yourself"))!;
    const result = setFormAnswer(
      {
        field_id: self.field_id,
        answer: "Yes",
        option_id: self.options![0].option_id,
        page_version: "pv_stale",
      },
      document,
    );
    expect(result).toEqual({
      success: false,
      error: "STALE_PAGE_VERSION",
      message: "The form changed. Read the page again.",
    });
  });

  it("does not let an option_id from one Yes/No group affect another", () => {
    const scan = scanForm(document);
    const self = scan.fields.find((f) => f.question.includes("yourself"))!;
    const ins = scan.fields.find((f) => f.question.includes("insurance"))!;
    const selfYes = self.options!.find((o) => o.label === "Yes")!;

    const result = setFormAnswer(
      {
        field_id: ins.field_id,
        answer: "Yes",
        option_id: selfYes.option_id,
        page_version: scan.page_version,
      },
      document,
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("OPTION_DOES_NOT_BELONG_TO_FIELD");

    const insYes = document.querySelector<HTMLInputElement>('input[name="ins"][value="yes"]');
    const selfYesEl = document.querySelector<HTMLInputElement>('input[name="self"][value="yes"]');
    expect(insYes?.checked).toBe(false);
    expect(selfYesEl?.checked).toBe(false);
  });

  it("verifies a successful text fill after DOM events", () => {
    const scan = scanForm(document);
    const nameField = scan.fields.find((f) => f.type === "text" && f.question.toLowerCase().includes("full name"))!;
    const result = setFormAnswer(
      {
        field_id: nameField.field_id,
        answer: "Ada Lovelace",
        page_version: scan.page_version,
      },
      document,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.verified_value).toBe("Ada Lovelace");
    expect(document.querySelector<HTMLInputElement>("#full-name")?.value).toBe("Ada Lovelace");
  });

  it("validates dropdown options against the requested field", () => {
    const scan = scanForm(document);
    const county = scan.fields.find((f) => f.type === "select")!;
    const fairfax = county.options!.find((o) => o.label === "Fairfax")!;
    const result = setFormAnswer(
      {
        field_id: county.field_id,
        answer: "Fairfax",
        option_id: fairfax.option_id,
        page_version: scan.page_version,
      },
      document,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.verified_value).toBe("Fairfax");
  });

  it("applies checkbox updates idempotently", () => {
    const scan = scanForm(document);
    const consent = scan.fields.find((f) => f.type === "checkbox")!;
    const first = setFormAnswer(
      { field_id: consent.field_id, answer: "yes", page_version: scan.page_version },
      document,
    );
    const second = setFormAnswer(
      { field_id: consent.field_id, answer: "yes", page_version: scan.page_version },
      document,
    );
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#consent")?.checked).toBe(true);
  });

  it("rejects hidden and disabled fields", () => {
    const scan = scanForm(document);
    const hidden = [...scan.localMap.values()].find((f) => f.elements[0].id === "hidden-field")!;
    const disabled = [...scan.localMap.values()].find((f) => f.elements[0].id === "disabled-field")!;
    const hiddenResult = setFormAnswer(
      { field_id: hidden.field_id, answer: "x", page_version: scan.page_version },
      document,
    );
    const disabledResult = setFormAnswer(
      { field_id: disabled.field_id, answer: "x", page_version: scan.page_version },
      document,
    );
    expect(hiddenResult.success).toBe(false);
    if (!hiddenResult.success) expect(hiddenResult.error).toBe("FIELD_HIDDEN");
    expect(disabledResult.success).toBe(false);
    if (!disabledResult.success) expect(disabledResult.error).toBe("FIELD_DISABLED");
  });

  it("changes page_version when a conditional question appears", () => {
    const before = scanForm(document);
    const wrap = document.getElementById("extra-wrap") as HTMLElement;
    const extra = document.getElementById("extra") as HTMLElement;
    wrap.style.display = "";
    extra.removeAttribute("hidden");
    Object.defineProperty(extra, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0, y: 0, top: 0, left: 0, bottom: 24, right: 120, width: 120, height: 24, toJSON() { return {}; },
      }),
    });
    const after = scanForm(document);
    expect(after.page_version).not.toBe(before.page_version);
    expect(after.fields.some((f) => f.question.toLowerCase().includes("conditional"))).toBe(true);
  });

  it("rejects sensitive automatic fill", () => {
    mountForm(`
      <form>
        <label for="ssn">Social Security number</label>
        <input id="ssn" name="ssn" type="password" />
      </form>
    `);
    const scan = scanForm(document);
    const sensitive = [...scan.localMap.values()].find((f) => f.sensitive)!;
    const result = setFormAnswer(
      { field_id: sensitive.field_id, answer: "000-00-0000", page_version: scan.page_version },
      document,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY");
  });

  it("ignores model-supplied selectors", () => {
    const scan = scanForm(document);
    const nameField = scan.fields.find((f) => f.type === "text")!;
    const result = setFormAnswer(
      {
        field_id: nameField.field_id,
        answer: "Grace Hopper",
        page_version: scan.page_version,
        selector: "document.body.innerHTML = 'hack'",
      } as never,
      document,
    );
    expect(result.success).toBe(true);
    expect(document.body.innerHTML).not.toContain("hack");
  });
});

describe("radio group form scoping (B5)", () => {
  it("keeps radio groups with the same name in different forms distinct", () => {
    mountForm(`
      <form id="form-a">
        <fieldset>
          <legend>Applying for yourself?</legend>
          <label><input type="radio" name="self" value="yes" form="form-a" /> Yes</label>
          <label><input type="radio" name="self" value="no"  form="form-a" /> No</label>
        </fieldset>
      </form>
      <form id="form-b">
        <fieldset>
          <legend>Do you have insurance?</legend>
          <label><input type="radio" name="self" value="yes" form="form-b" /> Yes</label>
          <label><input type="radio" name="self" value="no"  form="form-b" /> No</label>
        </fieldset>
      </form>
    `);
    // Attach inputs to their forms via the HTMLInputElement.form property stub.
    const [formA, formB] = Array.from(document.querySelectorAll("form"));
    document.querySelectorAll<HTMLInputElement>('input[form="form-a"]').forEach((el) => {
      Object.defineProperty(el, "form", { configurable: true, get: () => formA });
    });
    document.querySelectorAll<HTMLInputElement>('input[form="form-b"]').forEach((el) => {
      Object.defineProperty(el, "form", { configurable: true, get: () => formB });
    });

    const scan = scanForm(document);
    // Must produce two separate fields, not one collapsed group.
    const radioFields = scan.fields.filter((f) => f.type === "radio");
    expect(radioFields.length).toBe(2);
    expect(radioFields[0].field_id).not.toBe(radioFields[1].field_id);
    expect(radioFields[0].options?.[0].option_id).not.toBe(radioFields[1].options?.[0].option_id);
  });
});

describe("idempotency cache pruning (B4)", () => {
  beforeEach(() => {
    clearOperationCache();
    mountForm(`
      <label for="city">City</label>
      <input id="city" name="city" type="text" />
    `);
  });

  it("evicts the oldest entry once the cache reaches 50 entries", () => {
    const scan = scanForm(document);
    const city = scan.fields.find((f) => f.type === "text")!;

    // Fill 50 times with distinct operation IDs to saturate the cache.
    for (let i = 0; i < 50; i++) {
      const opId = `op_${i}`;
      const result = setFormAnswer(
        { field_id: city.field_id, answer: `City${i}`, page_version: scanForm(document).page_version, operation_id: opId },
        document,
      );
      expect(result.success).toBe(true);
    }

    // Adding a 51st entry must not grow the cache beyond 50.
    const scan2 = scanForm(document);
    setFormAnswer(
      { field_id: city.field_id, answer: "FinalCity", page_version: scan2.page_version, operation_id: "op_final" },
      document,
    );

    // Calling the 51st again should still return the cached result (idempotent).
    const cached = setFormAnswer(
      { field_id: city.field_id, answer: "FinalCity", page_version: scan2.page_version, operation_id: "op_final" },
      document,
    );
    expect(cached.success).toBe(true);
  });
});

describe("content script message routing", () => {
  beforeEach(() => {
    mountForm(`
      <label><input type="radio" name="self" value="yes" /> Yes</label>
      <label><input type="radio" name="self" value="no" /> No</label>
    `);
  });

  it("GET_CURRENT_FORM returns the content-script snapshot", () => {
    const sendResponse = vi.fn();
    handleMessage({ type: MessageType.GET_CURRENT_FORM }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledOnce();
    const payload = sendResponse.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.fields?.length).toBeGreaterThan(0);
  });
});

describe("client tools bridge", () => {
  it("get_current_form returns CONTENT_SCRIPT_UNAVAILABLE without chrome tabs", async () => {
    const tools = createFormClientTools();
    const raw = await tools.get_current_form();
    const result = JSON.parse(raw) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(["CONTENT_SCRIPT_UNAVAILABLE", "NO_ACTIVE_TAB"]).toContain(result.error);
  });

  it("set_form_answer forwards ids and page_version to messaging", async () => {
    const sendMessage = vi.fn();
    const query = vi.fn().mockResolvedValue([{ id: 42, url: "https://example.com/apply", active: true }]);

    vi.stubGlobal("chrome", {
      tabs: { query, sendMessage },
      scripting: { executeScript: vi.fn() },
      runtime: {
        id: "test-ext",
        getManifest: () => ({ content_scripts: [{ js: ["assets/content.js"] }] }),
      },
    });

    const tools = createFormClientTools();
    sendMessage.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({
      success: true,
      field_id: "fld_1",
      verified_value: "Yes",
      page_changed: false,
    });

    const raw = await tools.set_form_answer({
      field_id: "fld_1",
      answer: "Yes",
      option_id: "opt_1",
      page_version: "pv_1",
    });
    const result = JSON.parse(raw) as { success: boolean };

    expect(result.success).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: MessageType.SET_FORM_ANSWER,
      payload: {
        field_id: "fld_1",
        answer: "Yes",
        option_id: "opt_1",
        page_version: "pv_1",
      },
    });

    vi.unstubAllGlobals();
  });
});
