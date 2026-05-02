import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Crosshair, Star, Lock, Gem, BarChart3, AlertTriangle, Loader2,
  TrendingUp, ChevronRight, Zap, Shield, Target, RefreshCw,
  DollarSign, ArrowRight, CheckCircle2, Info, Filter, ChevronDown,
  Sparkles, Brain, Eye, Percent, Activity, Calendar, Trophy, HelpCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { settleSlip, type SettleableLeg } from "@/lib/betSettlement";

const PREMIUM_UNLOCKED_KEY = "fe_premium_unlocked";
function isEdgeUnlocked(): boolean {
  try { return localStorage.getItem(PREMIUM_UNLOCKED_KEY) === "true"; } catch { return false; }
}

/* ─── Types ─── */
type Pick = {
  match: string;
  prediction: string;
  confidence: number;
  market: string;
  reasoning: string;
  edge?: string;
  matchDate?: string;
};
type ValueAlert = {
  match: string;
  alert: string;
  modelProb: number;
  impliedProb?: number;
  reasoning: string;
  matchDate?: string;
};
type UndervaluedPick = {
  match: string;
  market: string;
  modelProb: number;
  reasoning: string;
  matchDate?: string;
};
type EdgeData = {
  bestPicks: Pick[];
  highConfidence: Pick[];
  valueAlerts: ValueAlert[];
  undervalued: UndervaluedPick[];
  summary: string;
};

type BetLeg = {
  match: string;
  market: string;
  odds: number;
  confidence: string;
  reason: string;
  matchDate?: string;
  matchTime?: string;
  league?: string;
  injuryImpact?: string | null;
};
type BetSlip = {
  slip: BetLeg[];
  combinedOdds: number;
  riskAssessment: string;
  expectedValue: string;
  advice: string;
};

const RISK_LEVELS = [
  { id: "low", label: "Low Risk", icon: Shield, desc: "Safer picks, lower returns", color: "text-emerald-400" },
  { id: "medium", label: "Medium", icon: Target, desc: "Balanced risk & reward", color: "text-amber-400" },
  { id: "high", label: "High Risk", icon: Zap, desc: "Big odds, bigger risk", color: "text-red-400" },
] as const;

const ALL_MARKETS = [
  { id: "1x2", label: "1X2", category: "Result" },
  { id: "double_chance", label: "Double Chance", category: "Result" },
  { id: "draw_no_bet", label: "Draw No Bet", category: "Result" },
  { id: "over_under_goals", label: "Over/Under Goals", category: "Goals" },
  { id: "btts", label: "BTTS", category: "Goals" },
  { id: "correct_score", label: "Correct Score", category: "Goals" },
  { id: "ht_ft", label: "HT/FT", category: "Goals" },
  { id: "goal_both_halves", label: "Goal Both Halves", category: "Goals" },
  { id: "clean_sheet", label: "Clean Sheet", category: "Goals" },
  { id: "win_to_nil", label: "Win to Nil", category: "Goals" },
  { id: "corners", label: "Corners", category: "Stats" },
  { id: "cards", label: "Cards", category: "Stats" },
  { id: "fouls", label: "Fouls", category: "Stats" },
  { id: "shots", label: "Shots", category: "Stats" },
  { id: "shots_on_target", label: "Shots on Target", category: "Stats" },
  { id: "offsides", label: "Offsides", category: "Stats" },
] as const;

const MARKET_CATEGORIES = ["Result", "Goals", "Stats"] as const;

/* ─── Confidence badge ─── */
const ConfidenceBadge = ({ value }: { value: number }) => {
  const color = value >= 75 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : value >= 60 ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
    : "bg-red-500/20 text-red-400 border-red-500/30";
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", color)}>
      {value}%
    </span>
  );
};

/* ─── Pick Card ─── */
const PickCard = ({ pick, accent }: { pick: Pick; accent: string }) => (
  <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-3.5 space-y-2 hover:border-primary/30 transition-colors">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground truncate">{pick.match}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", accent)}>
            {pick.market}
          </span>
          <ConfidenceBadge value={pick.confidence} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-black text-primary">{pick.prediction}</p>
      </div>
    </div>
    <p className="text-[11px] text-muted-foreground leading-relaxed">{pick.reasoning}</p>
    {pick.edge && (
      <div className="flex items-center gap-1 text-[10px] text-primary font-medium">
        <TrendingUp className="w-3 h-3" />
        <span>{pick.edge}</span>
      </div>
    )}
  </div>
);

