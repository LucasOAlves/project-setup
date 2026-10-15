// Slows down password guessing: after maxFailures failed sign-ins inside the window, further
// attempts wait until the oldest failure leaves it. One limiter for the whole app, since there
// is one user.
export class SignInLimiter {
  private failures: number[] = [];
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly now: () => Date;

  constructor(options: { maxFailures?: number; windowMs?: number; now?: () => Date } = {}) {
    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
  }

  private prune(at: number) {
    this.failures = this.failures.filter((time) => at - time < this.windowMs);
  }

  check(): { allowed: boolean; retryAfterMs: number } {
    const at = this.now().getTime();
    this.prune(at);
    if (this.failures.length < this.maxFailures) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: this.failures[0]! + this.windowMs - at };
  }

  recordFailure() {
    this.failures.push(this.now().getTime());
  }

  reset() {
    this.failures = [];
  }
}
