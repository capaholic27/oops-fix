# Project Memory

## Core
- FootballEdge analytics. Supabase Auth + Edge Functions. Data: football-data.co.uk & API-Football.
- Direct fetch in Edge Functions (no Supabase SDK helpers). Bottom sheets must use React portals.
- Radix UI packages are pinned; verify any updates against Shadcn UI components.
- 5-page layout with bottom nav. Disable horizontal swiping between pages. Double-tap nav to reset.
- Compact high-density UI. Fonts: Inter, DM Sans, JetBrains Mono. 0.75rem rounded corners.

## Memories
- [Data Source](mem://technical/data-source) — football-data.co.uk CSVs and API-Football fallback
- [Infrastructure](mem://technical/infrastructure) — Supabase Edge Functions direct fetch requirements
- [Statistical Modeling](mem://features/statistical-modeling) — Past N matches recency-weighted filter
- [Tactical Analysis](mem://features/tactical-analysis) — Playing style prediction and next match simulator
- [State Persistence](mem://features/state-persistence) — localStorage management for active filters
- [Recursive Navigation](mem://features/recursive-match-analysis) — Single-sheet state-driven stack for match lists
- [Interactive Stats](mem://features/interactive-stat-details) — Clickable metrics for match-by-match breakdowns
- [Team Search](mem://features/team-search) — Global search and league fallback behaviors
- [UI Architecture](mem://technical/ui-architecture) — React portals for bottom-sheet modals
- [Branding Config](mem://ui/branding) — STATIC_BADGES mapping for global club logos
- [AI Match Prediction](mem://features/ai-match-prediction) — Dixon-Coles engine and Gemini AI analysis
- [Predict Dialog](mem://ui/predict-dialog-refinement) — 4-section layout and sticky footer
- [Games Insights](mem://features/games-page-insights) — Summary analytics bar for past 80 matches
- [Dependency Constraints](mem://technical/dependency-constraints) — Pinned Radix UI packages and Shadcn integration
- [Games Page Layout](mem://ui/games-page-organization) — Horizontal date navigation for fixtures/results
- [Upcoming Fixtures](mem://features/team-upcoming-fixtures) — Expandable drawer with instant predictions
- [Design Aesthetic](mem://style/aesthetic) — Typography and border radius tokens
- [Theme System](mem://style/theme-system) — 6 modern visual themes via localStorage
- [Momentum Visualization](mem://features/momentum-visualization) — Form tracking calculation and visual charts
- [Density Layout](mem://ui/layout) — Compact rows and logo-first match banners
- [Navigation Structure](mem://ui/navigation-structure) — 5-page bottom menu system
- [Auth & Profile](mem://features/auth-and-profile) — Supabase Auth and automatic profile triggers
- [Navigation Reset](mem://ui/navigation-reset) — Double-tap bottom icon to reset page state
- [Favorites System](mem://features/favorites-system) — 3x3 grid layout and deduplication logic
- [League Selection](mem://ui/league-selection-filters) — Favorites, Top Leagues, and All tabs organization
- [Player Leaders](mem://features/player-leaders) — Interactive filter chips for top stats
- [H2H Probability](mem://features/win-probability-comparison) — Head-to-head gauge with dual-logo display
- [Team Mentality](mem://features/team-mentality) — Psychological profiles based on recent form
- [Team Normalization](mem://features/team-normalization) — Alias mapping utility to prevent duplicates
- [Premium Content](mem://features/premium-content) — Client-side unlock toggle for advanced analytics
- [Edge Page](mem://features/edge-page) — AI-powered betting edge with picks, value alerts, and bet builder
