---
name: Edge Page
description: AI-powered betting edge page replacing News — best picks, value alerts, bet builder
type: feature
---
The "Edge" page (nav position 4, icon Crosshair) replaced the News page. Two tabs:
1. **Today's Edge** — calls `edge-picks` edge function for best picks, high confidence predictions, value alerts, undervalued odds
2. **Bet Builder** — user enters target odds + risk level (low/medium/high), calls `build-bet` edge function which uses AI to construct an optimal parlay/accumulator

Both edge functions use Lovable AI (gemini-3-flash-preview). Results are structured JSON.
