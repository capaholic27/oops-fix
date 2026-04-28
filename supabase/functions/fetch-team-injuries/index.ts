// Fetches a team's current injuries from Fotmob (no API key needed).
// Uses /api/data/teams?id={fotmobTeamId} which includes per-player `injured`/`injury` fields.
// Cache in `team_injuries` for 12h.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOTMOB_BASE = "https://www.fotmob.com/api/data";
const FOTMOB_SEARCH = "https://apigw.fotmob.com/searchapi/suggest";
const PLAYER_IMG = (id: number | string) =>
  `https://images.fotmob.com/image_resources/playerimages/${id}.png`;

const UA = "Mozilla/5.0 (compatible; FootballEdgeBot/1.0; +https://lovable.dev)";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Injury = {
  playerName: string;
  playerId: number | null;
  photo: string | null;
  type: string | null;
  reason: string | null;
  fixtureDate: string | null;
  league: string | null;
  impact: string | null;
};

function getInjuryImpact(reason: string | null): string {
  if (!reason) return "Status unknown";
  const r = reason.toLowerCase();
  if (r.includes("suspended") || r.includes("red card")) return "Unavailable due to suspension.";
  if (r.includes("doubtful")) return "Game-time decision.";
  if (r.includes("knee") || r.includes("acl") || r.includes("ankle") || r.includes("hamstring")) return "Significant physical injury; likely to miss multiple matches.";
  if (r.includes("illness") || r.includes("flu")) return "Short-term absence expected.";
  if (r.includes("knock") || r.includes("muscle")) return "Minor issue; status day-to-day.";
  return "Currently sidelined; return date subject to medical assessment.";
}

async function findFotmobTeamId(teamName: string): Promise<number | null> {
  try {
    const res = await fetch(`${FOTMOB_SEARCH}?term=${encodeURIComponent(teamName)}`, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const opts: any[] = json?.teamSuggest?.[0]?.options ?? [];
    const target = teamName.toLowerCase().trim();
    const ranked = opts
      .map(o => {
        const txt: string = (o?.text ?? "").split("|")[0].toLowerCase();
        return {
          id: Number(o?.payload?.id),
          isWomen: txt.includes("(w)"),
          isYouth: /u\d{2}/.test(txt),
          exact: txt === target,
          contains: txt.includes(target) || target.includes(txt),
          score: Number(o?.score ?? 0),
        };
      })
      .filter(o => Number.isFinite(o.id) && !o.isWomen && !o.isYouth)
      .sort((a, b) => {
        if (a.exact !== b.exact) return a.exact ? -1 : 1;
        if (a.contains !== b.contains) return a.contains ? -1 : 1;
        return b.score - a.score;
      });
    return ranked[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function fetchFotmobInjuries(teamId: number): Promise<Injury[]> {
  const res = await fetch(`${FOTMOB_BASE}/teams?id=${teamId}`, {
    headers: { "User-Agent": UA, "Accept": "application/json" },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const groups: any[] = json?.squad?.squad ?? [];
  const teamName = json?.details?.name ?? null;
  const out: Injury[] = [];
  for (const grp of groups) {
    if (grp?.title === "coach") continue;
    for (const m of (grp?.members ?? [])) {
      if (!m?.injured) continue;
      const reason = m?.injury?.expectedReturn ?? null;
      out.push({
        playerName: m?.name ?? "",
        playerId: m?.id ?? null,
        photo: m?.id ? PLAYER_IMG(m.id) : null,
        type: reason && reason.toLowerCase().includes("doubtful") ? "Questionable" : "Missing Fixture",
        reason,
        fixtureDate: null,
        league: teamName,
        impact: getInjuryImpact(reason),
      });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const teamId = await findFotmobTeamId(teamName);
    if (!teamId) {
      if (cached && cachedAge < STALE_TTL_MS) {
        return new Response(JSON.stringify({
          success: true, cached: true, stale: true, team: teamName,
          season: cached.season, injuries: cached.injuries,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        success: true, team: teamName, injuries: [], season: null, source: "none",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const injuries = await fetchFotmobInjuries(teamId);

    await supabase.from("team_injuries").upsert({
      team_name: teamName,
      season: new Date().getFullYear(),
      injuries: injuries as any,
      source: "fotmob",
      fetched_at: new Date().toISOString(),
    }, { onConflict: "team_name" });

    return new Response(JSON.stringify({
      success: true, team: teamName, teamId, season: new Date().getFullYear(),
      injuries, source: "fotmob",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("fetch-team-injuries error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
