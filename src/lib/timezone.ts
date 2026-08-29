/**
 * Timezone helpers for displaying kick-off times in the user's local zone.
 *
 * The `fixtures` table stores `match_time` as a UTC "HH:MM" string (sourced
 * from API-Football ISO timestamps / football-data CSV). These helpers convert
 * that UTC time into whichever timezone the user is in — auto-detected from
 * the browser, or overridden in Settings.
 */

const USER_TZ_KEY = "fe_timezone";

/** The user's preferred timezone, falling back to the browser's local zone. */
export function getUserTimezone(): string {
  try {
    const stored = localStorage.getItem(USER_TZ_KEY);
    if (stored) return stored;
  } catch {
    /* localStorage unavailable */
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Persist (or clear) the user's timezone preference. */
export function setUserTimezone(tz: string | null): void {
  try {
    if (tz) localStorage.setItem(USER_TZ_KEY, tz);
    else localStorage.removeItem(USER_TZ_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Convert a stored kick-off time (UTC "HH:MM" + date) into the user's local
 * timezone, returning a formatted "HH:MM" string. Falls back to the raw time
 * if the input can't be parsed or the timezone is invalid.
 */
export function formatKickoffTime(
  dateStr: string,
  timeStr: string | null | undefined,
): string | null {
  if (!timeStr) return null;
  const tz = getUserTimezone();
  // Treat the stored match_time as UTC.
  const d = new Date(`${dateStr}T${timeStr}:00Z`);
  if (isNaN(d.getTime())) return timeStr;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(d);
  } catch {
    return timeStr;
  }
}

/** Common timezones offered in the Settings picker (auto option handled in UI). */
export const COMMON_TIMEZONES: string[] = [
  "Europe/London",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];
