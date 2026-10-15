import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBlockingPage, type PageSignals } from "./blocking-page.js";

const form: PageSignals = {
  title: "Senior Engineer at Acme",
  text: "Apply for this job. First name. Last name. Email. Resume/CV. Submit application",
  hasVisiblePasswordField: false,
  visibleFrameHosts: [],
};

test("an ordinary application form is not blocking", () => {
  assert.equal(detectBlockingPage(form), null);
});

test("a visible CAPTCHA frame blocks the run", () => {
  assert.equal(detectBlockingPage({ ...form, visibleFrameHosts: ["www.google.com"] })?.kind, "CAPTCHA");
  assert.equal(detectBlockingPage({ ...form, visibleFrameHosts: ["newassets.hcaptcha.com"] })?.kind, "CAPTCHA");
  assert.equal(detectBlockingPage({ ...form, visibleFrameHosts: ["challenges.cloudflare.com"] })?.kind, "CAPTCHA");
});

test("an unrelated visible frame is not a challenge", () => {
  assert.equal(detectBlockingPage({ ...form, visibleFrameHosts: ["www.youtube.com"] }), null);
});

test("bot-check pages block the run", () => {
  assert.equal(detectBlockingPage({ ...form, title: "Just a moment...", text: "" })?.kind, "BOT_CHECK");
  assert.equal(detectBlockingPage({ ...form, text: "Please verify you are a human" })?.kind, "BOT_CHECK");
});

test("a password field or a sign-in wall is a login", () => {
  assert.equal(detectBlockingPage({ ...form, hasVisiblePasswordField: true })?.kind, "LOGIN");
  assert.equal(detectBlockingPage({ ...form, text: "Sign in to continue" })?.kind, "LOGIN");
});
