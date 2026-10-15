/// <reference lib="dom" />
// The callback passed to page.evaluate runs inside the browser page, so it needs DOM types.
import type { Page } from "playwright-core";
import type { FormField, SupportedApplicationPortal } from "@studio/shared";
import { normalizeFormControls, type RawControl } from "./form-fields.js";

// Where each portal renders its application form. The generic reader below does the rest,
// so a portal tweaking its markup degrades to a worse label, not a broken run.
export const FORM_ROOTS: Record<SupportedApplicationPortal, string> = {
  greenhouse: "#application-form, form#application_form, form[action*='applications']",
  lever: "form.application-form, #application-form, form[action*='/apply']",
  ashby: ".ashby-application-form-container, form",
};

export const KEY_ATTRIBUTE = "data-jh-key";

export class FormNotFound extends Error {
  constructor() {
    super("No application form was found on the page.");
    this.name = "FormNotFound";
  }
}

// Reads every control of the form into FormFields and tags each one with KEY_ATTRIBUTE so the
// filler finds it again. The page's text is only read as data.
export async function readApplicationForm(page: Page, portal: SupportedApplicationPortal, timeoutMs = 15_000): Promise<FormField[]> {
  const root = await page.waitForSelector(FORM_ROOTS[portal], { timeout: timeoutMs, state: "attached" }).catch(() => null);
  if (!root) throw new FormNotFound();
  const raw = await root.evaluate((form: Element, keyAttribute: string): RawControl[] => {
    const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
    const visible = (element: Element) => {
      if (element.closest("[aria-hidden='true']")) return false;
      const box = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const byIds = (ids: string | null) =>
      (ids ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => text(document.getElementById(id)))
        .filter(Boolean)
        .join(" ");
    const labelFor = (element: Element) =>
      element.id ? text(document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) : "";
    // The question text of a field container: a legend, or a child whose class says label or
    // title, that does not itself contain the control.
    const containerLabel = (element: Element) => {
      let node: Element | null = element.parentElement;
      for (let depth = 0; node && node !== form.parentElement && depth < 6; depth += 1, node = node.parentElement) {
        const legend = node.matches("fieldset") ? node.querySelector(":scope > legend") : null;
        if (legend) return text(legend);
        const groupLabel = node.getAttribute("role") === "radiogroup" || node.getAttribute("role") === "group" ? byIds(node.getAttribute("aria-labelledby")) : "";
        if (groupLabel) return groupLabel;
        const candidate = Array.from(node.querySelectorAll(":scope > label, :scope > [class*='label' i], :scope > [class*='question-title' i], :scope > [class*='title' i]")).find(
          (child) => !child.contains(element) && !child.querySelector("input, select, textarea, button"),
        );
        if (candidate) return text(candidate);
      }
      return "";
    };
    const required = (element: Element) =>
      (element as HTMLInputElement).required === true ||
      element.getAttribute("aria-required") === "true" ||
      element.closest("[aria-required='true']") !== null;

    const controls: RawControl[] = [];
    let counter = 0;
    const tag = (element: Element) => {
      const key = `f${(counter += 1)}`;
      element.setAttribute(keyAttribute, key);
      return key;
    };

    // One pass in document order, so fields come out in the order the page shows them.
    for (const element of Array.from(form.querySelectorAll("input, textarea, select, div, fieldset, span"))) {
      const tagName = element.tagName.toLowerCase();
      if (tagName === "div" || tagName === "fieldset" || tagName === "span") {
        // Yes/No questions drawn as two buttons, not radio inputs.
        const buttons = Array.from(element.querySelectorAll(":scope > button"));
        if (buttons.length !== 2) continue;
        const labels = buttons.map((button) => text(button).toLowerCase());
        if (labels[0] !== "yes" || labels[1] !== "no") continue;
        controls.push({
          key: tag(element),
          tag: "button-group",
          type: "",
          role: "",
          name: element.getAttribute("name") ?? element.id ?? "",
          label: containerLabel(element),
          optionLabel: "",
          required: required(element),
          options: buttons.map((button) => text(button)),
          visible: visible(element),
        });
        continue;
      }
      const input = element as HTMLInputElement;
      const control = tagName as "input" | "textarea" | "select";
      const type = control === "input" ? (input.getAttribute("type") ?? "text").toLowerCase() : "";
      const choice = type === "radio" || type === "checkbox";
      const own = byIds(element.getAttribute("aria-labelledby")) || labelFor(element) || text(element.closest("label")) || (element.getAttribute("aria-label") ?? "");
      controls.push({
        key: tag(element),
        tag: control,
        type,
        role: element.getAttribute("role") ?? "",
        name: input.name || element.id || "",
        label: choice ? containerLabel(element) || (element.getAttribute("aria-label") ?? "") : own || containerLabel(element) || (input.placeholder ?? ""),
        optionLabel: choice ? own : "",
        required: required(element),
        options: control === "select" ? Array.from((element as HTMLSelectElement).options).map((option) => option.text) : [],
        visible: visible(element),
        accept: type === "file" ? input.accept || undefined : undefined,
        maxLength: control !== "select" && input.maxLength > 0 ? input.maxLength : undefined,
      });
    }
    return controls;
  }, KEY_ATTRIBUTE);
  return normalizeFormControls(raw);
}
