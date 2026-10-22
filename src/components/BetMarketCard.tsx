import { useMemo } from "react";
import { createPortal } from "react-dom";
import { BarChart3, ChevronUp, X } from "lucide-react";
import type { MarketInputs, MarketOutcome, PredictionMarket } from "@/lib/predictionMarkets";
import type { TeamMatchView } from "@/lib/matchStats";
import { TeamLogo } from "@/components/TeamLogo";
import { cn } from "@/lib/utils";

/** Reference-design palette: dark card, green/gold signals. */
const GREEN = "#2ecc71";
const GOLD = "#f1c40f";
const RED = "#e74c3c";

export function pctColor(pct: number): string {
  return pct >= 60 ? GREEN : pct >= 40 ? GOLD : RED;
}

/** A single historical support row: "5/5 · last 5: X at home · Y away" — 100%. */
export type MarketHistoryRow = { text: string; pct: number };

type Condition = { scan: "home" | "away" | "both"; test: (v: TeamMatchView) => boolean } | null;

/** Same stat feeds as the market catalog — keeps card numbers consistent with the model. */
const STAT_METRICS = [
  { id: "corners", teamId: "team_corners", read: (v: TeamMatchView) => v.cornersFor, opp: (v: TeamMatchView) => v.cornersAgainst, line: 9.5, teamLine: 5 },
  { id: "cards", teamId: "team_cards", read: (v: TeamMatchView) => v.yellowCards, opp: (v: TeamMatchView) => v.isHome ? v.match.away_yellows : v.match.home_yellows, line: 3.5, teamLine: 2 },
  { id: "fouls", teamId: "team_fouls", read: (v: TeamMatchView) => v.foulsCommitted, opp: (v: TeamMatchView) => v.foulsDrawn, line: 23.5, teamLine: 10 },
  { id: "shots", teamId: "team_shots", read: (v: TeamMatchView) => v.shotsFor, opp: (v: TeamMatchView) => v.shotsAgainst, line: 23.5, teamLine: 10 },
  { id: "shots_on_target", teamId: null, read: (v: TeamMatchView) => v.shotsOnTargetFor, opp: (v: TeamMatchView) => v.shotsOnTargetAgainst, line: 7.5, teamLine: 3 },
] as const;

/** Maps a market outcome onto the team match history it can be checked against. */
function conditionFor(market: PredictionMarket, outcome: MarketOutcome, home: string, away: string): Condition {
  const id = market.id;
  const label = outcome.label;
  const totals = (v: TeamMatchView) => v.goalsFor + v.goalsAgainst;
  const overUnder = (line: number) => {
    const m = label.match(/^(Over|Under) (\d+\.5)$/);
    if (!m) return null;
    return { scan: "both" as const, test: (v: TeamMatchView) => (m[1] === "Over") === (totals(v) > line) };
  };
  if (id === "btts") return { scan: "both", test: v => (label === "Yes") === (v.goalsFor > 0 && v.goalsAgainst > 0) };
  if (id === "over_under_goals") return overUnder(Number(label.match(/(\d+\.5)/)?.[1] ?? NaN));
  if (id === "1x2" || id === "draw_no_bet") {
    if (label === home) return { scan: "home", test: v => v.goalsFor > v.goalsAgainst };
    if (label === away) return { scan: "away", test: v => v.goalsFor > v.goalsAgainst };
    if (label === "Draw") return { scan: "both", test: v => v.goalsFor === v.goalsAgainst };
    return null;
  }
  if (id === "double_chance") {
    if (label === `${home} or draw`) return { scan: "home", test: v => v.goalsFor >= v.goalsAgainst };
    if (label === `${away} or draw`) return { scan: "away", test: v => v.goalsFor >= v.goalsAgainst };
    if (label === "Either team wins") return { scan: "both", test: v => v.goalsFor !== v.goalsAgainst };
    return null;
  }
  if (id === "clean_sheet") {
    if (label === home) return { scan: "home", test: v => v.goalsAgainst === 0 };
    if (label === away) return { scan: "away", test: v => v.goalsAgainst === 0 };
    return null;
  }
  if (id === "win_to_nil") {
    if (label === home) return { scan: "home", test: v => v.goalsFor > 0 && v.goalsAgainst === 0 };
    if (label === away) return { scan: "away", test: v => v.goalsFor > 0 && v.goalsAgainst === 0 };
    return null;
  }
  if (id === "team_goals") {
    for (const [team, scan] of [[home, "home"], [away, "away"]] as const) {
      if (label.startsWith(`${team} `)) {
        const line = Number(label.slice(team.length + 1).replace("+", ""));
        if (Number.isFinite(line)) return { scan, test: v => v.goalsFor >= line };
      }
    }
    return null;
  }
  for (const metric of STAT_METRICS) {
    if (id === metric.id) return overUnder(metric.line);
    if (metric.teamId && id === metric.teamId) {
      for (const [team, scan] of [[home, "home"], [away, "away"]] as const) {
        if (label.startsWith(`${team} `)) {
          const line = Number(label.slice(team.length + 1).replace("+", ""));
          if (Number.isFinite(line)) return { scan, test: v => metric.read(v) >= line };
        }
      }
    }
  }
  return null;
}

