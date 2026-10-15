/// <reference lib="dom" />
// The callback passed to page.evaluate runs inside the browser page, so it needs DOM types.
import type { Page } from "playwright-core";
import type { PageSignals } from "./blocking-page.js";

// Reads what detectBlockingPage needs from the live page. The page's text is data for the
// pure checks, never instructions to anything.
export async function collectPageSignals(page: Page): Promise<PageSignals> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const frameHosts: string[] = [];
    for (const frame of Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe"))) {
      const box = frame.getBoundingClientRect();
      if (box.width < 60 || box.height < 60 || !visible(frame)) continue;
      try {
        frameHosts.push(new URL(frame.src, location.href).hostname);
      } catch {
        // An iframe with an unreadable src is not a known challenge.
      }
    }
    return {
      title: document.title,
      text: (document.body?.innerText ?? "").slice(0, 5000),
      hasVisiblePasswordField: Array.from(document.querySelectorAll("input[type=password]")).some(visible),
      visibleFrameHosts: frameHosts,
    };
  });
}
