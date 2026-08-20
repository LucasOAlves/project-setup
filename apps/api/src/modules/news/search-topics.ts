import type { PersonaPayload } from "@studio/shared";

const STOP = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "software",
  "engineer",
  "engineering",
  "technology",
  "professional",
]);

export function buildSearchTopics(persona: PersonaPayload, limit = 8): string[] {
  const ranked = [
    ...persona.strongAuthorityTopics.map((item) => item.topic),
    ...persona.coreExpertise,
    ...persona.technologies,
    ...persona.contentPillars,
    ...persona.professionalKeywords,
    ...persona.credibleTopics.map((item) => item.topic),
    ...persona.supportingExpertise,
  ];

  const blocked = new Set(
    persona.riskyTopics.map((item) => item.topic.trim().toLowerCase()),
  );

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const raw of ranked) {
    const topic = raw.trim().replaceAll('"', "");
    const key = topic.toLowerCase();
    if (topic.length < 3 || STOP.has(key) || blocked.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(topic);
    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
}

export function languageCode(preferredLanguage: string): string {
  const value = preferredLanguage.trim().toLowerCase();
  if (value.startsWith("pt") || value.includes("portuguese")) return "pt";
  if (value.startsWith("es") || value.includes("spanish")) return "es";
  return "en";
}
