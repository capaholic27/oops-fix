# Base44 Agent Notes

## Project Overview
Lovable-generated Vite + React + TypeScript app with Supabase backend.
Football (soccer) match prediction and odds platform.

## Tech Stack
- **Frontend**: Vite + React 18 + TypeScript, Tailwind CSS, shadcn/ui (Radix)
- **Backend**: Supabase (Postgres + Edge Functions + Auth)
- **Build**: `npm run dev` (Vite dev server), `npm run build` (production)

## Development
- App runs via `docker compose -f docker-compose.base44.yml up -d` (web service on port 3000)
- Source is bind-mounted; Vite HMR with polling (`CHOKIDAR_USEPOLLING=true`) for live reload
- Dependencies installed at container startup via `npm install`
- Vite dev server binds 0.0.0.0:3000, `allowedHosts: true` in vite.config.ts

## Environment / Secrets
- Supabase credentials (URL, publishable key, project ID) in `.env` as defaults
- Real secrets override via `/run/base44/app.env` (last in `env_file` list)
- Supabase anon key is a public/publishable key (safe for client-side use)

## Supabase Edge Functions
Located in `supabase/functions/`:
- `fetch-fixtures`, `fetch-odds`, `fetch-live`, `fetch-standings`
- `predict-match`, `edge-picks`, `build-bet`
- `fetch-team-injuries`, `fetch-team-players`, `fetch-wc-history`
- `resolve-team-logo`, `settle-bet-results`
- Shared utilities in `supabase/functions/_shared/` (fotmob.ts)

## Key Source Directories
- `src/pages/` — route pages (Index, TeamPage, UpcomingGamesPage, PremiumPage, ProfilePage)
- `src/components/` — UI components (FixturePredictSheet, UpcomingFixtures, PredictedTacticalProfile, etc.)
- `src/hooks/` — custom hooks (useMatches, useLiveMatches, etc.)
- `src/integrations/supabase/` — Supabase client and types
- `src/lib/` — utilities (teamNormalize, timezone, etc.)
- `src/data/` — static data

## Verification
- `curl -s http://localhost:3000/` returns 200 with Vite-injected HTML
- `docker compose -f docker-compose.base44.yml ps` shows web service Up
- `docker compose -f docker-compose.base44.yml logs --tail=20 web` shows Vite HMR activity

## Tests
- `npm run test` (vitest) — run inside container: `docker compose -f docker-compose.base44.yml exec web npm run test`
