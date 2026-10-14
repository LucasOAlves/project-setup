# ADR-021 — Single-user sign-in before approval and submission

## Status

Accepted (Milestone 4, ticket 1). Updates [ADR-003](./ADR-003-unauthenticated-workspace.md).

## Context

ADR-003 shipped the app without accounts: one local workspace, trusted because it ran on the
user's machine. Milestone 4 lets the app submit job applications, and the spec says "Only the
authenticated user can transition an application to APPROVED". ADR-012 already noted that
whether an EXECUTE action can be built at all depends on an auth decision. The API also listens
on every interface and allowed CORS from any origin, so anything that could reach the port could
call any route.

The app still has exactly one user. There is no sign-up, no second account and no billing.

## Options considered

1. **Keep the app open and rely on the network.** Bind to localhost and trust whoever reaches
   it. Nothing proves the approval came from the user, and a page in the same browser could still
   send requests.
2. **Users table with accounts and sessions.** Ready for more users later, but it is a multi-user
   design for a single-user app: registration, account recovery and a session store to run.
3. **One password, set in the environment, and a signed session cookie.** The hash
   (scrypt) lives in `APP_PASSWORD_HASH`, and the session is an HMAC-signed token in an httpOnly,
   SameSite=Strict cookie, so there is no session table. State-changing requests must come from the
   app's own origin.

## Decision

Option 3. Every `/api` route except `/api/auth/*` needs the session when a password is set.
The session key mixes `SESSION_SECRET` with the password hash, so changing the password signs out
every browser. Five failed sign-ins in 15 minutes pause further attempts. CORS is off unless
`APP_ORIGINS` lists an origin, and the Vite proxy keeps the browser's Host header so the Origin
check can compare the two.

Without a password the app stays open as ADR-003 describes, so existing local setups keep
working. Routes marked `config.signedIn` (approving and submitting an application) are refused
in that mode, because there is no signed-in user to approve. Production (`NODE_ENV=production`)
refuses to start without a password.

## Consequences

- Approval in Milestone 4 can be attributed to the signed-in user and audited (`SIGNED_IN`,
  `SIGN_IN_FAILED`, with no IP or other identifier).
- The password is never stored or logged. `npm run hash-password` reads it without echo and
  prints the two settings for `.env`. The hash uses colons, not `$`, so Compose and shells do not
  expand it.
- Signing out clears the cookie but does not revoke the token. A stolen token works until it
  expires or the password changes, which is acceptable for one user on their own machine.
- The Secure flag is set in production. Over plain HTTP on a LAN address, the cookie works only
  outside production.

## Tradeoffs

Option 2 would allow revoking single sessions and adding users later, at the cost of tables,
flows and recovery the app does not need. Option 1 costs nothing but cannot satisfy "only the
authenticated user approves". Option 3 adds one small module and one environment setting, and a
move to option 2 later replaces it without touching the routes, which only see
`request.signedIn` and `config.signedIn`.
