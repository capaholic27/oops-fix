---
name: Player-Aware Prediction
description: Generate Prediction dialog — prediction mode, lineup availability toggles, player markets, inline guide
type: feature
---
The Generate Prediction dialog (TeamPage) supports:
- **Prediction type** chips: Full match / Player markets / Both (`PredictionMode` in `src/lib/playerProps.ts`).
- **Player availability**: `LineupSelector` per team, pre-deselecting injured/suspended players from `useTeamInjuries`. `computeLineupImpact` turns removals into attack/concede multipliers that feed the Dixon-Coles inputs.
- **Player markets**: `PlayerPropsPanel` (anytime scorer, assist, card, foul risk) derived from team xG via `computePlayerProps`.
- **Guide**: `PredictionGuide` collapsible tutorial shown above the inputs.
The `predict-match` edge function accepts `predictionMode`, `unavailablePlayers`, `playerMarkets` and must never contradict the model numbers.
