import { useState, useEffect, useCallback } from "react";
import {
  Crosshair, Star, Lock, Gem, BarChart3, AlertTriangle, Loader2,
  TrendingUp, ChevronRight, Zap, Shield, Target, RefreshCw,
  DollarSign, ArrowRight, CheckCircle2, Info, Filter, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ─── Types ─── */
type Pick = {
  match: string;
  prediction: string;
  confidence: number;
  market: string;
  reasoning: string;
  edge?: string;
};
type ValueAlert = {
  match: string;
  alert: string;
  modelProb: number;
  impliedProb?: number;
  reasoning: string;
};
type UndervaluedPick = {
  match: string;
  market: string;
  modelProb: number;
  reasoning: string;
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
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as BetSlip);
    } catch (e: any) {
      toast.error(e.message || "Failed to build bet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
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
          onChange={e => setOdds(e.target.value)}
          className="w-full h-12 rounded-lg border border-border bg-background/60 px-4 text-lg font-mono font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
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
          <div className="px-4 py-3 border-b border-border bg-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Your Bet Slip</span>
              <span className="text-sm font-black text-primary font-mono">
                {result.combinedOdds?.toFixed(2)}x
              </span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {result.slip.map((leg, i) => (
              <div key={i} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground">{leg.match}</p>
                  <span className="text-xs font-mono font-bold text-primary">{leg.odds?.toFixed(2)}</span>
                </div>
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
              </div>
            ))}
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
        </div>
      )}
    </div>
  );
};

/* ─── Main Edge Page ─── */
const EdgePage = () => {
  const [tab, setTab] = useState<"picks" | "builder">("picks");
  const [edgeData, setEdgeData] = useState<EdgeData | null>(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => { fetchEdge(); }, [fetchEdge]);

  const TABS = [
    { id: "picks", label: "Today's Edge", icon: Crosshair },
    { id: "builder", label: "Bet Builder", icon: DollarSign },
  ] as const;

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
            <div>
              <h2 className="text-base font-black text-foreground tracking-tight">Edge</h2>
              <p className="text-[10px] text-muted-foreground font-medium">How you win</p>
            </div>
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
                {/* Best Picks */}
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

                {/* High Confidence */}
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

                {/* Value Alerts */}
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

                {/* Undervalued */}
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