/** Historical hit-rate rows for one market outcome: last 5, last 10, overall. */
export function marketHistoryRows(market: PredictionMarket, outcome: MarketOutcome, inputs: MarketInputs): MarketHistoryRow[] {
  const { home, away, homeViews, awayViews } = inputs;
  const condition = conditionFor(market, outcome, home, away);
  if (!condition) {
    // No checkable history (player props, correct score, …): fall back to the model's own evidence.
    return [{ text: outcome.evidence, pct: Math.round(outcome.probability) }];
  }
  let views: TeamMatchView[];
  let venueSplit = false;
  if (condition.scan === "home") views = [...homeViews];
  else if (condition.scan === "away") views = [...awayViews];
  else {
    const homeAtHome = homeViews.filter(v => v.isHome);
    const awayAway = awayViews.filter(v => !v.isHome);
    venueSplit = homeAtHome.length >= 3 && awayAway.length >= 3;
    const merged = venueSplit ? [...homeAtHome, ...awayAway] : [...new Map([...homeViews, ...awayViews].map(v => [v.match.id, v])).values()];
    views = merged.sort((a, b) => String(a.match.match_date).localeCompare(String(b.match.match_date)));
  }
  if (views.length === 0) return [{ text: outcome.evidence, pct: Math.round(outcome.probability) }];
  const context = venueSplit ? `: ${home} at home · ${away} away` : "";
  const windows = [
    { tag: `last 5${context}`, views: views.slice(-5) },
    { tag: `last 10${context}`, views: views.slice(-10) },
    { tag: "overall", views },
  ].filter(w => w.views.length > 0);
  const rows = windows.map(w => {
    const hits = w.views.filter(condition.test).length;
    return { text: `${hits}/${w.views.length} · ${w.tag}`, pct: Math.round(hits / w.views.length * 100) };
  });
  // Collapse duplicate windows (e.g. only 5 matches on file).
  return rows.filter((row, i) => i === 0 || row.text !== rows[i - 1].text);
}

/** The reference-design card: header, headline prediction, historical stats, tip, collapse footer. */
export function BetMarketCard({ market, inputs, kickoffLabel, onCollapse }: {
  market: PredictionMarket;
  inputs: MarketInputs;
  kickoffLabel?: string;
  onCollapse: () => void;
}) {
  const best = useMemo(() => [...market.outcomes].sort((a, b) => b.probability - a.probability)[0], [market]);
  const rows = useMemo(() => best ? marketHistoryRows(market, best, inputs) : [], [market, best, inputs]);
  if (!best) return null;
  const confidenceColor = market.confidence === "Strong" ? GREEN : market.confidence === "Moderate" ? GOLD : market.confidence === "Limited" ? GOLD : RED;
  return <div className="rounded-2xl border border-[#2c2c2e] bg-[#151517] overflow-hidden shadow-2xl" role="dialog" aria-label={`${market.label} prediction details`}>
    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <TeamLogo teamName={inputs.home} size="sm" />
        <TeamLogo teamName={inputs.away} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate">{inputs.home} vs {inputs.away}</p>
        {kickoffLabel && <p className="text-[10px] text-neutral-400 truncate">{kickoffLabel}</p>}
      </div>
      <button onClick={onCollapse} className="p-1.5 rounded-md text-neutral-400 hover:text-white shrink-0" aria-label="Close prediction details"><X className="w-4 h-4" /></button>
    </div>
    <div className="flex items-center gap-2.5 px-4 py-3 border-t border-[#2c2c2e]">
      <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0"><BarChart3 className="w-4 h-4" style={{ color: GREEN }} /></span>
      <p className="text-sm font-bold text-white flex-1 min-w-0 break-words">{market.label}: {best.label}</p>
      <span className="font-mono text-lg font-bold text-white shrink-0">{best.probability.toFixed(0)}%</span>
    </div>
    <div className="px-4 py-3 border-t border-[#2c2c2e] space-y-2.5">
      {rows.map((row, i) => <div key={i} className="flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: pctColor(row.pct) }} />
        <p className="text-xs text-neutral-300 flex-1 min-w-0">{row.text}</p>
        <span className="text-sm font-bold shrink-0" style={{ color: pctColor(row.pct) }}>{row.pct}%</span>
      </div>)}
      <div className="flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: confidenceColor }} />
        <p className="text-xs text-neutral-300 flex-1 min-w-0">Model confidence: <span className="font-semibold text-white">{market.confidence}</span></p>
      </div>
    </div>
    <div className="px-4 pb-3 space-y-2 text-[11px] leading-relaxed text-neutral-400">
      <p><span className="font-semibold text-white">Quick info: </span>{market.meaning}</p>
      <p><span className="font-semibold" style={{ color: GOLD }}>Tip: </span>{market.tip}</p>
    </div>
    <button onClick={onCollapse} className={cn("w-full flex items-center justify-center gap-1.5 py-3 border-t border-[#2c2c2e] text-xs font-semibold active:opacity-60 transition-opacity")} style={{ color: GOLD }}>
      Collapse Stats <ChevronUp className="w-3.5 h-3.5" />
    </button>
  </div>;
}

/** Bottom-sheet wrapper for the card. */
export function BetMarketCardSheet({ market, inputs, kickoffLabel, onClose }: {
  market: PredictionMarket;
  inputs: MarketInputs;
  kickoffLabel?: string;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center bg-background/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <BetMarketCard market={market} inputs={inputs} kickoffLabel={kickoffLabel} onCollapse={onClose} />
      </div>
    </div>,
    document.body
  );
}
