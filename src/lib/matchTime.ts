/**
 * Kickoff times are stored in UTC (`match_date` = UTC date, `match_time` = UTC HH:MM).
 * The UI must always render them in the viewer's own timezone, which can shift a
 * game to the previous/next day (e.g. a 23:00 UTC kickoff is 01:00 next day in
 * Stockholm).
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Local YYYY-MM-DD (never use toISOString — that returns UTC). */
export function localDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type LocalKickoff = {
  date: string;        // local YYYY-MM-DD
  time: string | null; // local HH:MM
  ts: number | null;   // epoch ms
};

export function toLocalKickoff(matchDate: string, matchTime?: string | null): LocalKickoff {
  if (!matchTime || !/^\d{1,2}:\d{2}/.test(matchTime)) {
    return { date: matchDate, time: null, ts: null };
  }
  const [h, m] = matchTime.split(":");
  const dt = new Date(`${matchDate}T${pad(Number(h))}:${m.slice(0, 2)}:00Z`);
  if (Number.isNaN(dt.getTime())) return { date: matchDate, time: matchTime, ts: null };
  return {
    date: localDateStr(dt),
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
    ts: dt.getTime(),
  };
}
