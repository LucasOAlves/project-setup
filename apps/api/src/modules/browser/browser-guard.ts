import { BlockList, isIP } from "node:net";
import type { SupportedApplicationPortal } from "@studio/shared";

// Network guard for the browser worker (Milestone 3, spec section 6 "Browser isolation").
// Pure: the worker resolves each host and passes the addresses in, then routes or aborts the
// request on this answer. Pages only open on the job's ATS, nothing reaches a private network,
// and no request that writes to the portal (which is how a form is submitted) leaves the
// browser, except the read-only queries a portal needs to render its form.

export type GuardedRequest = {
  url: string;
  method: string;
  // A main-frame or iframe document load, as opposed to a script, style, image or fetch.
  isNavigation: boolean;
  // What the host resolved to. Empty for data: and blob: URLs and for IP literals.
  resolvedAddresses: string[];
  postData?: string | null;
};

export type GuardDecision = { allow: true } | { allow: false; reason: string };

export type PortalPolicy = {
  portal: SupportedApplicationPortal;
  hosts: string[];
  // Write requests a portal makes only to read data, such as a GraphQL query.
  isReadOnlyWrite: (url: URL, postData: string | null | undefined) => boolean;
};

const PRIVATE_RANGES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  PRIVATE_RANGES.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  PRIVATE_RANGES.addSubnet(network, prefix, "ipv6");
}

const LOCAL_NAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "");
  const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  // Other IPv4-mapped forms (::ffff:7f00:1) are rare enough to refuse outright. BlockList
  // would match them against IPv4 ranges inconsistently, so they never reach it.
  if (/^::ffff:/i.test(bare)) return true;
  const family = isIP(bare);
  if (family === 4) return PRIVATE_RANGES.check(bare, "ipv4");
  if (family === 6) return PRIVATE_RANGES.check(bare, "ipv6");
  return true;
}

function onHost(hostname: string, hosts: string[]): boolean {
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

// Ashby renders its form from GraphQL queries sent as POST. Only named queries are read-only;
// a mutation, an unnamed operation or a body that cannot be read is treated as a write.
function ashbyReadOnlyQuery(url: URL, postData: string | null | undefined): boolean {
  if (url.hostname !== "jobs.ashbyhq.com" || url.pathname !== "/api/non-user-graphql") return false;
  let body: unknown;
  try {
    body = JSON.parse(postData ?? "");
  } catch {
    return false;
  }
  const operations = Array.isArray(body) ? body : [body];
  return (
    operations.length > 0 &&
    operations.every((operation) => {
      if (!operation || typeof operation !== "object") return false;
      const { operationName, query } = operation as { operationName?: unknown; query?: unknown };
      return (
        typeof operationName === "string" &&
        !/submit|apply|upload|create|update|delete|save|send/i.test(operationName) &&
        typeof query === "string" &&
        /^\s*query\b/.test(query)
      );
    })
  );
}

const POLICIES: Record<SupportedApplicationPortal, PortalPolicy> = {
  greenhouse: {
    portal: "greenhouse",
    hosts: ["job-boards.greenhouse.io", "boards.greenhouse.io"],
    isReadOnlyWrite: () => false,
  },
  lever: { portal: "lever", hosts: ["jobs.lever.co"], isReadOnlyWrite: () => false },
  ashby: { portal: "ashby", hosts: ["jobs.ashbyhq.com"], isReadOnlyWrite: ashbyReadOnlyQuery },
};

export function portalPolicy(portal: SupportedApplicationPortal): PortalPolicy {
  return POLICIES[portal];
}

export function checkRequest(request: GuardedRequest, policy: PortalPolicy): GuardDecision {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { allow: false, reason: "The address could not be read." };
  }

  if (url.protocol === "data:" || url.protocol === "blob:") {
    return request.isNavigation
      ? { allow: false, reason: "Pages built from data or blob addresses are not opened." }
      : { allow: true };
  }
  if (url.protocol !== "https:") {
    return { allow: false, reason: `Only https is allowed, not ${url.protocol.replace(":", "")}.` };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (LOCAL_NAME.test(hostname)) return { allow: false, reason: `${hostname} is a local name.` };
  if (isIP(hostname) !== 0) {
    return isPrivateAddress(hostname)
      ? { allow: false, reason: `${hostname} is a private address.` }
      : { allow: false, reason: "Addresses written as an IP are not opened." };
  }
  const privateAddress = request.resolvedAddresses.find(isPrivateAddress);
  if (privateAddress) return { allow: false, reason: `${hostname} resolves to a private address.` };

  const portalHost = onHost(hostname, policy.hosts);
  if (request.isNavigation && !portalHost) {
    return { allow: false, reason: `${hostname} is not the application portal.` };
  }

  if (!READ_ONLY_METHODS.has(request.method.toUpperCase())) {
    if (portalHost && policy.isReadOnlyWrite(url, request.postData)) return { allow: true };
    return { allow: false, reason: `${request.method} to ${hostname} could submit or write data, so it was blocked.` };
  }
  return { allow: true };
}
