// Fetch live bookmaker odds from The Odds API (https://the-odds-api.com/).
// Returns odds grouped by market and bookmaker for a single fixture.
//
// Query params:
//   home     - home team name
//   away     - away team name
//   sport    - optional sport key (defaults to "soccer")
//   markets  - CSV of markets, defaults to "h2h,totals,btts"
//   regions  - CSV of regions, defaults to "eu,uk"
//
// Response shape (simplified):
//   {
//     found: boolean,
//     event: { id, commence_time, home, away, sport } | null,
//     bookmakers: [
//       { key, title, markets: [{ key, outcomes: [{ name, price, point? }] }] }
//     ]
//   }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ODDS_HOST = "https://api.the-odds-api.com/v4";

// The Odds API groups football under multiple sport keys. We search these
// in order and pick the first that has a match for the home/away pair.
const SOCCER_KEYS = [
  "soccer_epl",
  "soccer_england_efl_champ",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_italy_serie_b",
  "soccer_germany_bundesliga",
  "soccer_france_ligue_one",
  "soccer_netherlands_eredivisie",
  "soccer_portugal_primeira_liga",
  "soccer_turkey_super_league",
  "soccer_scotland_premier_league",
  "soccer_sweden_allsvenskan",
  "soccer_usa_mls",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  "soccer_uefa_conference_league",
  "soccer_uefa_nations_league",
  "soccer_uefa_european_championship",
  "soccer_fifa_world_cup",
  "soccer_conmebol_copa_america",
  "soccer_africa_cup_of_nations",
  "soccer_fifa_club_world_cup",
  "soccer_international_friendly",
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameMatches(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("THE_ODDS_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "THE_ODDS_API_KEY not configured", found: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const home = url.searchParams.get("home")?.trim();
  const away = url.searchParams.get("away")?.trim();
  if (!home || !away) {
    return new Response(
      JSON.stringify({ error: "home and away query params required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const markets = url.searchParams.get("markets") ?? "h2h,totals,btts";
  const regions = url.searchParams.get("regions") ?? "eu,uk";
  const sportOverride = url.searchParams.get("sport");
  const sportKeys = sportOverride ? [sportOverride] : SOCCER_KEYS;

  try {
    let lastStatus = 0;
    let lastStatusKey = "";
    for (const sportKey of sportKeys) {
      const oddsUrl = `${ODDS_HOST}/sports/${sportKey}/odds?regions=${regions}&markets=${markets}&oddsFormat=decimal&apiKey=${apiKey}`;
      const res = await fetch(oddsUrl);
      if (!res.ok) {
        // Capture the most recent non-OK status so callers can tell a bad key
        // (401) / exhausted quota (422) / missing sport (404) from a genuine
        // "no fixture listed yet" (200 with empty array).
        lastStatus = res.status;
        lastStatusKey = sportKey;
        continue;
      }
      const events = await res.json() as Array<{
        id: string; commence_time: string; home_team: string; away_team: string;
        bookmakers: Array<{ key: string; title: string; markets: Array<{ key: string; outcomes: Array<{ name: string; price: number; point?: number }> }> }>;
      }>;
      const match = events.find(
        (e) => (nameMatches(e.home_team, home) && nameMatches(e.away_team, away))
            || (nameMatches(e.home_team, away) && nameMatches(e.away_team, home)),
      );
      if (match) {
        return new Response(
          JSON.stringify({
            found: true,
            event: {
              id: match.id,
              commence_time: match.commence_time,
              home: match.home_team,
              away: match.away_team,
              sport: sportKey,
            },
            bookmakers: match.bookmakers,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        found: false,
        event: null,
        bookmakers: [],
        // When every sport key failed, lastStatus tells us why (0 = all keys
        // returned 200 but no matching fixture was listed yet).
        lastStatus,
        lastStatusKey,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("fetch-odds error", err);
    return new Response(
      JSON.stringify({ error: String(err), found: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
