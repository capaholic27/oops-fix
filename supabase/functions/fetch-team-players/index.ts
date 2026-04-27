// Fetches a team's squad with stats + photos from API-Football.
// Caches in `team_players` for 24h. Tries season 2025 first, falls back to 2024.
// If API-Football has nothing (lower-division team), returns null so the
// frontend can fall back to synthetic data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveQuota, refundQuota } from "../_shared/quota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAPIDAPI_HOST = "v3.football.api-sports.io";
// Free plan only allows seasons 2022-2024. Use 2024 for historical stats.
const STATS_SEASON = 2024;
// Squads change rarely. Long cache to protect the 100/day limit.
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const STALE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // serve stale up to 60 days if quota exhausted

type ApiPlayer = {
  name: string;
  fullName: string;
  photo: string | null;
  number: number | null;
  position: string | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;          // fouls committed
  foulsDrawn: number;     // fouls won
  yellow: number;
  red: number;
  appearances: number;
  rating: number | null;
};

async function apiFetch(endpoint: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`https://${RAPIDAPI_HOST}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API-Football ${res.status}: ${t}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    console.warn("API errors:", JSON.stringify(json.errors));
  }
  return json.response || [];
}

async function findTeamId(teamName: string, apiKey: string): Promise<number | null> {
  const candidates = [teamName, teamName.replace(/\s+FC$/i, ""), teamName.replace(/^FC\s+/i, "")];
  for (const q of candidates) {
    try {
      const res = await apiFetch("/teams", { search: q }, apiKey);
      if (res.length > 0) {
        // Prefer exact / case-insensitive name match
        const exact = res.find((r: any) =>
          r.team?.name?.toLowerCase() === teamName.toLowerCase()
        );
        return (exact?.team?.id ?? res[0].team?.id) || null;
      }
    } catch (e) {
      console.error("findTeamId error", e);
    }
  }
  return null;
}

/**
 * Fetches the CURRENT squad (1 API call) and enriches with last-season stats (paginated).
 * Returns ApiPlayer[] for ALL roster members, even if they have no stats yet.
 * `maxStatsCalls` limits the pagination cost; remaining unused calls should be refunded by caller.
 * Returns { players, callsUsed }.
 */
async function fetchSquadWithStats(
  teamId: number,
  apiKey: string,
  maxStatsCalls: number,
): Promise<{ players: ApiPlayer[]; callsUsed: number }> {
  let callsUsed = 0;

  // 1) Current squad (always 1 call)
  const squadRes = await apiFetch("/players/squads", { team: String(teamId) }, apiKey);
  callsUsed += 1;
  const roster: any[] = squadRes?.[0]?.players ?? [];
  if (roster.length === 0) return { players: [], callsUsed };

  // 2) Stats by player ID for last completed season (paginated)
  const statsByPid = new Map<number, any>();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && callsUsed < 1 + maxStatsCalls) {
    try {
      const url = new URL(`https://${RAPIDAPI_HOST}/players`);
      url.searchParams.set("team", String(teamId));
      url.searchParams.set("season", String(STATS_SEASON));
      url.searchParams.set("page", String(page));
      const res = await fetch(url.toString(), { headers: { "x-apisports-key": apiKey } });
      callsUsed += 1;
      if (!res.ok) break;
      const json = await res.json();
      totalPages = json.paging?.total ?? 1;
      for (const row of (json.response || [])) {
        const pid = row.player?.id;
        if (pid != null) statsByPid.set(pid, row);
      }
      page++;
    } catch (e) {
      console.error("stats page error", e);
      break;
    }
  }

  // 3) Merge: every roster member becomes an ApiPlayer
  const players: ApiPlayer[] = roster.map((p: any): ApiPlayer => {
    const row = statsByPid.get(p.id);
    const stat = row?.statistics?.[0] ?? {};
    const games = stat.games ?? {};
    const goals = stat.goals ?? {};
    const shots = stat.shots ?? {};
    const fouls = stat.fouls ?? {};
    const cards = stat.cards ?? {};
    const fullName = row?.player?.name ?? p.name ?? "";
    const fn = row?.player?.firstname;
    const ln = row?.player?.lastname;
    const short = fn && ln ? `${fn[0]}. ${ln}` : (p.name ?? fullName);
    return {
      name: short,
      fullName,
      photo: p.photo ?? row?.player?.photo ?? null,
      number: p.number ?? games.number ?? null,
      position: p.position ?? games.position ?? null,
      goals: Number(goals.total ?? 0) || 0,
      assists: Number(goals.assists ?? 0) || 0,
      shots: Number(shots.total ?? 0) || 0,
      shotsOnTarget: Number(shots.on ?? 0) || 0,
      fouls: Number(fouls.committed ?? 0) || 0,
      foulsDrawn: Number(fouls.drawn ?? 0) || 0,
      yellow: Number(cards.yellow ?? 0) || 0,
      red: Number(cards.red ?? 0) || 0,
      appearances: Number(games.appearences ?? 0) || 0,
      rating: games.rating ? Number(games.rating) : null,
    };
  });

  return { players, callsUsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "RAPIDAPI_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const teamName = (body.team || url.searchParams.get("team") || "").trim();
    const force = body.force === true || url.searchParams.get("force") === "1";

    if (!teamName) {
      return new Response(JSON.stringify({ success: false, error: "team required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Cache check
    const { data: cached } = await supabase
      .from("team_players")
      .select("*")
      .eq("team_name", teamName)
      .maybeSingle();

    const cachedAge = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
    const fresh = cached && cachedAge < CACHE_TTL_MS;

    if (!force && fresh) {
      return new Response(JSON.stringify({
        success: true, cached: true, team: teamName,
        season: cached!.season, players: cached!.players,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reserve quota: /teams (1) + /players paginated (typically 2-3, reserve 5 max)
    const RESERVE = 6;
    const reservation = await reserveQuota(supabase, RESERVE);
    if (!reservation.ok) {
      // Out of quota — serve stale cache if recent enough
      if (cached && cachedAge < STALE_TTL_MS) {
        return new Response(JSON.stringify({
          success: true, cached: true, stale: true, quotaExhausted: true,
          team: teamName, season: cached.season, players: cached.players,
          remaining: reservation.remaining,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        success: true, team: teamName, players: [], season: null,
        source: "quota-exhausted", quotaExhausted: true, remaining: reservation.remaining,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let usedCalls = 0;
    // 2) Resolve team id
    const teamId = await findTeamId(teamName, apiKey);
    usedCalls += 1;
    if (!teamId) {
      console.log(`No API-Football team for "${teamName}"`);
      await refundQuota(supabase, RESERVE - usedCalls);
      return new Response(JSON.stringify({
        success: true, team: teamName, players: [], season: null, source: "none",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3) Try seasons in order
    let players: ApiPlayer[] = [];
    let usedSeason: number | null = null;
    for (const s of SEASONS) {
      const before = usedCalls;
      players = await fetchSquadStats(teamId, s, apiKey);
      // /players is paginated — assume up to 3 pages used
      usedCalls = Math.min(RESERVE, before + 3);
      if (players.length > 0) { usedSeason = s; break; }
    }
    // Refund any unused calls
    await refundQuota(supabase, RESERVE - usedCalls);

    // 4) Cache (upsert)
    if (players.length > 0) {
      await supabase.from("team_players").upsert({
        team_name: teamName,
        season: usedSeason,
        players: players as any,
        source: "api-football",
        fetched_at: new Date().toISOString(),
      }, { onConflict: "team_name" });
    }

    return new Response(JSON.stringify({
      success: true,
      team: teamName,
      teamId,
      season: usedSeason,
      players,
      source: players.length ? "api-football" : "none",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("fetch-team-players error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
