import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { AppError } from "../../app-error.js";
import type { AuditEventInput, AuditRepository } from "../audit/audit-repository.js";
import { registerAuth, type AuthConfig } from "./auth-routes.js";
import { hashPassword } from "./password.js";
import { sessionKey } from "./session-token.js";
import { SignInLimiter } from "./sign-in-limiter.js";

const PASSWORD = "a long enough password";

async function build(mode: "OPEN" | "SIGN_IN", limiter?: SignInLimiter) {
  const passwordHash = mode === "SIGN_IN" ? await hashPassword(PASSWORD, { cost: 1024 }) : "";
  const config: AuthConfig = {
    mode,
    key: mode === "SIGN_IN" ? sessionKey("x".repeat(40), passwordHash) : "",
    passwordHash,
    ttlMs: 60 * 60 * 1000,
    secureCookie: false,
    allowedOrigins: [],
  };
  const events: AuditEventInput[] = [];
  const audit = { record: async (event: AuditEventInput) => void events.push(event) } as unknown as AuditRepository;
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) return reply.code(error.statusCode).send({ error: { code: error.code } });
    return reply.code(500).send({ error: { code: "INTERNAL" } });
  });
  await registerAuth(app, config, audit, { limiter });
  app.get("/health", async () => ({ ok: true }));
  app.get("/api/things", async () => ({ things: [] }));
  app.post("/api/things", async () => ({ saved: true }));
  app.post("/api/things/approve", { config: { signedIn: true } }, async () => ({ approved: true }));
  return { app, events };
}

async function signIn(app: Awaited<ReturnType<typeof build>>["app"]) {
  const response = await app.inject({ method: "POST", url: "/api/auth/sign-in", payload: { password: PASSWORD } });
  assert.equal(response.statusCode, 200);
  const setCookie = String(response.headers["set-cookie"]);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  return setCookie.split(";")[0]!;
}

test("open mode serves ordinary routes but refuses sign-in-only ones", async () => {
  const { app } = await build("OPEN");
  assert.equal((await app.inject({ method: "GET", url: "/api/things" })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/api/things" })).statusCode, 200);
  const approve = await app.inject({ method: "POST", url: "/api/things/approve" });
  assert.equal(approve.statusCode, 403);
  const session = await app.inject({ method: "GET", url: "/api/auth/session" });
  assert.deepEqual(session.json(), { required: false, signedIn: false, expiresAt: null });
});

test("with a password, routes need the session cookie that sign-in sets", async () => {
  const { app, events } = await build("SIGN_IN");
  assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/things" })).statusCode, 401);
  const cookie = await signIn(app);
  assert.equal((await app.inject({ method: "GET", url: "/api/things", headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/api/things/approve", headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } })).json().signedIn, true);
  assert.deepEqual(events.map((event) => event.eventType), ["SIGNED_IN"]);
});

test("a wrong password is refused and audited, and a forged cookie is ignored", async () => {
  const { app, events } = await build("SIGN_IN");
  const wrong = await app.inject({ method: "POST", url: "/api/auth/sign-in", payload: { password: "not the password" } });
  assert.equal(wrong.statusCode, 401);
  assert.equal(wrong.headers["set-cookie"], undefined);
  assert.deepEqual(events.map((event) => event.eventType), ["SIGN_IN_FAILED"]);
  const forged = await app.inject({ method: "GET", url: "/api/things", headers: { cookie: "jh_session=abc.def" } });
  assert.equal(forged.statusCode, 401);
});

test("a state-changing request from another site is refused even with a session", async () => {
  const { app } = await build("SIGN_IN");
  const cookie = await signIn(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/things",
    headers: { cookie, origin: "https://evil.example", host: "localhost:5173" },
  });
  assert.equal(response.statusCode, 403);
  const same = await app.inject({
    method: "POST",
    url: "/api/things",
    headers: { cookie, origin: "http://localhost:5173", host: "localhost:5173" },
  });
  assert.equal(same.statusCode, 200);
});

test("repeated failures are rate limited", async () => {
  const { app } = await build("SIGN_IN", new SignInLimiter({ maxFailures: 2 }));
  for (let i = 0; i < 2; i += 1) {
    await app.inject({ method: "POST", url: "/api/auth/sign-in", payload: { password: "wrong password" } });
  }
  const blocked = await app.inject({ method: "POST", url: "/api/auth/sign-in", payload: { password: PASSWORD } });
  assert.equal(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
});

test("sign-out clears the cookie", async () => {
  const { app } = await build("SIGN_IN");
  const response = await app.inject({ method: "POST", url: "/api/auth/sign-out" });
  assert.match(String(response.headers["set-cookie"]), /jh_session=; .*Max-Age=0/);
});
