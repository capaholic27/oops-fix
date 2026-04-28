// Fetches match results for settlement from API-Football.
// Batches by date to minimize quota usage (1 API call per unique date, ~300 fixtures each).
// Results are cached in the public.matches table via upsert so future settlements hit local DB.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, reserveQuota, refundQuota, getTodayCount, DAILY_LIMIT } from "../_shared/quota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://v3.football.api-sports.io";

type Query = { home: string; away: string; date: string };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+fc$|^fc\s+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function matchesTeam(apiName: string, target: string): boolean {
  const a = norm(apiName);
  const b = norm(target);
  if (a === b) return true;
  // partial containment (e.g. "Manchester City" vs "Man City")
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { queries } = await req.json() as { queries: Query[] };
    if (!Array.isArray(queries) || queries.length === 0) {
      return new Response(JSON.stringify({ error: "queries required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const API_KEY = Deno.env.get("RAPIDAPI_KEY");
    if (!API_KEY) throw new Error("RAPIDAPI_KEY not set");

    const supabase = adminClient();

    // Group queries by date
    const byDate = new Map<string, Query[]>();
    for (const q of queries) {
      if (!q.date || !q.home || !q.away) continue;
      const list = byDate.get(q.date) ?? [];
      list.push(q);
      byDate.set(q.date, list);
    }

    const results: Array<{
      home: string; away: string; date: string;
      found: boolean; status?: string;
      ft_home_goals?: number; ft_away_goals?: number; ft_result?: string;
      ht_home_goals?: number; ht_away_goals?: number;
    }> = [];

    // Check quota up front (1 call per unique date)
    const needed = byDate.size;
    const reservation = await reserveQuota(supabase, needed);
    if (!reservation.ok) {
      return new Response(JSON.stringify({
        error: "quota_exhausted",
        message: `Daily API limit reached (${reservation.used}/${DAILY_LIMIT}). Results will auto-settle tomorrow.`,
        results: [],
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let actuallyUsed = 0;
    const rowsToUpsert: any[] = [];

    for (const [date, qs] of byDate.entries()) {
      try {
        const url = `${API_BASE}/fixtures?date=${date}`;
        const resp = await fetch(url, {
          headers: {
            "x-apisports-key": API_KEY,
            "Accept": "application/json",
          },
        });
        actuallyUsed++;
        if (!resp.ok) {
          console.error("api-football fixtures failed", date, resp.status);
          for (const q of qs) results.push({ ...q, found: false, status: "api_error" });
          continue;
        }
        const body = await resp.json();
        const fixtures: any[] = body?.response ?? [];

        for (const q of qs) {
          const match = fixtures.find((f) =>
            matchesTeam(f?.teams?.home?.name ?? "", q.home) &&
            matchesTeam(f?.teams?.away?.name ?? "", q.away)
          );
          if (!match) {
            results.push({ ...q, found: false, status: "not_found" });
            continue;
          }
          const status = match?.fixture?.status?.short ?? "";
          const isFinished = ["FT", "AET", "PEN"].includes(status);
          if (!isFinished) {
            results.push({ ...q, found: true, status });
            continue;
          }
          const hg = match?.goals?.home ?? match?.score?.fulltime?.home ?? 0;
          const ag = match?.goals?.away ?? match?.score?.fulltime?.away ?? 0;
          const hth = match?.score?.halftime?.home ?? 0;
          const hta = match?.score?.halftime?.away ?? 0;
          const ftr = hg > ag ? "H" : hg < ag ? "A" : "D";

          results.push({
            ...q, found: true, status,
            ft_home_goals: hg, ft_away_goals: ag, ft_result: ftr,
            ht_home_goals: hth, ht_away_goals: hta,
          });

          // Cache in matches table for future settlements
          rowsToUpsert.push({
            league_code: match?.league?.id ? `API-${match.league.id}` : "API",
            league_name: match?.league?.name ?? "Unknown",
            season: String(match?.league?.season ?? new Date(date).getFullYear()),
            match_date: date,
            home_team: match?.teams?.home?.name ?? q.home,
            away_team: match?.teams?.away?.name ?? q.away,
            ft_home_goals: hg,
            ft_away_goals: ag,
            ft_result: ftr,
            ht_home_goals: hth,
            ht_away_goals: hta,
          });
        }
      } catch (e) {
        console.error("fetch fixtures error", date, e);
        for (const q of qs) results.push({ ...q, found: false, status: "fetch_error" });
      }
    }

    // Refund unused reservations
    if (actuallyUsed < needed) {
      await refundQuota(supabase, needed - actuallyUsed);
    }

    // Cache resolved matches for future (best-effort insert, ignore duplicates)
    if (rowsToUpsert.length > 0) {
      try {
        await supabase.from("matches").insert(rowsToUpsert);
      } catch (e) {
        console.warn("matches cache insert failed (likely duplicates)", e);
      }
    }

    const finalCount = await getTodayCount(supabase);
    return new Response(JSON.stringify({
      results,
      quota: { used: finalCount, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - finalCount) },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("settle-bet-results error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
