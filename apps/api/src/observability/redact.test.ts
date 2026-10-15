import assert from "node:assert/strict";
import test from "node:test";
import { redact } from "./redact.ts";

test("redact masks sensitive keys case-insensitively", () => {
  assert.deepEqual(
    redact({ Email: "a@b.com", password: "x", apiKey: "k", api_key: "k", Authorization: "Bearer t", jobId: "j1" }),
    { Email: "[REDACTED]", password: "[REDACTED]", apiKey: "[REDACTED]", api_key: "[REDACTED]", Authorization: "[REDACTED]", jobId: "j1" },
  );
});

test("redact masks personal fields from the profile", () => {
  assert.deepEqual(
    redact({ fullName: "Ana Souza", phone: "+55 11 99999-0000", linkedinUrl: "https://linkedin.com/in/ana", cookie: "s=1", token: "t" }),
    { fullName: "[REDACTED]", phone: "[REDACTED]", linkedinUrl: "[REDACTED]", cookie: "[REDACTED]", token: "[REDACTED]" },
  );
});

test("redact walks nested objects and arrays", () => {
  assert.deepEqual(
    redact({ applicant: { email: "a@b.com", city: "Recife" }, list: [{ password: "x" }, "ok"] }),
    { applicant: { email: "[REDACTED]", city: "Recife" }, list: [{ password: "[REDACTED]" }, "ok"] },
  );
});

test("redact masks email addresses inside free text", () => {
  assert.equal(
    redact("failed to reach ana.souza+jobs@example.com.br after 3 tries"),
    "failed to reach [EMAIL] after 3 tries",
  );
});

test("redact leaves numbers, booleans, null and dates intact", () => {
  const at = new Date("2026-10-14T00:00:00Z");
  assert.deepEqual(redact({ attempts: 3, ok: false, score: null, at }), { attempts: 3, ok: false, score: null, at: at.toISOString() });
});

test("redact turns an Error into name and redacted message", () => {
  assert.deepEqual(redact(new Error("bounce from x@y.io")), { name: "Error", message: "bounce from [EMAIL]" });
});

test("redact does not mutate its input", () => {
  const input = { email: "a@b.com" };
  redact(input);
  assert.equal(input.email, "a@b.com");
});

test("redact survives circular references", () => {
  const input: Record<string, unknown> = { id: "x" };
  input.self = input;
  assert.deepEqual(redact(input), { id: "x", self: "[CIRCULAR]" });
});
