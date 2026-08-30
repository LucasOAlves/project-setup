import type { AngleType, ContentPlanFormat } from "@studio/shared";

// The plan's confidentiality policy forbids first-person proprietary claims, so a
// plan-derived opportunity is never mapped to EXPERIENCE_DRIVEN.
export function mapFormatToAngle(format: ContentPlanFormat): AngleType {
  return format === "DIAGRAM" ? "ARCHITECTURAL" : "EDUCATIONAL";
}
