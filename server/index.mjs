// Local Supabase-compatible API: speaks the PostgREST protocol supabase-js
// already uses, and serves the edge-function endpoints, backed by live Fotmob
// data held in memory. No external dependencies (Node built-in http only).
import http from "node:http";
import { getState, refreshFull, refreshLive, startScheduler, SYNC_JOBS } from "./store.mjs";
import { filterRows, projectRows } from "./query.mjs";

const PORT = process.env.PORT || 8080;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

function cors(req, res) {
  const origin = req.headers.origin || FRONTEND_ORIGIN;
  res.setHeader("Access-Control-Allow-Origin", origin);
  if (origin !== "*") res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "apikey, authorization, content-type, x-client-info, prefer, range");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Range");
}

function sendJson(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...extra });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

const TABLES = ["matches", "fixtures", "standings", "live_matches", "team_logos", "sync_jobs", "match_votes", "profiles", "team_players", "team_injuries"];

function rowsFor(table) {
  const s = getState();
  switch (table) {
    case "matches": return s.matches;
    case "fixtures": return s.fixtures;
    case "standings": return s.standings;
    case "live_matches": return s.live_matches;
    case "team_logos": return s.team_logos;
    case "sync_jobs": return SYNC_JOBS;
    case "match_votes": return Object.values(s.match_votes);
    default: return []; // profiles, team_players, team_injuries -> empty
  }
}

async function handleRest(req, res, table, method) {
  const url = new URL(req.url, `http://localhost`);
  let rows = rowsFor(table);
  rows = filterRows(rows, url);
  const total = rows.length;

  // Range header pagination (supabase .range())
  const rangeHeader = req.headers.range;
  let from = 0; let to = total - 1; let partial = false;
  if (rangeHeader) {
    const m = String(rangeHeader).match(/^(\d+)-(\d+)$/);
    if (m) {
      from = Number(m[1]); to = Number(m[2]);
      partial = true;
      rows = rows.slice(from, to + 1);
    }
  }

  const select = url.searchParams.get("select");
  const out = projectRows(rows, select);

  const prefer = req.headers.prefer || "";
  const wantCount = /count\s*=\s*(exact|estimated|planned)/.test(prefer);
  const headers = {};
  if (wantCount || partial) {
    const end = from + rows.length - 1;
    headers["Content-Range"] = `${from}-${end < 0 ? "*" : end}/${total}`;
  }
  sendJson(res, partial ? 206 : 200, out, headers);
}

async function handleUpsert(req, res, table) {
  const body = await readBody(req);
  const s = getState();
  if (table === "match_votes") {
    const arr = Array.isArray(body) ? body : [body];
    for (const v of arr) {
      const key = `${v.match_date}|${v.home_team}|${v.away_team}|${v.user_id || "anon"}`;
      s.match_votes[key] = { ...v, id: key };
    }
    return sendJson(res, 201, Array.isArray(body) ? body : [body]);
  }
  // other writes: accept and ignore (stopgap)
  sendJson(res, 201, Array.isArray(body) ? body : [body]);
}

async function handleFunction(req, res, name) {
  const body = await readBody(req);
  switch (name) {
    case "fetch-live":
      refreshLive(true).catch(() => {});
      return sendJson(res, 200, { success: true, live: getState().live_matches.length });
    case "fetch-fixtures":
    case "fetch-football-data":
    case "fetch-wc-history":
    case "fetch-standings":
      refreshFull(true).catch(() => {});
      return sendJson(res, 200, { success: true });
    case "predict-match":
      // Best-effort stub so the prediction view doesn't crash.
      return sendJson(res, 200, { prediction: null, markets: {}, note: "live data pending" });
    case "fetch-odds":
      return sendJson(res, 200, { odds: null });
    case "build-bet":
      return sendJson(res, 200, { confidence: 50, verdict: "Evaluation unavailable in preview mode." });
    case "edge-picks":
      return sendJson(res, 200, { picks: [] });
    case "resolve-team-logo": {
      const s = getState();
      const name = body?.name || body?.team;
      const found = s.team_logos.find((l) => l.team_name.toLowerCase() === String(name).toLowerCase());
      return sendJson(res, 200, { logo_url: found?.logo_url || null });
    }
    case "fetch-team-players":
      return sendJson(res, 200, { players: [] });
    case "fetch-team-injuries":
      return sendJson(res, 200, { injuries: [] });
    case "settle-bet-results":
      return sendJson(res, 200, { success: true });
    default:
      return sendJson(res, 200, { success: true });
  }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    const s = getState();
    return sendJson(res, 200, { ok: true, ready: s.ready, matches: s.matches.length, fixtures: s.fixtures.length, standings: s.standings.length, live: s.live_matches.length });
  }

  const url = new URL(req.url, `http://localhost`);
  const parts = url.pathname.split("/").filter(Boolean); // ["rest","v1",table] | ["functions","v1",fn] | ["auth","v1",...]

  if (parts[0] === "rest" && parts[1] === "v1" && parts[2]) {
    const table = parts[2];
    if (!TABLES.includes(table)) return sendJson(res, 404, { error: `table "${table}" not found` });
    try {
      if (req.method === "GET") return await handleRest(req, res, table, req.method);
      if (["POST", "PATCH", "PUT"].includes(req.method)) return await handleUpsert(req, res, table);
      if (req.method === "DELETE") return sendJson(res, 204, {});
    } catch (e) {
      return sendJson(res, 500, { error: String(e?.message || e) });
    }
  }

  if (parts[0] === "functions" && parts[1] === "v1" && parts[2]) {
    try { return await handleFunction(req, res, parts[2]); }
    catch (e) { return sendJson(res, 500, { error: String(e?.message || e) }); }
  }

  // Auth + realtime stubs so the supabase-js client initializes without crashing.
  if (parts[0] === "auth" && parts[1] === "v1") {
    if (parts[2] === "settings") return sendJson(res, 200, { external: { email: false, oauth: false }, disable_signup: false });
    return sendJson(res, 401, { error: "no session" });
  }
  if (parts[0] === "realtime") {
    // WebSocket upgrade not supported; supabase-js realtime retries silently.
    res.writeHead(404); return res.end();
  }

  sendJson(res, 404, { error: "not found", path: url.pathname });
});

startScheduler();
server.listen(PORT, "0.0.0.0", () => console.log(`[api] listening on :${PORT}`));
