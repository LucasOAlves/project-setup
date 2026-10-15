import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRequest, isPrivateAddress, portalPolicy, type GuardedRequest } from "./browser-guard.js";

const greenhouse = portalPolicy("greenhouse");
const ashby = portalPolicy("ashby");

function request(overrides: Partial<GuardedRequest>): GuardedRequest {
  return {
    url: "https://job-boards.greenhouse.io/acme/jobs/123",
    method: "GET",
    isNavigation: true,
    resolvedAddresses: ["104.18.1.1"],
    ...overrides,
  };
}

test("private, loopback, link-local and metadata addresses are private", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
  ]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "104.18.1.1", "172.32.0.1", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("the job's ATS page is allowed", () => {
  assert.deepEqual(checkRequest(request({}), greenhouse), { allow: true });
  assert.deepEqual(checkRequest(request({ url: "https://boards.greenhouse.io/acme/jobs/123" }), greenhouse), { allow: true });
});

test("navigation to any other host is blocked", () => {
  const result = checkRequest(request({ url: "https://evil.example.com/" }), greenhouse);
  assert.equal(result.allow, false);
  if (!result.allow) assert.match(result.reason, /not the application portal/i);
});

test("a lookalike host is not the portal", () => {
  assert.equal(checkRequest(request({ url: "https://job-boards.greenhouse.io.evil.com/x" }), greenhouse).allow, false);
  assert.equal(checkRequest(request({ url: "https://evilgreenhouse.io/x" }), greenhouse).allow, false);
});

test("plain http and other schemes are blocked", () => {
  assert.equal(checkRequest(request({ url: "http://job-boards.greenhouse.io/acme/jobs/1" }), greenhouse).allow, false);
  assert.equal(checkRequest(request({ url: "file:///etc/passwd" }), greenhouse).allow, false);
  assert.equal(checkRequest(request({ url: "javascript:alert(1)" }), greenhouse).allow, false);
});

test("local names and IP literals are blocked for any request", () => {
  for (const url of [
    "https://localhost/",
    "https://app.localhost/",
    "https://printer.local/",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.5/",
    "https://[::1]/",
  ]) {
    const result = checkRequest(request({ url, isNavigation: false, resolvedAddresses: [] }), greenhouse);
    assert.equal(result.allow, false, url);
  }
});

test("a public name that resolves to a private address is blocked", () => {
  const result = checkRequest(request({ url: "https://cdn.example.com/app.js", isNavigation: false, resolvedAddresses: ["10.0.0.7"] }), greenhouse);
  assert.equal(result.allow, false);
  if (!result.allow) assert.match(result.reason, /private/i);
});

test("public scripts, styles and images from other hosts load", () => {
  const result = checkRequest(
    request({ url: "https://cdn.jsdelivr.net/lib.js", isNavigation: false, resolvedAddresses: ["151.101.1.229"] }),
    greenhouse,
  );
  assert.deepEqual(result, { allow: true });
});

test("data and blob subresources load, but never as a page", () => {
  assert.deepEqual(checkRequest(request({ url: "data:image/png;base64,AAAA", isNavigation: false, resolvedAddresses: [] }), greenhouse), { allow: true });
  assert.equal(checkRequest(request({ url: "data:text/html,<p>x</p>", isNavigation: true, resolvedAddresses: [] }), greenhouse).allow, false);
});

test("every write request on Greenhouse is blocked, so nothing can be submitted", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const result = checkRequest(request({ method, isNavigation: false }), greenhouse);
    assert.equal(result.allow, false, method);
    if (!result.allow) assert.match(result.reason, /submit|write/i);
  }
});

test("Ashby's read-only GraphQL queries are allowed, and its mutations are blocked", () => {
  const graphql = "https://jobs.ashbyhq.com/api/non-user-graphql";
  const read = request({
    url: `${graphql}?op=ApiJobPosting`,
    method: "POST",
    isNavigation: false,
    postData: JSON.stringify({ operationName: "ApiJobPosting", query: "query ApiJobPosting { x }" }),
  });
  assert.deepEqual(checkRequest(read, ashby), { allow: true });

  const submit = request({
    url: `${graphql}?op=ApiSubmitSingleApplicationFormAction`,
    method: "POST",
    isNavigation: false,
    postData: JSON.stringify({ operationName: "ApiSubmitSingleApplicationFormAction", query: "mutation ApiSubmitSingleApplicationFormAction { x }" }),
  });
  assert.equal(checkRequest(submit, ashby).allow, false);

  const disguised = request({
    url: `${graphql}?op=ApiJobPosting`,
    method: "POST",
    isNavigation: false,
    postData: JSON.stringify({ operationName: "ApiJobPosting", query: "mutation Something { x }" }),
  });
  assert.equal(checkRequest(disguised, ashby).allow, false);

  const unreadable = request({ url: `${graphql}?op=ApiJobPosting`, method: "POST", isNavigation: false, postData: "not json" });
  assert.equal(checkRequest(unreadable, ashby).allow, false);

  const otherPath = request({ url: "https://jobs.ashbyhq.com/api/upload", method: "POST", isNavigation: false, postData: "{}" });
  assert.equal(checkRequest(otherPath, ashby).allow, false);
});

test("a read-only query to a host that is not the portal is still a write and is blocked", () => {
  const result = checkRequest(
    request({
      url: "https://evil.example.com/api/non-user-graphql",
      method: "POST",
      isNavigation: false,
      postData: JSON.stringify({ operationName: "ApiJobPosting", query: "query ApiJobPosting { x }" }),
    }),
    ashby,
  );
  assert.equal(result.allow, false);
});

