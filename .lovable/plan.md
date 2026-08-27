# Live matches (real-time, Fotmob-style)

## Why it isn't live today
The app only stores two things: upcoming fixtures (date + kickoff time) and finished results. Nothing writes a match's in-play state, so there is no minute, no live score, no events. Refresh jobs also run every 15-30 minutes, which is far too slow for live.

Live is fully doable — Fotmob exposes both a day-level match list with in-play status and a per-match detail payload with stats and an event feed. We add a fast live lane on top of the existing slow lanes.

## What you get
1. **Live strip at the top of Games** — auto-appears when any match is in play: minute, score, team badges, competition, red-card/scorer markers. Empty state hidden entirely when nothing is live.
2. **Live match sheet** — tap an ongoing match to open: big scoreline with minute, goal/card/substitution timeline feed, live stats (possession, shots, shots on target, corners, cards, xG when Fotmob provides it), and the existing prediction/odds blocks re-used underneath.
3. **Auto-updating without refresh** — scores, minute and feed update every ~20 seconds while the sheet or Games page is open, and stop when the tab is backgrounded.
4. Recently finished matches stay in the strip for ~15 minutes marked FT, then drop out.

## How it works (technical)
**New table `public.live_matches`**
- `fotmob_match_id` (unique), `league_code`, `league_name`, `home_team`, `away_team`, `home_goals`, `away_goals`, `status` (`live` | `ht` | `ft`), `minute`, `started_at`, `events` jsonb, `stats` jsonb, `updated_at`.
- GRANTs: `SELECT` to `anon` + `authenticated` (public read), `ALL` to `service_role`. RLS enabled, single public read policy, writes only by the sync function.
- Added to the `supabase_realtime` publication so clients get pushes instead of relying only on polling.

**New edge function `fetch-live`**
- Pulls Fotmob's day match list (`/api/data/matches?date=YYYYMMDD`) filtered to the leagues in `_shared/fotmob.ts`, keeps matches that are started-and-not-finished (plus finished within the last 15 min).
- For each live match, fetches `/api/data/matchDetails?matchId=…` to get the event feed and stat blocks; normalises team names through the existing `canon_team` path so badges and links match the rest of the app.
- Upserts into `live_matches` on `fotmob_match_id`, deletes rows older than 15 minutes past FT.
- When a match flips to finished it also writes the final score into `matches` so history is immediately correct instead of waiting for the 30-minute results job.

**Scheduling**
- New `pg_cron` job hitting `fetch-live` every minute (pg_net timeout 60s), registered alongside the existing jobs and listed in `sync_jobs` so it shows up with the others.
- Cron gives baseline freshness even with nobody watching; the frontend adds a 20s `refetchInterval` on the live query plus a realtime subscription for instant score changes.

**Frontend**
- `useLiveMatches()` in `src/hooks/useMatches.ts`: query on `live_matches`, 20s interval, `refetchIntervalInBackground: false`, realtime channel subscription with cleanup on unmount.
- `src/components/LiveStrip.tsx` — the Games-page live section, styled with the existing `stat-card` / compact-row tokens.
- `src/components/LiveMatchSheet.tsx` — portal bottom sheet (matching `MatchDetailSheet` conventions) with feed + stats tabs.
- `UpcomingGamesPage.tsx`: render `LiveStrip` above the date scroller; today's fixtures that are currently live show a pulsing LIVE badge and open the live sheet instead of the prediction sheet.

## Caveats
- Fotmob's API is unofficial and unauthenticated; if a payload shape changes the live lane degrades to "no live matches" rather than breaking the page.
- Per-match detail calls are limited to matches actually in play, so the minute-by-minute job stays small.
- Coverage is the leagues already listed in `_shared/fotmob.ts` — no new competitions are added in this change.
