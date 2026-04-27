// Fetches a team's current injuries/suspensions from API-Football's /injuries endpoint.
// Caches in `team_injuries` for 12h. Tries season 2025 first, falls back to 2024.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, reserveQuota, refundQuota, getTodayCount, DAILY_LIMIT } from "../_shared/quota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAPIDAPI_HOST = "v3.football.api-sports.io";
// Free plan only allows 2022-2024
const SEASONS = [2024];
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Injury = {
  playerName: string;
  playerId: number | null;
  photo: string | null;
  type: string | null;       // "Missing Fixture" | "Questionable"
  reason: string | null;     // e.g. "Knee Injury", "Hamstring", "Suspended"
  fixtureDate: string | null;
  league: string | null;
  impact: string | null;     // Added: Explanation of impact
};

async function findTeamId(teamName: string, apiKey: string): Promise<number | null> {
  const candidates = [teamName, teamName.replace(/\s+FC$/i, ""), teamName.replace(/^FC\s+/i, "")];
  for (const q of candidates) {
    const url = new URL(`https://${RAPIDAPI_HOST}/teams`);
    url.searchParams.set("search", q);
    const res = await fetch(url.toString(), { headers: { "x-apisports-key": apiKey } });
    if (!res.ok) continue;
    const json = await res.json();
    const list = json.response || [];
    if (list.length > 0) {
      const exact = list.find((r: any) => r.team?.name?.toLowerCase() === teamName.toLowerCase());
      return (exact?.team?.id ?? list[0].team?.id) || null;
    }
  }
  return null;
}

function getInjuryImpact(reason: string | null): string {
  if (!reason) return "Status unknown";
  const r = reason.toLowerCase();
  if (r.includes("suspended") || r.includes("red card")) return "Unavailable due to suspension.";
  if (r.includes("knee") || r.includes("acl") || r.includes("ankle") || r.includes("hamstring")) return "Significant physical injury; likely to miss multiple matches.";
  if (r.includes("illness") || r.includes("flu")) return "Short-term absence expected.";
  if (r.includes("knock") || r.includes("muscle")) return "Minor issue; status day-to-day.";
  return "Currently sidelined; return date subject to medical assessment.";
}

async function fetchInjuries(teamId: number, season: number, apiKey: string): Promise<Injury[]> {
  const url = new URL(`https://${RAPIDAPI_HOST}/injuries`);
  url.searchParams.set("team", String(teamId));
  url.searchParams.set("season", String(season));
  const res = await fetch(url.toString(), { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) return [];
  const json = await res.json();
  const rows = (json.response || []) as any[];

  // Keep only the most recent record per player so we don't show duplicates from past fixtures.
  const byPlayer = new Map<string, Injury>();
  for (const r of rows) {
    const p = r.player ?? {};
    const f = r.fixture ?? {};
    const l = r.league ?? {};
    const key = String(p.id ?? p.name ?? "");
    if (!key) continue;
    const inj: Injury = {
      playerName: p.name ?? "",
      playerId: p.id ?? null,
      photo: p.photo ?? null,
      type: p.type ?? null,
      reason: p.reason ?? null,
      fixtureDate: f.date ?? null,
      league: l.name ?? null,
      impact: getInjuryImpact(p.reason ?? null),
    };
    const prev = byPlayer.get(key);
    if (!prev) { byPlayer.set(key, inj); continue; }
    // Keep the one with the latest fixture date
    const a = prev.fixtureDate ? Date.parse(prev.fixtureDate) : 0;
    const b = inj.fixtureDate ? Date.parse(inj.fixtureDate) : 0;
    if (b > a) byPlayer.set(key, inj);
  }
  return Array.from(byPlayer.values());
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

    // Cache check
    const { data: cached } = await supabase
      .from("team_injuries")
      .select("*")
      .eq("team_name", teamName)
      .maybeSingle();

    const cachedAge = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
    const fresh = cached && cachedAge < CACHE_TTL_MS;

    if (!force && fresh) {
      return new Response(JSON.stringify({
        success: true, cached: true, team: teamName,
        season: cached!.season, injuries: cached!.injuries,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reserve quota: 1 /teams + up to 2 /injuries = 3 max
    const reservation = await reserveQuota(supabase, 2);
    if (!reservation.ok) {
      if (cached && cachedAge < STALE_TTL_MS) {
        return new Response(JSON.stringify({
          success: true, cached: true, stale: true, quotaExhausted: true,
          team: teamName, season: cached.season, injuries: cached.injuries,
          remaining: reservation.remaining,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        success: true, team: teamName, injuries: [], season: null, source: "quota-exhausted",
        quotaExhausted: true, remaining: reservation.remaining,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let usedCalls = 0;
    const teamId = await findTeamId(teamName, apiKey);
    usedCalls += 1;
    if (!teamId) {
      await refundQuota(supabase, 3 - usedCalls);
      return new Response(JSON.stringify({
        success: true, team: teamName, injuries: [], season: null, source: "none",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let injuries: Injury[] = [];
    let usedSeason: number | null = null;
    for (const s of SEASONS) {
      injuries = await fetchInjuries(teamId, s, apiKey);
      usedCalls += 1;
      if (injuries.length > 0) { usedSeason = s; break; }
    }
    await refundQuota(supabase, 3 - usedCalls);

    await supabase.from("team_injuries").upsert({
      team_name: teamName,
      season: usedSeason,
      injuries: injuries as any,
      source: "api-football",
      fetched_at: new Date().toISOString(),
    }, { onConflict: "team_name" });

    return new Response(JSON.stringify({
      success: true, team: teamName, teamId, season: usedSeason,
      injuries, source: injuries.length ? "api-football" : "none",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("fetch-team-injuries error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
