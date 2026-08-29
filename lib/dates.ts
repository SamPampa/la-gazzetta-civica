const MS_PER_DAY = 86_400_000;

function utcCalendarDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseDeadlineUtcDay(deadlineStr: string): number | null {
  const trimmed = deadlineStr.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return utcCalendarDay(new Date(parsed));
}

/**
 * Calendar-day lateness of a decreto-attuativo deadline versus `referenceDate`
 * (default: now). Null or still-future deadlines return 0; a past deadline
 * returns the UTC date-only difference in days.
 */
export function calculateDelayDays(
  deadlineStr: string | null,
  referenceDate: Date = new Date(),
): number {
  if (!deadlineStr) return 0;
  const deadlineUtc = parseDeadlineUtcDay(deadlineStr);
  if (deadlineUtc === null) return 0;

  const referenceUtc = utcCalendarDay(referenceDate);
  if (deadlineUtc >= referenceUtc) return 0;
  return Math.round((referenceUtc - deadlineUtc) / MS_PER_DAY);
}
