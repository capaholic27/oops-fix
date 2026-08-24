---
name: Recency Window
description: 400-day rolling window so old seasons never leak into current form or predictions
type: feature
---
`matches` holds several seasons plus tournament archives back to 2002. Every form/prediction consumer must slice through `filterRecentViews` / `filterRecentMatches` (`src/lib/matchStats.ts`, RECENT_WINDOW_DAYS = 400) before taking `slice(-N)`. Falls back to the last 5 matches when a team (e.g. national side) has nothing inside the window so pages never go blank. Applied in TeamPage, PremiumPage (Pro), UpcomingFixtures, FixturePredictSheet.
