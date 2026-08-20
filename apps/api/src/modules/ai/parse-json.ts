import { malformedAiOutput } from "../../app-error.js";

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(raw);
  } catch {
    throw malformedAiOutput("The model did not return valid JSON.");
  }
}