// Milestone 4: submit mode. Only a submission run opens the gate, only after it has rechecked
// the approval, only once, and only for the approved posting's own submit request.

const lever = portalPolicy("lever");
const LEVER_POSTING = "https://jobs.lever.co/acmemock/0b6f2a1e-mock";
const GREENHOUSE_POSTING = "https://job-boards.greenhouse.io/acmemock/jobs/4000001";
const ASHBY_POSTING = "https://jobs.ashbyhq.com/acmemock/7c1d-mock";
const armed = (destinationUrl: string, used = 0) => ({ destinationUrl, armed: true, used });

function ashbySubmit(jobPostingId: string, operationName = "ApiSubmitSingleApplicationFormAction") {
  return request({
    url: `https://jobs.ashbyhq.com/api/non-user-graphql?op=${operationName}`,
    method: "POST",
    isNavigation: false,
    postData: JSON.stringify({ operationName, query: `mutation ${operationName}($x: X) { y }`, variables: { jobPostingId } }),
  });
}

test("an armed submission run lets the approved posting's submit request through once", () => {
  const leverSubmit = request({ url: `${LEVER_POSTING}/apply`, method: "POST", isNavigation: true });
  assert.deepEqual(checkRequest(leverSubmit, lever, armed(LEVER_POSTING)), { allow: true, submit: true });

  const greenhouseSubmit = request({ url: `${GREENHOUSE_POSTING}/applications`, method: "POST", isNavigation: false });
  assert.deepEqual(checkRequest(greenhouseSubmit, greenhouse, armed(GREENHOUSE_POSTING)), { allow: true, submit: true });

  assert.deepEqual(checkRequest(ashbySubmit("7c1d-mock"), ashby, armed(ASHBY_POSTING)), { allow: true, submit: true });
});

test("a second submit request in the same run is blocked", () => {
  const leverSubmit = request({ url: `${LEVER_POSTING}/apply`, method: "POST", isNavigation: true });
  const result = checkRequest(leverSubmit, lever, armed(LEVER_POSTING, 1));
  assert.equal(result.allow, false);
  if (!result.allow) assert.match(result.reason, /already/i);
});

test("before the run rechecks the approval, the submit request is blocked", () => {
  const leverSubmit = request({ url: `${LEVER_POSTING}/apply`, method: "POST", isNavigation: true });
  const result = checkRequest(leverSubmit, lever, { destinationUrl: LEVER_POSTING, armed: false, used: 0 });
  assert.equal(result.allow, false);
  if (!result.allow) assert.match(result.reason, /approval/i);
});

test("without submit mode, a submit request is blocked as before", () => {
  assert.equal(checkRequest(request({ url: `${LEVER_POSTING}/apply`, method: "POST", isNavigation: true }), lever).allow, false);
  assert.equal(checkRequest(ashbySubmit("7c1d-mock"), ashby).allow, false);
});

test("a submit to another posting, or any other write, stays blocked in submit mode", () => {
  const otherLever = request({ url: "https://jobs.lever.co/acmemock/another-posting/apply", method: "POST", isNavigation: true });
  assert.equal(checkRequest(otherLever, lever, armed(LEVER_POSTING)).allow, false);

  const otherGreenhouse = request({ url: "https://job-boards.greenhouse.io/acmemock/jobs/4000002/applications", method: "POST", isNavigation: false });
  assert.equal(checkRequest(otherGreenhouse, greenhouse, armed(GREENHOUSE_POSTING)).allow, false);
  const prefixTrick = request({ url: "https://job-boards.greenhouse.io/acmemock/jobs/40000019/applications", method: "POST", isNavigation: false });
  assert.equal(checkRequest(prefixTrick, greenhouse, armed(GREENHOUSE_POSTING)).allow, false);

  const leverOther = request({ url: `${LEVER_POSTING}/something-else`, method: "POST", isNavigation: false });
  assert.equal(checkRequest(leverOther, lever, armed(LEVER_POSTING)).allow, false);
  const leverPut = request({ url: `${LEVER_POSTING}/apply`, method: "PUT", isNavigation: false });
  assert.equal(checkRequest(leverPut, lever, armed(LEVER_POSTING)).allow, false);

  assert.equal(checkRequest(ashbySubmit("another-posting"), ashby, armed(ASHBY_POSTING)).allow, false);
  assert.equal(checkRequest(ashbySubmit("7c1d-mock", "ApiDeleteSomething"), ashby, armed(ASHBY_POSTING)).allow, false);
});

test("a submit request to a host outside the portal is blocked even when armed", () => {
  const offsite = request({ url: "https://evil.example.com/acmemock/0b6f2a1e-mock/apply", method: "POST", isNavigation: false });
  assert.equal(checkRequest(offsite, lever, armed(LEVER_POSTING)).allow, false);
  const privateHost = request({ url: `${LEVER_POSTING}/apply`, method: "POST", isNavigation: true, resolvedAddresses: ["10.0.0.5"] });
  assert.equal(checkRequest(privateHost, lever, armed(LEVER_POSTING)).allow, false);
});

test("a Lever destination given as its /apply page still matches its submit request", () => {
  const leverSubmit = request({ url: `${LEVER_POSTING}/apply`, method: "POST", isNavigation: true });
  assert.deepEqual(checkRequest(leverSubmit, lever, armed(`${LEVER_POSTING}/apply`)), { allow: true, submit: true });
});
