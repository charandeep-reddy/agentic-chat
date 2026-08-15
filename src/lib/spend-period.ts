/**
 * The lazy period-reset rule for `spendLimit` rows — see the schema comment
 * in `lib/db/schema.ts`. There is no cron resetting these on a schedule;
 * whichever request next touches a row after its period has elapsed is the
 * one that resets it, which is why this is a pure function rather than a
 * side-effecting one: the caller decides what "touches" means (a read before
 * the spend check, a write after it) and does the actual update.
 */

export interface SpendPeriod {
  periodStart: Date;
  periodDays: number;
}

/** True once `periodDays` have elapsed since `periodStart`, as of `now`. */
export function periodHasElapsed(period: SpendPeriod, now: Date): boolean {
  const elapsedMs = now.getTime() - period.periodStart.getTime();
  return elapsedMs >= period.periodDays * 24 * 60 * 60 * 1000;
}

/**
 * The row values a reset should write: spend back to zero, and the period
 * restarted from `now` — not from where the old period would have ended, so
 * a limit that goes untouched for months doesn't "catch up" all at once by
 * chaining several elapsed periods into one reset.
 */
export function resetPeriod(now: Date): { periodStart: Date; spentCentsThisPeriod: number } {
  return { periodStart: now, spentCentsThisPeriod: 0 };
}
