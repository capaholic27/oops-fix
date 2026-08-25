# Auto-sync: data refreshes itself, no button needed

## Goal

All app data (fixtures, results, standings, odds) refreshes automatically in the background on a schedule — the manual Sync button becomes redundant. Sync runs even when nobody has the app open.

## How it works

Two layers:

1. **Server-side scheduled sync (primary)** — a database scheduler calls the existing sync functions on a fixed schedule, 24/7, whether or not the app is open.
2. **Client-side stale-check (backup)** — when a user opens the app, it silently checks when data was last synced; if it's older than the freshness threshold, it triggers one background sync automatically (no button, no blocking UI).

```text
Database scheduler (every N min)
        │
        ▼
fetch-fixtures ──► fixtures table ──► Games page
fetch-football-data ──► matches table ──► Stats/Pro
fetch-standings ──► standings table ──► Team lists/Rankings
fetch-odds ──► live odds ──► Edge page
        ▲
App open: if data stale → trigger once, silently
```

## Schedule

| Job | Frequency | Why |
|---|---|---|
| Fixtures (upcoming matches) | Every 15 min | Times/venues change often |
| Results (finished matches) | Every 30 min | Scores land shortly after matches end |
| Standings (tables, promotion/relegation) | Every 60 min | Changes only after matches |
| Live odds | Every 30 min | Fresh prices without burning API quota |
| Tournament history backfill | Once daily | Rarely changes; cheap no-op when current |

Jobs are staggered (e.g. :00, :07, :15) so they don't burst at once.

## Changes

### 1. Database migration (scheduled jobs)
- Register 5 scheduled jobs using the built-in `pg_cron` + `pg_net` extensions (both already enabled).
- Each job makes an HTTP POST to the corresponding sync function with the publishable key (same key the app already uses — not secret).
- Store the schedule config in a small `sync_jobs` reference table so the schedule is visible and adjustable later.

### 2. Client-side silent auto-sync (`src/hooks/useMatches.ts` + `src/pages/Index.tsx`)
- New `useAutoSync()` hook: on app mount, checks the newest `fetched_at`/`created_at` timestamps for fixtures, matches, and standings; if anything is stale, fires `useSyncFixtures` once in the background.
- Guarded so it triggers at most once per session and never blocks rendering or spams toasts (a single subtle "Data refreshed" toast at most).

### 3. Sync button becomes optional
- Keep the header Sync button as a manual override ("refresh now"), but it's no longer required — everything stays current on its own.

## Notes / technical details

- The scheduled jobs hit the same endpoints the button already calls, so behavior is identical — just automatic.
- The odds job respects the existing quota guard in `fetch-odds`; 30-min cadence keeps well within The Odds API limits.
- All sync functions are idempotent (upserts + dedup keys), so overlapping runs are safe.
- New-season promotion/relegation is covered automatically: the hourly standings job pulls the current table, and the Stats page team lists already read from it.
