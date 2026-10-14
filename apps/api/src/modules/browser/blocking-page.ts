// Recognizes a page the worker must stop on (spec section 6 "Application policies"): a login,
// a CAPTCHA or a bot check. The worker never works around these. It stops the run as
// BLOCKED_BY_PLATFORM and the user takes it from there. Pure: the worker collects the signals.

export type PageSignals = {
  title: string;
  // The page's visible text, truncated by the caller.
  text: string;
  hasVisiblePasswordField: boolean;
  // Hosts of iframes big enough to be a visible challenge, not an invisible badge.
  visibleFrameHosts: string[];
};

export type BlockingPage = { kind: "LOGIN" | "CAPTCHA" | "BOT_CHECK"; reason: string };

// reCAPTCHA's visible challenge is served from www.google.com or recaptcha.net.
const CHALLENGE_HOSTS = [
  "www.google.com",
  "recaptcha.net",
  "hcaptcha.com",
  "challenges.cloudflare.com",
  "arkoselabs.com",
  "funcaptcha.com",
];

const BOT_CHECK_TEXT =
  /(verify (that )?you are (a )?human|are you a robot|checking your browser|just a moment\.\.\.|unusual traffic|access denied|request blocked)/i;
const LOGIN_TEXT = /(sign in|log in|login) (to|with) (continue|apply|your account)/i;

export function detectBlockingPage(signals: PageSignals): BlockingPage | null {
  const challengeFrame = signals.visibleFrameHosts.find((host) =>
    CHALLENGE_HOSTS.some((challenge) => host === challenge || host.endsWith(`.${challenge}`)),
  );
  if (challengeFrame) {
    return { kind: "CAPTCHA", reason: `The page shows a verification challenge (${challengeFrame}). Solve it yourself on the portal.` };
  }
  const haystack = `${signals.title}\n${signals.text}`;
  if (BOT_CHECK_TEXT.test(haystack)) {
    return { kind: "BOT_CHECK", reason: "The portal is checking whether a person is using it. Open the link yourself." };
  }
  if (signals.hasVisiblePasswordField || LOGIN_TEXT.test(haystack)) {
    return { kind: "LOGIN", reason: "The portal asks you to sign in before applying. Sign in and apply yourself." };
  }
  return null;
}
