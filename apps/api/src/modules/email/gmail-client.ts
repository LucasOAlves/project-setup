// The Gmail API through plain HTTPS (Milestone 5): Google's OAuth endpoints for the read-only
// scope, and the few Gmail calls the app needs. Nothing here can send, change or delete mail:
// the scope does not allow it, and no such call exists.

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GoogleOAuthClient = { clientId: string; clientSecret: string; redirectUri: string };

type Fetch = typeof fetch;

export class GmailError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    // invalid_grant: the user revoked access, or the token expired. Connect again.
    readonly revoked = false,
  ) {
    super(message);
  }
}

export type GmailMessageRef = { id: string; threadId: string };

export type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePart;
};

// The URL that sends the user to Google's consent screen. access_type=offline and
// prompt=consent make Google return a refresh token every time.
export function googleConsentUrl(client: GoogleOAuthClient, state: string): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function tokenRequest(fetchImpl: Fetch, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = await readJson(response);
  if (!response.ok) {
    // Google's error code only: its description can echo request details.
    const code = typeof json.error === "string" ? json.error : `HTTP ${response.status}`;
    throw new GmailError(`Google refused the token request (${code}).`, response.status, code === "invalid_grant");
  }
  return json;
}

// Exchanges the code from the consent redirect. Refuses a grant without a refresh token or
// with any scope beyond read-only.
export async function exchangeGoogleCode(
  client: GoogleOAuthClient,
  code: string,
  fetchImpl: Fetch = fetch,
): Promise<{ refreshToken: string; accessToken: string; scope: string }> {
  const json = await tokenRequest(fetchImpl, {
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: client.redirectUri,
    grant_type: "authorization_code",
  });
  const scope = typeof json.scope === "string" ? json.scope : "";
  const scopes = scope.split(" ").filter(Boolean);
  if (!scopes.includes(GMAIL_READONLY_SCOPE)) throw new GmailError("Google did not grant read access to Gmail.", null);
  const extra = scopes.filter((granted) => granted !== GMAIL_READONLY_SCOPE && !["openid", "email", "profile"].includes(granted) && !granted.endsWith("/userinfo.email"));
  if (extra.length > 0) throw new GmailError("Google granted more than read-only access. Connect again with only Gmail read access.", null);
  if (typeof json.refresh_token !== "string" || typeof json.access_token !== "string") {
    throw new GmailError("Google did not return a refresh token. Remove the app's access in your Google account and connect again.", null);
  }
  return { refreshToken: json.refresh_token, accessToken: json.access_token, scope: GMAIL_READONLY_SCOPE };
}

export async function refreshGoogleAccessToken(client: GoogleOAuthClient, refreshToken: string, fetchImpl: Fetch = fetch): Promise<string> {
  const json = await tokenRequest(fetchImpl, {
    refresh_token: refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: "refresh_token",
  });
  if (typeof json.access_token !== "string") throw new GmailError("Google returned no access token.", null);
  return json.access_token;
}

// Best effort: the local copy is deleted whatever Google answers.
export async function revokeGoogleToken(token: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Read-only Gmail calls with one access token.
export class GmailReader {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async get(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const query = new URLSearchParams(params).toString();
    const response = await this.fetchImpl(`${GMAIL_API}${path}${query ? `?${query}` : ""}`, {
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    const json = await readJson(response);
    if (!response.ok) throw new GmailError(`Gmail answered HTTP ${response.status}.`, response.status, response.status === 401);
    return json;
  }

  async profile(): Promise<{ emailAddress: string }> {
    const json = await this.get("/profile");
    if (typeof json.emailAddress !== "string") throw new GmailError("Gmail returned no address.", null);
    return { emailAddress: json.emailAddress };
  }

  // Message ids matching a Gmail search, newest first, up to `limit`.
  async search(query: string, limit: number): Promise<GmailMessageRef[]> {
    const found: GmailMessageRef[] = [];
    let pageToken: string | undefined;
    do {
      const json = await this.get("/messages", {
        q: query,
        maxResults: String(Math.min(100, limit - found.length)),
        ...(pageToken ? { pageToken } : {}),
      });
      const messages = Array.isArray(json.messages) ? (json.messages as GmailMessageRef[]) : [];
      found.push(...messages);
      pageToken = typeof json.nextPageToken === "string" ? json.nextPageToken : undefined;
    } while (pageToken && found.length < limit);
    return found.slice(0, limit);
  }

  async message(id: string): Promise<GmailMessage> {
    return (await this.get(`/messages/${encodeURIComponent(id)}`, { format: "full" })) as unknown as GmailMessage;
  }
}