/* ─── Value Alert Card ─── */
const ValueAlertCard = ({ alert }: { alert: ValueAlert }) => (
  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-2">
    <div className="flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground">{alert.match}</p>
        <p className="text-[11px] font-semibold text-amber-400 mt-0.5">{alert.alert}</p>
      </div>
      {alert.modelProb && (
        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted-foreground">Model</p>
          <p className="text-sm font-black text-amber-400">{alert.modelProb}%</p>
        </div>
      )}
    </div>
    <p className="text-[11px] text-muted-foreground leading-relaxed">{alert.reasoning}</p>
  </div>
);

/* ─── Section Header ─── */
const SectionHeader = ({ icon: Icon, emoji, title, count }: { icon: any; emoji: string; title: string; count?: number }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-base">{emoji}</span>
    <h3 className="text-sm font-bold text-foreground tracking-tight">{title}</h3>
    {count !== undefined && count > 0 && (
      <span className="text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">{count}</span>
    )}
  </div>
);

/* ─── Locked Tease ─── */
const EdgeLockedTease = () => {
  const teasePicks = [
    { match: "Arsenal vs Chelsea", prediction: "Over 2.5", confidence: 78, market: "Goals", reasoning: "Both teams averaging 3.1 goals in last 6 meetings." },
    { match: "Man City vs Liverpool", prediction: "BTTS Yes", confidence: 82, market: "BTTS", reasoning: "Head-to-head BTTS rate of 80% in last 10." },
    { match: "Real Madrid vs Barcelona", prediction: "Over 10.5", confidence: 65, market: "Corners", reasoning: "Average 12.3 corners per El Clásico." },
  ];

  const teaseAlerts = [
    { label: "Value: Arsenal ML", pct: 72 },
    { label: "Edge: BTTS @ 1.85", pct: 68 },
    { label: "Under 3.5 Cards", pct: 55 },
    { label: "Over 9.5 Corners", pct: 61 },
  ];

  const features = [
    { icon: <Star className="w-4 h-4" />, title: "AI Best Picks", desc: "Daily curated picks with confidence scores and reasoning." },
    { icon: <Brain className="w-4 h-4" />, title: "AI Bet Builder", desc: "Enter your target odds and risk — AI builds the optimal parlay." },
    { icon: <Eye className="w-4 h-4" />, title: "Value Alerts", desc: "Instantly spot when odds are mispriced by the market." },
    { icon: <Gem className="w-4 h-4" />, title: "Undervalued Odds", desc: "Model-backed opportunities the market is sleeping on." },
    { icon: <Percent className="w-4 h-4" />, title: "Market Probabilities", desc: "See true probabilities across 16+ betting markets." },
    { icon: <Activity className="w-4 h-4" />, title: "Risk Profiling", desc: "Choose low, medium, or high risk bet construction." },
  ];

  const blurMask =
    "linear-gradient(to bottom, transparent 0%, transparent 18%, rgba(0,0,0,0.25) 32%, rgba(0,0,0,0.6) 48%, rgba(0,0,0,0.9) 65%, #000 80%)";

  return (
    <div className="space-y-5">
      {/* Teased picks preview */}
      <div className="relative -mx-1">
        <div className="px-1 pointer-events-none select-none" aria-hidden>
          <div className="space-y-2">
            {teasePicks.map((p, i) => (
              <div key={i} className="rounded-xl border border-border bg-card/60 p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">{p.match}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary">{p.market}</span>
                      <ConfidenceBadge value={p.confidence} />
                    </div>
                  </div>
                  <p className="text-sm font-black text-primary">{p.prediction}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">{p.reasoning}</p>
              </div>
            ))}
          </div>

          {/* Teased value alerts */}
          <div className="mt-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/[0.04] p-4 shadow-md space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Value Alerts</span>
              <span className="ml-auto px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold">EDGE</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {teaseAlerts.map(r => (
                <div key={r.label} className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground">{r.label}</span>
                    <span className="font-mono text-sm font-bold text-primary">{r.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Blur overlay */}
        <div
          className="pointer-events-none absolute inset-0 backdrop-blur-md"
          style={{ WebkitMaskImage: blurMask, maskImage: blurMask }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background) / 0) 0%, hsl(var(--background) / 0) 30%, hsl(var(--background) / 0.15) 50%, hsl(var(--background) / 0.45) 70%, hsl(var(--background) / 0.8) 88%, hsl(var(--background)) 100%)",
          }}
        />
      </div>

      {/* Features list */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">What's inside Edge</h2>
          <div className="flex-1 h-px bg-border ml-1" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/30 transition-colors opacity-0 animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                {f.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-foreground">{f.title}</div>
                <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{f.desc}</div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-primary/60 flex-shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Edge History ─── */
const EDGE_HISTORY_KEY = "fe_edge_history";
type EdgeLegStored = BetLeg & { matchDate?: string; matchTime?: string; league?: string; settledAs?: "win" | "loss" | "push" | "unknown"; actual?: string };
type EdgeHistoryEntry = {
  id: string;
  date: string;
  slip: EdgeLegStored[];
  combinedOdds: number;
  result?: "win" | "loss" | "pending" | "unknown";
  league?: string;
  betType?: string;
  settledAt?: string;
};

function loadHistory(): EdgeHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(EDGE_HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(h: EdgeHistoryEntry[]) {
  localStorage.setItem(EDGE_HISTORY_KEY, JSON.stringify(h.slice(0, 100)));
}

/* ─── Expandable History Entry ─── */
const ExpandableHistoryEntry = ({ entry }: { entry: EdgeHistoryEntry }) => {
  const [open, setOpen] = useState(false);
  const isPending = !entry.result || entry.result === "pending";
  const isUnknown = entry.result === "unknown";

  return (
    <div className="rounded-lg border border-border bg-card/60 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
      >
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[10px] font-bold text-foreground truncate">
            {entry.slip.length} leg{entry.slip.length > 1 ? "s" : ""} @ {entry.combinedOdds.toFixed(2)}x
          </p>
          <p className="text-[9px] text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {isPending ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">PENDING</span>
          ) : isUnknown ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">N/A</span>
          ) : (
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded",
              entry.result === "win" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            )}>
              {entry.result === "win" ? "WON" : "LOST"}
            </span>
          )}
          <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border bg-background/40">
          {entry.slip.map((leg, i) => {
            const settled = leg.settledAs;
            const isWin = settled === "win";
            const isLoss = settled === "loss";
            return (
              <div key={i} className="px-3 py-2 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-foreground truncate">{leg.match}</p>
                    {(leg.matchDate || leg.matchTime) && (
                      <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {leg.matchDate && new Date(leg.matchDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        {leg.matchTime && ` · ${leg.matchTime}`}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[9px] font-semibold bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">
                        {leg.market}
                      </span>
                      <span className="text-[9px] font-mono font-bold text-primary">{leg.odds?.toFixed(2)}x</span>
                    </div>
                  </div>
                  {settled === "win" && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0">✓ WON</span>
                  )}
                  {settled === "loss" && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">✗ LOST</span>
                  )}
                  {settled === "push" && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">PUSH</span>
                  )}
                  {(!settled || settled === "unknown") && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">PENDING</span>
                  )}
                </div>
                {leg.actual && (
                  <p className={cn(
                    "text-[10px] font-mono",
                    isWin ? "text-emerald-400" : isLoss ? "text-red-400" : "text-muted-foreground"
                  )}>
                    Actual: {leg.actual}
                  </p>
                )}
              </div>
            );
          })}
          {!isPending && !isUnknown && (
            <div className="px-3 py-2 bg-muted/30 flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground">Final</span>
              <span className={cn(
                "text-[10px] font-black",
                entry.result === "win" ? "text-emerald-400" : "text-red-400"
              )}>
                {entry.result === "win"
                  ? `+${(entry.combinedOdds - 1).toFixed(2)}u`
                  : `-1.00u`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const EdgeHistory = () => {
  const [history, setHistory] = useState(loadHistory);
  const [period, setPeriod] = useState<"7" | "30">("7");
  const [filterLeague, setFilterLeague] = useState("");
  const [filterType, setFilterType] = useState("");
  const [settling, setSettling] = useState(false);

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(period));
    return d.toISOString();
  }, [period]);

  const runSettlement = useCallback(async (silent = true) => {
    const current = loadHistory();
    const pending = current.filter(h => !h.result || h.result === "pending" || h.result === "unknown");
    if (pending.length === 0) {
      if (!silent) toast.info("Nothing to settle");
      return;
    }
    setSettling(true);
    let changed = 0;
    let quotaHit = false;
    let quotaMsg: string | undefined;
    for (const entry of pending) {
      const legs: SettleableLeg[] = entry.slip.map(l => ({
        match: l.match,
        market: l.market,
        odds: l.odds,
        matchDate: l.matchDate,
      }));
      try {
        const { legResults, finalResult, quotaExhausted, quotaMessage } = await settleSlip(legs, entry.date);
        if (quotaExhausted) { quotaHit = true; quotaMsg = quotaMessage; break; }
        if (finalResult !== "pending") {
          entry.result = finalResult;
          entry.settledAt = new Date().toISOString();
          entry.slip = entry.slip.map((l, i) => ({
            ...l,
            settledAs: legResults[i]?.result,
            actual: legResults[i]?.actual,
          }));
          changed++;
        }
      } catch (e) {
        console.error("Settle error:", e);
      }
    }
    saveHistory(current);
    setHistory(current);
    setSettling(false);
    if (quotaHit) {
      toast.warning("Daily API limit reached", {
        description: quotaMsg || "Pending bets will auto-settle tomorrow when quota resets.",
        duration: 6000,
      });
    } else if (!silent && changed > 0) toast.success(`Settled ${changed} bet${changed > 1 ? "s" : ""}`);
    else if (!silent) toast.info("No bets ready to settle yet");
  }, []);

  useEffect(() => {
    runSettlement(true);
  }, [runSettlement]);

  const filtered = useMemo(() => {
    let items = history.filter(h => h.date >= cutoff);
    if (filterLeague) items = items.filter(h => h.slip.some(l => l.match.toLowerCase().includes(filterLeague.toLowerCase())));
    if (filterType) items = items.filter(h => h.betType === filterType);
    return items;
  }, [history, cutoff, filterLeague, filterType]);

  const stats = useMemo(() => {
    const settled = filtered.filter(h => h.result === "win" || h.result === "loss");
    const wins = settled.filter(h => h.result === "win").length;
    const total = settled.length;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "—";
    const roi = total > 0
      ? ((settled.reduce((acc, h) => acc + (h.result === "win" ? h.combinedOdds - 1 : -1), 0) / total) * 100).toFixed(1)
      : "—";
    const pending = filtered.filter(h => !h.result || h.result === "pending" || h.result === "unknown").length;
    return { wins, total, winRate, roi, pending };
  }, [filtered]);

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 p-4 text-center space-y-2">
        <Calendar className="w-6 h-6 text-muted-foreground mx-auto" />
        <p className="text-xs text-muted-foreground">No edge history yet. Build your first bet to start tracking!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Edge Performance</h3>
        <button
          onClick={() => runSettlement(false)}
          disabled={settling}
          className="ml-auto text-[10px] font-bold px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors flex items-center gap-1"
          title="Auto-check past results"
        >
          <RefreshCw className={cn("w-3 h-3", settling && "animate-spin")} />
          {settling ? "Checking..." : "Auto-settle"}
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Results are auto-verified against actual match data — no manual marking.
      </p>

      {/* Period toggle */}
      <div className="flex gap-2">
        {(["7", "30"] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all",
              period === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            )}
          >
            Past {p} days
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="text-[10px] h-7 rounded-md border border-border bg-background px-2 text-foreground"
        >
          <option value="">All types</option>
          <option value="single">Single</option>
          <option value="double">Double</option>
          <option value="accumulator">Accumulator</option>
        </select>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-card p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Win Rate</p>
          <p className="text-sm font-black text-foreground">{stats.winRate}%</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">ROI</p>
          <p className={cn("text-sm font-black", parseFloat(stats.roi as string) > 0 ? "text-emerald-400" : parseFloat(stats.roi as string) < 0 ? "text-red-400" : "text-foreground")}>
            {stats.roi !== "—" ? `${parseFloat(stats.roi as string) > 0 ? "+" : ""}${stats.roi}%` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Record</p>
          <p className="text-sm font-black text-foreground">{stats.wins}W / {stats.total - stats.wins}L</p>
        </div>
      </div>

      {stats.pending > 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          {stats.pending} bet{stats.pending > 1 ? "s" : ""} awaiting match results
        </p>
      )}

      {/* Summary message */}
      {stats.total > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
          <p className="text-[11px] text-foreground">
            If you followed all edges: <span className="font-bold text-primary">{parseFloat(stats.roi as string) > 0 ? "+" : ""}{stats.roi}%</span> ROI over {stats.total} bets
          </p>
        </div>
      )}

      {/* Recent entries */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {filtered.slice(0, 10).map(entry => (
          <ExpandableHistoryEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
};

/* ─── Quick Bet Templates ─── */
const QUICK_TEMPLATES = [
  { id: "safe_single", label: "Safe Single", odds: "1.50", risk: "low" as const, legs: 1, desc: "Single low-risk pick" },
  { id: "quick_double", label: "Quick Double", odds: "3.00", risk: "medium" as const, legs: 2, desc: "Two balanced picks" },
  { id: "value_treble", label: "Value Treble", odds: "6.00", risk: "medium" as const, legs: 3, desc: "Three value picks" },
  { id: "big_acca", label: "Big Acca", odds: "15.00", risk: "high" as const, legs: 5, desc: "High odds accumulator" },
];

/* ─── League list for filter ─── */
const BET_LEAGUES = [
  { code: "PL", name: "Premier League" },
  { code: "BL1", name: "Bundesliga" },
  { code: "SA", name: "Serie A" },
  { code: "PD", name: "La Liga" },
  { code: "FL1", name: "Ligue 1" },
  { code: "DED", name: "Eredivisie" },
  { code: "PPL", name: "Primeira Liga" },
  { code: "ELC", name: "Championship" },
];

/* ─── Build upcoming-date list (today + next 13 days) ─── */
function getUpcomingDates(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    let label: string;
    if (i === 0) label = "Today";
    else if (i === 1) label = "Tomorrow";
    else label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    out.push({ value, label });
  }
  return out;
}

/* ─── Bet Builder ─── */
const BetBuilder = () => {
  const [odds, setOdds] = useState("");
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BetSlip | null>(null);
  const [enabledMarkets, setEnabledMarkets] = useState<Set<string>>(
    () => new Set(ALL_MARKETS.map(m => m.id))
  );
  const [showMarkets, setShowMarkets] = useState(false);
  const [leagueFilter, setLeagueFilter] = useState("");
  const [maxLegs, setMaxLegs] = useState<number | null>(null);
  const [targetDate, setTargetDate] = useState<string>(""); // "" = next 7 days
  const upcomingDates = useMemo(() => getUpcomingDates(), []);

  const toggleMarket = (id: string) => {
    setEnabledMarkets(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) { toast.error("Keep at least 1 market enabled"); return prev; }
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    const ids = ALL_MARKETS.filter(m => m.category === cat).map(m => m.id);
    const allOn = ids.every(id => enabledMarkets.has(id));
    setEnabledMarkets(prev => {
      const next = new Set(prev);
      ids.forEach(id => allOn ? next.delete(id) : next.add(id));
      if (next.size === 0) { toast.error("Keep at least 1 market enabled"); return prev; }
      return next;
    });
  };

  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setOdds(tpl.odds);
    setRisk(tpl.risk);
    setMaxLegs(tpl.legs);
    toast.info(`Template: ${tpl.label}`, { description: tpl.desc });
  };

  const buildBet = async () => {
    const parsed = parseFloat(odds);
    if (!parsed || parsed < 1.1 || parsed > 1000) {
      toast.error("Enter valid odds between 1.1 and 1000");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("build-bet", {
        body: {
          targetOdds: parsed,
          riskLevel: risk,
          enabledMarkets: Array.from(enabledMarkets).map(id => ALL_MARKETS.find(m => m.id === id)?.label).filter(Boolean),
          leagueFilter: leagueFilter || undefined,
          maxLegs: maxLegs || undefined,
          targetDate: targetDate || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const slip = data as BetSlip;
      if (!slip.slip || slip.slip.length === 0) {
        toast.error("No matches available for the selected date/league. Try another date.");
        setResult(slip);
        return;
      }
      setResult(slip);

      // Save to history
      const entry: EdgeHistoryEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        slip: slip.slip || [],
        combinedOdds: slip.combinedOdds || parsed,
        result: "pending",
        league: leagueFilter || undefined,
        betType: (slip.slip?.length || 0) === 1 ? "single" : (slip.slip?.length || 0) === 2 ? "double" : "accumulator",
      };
      const history = loadHistory();
      history.unshift(entry);
      saveHistory(history);

      toast.success("Bet slip built successfully!", {
        description: `${slip.slip?.length || 0} legs at ${slip.combinedOdds?.toFixed(2)}x combined odds`,
        duration: 5000,
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to build bet");
    } finally {
      setLoading(false);
    }
  };

  // Check for help message: did AI suggest adding leagues?
  const needsHelp = result && result.advice && (
    result.advice.toLowerCase().includes("not enough") ||
    result.advice.toLowerCase().includes("insufficient") ||
    result.advice.toLowerCase().includes("add") ||
    (result.combinedOdds && parseFloat(odds) > 0 && Math.abs(result.combinedOdds - parseFloat(odds)) / parseFloat(odds) > 0.3)
  );

  return (
    <div className="space-y-4">
      {/* Quick Templates */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Quick Templates</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => applyTemplate(tpl)}
              className={cn(
                "flex flex-col items-start gap-0.5 p-2.5 rounded-lg border transition-all text-left",
                odds === tpl.odds && risk === tpl.risk
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/40 hover:border-primary/30"
              )}
            >
              <span className="text-[11px] font-bold text-foreground">{tpl.label}</span>
              <span className="text-[9px] text-muted-foreground">{tpl.desc}</span>
              <span className="text-[10px] font-mono font-bold text-primary mt-0.5">{tpl.odds}x · {tpl.legs} leg{tpl.legs > 1 ? "s" : ""}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Odds input */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Target Odds</span>
        </div>
        <input
          type="number"
          step="0.1"
          min="1.1"
          max="1000"
          placeholder="e.g. 3.50"
          value={odds}
          onChange={e => {
            setOdds(e.target.value);
            // User-entered odds override any active template leg count
            if (maxLegs !== null) setMaxLegs(null);
          }}
          className="w-full h-12 rounded-lg border border-border bg-background/60 px-4 text-lg font-mono font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {maxLegs !== null ? (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Template lock: <span className="font-bold text-primary">{maxLegs} legs</span></span>
            <button
              onClick={() => setMaxLegs(null)}
              className="text-primary font-bold hover:underline"
            >
              Clear · use odds only
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">AI will pick the optimal number of legs to hit your target odds.</p>
        )}

        {/* Date Picker — upcoming fixtures */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-foreground">Match Date</span>
          </div>
          <select
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Next 7 days (any)</option>
            {upcomingDates.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <p className="text-[9px] text-muted-foreground">
            {targetDate
              ? `Bet will only use matches on ${new Date(targetDate).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`
              : "AI picks from any upcoming fixture in the next week"}
          </p>
        </div>

        {/* League Filter */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-foreground">League</span>
          </div>
          <select
            value={leagueFilter}
            onChange={e => setLeagueFilter(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">All Leagues</option>
            {BET_LEAGUES.map(l => (
              <option key={l.code} value={l.name}>{l.name}</option>
            ))}
          </select>
          {leagueFilter && (
            <p className="text-[9px] text-muted-foreground">
              Bet will focus on upcoming {leagueFilter} matches
            </p>
          )}
        </div>

        {/* Risk selector */}
        <div className="grid grid-cols-3 gap-2">
          {RISK_LEVELS.map(r => {
            const Icon = r.icon;
            const active = risk === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRisk(r.id as any)}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 rounded-lg border text-center transition-all",
                  active
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card/40 hover:border-primary/30"
                )}
              >
                <Icon className={cn("w-4 h-4", active ? "text-primary" : r.color)} />
                <span className={cn("text-[10px] font-bold", active ? "text-primary" : "text-muted-foreground")}>
                  {r.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Market Filter */}
        <div className="space-y-2">
          <button
            onClick={() => setShowMarkets(!showMarkets)}
            className="flex items-center justify-between w-full text-xs font-bold text-foreground"
          >
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <span>Markets</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {enabledMarkets.size}/{ALL_MARKETS.length}
              </span>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", showMarkets && "rotate-180")} />
          </button>
          {showMarkets && (
            <div className="space-y-2.5 pt-1">
              {MARKET_CATEGORIES.map(cat => {
                const items = ALL_MARKETS.filter(m => m.category === cat);
                const allOn = items.every(m => enabledMarkets.has(m.id));
                return (
                  <div key={cat} className="space-y-1.5">
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                    >
                      <div className={cn(
                        "w-3 h-3 rounded border flex items-center justify-center transition-colors",
                        allOn ? "bg-primary border-primary" : "border-muted-foreground/40"
                      )}>
                        {allOn && <CheckCircle2 className="w-2 h-2 text-primary-foreground" />}
                      </div>
                      {cat}
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map(m => {
                        const on = enabledMarkets.has(m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() => toggleMarket(m.id)}
                            className={cn(
                              "text-[10px] font-semibold px-2 py-1 rounded-md border transition-all",
                              on
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-card/40 text-muted-foreground line-through opacity-60"
                            )}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={buildBet}
          disabled={loading || !odds}
          className={cn(
            "w-full h-11 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          )}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Building...</>
          ) : (
            <><Crosshair className="w-4 h-4" /> Build My Bet</>
          )}
        </button>
      </div>

      {/* Result */}
      {result?.slip && (
        <div className="rounded-xl border border-primary/20 bg-card/60 backdrop-blur-sm overflow-hidden">
          {/* Success banner */}
          <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">Bet slip built successfully</span>
          </div>

          <div className="px-4 py-3 border-b border-border bg-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Your Bet Slip</span>
              <span className="text-sm font-black text-primary font-mono">
                {result.combinedOdds?.toFixed(2)}x
              </span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {result.slip.map((leg, i) => {
              const dateLabel = leg.matchDate
                ? new Date(leg.matchDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                : null;
              return (
                <div key={i} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-foreground truncate">{leg.match}</p>
                    <span className="text-xs font-mono font-bold text-primary shrink-0">{leg.odds?.toFixed(2)}</span>
                  </div>
                  {(dateLabel || leg.matchTime || leg.league) && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Calendar className="w-2.5 h-2.5" />
                      {dateLabel && <span className="font-semibold text-foreground/80">{dateLabel}</span>}
                      {leg.matchTime && <span>· {leg.matchTime}</span>}
                      {leg.league && <span className="truncate">· {leg.league}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">
                      {leg.market}
                    </span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      leg.confidence === "high" ? "bg-emerald-500/20 text-emerald-400"
                        : leg.confidence === "medium" ? "bg-amber-500/20 text-amber-400"
                        : "bg-red-500/20 text-red-400"
                    )}>
                      {leg.confidence}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{leg.reason}</p>
                  {leg.injuryImpact && (
                    <div className="flex items-start gap-1 mt-1 px-1.5 py-1 rounded bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-400 font-medium leading-snug">
                        Squad impact: {leg.injuryImpact}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {(result.riskAssessment || result.advice) && (
            <div className="px-4 py-3 border-t border-border bg-muted/30 space-y-1.5">
              {result.riskAssessment && (
                <div className="flex items-start gap-1.5">
                  <Info className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-[10px] text-muted-foreground">{result.riskAssessment}</p>
                </div>
              )}
              {result.advice && (
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                  <p className="text-[10px] text-primary font-medium">{result.advice}</p>
                </div>
              )}
            </div>
          )}

          {/* Help message when odds don't match */}
          {needsHelp && (
            <div className="px-4 py-3 border-t border-amber-500/20 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[11px] font-bold text-amber-400">Not enough matches to hit your target odds</p>
                  <p className="text-[10px] text-muted-foreground">
                    {leagueFilter
                      ? `${leagueFilter} may not have enough fixtures today. Try adding more leagues or lowering your target odds.`
                      : "Try adding more leagues or adjusting your target odds for better results."}
                  </p>
                  {leagueFilter && (
                    <button
                      onClick={() => { setLeagueFilter(""); toast.info("League filter cleared — will search all leagues"); }}
                      className="text-[10px] font-bold text-primary hover:underline mt-1"
                    >
                      Remove league filter & rebuild →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edge History */}
      <EdgeHistory />
    </div>
  );
};

/* ─── Main Edge Page ─── */
const EdgePage = () => {
  const [unlocked, setUnlocked] = useState(isEdgeUnlocked);
  const [tab, setTab] = useState<"picks" | "builder">("picks");
  const [edgeData, setEdgeData] = useState<EdgeData | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync with Pro unlock from other components
  useEffect(() => {
    const onStorage = () => setUnlocked(isEdgeUnlocked());
    window.addEventListener("storage", onStorage);
    // Also poll in case same-tab update
    const interval = setInterval(() => setUnlocked(isEdgeUnlocked()), 500);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(interval); };
  }, []);

  const fetchEdge = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("edge-picks", {
        body: { fixtures: [], matchStats: [] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEdgeData(data as EdgeData);
    } catch (e: any) {
      toast.error(e.message || "Failed to load picks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) fetchEdge();
  }, [unlocked, fetchEdge]);

  const TABS = [
    { id: "picks", label: "Today's Edge", icon: Crosshair },
    { id: "builder", label: "Bet Builder", icon: DollarSign },
  ] as const;

  /* ── Locked state ── */
  if (!unlocked) {
    return (
      <div className="min-h-full p-4 pb-24 max-w-lg mx-auto space-y-5">
        <div className="text-center space-y-3 pt-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-lg">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Unlock Edge</h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            AI-powered picks, value alerts, and a smart bet builder — your unfair advantage.
          </p>

          {/* Clear Pro unlock CTA */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2 mt-2">
            <div className="flex items-center justify-center gap-2">
              <Gem className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">Edge is included with Pro</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Upgrade to <span className="font-bold text-primary">Pro</span> to unlock full access to Edge — AI picks, bet builder, value alerts, and all premium analytics in one subscription.
            </p>
            <a
              href="/premium"
              className="inline-flex items-center gap-1.5 mt-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              Go to Pro <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <EdgeLockedTease />
      </div>
    );
  }

  /* ── Unlocked state ── */
  return (
    <div className="min-h-full bg-background">
      {/* Hero banner */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/4" />
        <div className="relative px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Crosshair className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-black text-foreground tracking-tight">Edge</h2>
              <p className="text-[10px] text-muted-foreground font-medium">How you win</p>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold">PRO</span>
          </div>
          {edgeData?.summary && (
            <div className="mt-2.5 flex items-start gap-2 bg-card/60 border border-border rounded-lg px-3 py-2">
              <Zap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-foreground leading-relaxed">{edgeData.summary}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex px-4">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
          {tab === "picks" && (
            <button
              onClick={fetchEdge}
              disabled={loading}
              className="ml-auto flex items-center gap-1 px-2 py-2 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-5 pb-8">
        {tab === "picks" && (
          <>
            {loading && !edgeData ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Scanning matches for edge...</p>
              </div>
            ) : (
              <>
                {edgeData?.bestPicks?.length ? (
                  <section>
                    <SectionHeader icon={Star} emoji="⭐" title="Best Picks Today" count={edgeData.bestPicks.length} />
                    <div className="space-y-2">
                      {edgeData.bestPicks.map((p, i) => (
                        <PickCard key={i} pick={p} accent="bg-primary/15 text-primary" />
                      ))}
                    </div>
                  </section>
                ) : null}

                {edgeData?.highConfidence?.length ? (
                  <section>
                    <SectionHeader icon={Lock} emoji="🔒" title="High Confidence" count={edgeData.highConfidence.length} />
                    <div className="space-y-2">
                      {edgeData.highConfidence.map((p, i) => (
                        <PickCard key={i} pick={p} accent="bg-emerald-500/15 text-emerald-400" />
                      ))}
                    </div>
                  </section>
                ) : null}

                {edgeData?.valueAlerts?.length ? (
                  <section>
                    <SectionHeader icon={AlertTriangle} emoji="🚨" title="Value Alerts" count={edgeData.valueAlerts.length} />
                    <div className="space-y-2">
                      {edgeData.valueAlerts.map((a, i) => (
                        <ValueAlertCard key={i} alert={a} />
                      ))}
                    </div>
                  </section>
                ) : null}

                {edgeData?.undervalued?.length ? (
                  <section>
                    <SectionHeader icon={Gem} emoji="💎" title="Undervalued Odds" count={edgeData.undervalued.length} />
                    <div className="space-y-2">
                      {edgeData.undervalued.map((u, i) => (
                        <div key={i} className="rounded-xl border border-border bg-card/60 p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-foreground">{u.match}</p>
                            <ConfidenceBadge value={u.modelProb} />
                          </div>
                          <span className="text-[10px] font-semibold bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded-md inline-block">
                            {u.market}
                          </span>
                          <p className="text-[10px] text-muted-foreground">{u.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {!edgeData && !loading && (
                  <div className="text-center py-12">
                    <Crosshair className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No edge data available</p>
                    <button onClick={fetchEdge} className="mt-3 text-xs text-primary font-bold">
                      Try again
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "builder" && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🎰</span>
              <h3 className="text-sm font-bold text-foreground">AI Bet Builder</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">
              Choose your target odds and risk level — our model builds the optimal bet slip.
            </p>
            <BetBuilder />
          </div>
        )}
      </div>
    </div>
  );
};

export default EdgePage;
