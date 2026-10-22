import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronRight, Info, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveOddsRow } from "@/components/LiveOddsRow";
import { TeamLogo } from "@/components/TeamLogo";
import { AiMatchPrediction } from "@/components/AiMatchPrediction";
import { BetMarketCardSheet, pctColor } from "@/components/BetMarketCard";
import { buildPredictionMarkets, type MarketId, type MarketInputs, type PredictionMarket } from "@/lib/predictionMarkets";
import type { PredictionMode } from "@/lib/playerProps";
import { cn } from "@/lib/utils";

export type PredictionView = "quick" | "original" | "ai";

export function PredictionViewSwitch({ value, onChange }: { value: PredictionView; onChange: (view: PredictionView) => void }) {
  return <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Prediction metric view">
    {([{ id: "quick", label: "Quick", icon: Zap }, { id: "original", label: "Metrics", icon: SlidersHorizontal }, { id: "ai", label: "AI text", icon: Sparkles }] as const).map(view =>
      <Button key={view.id} variant={value === view.id ? "outline" : "ghost"} size="sm" className="h-8 text-xs" aria-pressed={value === view.id} onClick={() => onChange(view.id)}><view.icon />{view.label}</Button>
    )}
  </div>;
}

function MarketRow({ market, home, away, expanded, onToggle }: { market: PredictionMarket; home: string; away: string; expanded: boolean; onToggle: () => void }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const best = [...market.outcomes].sort((a, b) => b.probability - a.probability)[0];
  const confidenceColor = market.confidence === "Strong" ? "text-stat-positive" : market.confidence === "Moderate" ? "text-stat-warn" : "text-muted-foreground";
  return <div className="border border-border rounded-lg overflow-hidden">
    <div className="flex items-center min-h-16 pr-1">
      <Button variant="ghost" className="flex-1 h-auto min-h-16 justify-between rounded-none px-3 py-2 whitespace-normal text-left gap-2" aria-expanded={expanded} onClick={onToggle}>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-medium text-muted-foreground">{market.label}</span>
          <span className="block text-xs font-semibold break-words mt-0.5">{best?.label ?? "Data unavailable"}</span>
        </span>
        <span className="text-right shrink-0">
          <span className="block font-mono text-sm font-bold">{best ? `${best.probability.toFixed(0)}%` : "—"}</span>
          <span className={cn("block text-[9px] font-medium", confidenceColor)}>{market.confidence} confidence</span>
        </span>
        {expanded ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Info about ${market.label}`} aria-expanded={infoOpen} title={`About ${market.label}`} onClick={() => setInfoOpen(!infoOpen)}><Info className="text-muted-foreground" /></Button>
    </div>
    {infoOpen && <div className="border-t border-border bg-muted/30 p-3 space-y-2 text-xs leading-relaxed" role="region" aria-label={`${market.label} information`}>
      <p><span className="font-semibold">Meaning: </span>{market.meaning}</p>
      <p><span className="font-semibold">Why: </span>{market.why}</p>
      <p><span className="font-semibold text-primary">Tip: </span>{market.tip}</p>
    </div>}
    {expanded && <div className="border-t border-border divide-y divide-border" role="region" aria-label={`${market.label} outcomes`}>
      {market.outcomes.map((outcome, index) => <div key={`${outcome.label}-${index}`} className="px-3 py-2 space-y-1.5 bg-muted/10">
        <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium break-words min-w-0">{outcome.label}</span><span className="font-mono text-xs font-bold text-primary shrink-0">{outcome.probability.toFixed(1)}%</span></div>
        <p className="text-[10px] text-muted-foreground">{outcome.evidence}</p>
        {outcome.odds && <LiveOddsRow home={home} away={away} {...outcome.odds} />}
      </div>)}
      {market.outcomes.length === 0 && <p className="p-3 text-xs text-muted-foreground leading-relaxed">{market.why}</p>}
    </div>}
  </div>;
}

/** Quick-view tappable market row — opens the detailed stat card. */
function QuickMarketRow({ market, onOpen }: { market: PredictionMarket; onOpen: () => void }) {
  const best = [...market.outcomes].sort((a, b) => b.probability - a.probability)[0];
  if (!best) return <div className="rounded-xl border border-[#2c2c2e] bg-[#151517] px-3 py-2.5 opacity-60">
    <span className="block text-[10px] text-neutral-400">{market.label}</span>
    <span className="block text-xs font-semibold text-white mt-0.5">Data unavailable</span>
  </div>;
  return <button onClick={onOpen} className="w-full flex items-center gap-2.5 rounded-xl border border-[#2c2c2e] bg-[#151517] px-3 py-2.5 text-left active:scale-[0.98] transition-transform" aria-label={`${market.label} — open prediction details`}>
    <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0"><BarChart3 className="w-4 h-4" style={{ color: pctColor(best.probability) }} /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-[10px] font-medium text-neutral-400">{market.label}</span>
      <span className="block text-xs font-semibold text-white truncate mt-0.5">{best.label}</span>
    </span>
    <span className="text-right shrink-0">
      <span className="block font-mono text-sm font-bold text-white">{best.probability.toFixed(0)}%</span>
      <span className="block text-[9px] font-medium" style={{ color: pctColor(best.probability) === "#e74c3c" ? "#f1c40f" : pctColor(best.probability) }}>{market.confidence} confidence</span>
    </span>
    <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
  </button>;
}

export function PredictionMetrics({ inputs, view, mode = "both", onViewChange, note, kickoffLabel }: {
  inputs: MarketInputs;
  view: PredictionView;
  mode?: PredictionMode;
  onViewChange: (view: PredictionView) => void;
  note?: string;
  kickoffLabel?: string;
}) {
  const markets = useMemo(() => buildPredictionMarkets(inputs), [inputs]);
  const [expanded, setExpanded] = useState<Set<MarketId>>(new Set());
  const [category, setCategory] = useState("All");
  const [allQuick, setAllQuick] = useState(false);
  const [quickCard, setQuickCard] = useState<MarketId | null>(null);
  const quickMarket = quickCard ? markets.find(m => m.id === quickCard) : undefined;
  const filtered = markets.filter(market => (mode === "both" || (mode === "players" ? market.category === "Players" : market.category !== "Players")) && (category === "All" || market.category === category));
  const quickIds = new Set<MarketId>(mode === "players" ? ["anytime_scorer", "player_assist", "player_card"] : ["1x2", "double_chance", "over_under_goals", "btts", "corners", "cards"]);
  const visible = view === "quick" && !allQuick && category === "All" ? filtered.filter(m => quickIds.has(m.id)) : filtered;
  const categories = mode === "players" ? ["All", "Players"] : mode === "full" ? ["All", "Result", "Goals", "Team", "Stats"] : ["All", "Result", "Goals", "Team", "Stats", "Players"];
  const p = inputs.prediction;
  const topScore = p.topScorelines[0];
  return <div className="space-y-3">
    <PredictionViewSwitch value={view} onChange={onViewChange} />
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-2">
      <div className="flex items-center gap-2 min-w-0"><TeamLogo teamName={inputs.home} size="sm" /><span className="text-xs font-semibold break-words">{inputs.home}</span></div>
      <span className="text-[10px] text-muted-foreground">VS</span>
      <div className="flex items-center justify-end gap-2 min-w-0"><span className="text-xs font-semibold break-words text-right">{inputs.away}</span><TeamLogo teamName={inputs.away} size="sm" /></div>
    </div>
    <div className="grid grid-cols-3 gap-2 border-y border-border py-3 text-center">
      {[{ label: "Home", value: p.homeWin, color: "text-stat-positive" }, { label: "Draw", value: p.draw, color: "text-stat-warn" }, { label: "Away", value: p.awayWin, color: "text-stat-negative" }].map(result => <div key={result.label}><p className={cn("font-mono text-lg font-bold", result.color)}>{result.value.toFixed(0)}%</p><p className="text-[10px] text-muted-foreground">{result.label}</p></div>)}
    </div>
    <div className="flex justify-between text-xs gap-3"><span className="text-muted-foreground">Projected xG <strong className="font-mono text-foreground">{p.lambdaHome.toFixed(2)} – {p.lambdaAway.toFixed(2)}</strong></span>{topScore && <span className="text-muted-foreground">Top score <strong className="font-mono text-foreground">{topScore.home}–{topScore.away}</strong></span>}</div>
    {view === "original" && <section className="space-y-2">
      <h3 className="text-[10px] uppercase font-semibold text-muted-foreground">Team comparison</h3>
      <div className="divide-y divide-border border-y border-border">
        {[
          ["Matches", inputs.statsHome.matchesPlayed, inputs.statsAway.matchesPlayed],
          ["Goals / match", inputs.statsHome.goalsFor / inputs.statsHome.matchesPlayed, inputs.statsAway.goalsFor / inputs.statsAway.matchesPlayed],
          ["Conceded / match", inputs.statsHome.goalsAgainst / inputs.statsHome.matchesPlayed, inputs.statsAway.goalsAgainst / inputs.statsAway.matchesPlayed],
          ["Shots / match", inputs.statsHome.avgShotsFor, inputs.statsAway.avgShotsFor],
          ["Corners / match", inputs.statsHome.avgCornersFor, inputs.statsAway.avgCornersFor],
          ["Yellow cards / match", inputs.statsHome.avgYellowCards, inputs.statsAway.avgYellowCards],
          ["Fouls / match", inputs.statsHome.avgFoulsCommitted, inputs.statsAway.avgFoulsCommitted],
        ].map(([label, a, b]) => <div key={label} className="grid grid-cols-[4rem_1fr_4rem] items-center py-2 text-xs"><span className="font-mono font-semibold">{Number(a).toFixed(1)}</span><span className="text-center text-muted-foreground text-[10px]">{label}</span><span className="font-mono font-semibold text-right">{Number(b).toFixed(1)}</span></div>)}
      </div>
    </section>}
    {view === "ai" && <AiMatchPrediction inputs={inputs} note={note} />}
    {view !== "ai" && <>
    <div className="flex flex-wrap gap-1" role="group" aria-label="Market category">
      {categories.map(c => <Button key={c} size="sm" variant={category === c ? "secondary" : "ghost"} className="h-7 px-2 text-[10px]" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</Button>)}
    </div>
    <div className="space-y-1.5">
      {visible.map(market => view === "quick"
        ? <QuickMarketRow key={market.id} market={market} onOpen={() => setQuickCard(market.id)} />
        : <MarketRow key={market.id} market={market} home={inputs.home} away={inputs.away} expanded={expanded.has(market.id)} onToggle={() => setExpanded(current => { const next = new Set(current); if (next.has(market.id)) next.delete(market.id); else next.add(market.id); return next; })} />)}
    </div>
    {view === "quick" && category === "All" && <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setAllQuick(!allQuick)}>{allQuick ? "Show key markets" : `All ${filtered.length} markets`}<ChevronDown /></Button>}
    </>}
    {view === "quick" && quickMarket && <BetMarketCardSheet market={quickMarket} inputs={inputs} kickoffLabel={kickoffLabel} onClose={() => setQuickCard(null)} />}
    {note && <details className="border-t border-border pt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Your match note</summary><p className="mt-2 break-words">{note}</p><p className="text-[10px] text-muted-foreground mt-1">Saved for reference; free-text notes do not change model probabilities.</p></details>}
    <p className="text-[9px] leading-relaxed text-muted-foreground">Estimated chance · Confidence measures data support · Normal time only · Not guaranteed returns</p>
  </div>;
}