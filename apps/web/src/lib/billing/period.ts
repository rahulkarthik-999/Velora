// ============================================================================
// Monthly allowance windows, anchored to the day a plan started (UTC)
// ============================================================================

function addMonthsUtc(date: Date, months: number, anchorDay: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  // Clamp to the month's length: an anchor on the 31st resets on the 30th, 28th...
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(y, m, Math.min(anchorDay, lastDay), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())
  );
}

/**
 * The monthly allowance window containing `now`, for a plan anchored at `anchor`.
 * Quarterly, annual and lifetime plans still reset every month on the anchor's day.
 */
export function allowanceWindow(anchor: Date, now: Date = new Date()): { start: Date; end: Date } {
  const day = anchor.getUTCDate();
  if (now < anchor) return { start: anchor, end: addMonthsUtc(anchor, 1, day) };
  let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  let start = addMonthsUtc(anchor, months, day);
  if (start > now) start = addMonthsUtc(anchor, --months, day);
  return { start, end: addMonthsUtc(anchor, months + 1, day) };
}
