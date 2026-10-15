/// <reference lib="dom" />
// Callbacks passed to evaluate run inside the browser page, so they need DOM types.
import type { Locator, Page } from "playwright-core";
import type { FieldPlan, FormField } from "@studio/shared";
import type { ReadBack } from "./filled-values.js";
import { KEY_ATTRIBUTE } from "./form-reader.js";

export type AttachmentFile = { name: string; mimeType: string; buffer: Buffer };

const TEXT_KINDS = new Set(["TEXT", "EMAIL", "PHONE", "URL", "NUMBER", "DATE", "TEXTAREA"]);
const SUGGESTION_WAIT_MS = 1_500;

function byKey(page: Page, key: string): Locator {
  return page.locator(`[${KEY_ATTRIBUTE}="${key}"]`);
}

function loose(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Fills each planned field on the page (Milestone 3, spec section 5 step 7). It types,
// selects, checks and attaches. It never clicks a submit button or presses Enter in a field.
// A field it cannot fill is left as the page had it, and the read-back reports it.
export async function fillForm(
  page: Page,
  fields: FormField[],
  plan: FieldPlan[],
  loadFile: (documentId: string) => Promise<AttachmentFile>,
): Promise<ReadBack> {
  const byFieldKey = new Map(fields.map((field) => [field.key, field]));
  for (const item of plan) {
    if (item.status !== "FILLED" || item.value === null) continue;
    const field = byFieldKey.get(item.key);
    if (!field) continue;
    const target = byKey(page, item.key).first();
    try {
      if (item.kind === "FILE" && item.documentId) {
        const file = await loadFile(item.documentId);
        await target.setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer });
      } else if (TEXT_KINDS.has(item.kind)) {
        await target.fill(item.value);
      } else if (item.kind === "SELECT") {
        await target.selectOption({ label: item.value });
      } else if (item.kind === "COMBOBOX") {
        await fillCombobox(page, target, item.value);
      } else if (item.kind === "CHECKBOX" && field.options.length === 0) {
        // A lone consent box, ticked only because the user agreed for this application.
        if (item.value === "Yes") await target.check();
      } else if (item.kind === "RADIO" || item.kind === "CHECKBOX") {
        await checkChoices(page, field, item.value);
      } else if (item.kind === "YES_NO") {
        await target.locator(":scope > button", { hasText: new RegExp(`^\\s*${item.value}\\s*$`, "i") }).first().click();
      }
    } catch {
      // Left for the read-back to report as a mismatch.
    }
  }
  return readBack(page, fields, plan);
}

// Types the value, then picks the first suggestion that contains its first part (the city).
// Without a matching suggestion the typed text stays, and the read-back decides.
async function fillCombobox(page: Page, target: Locator, value: string) {
  await target.fill(value);
  const firstPart = value.split(",")[0]?.trim() || value;
  const option = page.getByRole("option").filter({ hasText: firstPart }).first();
  try {
    await option.waitFor({ state: "visible", timeout: SUGGESTION_WAIT_MS });
    await option.click();
  } catch {
    await target.press("Escape").catch(() => undefined);
  }
}

async function checkChoices(page: Page, field: FormField, value: string) {
  const wanted = field.kind === "CHECKBOX" && field.options.length > 0 ? value.split(/\s*,\s*/).map(loose) : [loose(value)];
  const inputs = page.locator(`input[type="${field.kind === "RADIO" ? "radio" : "checkbox"}"][name="${field.name.replaceAll('"', '\\"')}"]`);
  const count = await inputs.count();
  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    const label = await input.evaluate((element) => {
      const own = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      return (own ?? element.closest("label"))?.textContent ?? (element as HTMLInputElement).value;
    });
    if (wanted.includes(loose(label))) await input.check();
  }
}

// What the page shows for each planned field now.
async function readBack(page: Page, fields: FormField[], plan: FieldPlan[]): Promise<ReadBack> {
  const wanted = plan.filter((item) => item.status === "FILLED").map((item) => item.key);
  const names = Object.fromEntries(fields.map((field) => [field.key, field.name]));
  const lone = fields.filter((field) => field.kind === "CHECKBOX" && field.options.length === 0).map((field) => field.key);
  return page.evaluate(
    ({ keys, keyAttribute, fieldNames, loneBoxes }) => {
      const result: Record<string, { value: string | null; files?: string[] }> = {};
      for (const key of keys) {
        const element = document.querySelector(`[${keyAttribute}="${key}"]`);
        if (!element) continue;
        if (loneBoxes.includes(key) && element instanceof HTMLInputElement) {
          result[key] = { value: element.checked ? "Yes" : "" };
        } else if (element instanceof HTMLInputElement && element.type === "file") {
          result[key] = { value: null, files: Array.from(element.files ?? []).map((file) => file.name) };
        } else if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")) {
          const name = fieldNames[key] ?? "";
          const group = name ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`)) : [element];
          const checked = group
            .filter((input) => input.checked)
            .map((input) => {
              const own = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
              return ((own ?? input.closest("label"))?.textContent ?? input.value).trim();
            });
          result[key] = { value: checked.join(", ") };
        } else if (element instanceof HTMLSelectElement) {
          result[key] = { value: element.selectedOptions[0]?.text ?? "" };
        } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          result[key] = { value: element.value };
        } else {
          // A Yes/No button pair: trust only a pressed or selected marker the page exposes.
          const pressed = Array.from(element.querySelectorAll(":scope > button")).find(
            (button) => button.getAttribute("aria-pressed") === "true" || /\b(selected|active|checked)\b/i.test(button.className),
          );
          result[key] = { value: pressed ? (pressed.textContent ?? "").trim() : null };
        }
      }
      return result;
    },
    { keys: wanted, keyAttribute: KEY_ATTRIBUTE, fieldNames: names, loneBoxes: lone },
  );
}
