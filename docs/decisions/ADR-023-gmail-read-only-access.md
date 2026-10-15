# ADR-023 — Recruiter email through Gmail's read-only scope

## Status

Accepted (Milestone 5, ticket 2). Lucas chose this option on 2026-10-15.

## Context

Milestone 5 tracks what happens after an application is sent: confirmations, rejections,
interview requests and offers arrive by email (spec A10, JOB-026). The app needs to read those
messages. The spec asks to prefer scoped OAuth access over stored passwords, to encrypt
credentials at rest, and to minimize the personal data the app keeps and sends to models.

## Options considered

1. **Gmail API with the read-only scope, through the user's own OAuth client.** Narrow and
   revocable, and no password is stored. The user creates a Google Cloud OAuth client once.
   While that client is in "testing", Google expires the grant every 7 days, so it has to be
   published. Unverified, it shows a warning screen, which is acceptable for a single user.
2. **IMAP with an app password.** Works with any provider, but the stored password can read and
   delete every message, and it is a password, which the spec asks to avoid.
3. **Paste or forward by hand.** No access at all, but tracking depends on the user remembering
   to do it.

## Decision

Option 1. `gmail-client.ts` talks to Google's OAuth and Gmail endpoints over plain HTTPS. It asks
only for `gmail.readonly` and refuses a grant that carries any broader scope. No call that could
send, modify or delete mail exists in the code. The refresh token is sealed with AES-256-GCM
under `APP_ENCRYPTION_KEY` (`secret-box.ts`), with its purpose bound as associated data. It is
opened only to get a short-lived access token, and it is never logged, audited or sent to a
model.

Google's redirect back to the app is a cross-site navigation, so the SameSite=Strict session
cookie does not come with it. The callback is therefore a public path. It is accepted only when
Google returns the nonce held in a signed, 10-minute, SameSite=Lax cookie that the signed-in
start set (`oauth-state.ts`). Pasting a message by hand stays available whatever is connected.

## Consequences

- Disconnecting revokes the grant at Google and deletes the token. A revoked or expired grant
  is shown on the account with a "Connect Gmail again" action.
- Losing `APP_ENCRYPTION_KEY` makes the stored token unreadable, and the fix is to connect
  again. Rotating the key works the same way.
- Read access covers the whole mailbox, so what the app reads is narrowed in its own code
  (ticket 3): a Gmail search limited to recent messages from ATS domains and the companies
  applied to. Messages that match no application are not stored.

## Tradeoffs

Option 2 would support other providers but would keep a password with full mailbox control.
Option 3 keeps no access at all, but replies would be missed. Option 1 costs a one-time Google
Cloud setup and an "unverified app" screen, in exchange for the narrowest access that works
without the user's daily attention.
