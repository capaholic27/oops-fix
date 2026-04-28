// Fetches a team's squad with stats + photos from Fotmob (no API key needed).
// 1) Resolve team name -> Fotmob teamId via /searchapi/suggest
// 2) GET /api/data/teams?id={teamId} -> squad with stats per player
// 3) Photo URL = https://images.fotmob.com/image_resources/playerimages/{id}.png
// Cache in `team_players` for 14 days.

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
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const STALE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type RealPlayer = {
  name: string;
  fullName: string;
  photo: string | null;
  number: number | null;
  position: string | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;
  foulsDrawn: number;
  yellow: number;
  red: number;
  appearances: number;
  rating: number | null;
};

function shortName(full: string): string {
  if (!full) return full;
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

async function findFotmobTeamId(teamName: string): Promise<number | null> {
  try {
    const url = `${FOTMOB_SEARCH}?term=${encodeURIComponent(teamName)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const teamSuggest = json?.teamSuggest ?? [];
    const opts: any[] = teamSuggest[0]?.options ?? [];
    if (opts.length === 0) return null;

    const target = teamName.toLowerCase().trim();
    // Prefer non-women's senior team with closest name match.
    const ranked = opts
      .map(o => {
        const txt: string = (o?.text ?? "").split("|")[0].toLowerCase();
        const isWomen = txt.includes("(w)");
        const isYouth = /u\d{2}/.test(txt);
        const exact = txt === target;
        const contains = txt.includes(target) || target.includes(txt);
        const id = Number(o?.payload?.id);
        return { id, txt, isWomen, isYouth, exact, contains, score: Number(o?.score ?? 0) };
      })
      .filter(o => Number.isFinite(o.id) && !o.isWomen && !o.isYouth)
      .sort((a, b) => {
        if (a.exact !== b.exact) return a.exact ? -1 : 1;
        if (a.contains !== b.contains) return a.contains ? -1 : 1;
        return b.score - a.score;
      });

    return ranked[0]?.id ?? (Number(opts[0]?.payload?.id) || null);
  } catch (e) {
    console.warn("Fotmob search failed", e);
    return null;
  }
}

async function fetchFotmobSquad(teamId: number): Promise<RealPlayer[]> {
  const res = await fetch(`${FOTMOB_BASE}/teams?id=${teamId}`, {
    headers: { "User-Agent": UA, "Accept": "application/json" },
  });
  if (!res.ok) {
    console.warn(`Fotmob /teams ${teamId} HTTP ${res.status}`);
    return [];
  }
  const json = await res.json();
  const groups: any[] = json?.squad?.squad ?? [];
  const out: RealPlayer[] = [];

  for (const grp of groups) {
    if (grp?.title === "coach") continue;
    const positionDefault =
      grp?.title === "keepers" ? "Goalkeeper"
      : grp?.title === "defenders" ? "Defender"
      : grp?.title === "midfielders" ? "Midfielder"
      : grp?.title === "attackers" ? "Attacker"
      : null;

    for (const m of (grp?.members ?? [])) {
      // NOTE: `excludeFromRanking` is Fotmob's flag for "not in top performers list",
      // NOT "not on squad". We include them — they're real squad members.
      const id = m?.id;
      const fullName = m?.name ?? "";
      if (!fullName) continue;
      out.push({
        name: shortName(fullName),
        fullName,
        photo: id ? PLAYER_IMG(id) : null,
        number: m?.shirtNumber ?? null,
        position: m?.positionIdsDesc ?? positionDefault,
        goals: Number(m?.goals ?? 0) || 0,
        assists: Number(m?.assists ?? 0) || 0,
        // Fotmob squad payload doesn't expose shots/fouls — leave at 0.
        // Match-level shots/fouls live in the per-fixture stats API.
        shots: 0,
        shotsOnTarget: 0,
        fouls: 0,
        foulsDrawn: 0,
        yellow: Number(m?.ycards ?? 0) || 0,
        red: Number(m?.rcards ?? 0) || 0,
        appearances: 0,
        rating: m?.rating != null ? Number(m.rating) : null,
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

    const teamId = await findFotmobTeamId(teamName);
    if (!teamId) {
      // Serve stale if available
      if (cached && cachedAge < STALE_TTL_MS) {
        return new Response(JSON.stringify({
          success: true, cached: true, stale: true, team: teamName,
          season: cached.season, players: cached.players, source: "stale",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        success: true, team: teamName, players: [], season: null, source: "none",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const players = await fetchFotmobSquad(teamId);

    if (players.length > 0) {
      await supabase.from("team_players").upsert({
        team_name: teamName,
        season: new Date().getFullYear(),
        players: players as any,
        source: "fotmob",
        fetched_at: new Date().toISOString(),
      }, { onConflict: "team_name" });
    } else if (cached && cachedAge < STALE_TTL_MS) {
      // Empty result — keep stale cache
      return new Response(JSON.stringify({
        success: true, cached: true, stale: true, team: teamName,
        season: cached.season, players: cached.players, source: "stale",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      team: teamName,
      teamId,
      season: new Date().getFullYear(),
      players,
      source: players.length ? "fotmob" : "none",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("fetch-team-players error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
