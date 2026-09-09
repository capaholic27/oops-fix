/**
 * Centralized date/time utilities.
 *
 * The database stores match_date (YYYY-MM-DD) and match_time (HH:MM) in UTC.
 * This module converts those to the user's local timezone for display and
 * date-grouping decisions.
 *
 * Use these helpers everywhere: Games, Stats, recent form, match details,
 * predictions, and live matches.
 */

/**
 * Convert a UTC date string + optional UTC time to the user's LOCAL date.
 * If no time is provided, the date is returned as-is (we can't shift it
 * without knowing the kickoff hour).
 */
export function utcToLocalDate(utcDate: string, utcTime?: string | null): string {
  if (!utcTime) return utcDate;
  const d = new Date(`${utcDate}T${utcTime}:00Z`);
  if (isNaN(d.getTime())) return utcDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Convert a UTC time string to the user's LOCAL time string (HH:MM).
 */
export function utcToLocalTime(utcDate: string, utcTime: string): string {
  const d = new Date(`${utcDate}T${utcTime}:00Z`);
  if (isNaN(d.getTime())) return utcTime;
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Today's date in the user's local timezone (YYYY-MM-DD).
 * Uses the browser's local date, NOT UTC.
 */
export function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get a date N days from today (local timezone) as YYYY-MM-DD.
 */
export function localAddDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Check whether a match (given UTC date + optional UTC time) has already
 * kicked off in the user's local timezone. Used to exclude future matches
 * from recent form.
 */
export function isPastKickoff(utcDate: string, utcTime?: string | null): boolean {
  if (utcTime) {
    // We have the exact kickoff time — compare against now.
    const kickoff = new Date(`${utcDate}T${utcTime}:00Z`);
    if (!isNaN(kickoff.getTime())) {
      return kickoff.getTime() <= Date.now();
    }
  }
  // No time — fall back to date comparison in local timezone.
  // A match with today's date (local) is considered "past" (likely already played
  // since we only get completed results in the matches table).
  return utcDate <= localToday();
}

/**
 * Format a date string for display in the user's locale.
 */
export function formatMatchDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
