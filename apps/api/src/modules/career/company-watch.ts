// Target-company watchlist (Milestone 1.5): the pure rules. Pure and deterministic.
//
// A company is polled at most once an hour, whatever triggers it (the daily run, a retry, the
// "Check now" button), as a courtesy to its careers endpoint. "Hiring fast" is many openings
// published at once, a sign of a growing team.

export const WATCH_MIN_INTERVAL_MS = 60 * 60 * 1000;
export const HIRING_FAST_WINDOW_DAYS = 30;
export const HIRING_FAST_MIN_RECENT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type HiringPace = { open: number; recent: number; hiringFast: boolean };

export function hiringPace(postedDates: Array<Date | null>, now: Date): HiringPace {
  const cutoff = now.getTime() - HIRING_FAST_WINDOW_DAYS * DAY_MS;
  const recent = postedDates.filter((date) => date !== null && date.getTime() >= cutoff).length;
  return { open: postedDates.length, recent, hiringFast: recent >= HIRING_FAST_MIN_RECENT };
}

export function isPollDue(lastPolledAt: Date | null, now: Date): boolean {
  return lastPolledAt === null || now.getTime() - lastPolledAt.getTime() >= WATCH_MIN_INTERVAL_MS;
}
