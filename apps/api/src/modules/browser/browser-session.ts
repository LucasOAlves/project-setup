import { lookup } from "node:dns/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { checkRequest, type PortalPolicy, type SubmitGate } from "./browser-guard.js";

export type MockResponse = { status?: number; contentType: string; body: string };

export type BrowserSessionOptions = {
  // Empty uses Playwright's own Chromium.
  executablePath?: string;
  runTimeoutMs: number;
  navigationTimeoutMs?: number;
  // Tests serve mock portals through this hook. It runs only after the guard allowed the request.
  mockResponse?: (url: string, method: string) => MockResponse | null;
  resolveHost?: (hostname: string) => Promise<string[]>;
  // Submission runs only (Milestone 4): the approved posting. Without it every write is blocked.
  submit?: { destinationUrl: string };
};

export type GuardedSession = {
  page: Page;
  // Every request the guard refused in this run, for the run's record.
  blocked: string[];
  // Submission runs only: opens the gate for one submit request. Call it right after the
  // approval was checked again, just before the click.
  armSubmit: () => void;
  // The submit requests the guard let through (at most one), with their response status once
  // one arrives.
  submits: SubmitRecord[];
};

export type SubmitRecord = { url: string; method: string; status: number | null };

// Neutralizes form submission in every frame before any page script runs, in preparation runs.
// Belt and braces: the worker never clicks submit there, and the network guard drops write
// requests anyway. Submission runs leave it out: there the guard's armed, one-shot gate is
// what lets the single submit request through, and it lives outside the page.
const NO_SUBMIT_SCRIPT = `(() => {
  document.addEventListener("submit", (event) => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
  HTMLFormElement.prototype.submit = function () {};
  HTMLFormElement.prototype.requestSubmit = function () {};
})();`;

async function resolveWithDns(hostname: string): Promise<string[]> {
  try {
    return (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
  } catch {
    // Unresolvable: Chromium will fail the request itself.
    return [];
  }
}

// One throwaway browser per run (spec section 6 "Browser isolation"): a fresh context with no
// stored cookies or profile, downloads and service workers off, every request checked by
// browser-guard.ts, WebSockets closed, and the whole run bounded by runTimeoutMs.
export async function withGuardedPage<T>(
  policy: PortalPolicy,
  options: BrowserSessionOptions,
  run: (session: GuardedSession) => Promise<T>,
): Promise<T> {
  const resolveHost = options.resolveHost ?? resolveWithDns;
  const resolved = new Map<string, Promise<string[]>>();
  const blocked: string[] = [];
  const submits: SubmitRecord[] = [];
  const gate: SubmitGate | undefined = options.submit ? { destinationUrl: options.submit.destinationUrl, armed: false, used: 0 } : undefined;

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new BrowserRunTimeout(options.runTimeoutMs));
    }, options.runTimeoutMs);
  });

  const work = async () => {
    browser = await chromium.launch({
      headless: true,
      executablePath: options.executablePath || undefined,
      args: ["--disable-dev-shm-usage", "--disable-background-networking", "--no-first-run"],
    });
    if (timedOut) {
      // The run was abandoned while Chromium was starting: do not leave it running.
      await browser.close();
      throw new BrowserRunTimeout(options.runTimeoutMs);
    }
    context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      locale: "en-US",
      viewport: { width: 1280, height: 900 },
    });
    context.setDefaultTimeout(options.navigationTimeoutMs ?? 30_000);
    if (!gate) await context.addInitScript({ content: NO_SUBMIT_SCRIPT });
    // tsx compiles with esbuild's keepNames, which wraps functions in a __name() helper. The
    // functions we pass to page.evaluate carry those calls into the page, so define a no-op.
    await context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((target) => target);" });
    await context.routeWebSocket(/.*/, (socket) => socket.close());
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = request.url();
      let addresses: string[] = [];
      try {
        const { protocol, hostname } = new URL(url);
        if (protocol === "https:" || protocol === "http:") {
          const host = hostname.replace(/^\[|\]$/g, "");
          if (!resolved.has(host)) resolved.set(host, resolveHost(host));
          addresses = await resolved.get(host)!;
        }
      } catch {
        // checkRequest rejects an unreadable URL.
      }
      const decision = checkRequest(
        { url, method: request.method(), isNavigation: request.isNavigationRequest(), resolvedAddresses: addresses, postData: request.postData() },
        policy,
        gate,
      );
      if (!decision.allow) {
        blocked.push(decision.reason);
        await route.abort("blockedbyclient");
        return;
      }
      let record: SubmitRecord | null = null;
      if (decision.submit && gate) {
        // Counted before the request leaves, so a second one is refused even if it races.
        gate.used += 1;
        record = { url, method: request.method(), status: null };
        submits.push(record);
      }
      const mock = options.mockResponse?.(url, request.method());
      if (mock) {
        if (record) record.status = mock.status ?? 200;
        await route.fulfill({ status: mock.status ?? 200, contentType: mock.contentType, body: mock.body });
        return;
      }
      if (options.mockResponse) {
        // Under test, nothing reaches the real network.
        await route.abort("internetdisconnected");
        return;
      }
      if (record) {
        const sent = record;
        // A request that fails after leaving keeps status null: sent or not, nobody can tell.
        void request
          .response()
          .then((response) => {
            sent.status = response?.status() ?? null;
          })
          .catch(() => undefined);
      }
      await route.continue();
    });

    const page = await context.newPage();
    // Redirects are followed without passing through route(), so the landed URL is checked too.
    page.on("framenavigated", (frame) => {
      // A request the guard aborted lands on Chromium's own error page, which is not a site.
      if (frame !== page.mainFrame() || frame.url() === "about:blank" || frame.url().startsWith("chrome-error:")) return;
      const decision = checkRequest({ url: frame.url(), method: "GET", isNavigation: true, resolvedAddresses: [] }, policy);
      if (!decision.allow) {
        blocked.push(`Left the portal: ${decision.reason}`);
        void page.close();
      }
    });
    const armSubmit = () => {
      if (gate) gate.armed = true;
    };
    return run({ page, blocked, armSubmit, submits });
  };

  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
    await (context as BrowserContext | null)?.close().catch(() => undefined);
    await (browser as Browser | null)?.close().catch(() => undefined);
  }
}

export class BrowserRunTimeout extends Error {
  constructor(readonly timeoutMs: number) {
    super(`The browser run took longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped.`);
    this.name = "BrowserRunTimeout";
  }
}
