import {
  profileEvidenceFlags,
  type PersonaPayload,
  type ProfileInput,
} from "@studio/shared";

export function groundPersona(
  payload: PersonaPayload,
  profile: ProfileInput,
): PersonaPayload {
  const { hasIdentity, hasProof } = profileEvidenceFlags(profile);

  if (!hasIdentity && !hasProof) {
    return {
      ...payload,
      strongAuthorityTopics: [],
      adjacentTopics: [...payload.adjacentTopics, ...payload.strongAuthorityTopics].slice(
        0,
        8,
      ),
    };
  }

  if (!hasProof && payload.strongAuthorityTopics.length > 1) {
    return {
      ...payload,
      strongAuthorityTopics: payload.strongAuthorityTopics.slice(0, 1),
      adjacentTopics: [
        ...payload.adjacentTopics,
        ...payload.strongAuthorityTopics.slice(1),
      ].slice(0, 8),
    };
  }

  return payload;
}
