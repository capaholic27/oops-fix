// In-memory data store + background refresh. Holds the tables the frontend
// queries (matches, fixtures, standings, live_matches, team_logos, sync_jobs).
import { fetchAllLeagues, fetchLive } from "./fotmob.mjs";

const state = {
  matches: [],
  fixtures: [],
  standings: [],
  live_matches: [],
  team_logos: [],
  match_votes: {},
  lastFullRefresh: 0,
  lastLiveRefresh: 0,
  ready: false,
};

export const SYNC_JOBS = [
  { job_name: "fetch-fixtures", label: "Fixtures & results (Fotmob)", schedule: "*/15 * * * *", target_function: "fetch-fixtures", enabled: true },
  { job_name: "fetch-live", label: "Live match updates", schedule: "* * * * *", target_function: "fetch-live", enabled: true },
  { job_name: "fetch-standings", label: "League standings", schedule: "0 */6 * * *", target_function: "fetch-standings", enabled: true },
];

const FULL_TTL = 15 * 60 * 1000;
const LIVE_TTL = 30 * 1000;

let fullInFlight = null;
let liveInFlight = null;

export async function refreshFull(force = false) {
  if (!force && Date.now() - state.lastFullRefresh < FULL_TTL) return state;
  if (fullInFlight) return fullInFlight;
  fullInFlight = (async () => {
    try {
      console.log("[store] refreshing full league data from Fotmob...");
      const { results, fixtures, standings, logos } = await fetchAllLeagues();
      // Merge: keep the most recent results; replace fixtures/standings/logos.
      const byKey = new Map();
      // seed with existing results so we don't lose deeper history on a partial fetch
      for (const r of state.matches) byKey.set(`${r.match_date}|${r.home_team}|${r.away_team}`, r);
      for (const r of results) byKey.set(`${r.match_date}|${r.home_team}|${r.away_team}`, r);
      state.matches = [...byKey.values()];
      state.fixtures = fixtures;
      state.standings = standings;
      const logoMap = new Map();
      for (const l of state.team_logos) logoMap.set(l.team_name, l);
      for (const l of logos) logoMap.set(l.team_name, l);
      state.team_logos = [...logoMap.values()];
      state.lastFullRefresh = Date.now();
      state.ready = true;
      console.log(`[store] full refresh done: ${state.matches.length} matches, ${state.fixtures.length} fixtures, ${state.standings.length} standings, ${state.team_logos.length} logos`);
    } catch (e) {
      console.error("[store] full refresh failed", e?.message || e);
    } finally {
      fullInFlight = null;
    }
    return state;
  })();
  return fullInFlight;
}

export async function refreshLive(force = false) {
  if (!force && Date.now() - state.lastLiveRefresh < LIVE_TTL) return state.live_matches;
  if (liveInFlight) return liveInFlight;
  liveInFlight = (async () => {
    try {
      state.live_matches = await fetchLive();
      state.lastLiveRefresh = Date.now();
    } catch (e) {
      console.error("[store] live refresh failed", e?.message || e);
    } finally {
      liveInFlight = null;
    }
    return state.live_matches;
  })();
  return liveInFlight;
}

export function getState() { return state; }
export function isReady() { return state.ready; }

// Schedule background refreshes.
let started = false;
export function startScheduler() {
  if (started) return;
  started = true;
  refreshFull(true).catch(() => {});
  setInterval(() => refreshFull(false), 15 * 60 * 1000);
  setInterval(() => refreshLive(true), 30 * 1000);
  refreshLive(true).catch(() => {});
}
