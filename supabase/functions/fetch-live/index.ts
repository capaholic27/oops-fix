// Fast "live lane" sync.
// Pulls Fotmob's day match list, keeps in-play matches (plus recently finished),
// enriches them with the match-details event feed + stats, and upserts into
// public.live_matches. Designed to run every minute via cron.

import { adminClient } from "../_shared/quota.ts";
import { FOTMOB_LEAGUES } from "../_shared/fotmob.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (compatible; FootballEdgeBot/1.0; +https://lovable.dev)";
const BASE = "https://www.fotmob.com/api/data";

const FT_KEEP_MS = 15 * 60 * 1000; // keep finished matches visible for 15 min
const MAX_DETAILS = 30; // cap detail calls per run

type LeagueMeta = { code: string; name: string };

const LEAGUE_BY_ID = new Map<number, LeagueMeta>(
  FOTMOB_LEAGUES.map((l) => [l.id, { code: l.code, name: l.name }])
);

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) {
      console.warn(`fotmob ${url} HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`fotmob ${url} error`, e);
    return null;
  }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Parse Fotmob "27.08.2026 22:00:00" into epoch ms (treated as UTC-ish local string). */
function parseHalfTime(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return Date.parse(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss ?? "00"}Z`);
}

/** Derive a display minute from the match status halves. */
function deriveMinute(status: any): { minute: number | null; state: string; label: string } {
  const halfs = status?.halfs ?? {};
  const now = Date.now();
  const periodLength = Number(status?.periodLength ?? 45);

  if (status?.finished) return { minute: null, state: "ft", label: "FT" };

  // Prefer Fotmob's own live clock ("78'", "45+2'", "HT") — avoids timezone drift.
  const short = String(status?.liveTime?.short ?? "").replace(/[^\dA-Za-z+]/g, "");
  if (/^HT$/i.test(short)) return { minute: periodLength, state: "ht", label: "HT" };
  const m = short.match(/^(\d+)(?:\+(\d+))?/);
  if (m) {
    const mins = Number(m[1]) + Number(m[2] ?? 0);
    return { minute: mins, state: "live", label: `${m[1]}${m[2] ? "+" + m[2] : ""}'` };
  }


  const secondStart = parseHalfTime(halfs.secondHalfStarted);
  const firstEnd = parseHalfTime(halfs.firstHalfEnded);
  const firstStart = parseHalfTime(halfs.firstHalfStarted);

  // Extra time
  const etFirst = parseHalfTime(halfs.firstExtraHalfStarted);
  const etSecond = parseHalfTime(halfs.secondExtraHalfStarted);
  if (etSecond) {
    const mins = Math.floor((now - etSecond) / 60000) + 105;
    return { minute: mins, state: "live", label: `${mins}'` };
  }
  if (etFirst) {
    const mins = Math.floor((now - etFirst) / 60000) + 90;
    return { minute: mins, state: "live", label: `${mins}'` };
  }

  if (secondStart) {
    const mins = Math.floor((now - secondStart) / 60000) + periodLength;
    return { minute: mins, state: "live", label: `${mins}'` };
  }
  if (firstEnd) return { minute: periodLength, state: "ht", label: "HT" };
  if (firstStart) {
    const mins = Math.max(1, Math.floor((now - firstStart) / 60000));
    return { minute: mins, state: "live", label: `${mins}'` };
  }
  return { minute: null, state: "live", label: "LIVE" };
}

type Candidate = {
  id: number;
  league_code: string | null;
  league_name: string;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  status: string;
  status_label: string;
  minute: number | null;
  kickoff_at: string | null;
  finished_at: string | null;
};

