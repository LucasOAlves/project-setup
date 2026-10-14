import type { FormField, FormFieldKind, SupportedApplicationPortal } from "@studio/shared";

// Pure half of form reading (Milestone 3): where each portal's form lives, and how the raw
// controls the page reader collects become FormFields. The page side is form-reader.ts.

export type RawControl = {
  key: string;
  // "button-group" is a pair of Yes/No buttons standing in for a question (Ashby does this).
  tag: "input" | "textarea" | "select" | "button-group";
  type: string;
  role: string;
  name: string;
  // The question's label: aria-labelledby, label[for], a wrapping label, a legend or the
  // field container's label text, in that order.
  label: string;
  // A radio or checkbox's own label, such as "Yes".
  optionLabel: string;
  required: boolean;
  options: string[];
  visible: boolean;
  accept?: string;
  maxLength?: number;
};

const LABEL_LIMIT = 300;
const SKIPPED_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "password", "search"]);
const PLACEHOLDER_OPTION = /^(|-+|select\b.*|please select\b.*|choose\b.*|--.*)$/i;

const INPUT_KINDS: Record<string, FormFieldKind> = {
  email: "EMAIL",
  tel: "PHONE",
  url: "URL",
  number: "NUMBER",
  date: "DATE",
  file: "FILE",
};

// Greenhouse shows the form on the posting itself, Lever on /apply and Ashby on /application.
export function applicationPageUrl(portal: SupportedApplicationPortal, postingUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(postingUrl);
  } catch {
    return null;
  }
  url.hash = "";
  const segments = url.pathname.split("/").filter(Boolean);
  if (portal === "greenhouse") {
    return segments.includes("jobs") && segments.length >= 3 ? url.toString() : null;
  }
  const suffix = portal === "lever" ? "apply" : "application";
  if (segments.length < 2) return null;
  if (segments[2] !== suffix) url.pathname = `/${segments[0]}/${segments[1]}/${suffix}`;
  return url.toString();
}

export function cleanLabel(raw: string): { label: string; marked: boolean } {
  let label = raw.replace(/\s+/g, " ").trim();
  let marked = false;
  for (;;) {
    const before = label;
    label = label
      .replace(/\s*[*✱]+\s*$/u, () => {
        marked = true;
        return "";
      })
      .replace(/^\s*[*✱]+\s*/u, () => {
        marked = true;
        return "";
      })
      .replace(/\s*\(required\)\s*$/i, () => {
        marked = true;
        return "";
      })
      .replace(/\s*\(optional\)\s*$/i, "")
      .trim();
    if (label === before) break;
  }
  return { label: label.slice(0, LABEL_LIMIT), marked };
}

function humanizeName(name: string): string {
  return name
    .replace(/[[\]_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_LIMIT);
}

function kindOf(control: RawControl): FormFieldKind | null {
  if (control.tag === "textarea") return "TEXTAREA";
  if (control.tag === "select") return "SELECT";
  if (control.tag === "button-group") return "YES_NO";
  const type = control.type.toLowerCase() || "text";
  if (SKIPPED_TYPES.has(type)) return null;
  if (type === "radio") return "RADIO";
  if (type === "checkbox") return "CHECKBOX";
  if (control.role.toLowerCase() === "combobox") return "COMBOBOX";
  return INPUT_KINDS[type] ?? "TEXT";
}

export function normalizeFormControls(controls: RawControl[]): FormField[] {
  const fields: FormField[] = [];
  const groups = new Map<string, FormField>();
  const checkboxNames = new Map<string, number>();
  for (const control of controls) {
    if (control.tag === "input" && control.type.toLowerCase() === "checkbox" && control.name) {
      checkboxNames.set(control.name, (checkboxNames.get(control.name) ?? 0) + 1);
    }
  }

  for (const control of controls) {
    const kind = kindOf(control);
    if (!kind) continue;
    // Invisible controls are honeypots or leftovers, except file inputs, which portals hide
    // behind an "Attach" button.
    if (!control.visible && kind !== "FILE") continue;

    const question = cleanLabel(control.label);
    const option = cleanLabel(control.optionLabel);
    const grouped = (kind === "RADIO" || (kind === "CHECKBOX" && (checkboxNames.get(control.name) ?? 0) > 1)) && control.name;

    if (grouped) {
      const existing = groups.get(`${kind}:${control.name}`);
      if (existing) {
        if (option.label) existing.options.push(option.label);
        existing.required ||= control.required || question.marked;
        continue;
      }
      const field: FormField = {
        key: control.key,
        label: question.label || humanizeName(control.name),
        kind,
        required: control.required || question.marked,
        options: option.label ? [option.label] : [],
        name: control.name,
      };
      groups.set(`${kind}:${control.name}`, field);
      fields.push(field);
      continue;
    }

    // A lone checkbox is labelled by its own text ("I agree to ...").
    const label = (kind === "CHECKBOX" ? option.label || question.label : question.label) || humanizeName(control.name);
    const options =
      kind === "SELECT"
        ? control.options.map((value) => value.replace(/\s+/g, " ").trim()).filter((value) => !PLACEHOLDER_OPTION.test(value))
        : kind === "YES_NO"
          ? control.options.map((value) => value.trim())
          : [];
    fields.push({
      key: control.key,
      label,
      kind,
      required: control.required || question.marked || option.marked,
      options,
      name: control.name,
      ...(control.accept ? { accept: control.accept } : {}),
      ...(control.maxLength && control.maxLength > 0 ? { maxLength: control.maxLength } : {}),
    });
  }
  return fields;
}
