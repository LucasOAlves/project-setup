import type { FieldPlan } from "@studio/shared";

// Compares what the page shows after filling with what was planned (Milestone 3, spec section
// 5 step 8). A portal can reformat, drop or replace a value, so the preview only claims what
// the page actually kept.

export type ReadBack = Record<string, { value: string | null; files?: string[] }>;
export type Mismatch = { key: string; expected: string; actual: string | null };
export type FilledCheck = { confirmed: string[]; mismatches: Mismatch[]; unverified: string[] };

function loose(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@+.#]/g, "");
}

export function checkFilledValues(plan: FieldPlan[], readBack: ReadBack): FilledCheck {
  const result: FilledCheck = { confirmed: [], mismatches: [], unverified: [] };
  for (const field of plan) {
    if (field.status !== "FILLED" || field.value === null) continue;
    const read = readBack[field.key];
    if (!read) {
      result.mismatches.push({ key: field.key, expected: field.value, actual: null });
      continue;
    }
    if (field.kind === "FILE") {
      if ((read.files ?? []).length > 0) result.confirmed.push(field.key);
      else result.mismatches.push({ key: field.key, expected: field.value, actual: null });
      continue;
    }
    if (read.value === null) {
      result.unverified.push(field.key);
      continue;
    }
    const kept =
      field.kind === "COMBOBOX"
        ? read.value.trim() !== "" &&
          field.value
            .split(",")
            .map((part) => loose(part))
            .filter(Boolean)
            .every((part) => loose(read.value!).includes(part))
        : field.kind === "CHECKBOX"
          ? loose(read.value) === loose(field.value)
          : loose(read.value) === loose(field.value);
    if (kept) result.confirmed.push(field.key);
    else result.mismatches.push({ key: field.key, expected: field.value, actual: read.value });
  }
  return result;
}
