import type { JobBoardSource } from "./career.js";

// Recognizes a company's ATS board from a pasted careers or posting URL, so the user can paste
// what they see in the browser instead of working out the board token. Pure. A bare token
// returns null: the caller keeps the source the user picked.

export type BoardReference = { source: JobBoardSource; token: string };

const BOARD_HOSTS: Record<string, JobBoardSource> = {
  "boards.greenhouse.io": "greenhouse",
  "job-boards.greenhouse.io": "greenhouse",
  "boards-api.greenhouse.io": "greenhouse",
  "jobs.lever.co": "lever",
  "jobs.ashbyhq.com": "ashby",
};

export function detectBoardReference(input: string): BoardReference | null {
  const trimmed = input.trim();
  if (!trimmed.includes("/") && !trimmed.includes(".")) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const source = BOARD_HOSTS[host];
  if (!source) return null;

  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  let token: string | undefined;
  if (host === "boards-api.greenhouse.io") {
    // /v1/boards/<token>/jobs
    const index = segments.indexOf("boards");
    token = index >= 0 ? segments[index + 1] : undefined;
  } else if (source === "greenhouse" && segments[0] === "embed") {
    token = url.searchParams.get("for") ?? undefined;
  } else {
    token = segments[0];
  }

  token = token?.trim();
  return token ? { source, token } : null;
}
