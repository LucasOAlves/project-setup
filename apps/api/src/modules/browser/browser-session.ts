import { lookup } from "node:dns/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { checkRequest, type PortalPolicy } from "./browser-guard.js";

export type MockResponse = { status?: number; contentType: string; body: string };

export type BrowserSessionOptions = {
  // Empty uses Playwright's own Chromium.
  executablePath?: string;
  runTimeoutMs: number;
  navigationTimeoutMs?: number;
  // Tests serve mock portals through this hook. It runs only after the guard allowed the request.
  mockResponse?: (url: string, method: string) => MockResponse | null;
  resolveHost?: (hostname: string) => Promise<string[]>;
};

export type GuardedSession = {
  page: Page;
  // Every request the guard refused in this run, for the run's record.
  blocked: string[];
};

// Neutralizes form submission in every frame before any page script runs. Belt and braces:
// the worker never clicks submit, and the network guard drops write requests anyway.
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
    await context.addInitScript({ content: NO_SUBMIT_SCRIPT });
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
      );
      if (!decision.allow) {
        blocked.push(decision.reason);
        await route.abort("blockedbyclient");
        return;
      }
      const mock = options.mockResponse?.(url, request.method());
      if (mock) {
        await route.fulfill({ status: mock.status ?? 200, contentType: mock.contentType, body: mock.body });
        return;
      }
      if (options.mockResponse) {
        // Under test, nothing reaches the real network.
        await route.abort("internetdisconnected");
        return;
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
    return run({ page, blocked });
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
