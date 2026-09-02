/* League registry shared by the frontend.
 *
 * Single source of truth for the competitions the app supports. Mirrors the
 * FOTMOB_LEAGUES list in supabase/functions/_shared/fotmob.ts — keep them in
 * sync when adding a league.
 *
 * "International" = national-team friendlies (Fotmob id 114).
 * "Friendlies"   = club friendlies (Fotmob id 489).
 * Both are Pro-only (not listed in TOP_LEAGUES in premium.ts).
 */

import { isTournamentLeague } from "@/lib/teamNormalize";

export type LeagueGroup = "domestic" | "tournament" | "international" | "friendlies";

export type SupportedLeague = { code: string; name: string; group: LeagueGroup };

export const SUPPORTED_LEAGUES: SupportedLeague[] = [
  // Domestic leagues
  { code: "E0",   name: "Premier League",        group: "domestic" },
  { code: "E1",   name: "Championship",          group: "domestic" },
  { code: "SP1",  name: "La Liga",               group: "domestic" },
  { code: "D1",   name: "Bundesliga",            group: "domestic" },
  { code: "I1",   name: "Serie A",               group: "domestic" },
  { code: "I2",   name: "Serie B",               group: "domestic" },
  { code: "F1",   name: "Ligue 1",               group: "domestic" },
  { code: "N1",   name: "Eredivisie",            group: "domestic" },
  { code: "P1",   name: "Primeira Liga",         group: "domestic" },
  { code: "T1",   name: "Süper Lig",             group: "domestic" },
  { code: "SC0",  name: "Scottish Premiership",   group: "domestic" },
  { code: "MLS",  name: "Major League Soccer",   group: "domestic" },
  { code: "SWE1", name: "Allsvenskan",           group: "domestic" },
  { code: "AUS1", name: "A-League",              group: "domestic" },
  // Tournaments (club + national-team competitions)
  { code: "UCL",   name: "UEFA Champions League",  group: "tournament" },
  { code: "UEL",   name: "UEFA Europa League",     group: "tournament" },
  { code: "UECL",  name: "UEFA Conference League", group: "tournament" },
  { code: "WC",    name: "World Cup",              group: "tournament" },
  { code: "EURO",  name: "Euros",                  group: "tournament" },
  { code: "COPA",  name: "Copa America",           group: "tournament" },
  { code: "AFCON", name: "AFCON",                  group: "tournament" },
  { code: "CWC",   name: "FIFA Club World Cup",     group: "tournament" },
  { code: "UNL",   name: "UEFA Nations League",    group: "tournament" },
  // International & friendly matches (Pro-only)
  { code: "INTL", name: "International", group: "international" },
  { code: "FRLY", name: "Friendlies",   group: "friendlies" },
];

const INTERNATIONAL_NAMES = new Set(["International"]);
const FRIENDLY_NAMES = new Set(["Friendlies", "Club Friendlies"]);

/** Classify a league name into a display group for the "All" view. */
export function leagueGroupFor(name: string): LeagueGroup {
  if (FRIENDLY_NAMES.has(name)) return "friendlies";
  if (INTERNATIONAL_NAMES.has(name)) return "international";
  if (isTournamentLeague(name)) return "tournament";
  return "domestic";
}

/** True for every non-domestic competition (tournaments, internationals, friendlies). */
export function isNonDomesticLeague(name: string): boolean {
  return leagueGroupFor(name) !== "domestic";
}

/**
 * Merge data-derived leagues with the static supported list so every
 * supported competition appears in the "All" view — even before a sync has
 * populated its matches (e.g. International & Friendlies). Dedup by code,
 * preferring the supported display name.
 */
export function mergeSupportedLeagues(
  dataLeagues: { code: string; name: string }[],
): { code: string; name: string }[] {
  const byCode = new Map<string, { code: string; name: string }>();
  for (const l of SUPPORTED_LEAGUES) byCode.set(l.code, { code: l.code, name: l.name });
  for (const l of dataLeagues) {
    if (!byCode.has(l.code)) byCode.set(l.code, { code: l.code, name: l.name });
  }
  return Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name));
}