/** Pull today's + yesterday's day lists and filter to live / recently finished. */
async function collectCandidates(): Promise<Candidate[]> {
  const now = Date.now();
  const dates = [new Date(now - 86400000), new Date(now)];
  const out: Candidate[] = [];

  for (const d of dates) {
    const data = await getJson(`${BASE}/matches?date=${ymd(d)}`);
    const leagues: any[] = data?.leagues ?? [];
    for (const lg of leagues) {
      const meta =
        LEAGUE_BY_ID.get(Number(lg?.primaryId)) ?? LEAGUE_BY_ID.get(Number(lg?.id));
      if (!meta) continue;
      for (const m of lg?.matches ?? []) {
        const st = m?.status ?? {};
        if (st.cancelled) continue;
        if (!st.started) continue;

        const utc = st.utcTime ? Date.parse(st.utcTime) : NaN;
        const gameEnded = parseHalfTime(st?.halfs?.gameEnded);

        if (st.finished) {
          const endedAt = gameEnded ?? (Number.isFinite(utc) ? utc + 115 * 60000 : now);
          if (now - endedAt > FT_KEEP_MS) continue;
        }

        const { minute, state, label } = deriveMinute(st);
        const home = String(m?.home?.name ?? "").trim();
        const away = String(m?.away?.name ?? "").trim();
        if (!home || !away) continue;

        out.push({
          id: Number(m?.id),
          league_code: meta.code,
          league_name: meta.name,
          home_team: home,
          away_team: away,
          home_goals: Number(m?.home?.score ?? 0) || 0,
          away_goals: Number(m?.away?.score ?? 0) || 0,
          status: state,
          status_label: st?.reason?.short ?? label,
          minute,
          kickoff_at: Number.isFinite(utc) ? new Date(utc).toISOString() : null,
          finished_at: st.finished ? new Date(gameEnded ?? now).toISOString() : null,
        });
      }
    }
  }

  // dedupe by fotmob id
  const seen = new Set<number>();
  return out.filter((c) => {
    if (!Number.isFinite(c.id) || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

function pickStat(groups: any[], keys: string[]): [number | null, number | null] {
  for (const g of groups) {
    for (const item of g?.stats ?? g?.items ?? []) {
      const title = String(item?.title ?? item?.key ?? "").toLowerCase();
      if (keys.some((k) => title.includes(k))) {
        const vals = item?.stats ?? item?.value ?? [];
        const h = Array.isArray(vals) ? vals[0] : null;
        const a = Array.isArray(vals) ? vals[1] : null;
        const num = (v: any) => {
          if (v === null || v === undefined) return null;
          const n = parseFloat(String(v).replace("%", "").split("(")[0].trim());
          return Number.isFinite(n) ? n : null;
        };
        return [num(h), num(a)];
      }
    }
  }
  return [null, null];
}

function flattenStatGroups(stats: any): any[] {
  if (!stats) return [];
  const periods = stats?.Periods ?? stats?.periods;
  const all = periods?.All ?? periods?.all ?? stats;
  const arr = all?.stats ?? all;
  return Array.isArray(arr) ? arr : [];
}

async function enrich(c: Candidate) {
  const d = await getJson(`${BASE}/matchDetails?matchId=${c.id}`);
  if (!d) return { events: [], stats: {} };

  const facts = d?.content?.matchFacts ?? {};
  const rawEvents: any[] = facts?.events?.events ?? [];
  const events = rawEvents
    .filter((e) => e?.type)
    .map((e) => ({
      type: String(e.type),
      minute: Number(e.time ?? e.timeStr ?? 0) || null,
      minuteStr: String(e.timeStr ?? e.time ?? ""),
      isHome: !!e.isHome,
      player: e?.player?.name ?? e?.nameStr ?? null,
      assist: e?.assistStr ?? null,
      card: e?.card ?? null,
      ownGoal: !!e.ownGoal,
      homeScore: e?.homeScore ?? null,
      awayScore: e?.awayScore ?? null,
      swap: Array.isArray(e?.swap)
        ? e.swap.map((s: any) => ({ name: s?.name ?? null, in: !!s?.["in"] }))
        : null,
    }))
    .slice(-60);

  const groups = flattenStatGroups(d?.content?.stats);
  const [posH, posA] = pickStat(groups, ["ball possession", "possession"]);
  const [shH, shA] = pickStat(groups, ["total shots", "shots"]);
  const [sotH, sotA] = pickStat(groups, ["shots on target"]);
  const [xgH, xgA] = pickStat(groups, ["expected goals"]);
  const [corH, corA] = pickStat(groups, ["corner"]);
  const [ylwH, ylwA] = pickStat(groups, ["yellow card"]);
  const [redH, redA] = pickStat(groups, ["red card"]);
  const [fouH, fouA] = pickStat(groups, ["fouls"]);

  const stats = {
    possession: [posH, posA],
    shots: [shH, shA],
    shotsOnTarget: [sotH, sotA],
    xg: [xgH, xgA],
    corners: [corH, corA],
    yellows: [ylwH, ylwA],
    reds: [
      redH ?? d?.header?.status?.numberOfHomeRedCards ?? null,
      redA ?? d?.header?.status?.numberOfAwayRedCards ?? null,
    ],
    fouls: [fouH, fouA],
  };

  return { events, stats };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = adminClient();

  try {
    const candidates = await collectCandidates();

    // Enrich the most relevant ones (live first, then recently finished).
    const ordered = [...candidates].sort((a, b) => {
      const rank = (s: string) => (s === "ft" ? 1 : 0);
      return rank(a.status) - rank(b.status);
    });

    const rows: any[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const c = ordered[i];
      let extra: { events: any[]; stats: any } = { events: [], stats: {} };
      if (i < MAX_DETAILS) extra = await enrich(c);
      rows.push({
        fotmob_match_id: c.id,
        league_code: c.league_code,
        league_name: c.league_name,
        home_team: c.home_team,
        away_team: c.away_team,
        home_goals: c.home_goals,
        away_goals: c.away_goals,
        status: c.status,
        status_label: c.status_label,
        minute: c.minute,
        kickoff_at: c.kickoff_at,
        finished_at: c.finished_at,
        events: extra.events,
        stats: extra.stats,
        updated_at: new Date().toISOString(),
      });
    }

    let upserted = 0;
    if (rows.length) {
      const { error } = await supabase
        .from("live_matches")
        .upsert(rows, { onConflict: "fotmob_match_id" });
      if (error) console.error("upsert live_matches", error);
      else upserted = rows.length;

      // Write finished matches straight into history so results don't lag.
      const finished = rows.filter((r) => r.status === "ft" && r.kickoff_at);
      if (finished.length) {
        const historyRows = finished.map((r) => {
          const d = new Date(r.kickoff_at as string);
          const yr = d.getUTCFullYear();
          const season = `${String(yr % 100).padStart(2, "0")}${String((yr + 1) % 100).padStart(2, "0")}`;
          const st = r.stats ?? {};
          const n = (v: any) => (Number.isFinite(v) ? Math.round(v) : 0);
          return {
            league_code: r.league_code,
            league_name: r.league_name,
            season,
            match_date: d.toISOString().slice(0, 10),
            home_team: r.home_team,
            away_team: r.away_team,
            ft_home_goals: r.home_goals,
            ft_away_goals: r.away_goals,
            ft_result:
              r.home_goals > r.away_goals ? "H" : r.home_goals < r.away_goals ? "A" : "D",
            home_shots: n(st.shots?.[0]),
            away_shots: n(st.shots?.[1]),
            home_shots_target: n(st.shotsOnTarget?.[0]),
            away_shots_target: n(st.shotsOnTarget?.[1]),
            home_corners: n(st.corners?.[0]),
            away_corners: n(st.corners?.[1]),
            home_yellows: n(st.yellows?.[0]),
            away_yellows: n(st.yellows?.[1]),
            home_reds: n(st.reds?.[0]),
            away_reds: n(st.reds?.[1]),
            home_fouls: n(st.fouls?.[0]),
            away_fouls: n(st.fouls?.[1]),
          };
        });
        const { error: hErr } = await supabase.from("matches").upsert(historyRows, {
          onConflict: "league_code,match_date,home_team,away_team",
          ignoreDuplicates: true,
        });
        if (hErr) console.warn("history upsert skipped", hErr.message);
      }
    }

    // Drop stale rows (finished long ago or no longer reported).
    const keepIds = rows.map((r) => r.fotmob_match_id);
    const cutoff = new Date(Date.now() - FT_KEEP_MS).toISOString();
    if (keepIds.length) {
      await supabase
        .from("live_matches")
        .delete()
        .not("fotmob_match_id", "in", `(${keepIds.join(",")})`)
        .lt("updated_at", cutoff);
    } else {
      await supabase.from("live_matches").delete().lt("updated_at", cutoff);
    }

    return new Response(
      JSON.stringify({
        success: true,
        live: rows.filter((r) => r.status !== "ft").length,
        recentlyFinished: rows.filter((r) => r.status === "ft").length,
        upserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-live error", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
