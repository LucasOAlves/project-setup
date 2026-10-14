import { test } from "node:test";
import assert from "node:assert/strict";
import { accessDecision, originAllowed, readCookie, type AccessInput } from "./request-guard.js";

test("reading requests are allowed whatever their Origin", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(originAllowed({ method, origin: "https://evil.example", host: "localhost:5173", allowedOrigins: [] }), true);
  }
});

test("a state-changing request from the same origin is allowed", () => {
  assert.equal(originAllowed({ method: "POST", origin: "http://localhost:5173", host: "localhost:5173", allowedOrigins: [] }), true);
});

test("a state-changing request from another origin is refused", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(originAllowed({ method, origin: "https://evil.example", host: "localhost:5173", allowedOrigins: [] }), false);
  }
  assert.equal(originAllowed({ method: "POST", origin: "http://localhost:5174", host: "localhost:5173", allowedOrigins: [] }), false);
  assert.equal(originAllowed({ method: "POST", origin: "null", host: "localhost:5173", allowedOrigins: [] }), false);
});

test("a configured origin is allowed", () => {
  assert.equal(
    originAllowed({ method: "POST", origin: "https://jobs.example.com", host: "api:3000", allowedOrigins: ["https://jobs.example.com"] }),
    true,
  );
});

test("a request without an Origin header is allowed, since the session cookie still decides", () => {
  assert.equal(originAllowed({ method: "POST", origin: undefined, host: "localhost:3000", allowedOrigins: [] }), true);
});

test("readCookie finds one cookie among several", () => {
  assert.equal(readCookie("a=1; jh_session=abc.def; b=2", "jh_session"), "abc.def");
  assert.equal(readCookie("jh_session=", "jh_session"), "");
  assert.equal(readCookie("xjh_session=1", "jh_session"), undefined);
  assert.equal(readCookie(undefined, "jh_session"), undefined);
});

const base: AccessInput = { mode: "SIGN_IN", path: "/api/career/jobs", signedIn: false, requiresSignIn: false };

test("health and the auth routes are always public", () => {
  for (const path of ["/health", "/api/auth/session", "/api/auth/sign-in", "/api/auth/sign-out"]) {
    assert.equal(accessDecision({ ...base, path }), "ALLOW", path);
    assert.equal(accessDecision({ ...base, path, mode: "OPEN" }), "ALLOW", path);
  }
});

test("with a password set, every other /api route needs a session", () => {
  assert.equal(accessDecision(base), "UNAUTHENTICATED");
  assert.equal(accessDecision({ ...base, signedIn: true }), "ALLOW");
  assert.equal(accessDecision({ ...base, path: "/api/auth/sign-in-extra" }), "UNAUTHENTICATED");
});

test("without a password, ordinary routes stay open but sign-in-only routes are refused", () => {
  assert.equal(accessDecision({ ...base, mode: "OPEN" }), "ALLOW");
  assert.equal(accessDecision({ ...base, mode: "OPEN", requiresSignIn: true }), "SIGN_IN_NOT_CONFIGURED");
});

test("with a password set, a sign-in-only route needs a session like any other", () => {
  assert.equal(accessDecision({ ...base, requiresSignIn: true }), "UNAUTHENTICATED");
  assert.equal(accessDecision({ ...base, requiresSignIn: true, signedIn: true }), "ALLOW");
});
