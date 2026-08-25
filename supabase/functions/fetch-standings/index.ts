// Fetches official Fotmob league standings (one row per league) and caches them
// in the `standings` table. No API key required.
//
// Body: { force?: boolean, league?: string }  // league = our internal league_code
// Default: refresh ALL configured leagues (Fotmob exposes the table inside the
// same /leagues?id={id} payload we already use for fixtures, so this is cheap).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FOTMOB_LEAGUES } from "../_shared/fotmob.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOTMOB_BASE = "https://www.fotmob.com/api/data";
const UA = "Mozilla/5.0 (compatible; FootballEdgeBot/1.0; +https://lovable.dev)";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

const TEAM_LOGO = (id: number | string) =>
  `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;

type StandingRow = {
  position: number;
  team_id: number;
  name: string;
  short_name: string;
  logo: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  qual_color: string | null;
  form: string[]; // last 5: "W"|"D"|"L"
};

function parseScores(scores: string | null | undefined): [number, number] {
  if (!scores) return [0, 0];
  const m = scores.split(/[-–:]/).map(s => s.trim());
  const a = Number(m[0]); const b = Number(m[1]);
  return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0];
}

async function fotmobLeague(id: number): Promise<any | null> {
  try {
    const res = await fetch(`${FOTMOB_BASE}/leagues?id=${id}`, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn(`fotmob league ${id} failed`, e);
    return null;
  }
}

function extractStanding(data: any): { season: string | null; rows: StandingRow[] } {
  // The standings live at data.table[0].data.table.all (or .tables for grouped formats).
  const tableContainer = data?.table?.[0]?.data ?? {};
  let allRows: any[] = tableContainer?.table?.all ?? [];

  // For grouped (Champions League etc.), data lives under data.tables[].table.all
  if (!Array.isArray(allRows) || allRows.length === 0) {
    const grouped: any[] = tableContainer?.tables ?? [];
    allRows = grouped.flatMap((g: any) => g?.table?.all ?? []);
  }

  // Grouped competitions (MLS conferences, World Cup groups) can repeat a
  // team across the combined table and its group table — dedupe by team id,
  // keeping the first (highest-ranked) occurrence.
  const seen = new Set<string>();
  allRows = (allRows ?? []).filter((r: any) => {
    const key = String(r?.id ?? "") || String(r?.name ?? "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Pick season label off any field we can find.
  const season =
    data?.details?.selectedSeason ??
    data?.allAvailableSeasons?.[0] ??
    null;

  const rows: StandingRow[] = (allRows ?? []).map((r: any, idx: number) => {
    const [gf, ga] = parseScores(r?.scoresStr);
    const id = Number(r?.id);
    return {
      position: Number(r?.idx ?? idx + 1),
      team_id: id,
      name: r?.name ?? "",
      short_name: r?.shortName ?? r?.name ?? "",
      logo: Number.isFinite(id) ? TEAM_LOGO(id) : "",
      played: Number(r?.played ?? 0),
      wins: Number(r?.wins ?? 0),
      draws: Number(r?.draws ?? 0),
      losses: Number(r?.losses ?? 0),
      gf,
      ga,
      gd: Number(r?.goalConDiff ?? gf - ga),
      points: Number(r?.pts ?? 0),
      qual_color: r?.qualColor ?? null,
      form: Array.isArray(r?.recentResults) ? r.recentResults.slice(-5) : [],
    };
  });

  return { season, rows };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const force = body?.force === true;
    const onlyLeagueCode: string | undefined = body?.league;

    const targets = onlyLeagueCode
      ? FOTMOB_LEAGUES.filter(l => l.code === onlyLeagueCode)
      : FOTMOB_LEAGUES;

    const updated: { code: string; rows: number }[] = [];
    const teamLogoUpserts: { team_name: string; fotmob_id: number; logo_url: string }[] = [];

    for (const lg of targets) {
      // Cache check
      if (!force) {
        const { data: cached } = await supabase
          .from("standings")
          .select("fetched_at")
          .eq("league_code", lg.code)
          .maybeSingle();
        if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
          continue;
        }
      }

      const data = await fotmobLeague(lg.id);
      if (!data) continue;
      const { season, rows } = extractStanding(data);
      if (rows.length === 0) continue;

      await supabase.from("standings").upsert({
        league_code: lg.code,
        league_name: lg.name,
        season,
        rows: rows as any,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "league_code" });

      // Collect logo info for every team on the table.
      for (const r of rows) {
        if (!r.team_id || !r.name) continue;
        teamLogoUpserts.push({
          team_name: r.name,
          fotmob_id: r.team_id,
          logo_url: r.logo,
        });
      }

      updated.push({ code: lg.code, rows: rows.length });
    }

    if (teamLogoUpserts.length > 0) {
      // Dedup by team_name (last write wins)
      const map = new Map<string, typeof teamLogoUpserts[number]>();
      for (const t of teamLogoUpserts) map.set(t.team_name, t);
      const list = [...map.values()].map(t => ({
        ...t,
        fetched_at: new Date().toISOString(),
      }));
      // Upsert in batches
      for (let i = 0; i < list.length; i += 100) {
        await supabase.from("team_logos").upsert(list.slice(i, i + 100), {
          onConflict: "team_name",
        });
      }
    }

    return new Response(JSON.stringify({ success: true, updated, teamLogos: teamLogoUpserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("fetch-standings error", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
