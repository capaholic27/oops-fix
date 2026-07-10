import { useEffect, useMemo, useState } from "react";
import {
  Wallet, TrendingUp, TrendingDown, Shield, Target, Calculator,
  ChevronDown, RotateCcw, CheckCircle2, XCircle, MinusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadBankroll, saveBankroll, recommendStake, settleBet, type BankrollState,
} from "@/lib/bankroll";
import { BookmakerFilter } from "@/components/BookmakerFilter";

const Field = ({
  label, value, onChange, suffix, min, max, step = 1, hint,
}: {
  label: string; value: number; onChange: (n: number) => void;
  suffix?: string; min?: number; max?: number; step?: number; hint?: string;
}) => (
  <label className="block space-y-1">
    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 focus-within:border-primary/40">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 bg-transparent text-sm font-mono font-bold focus:outline-none"
      />
      {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
    </div>
    {hint && <p className="text-[9px] text-muted-foreground leading-snug">{hint}</p>}
  </label>
);

/**
 * Bankroll page — configures the plan, previews stake sizing on an example
 * edge, shows session P&L and pending tickets.
 */
export const BankrollManager = () => {
  const [state, setState] = useState<BankrollState>(loadBankroll);
  const [showSettings, setShowSettings] = useState(false);
  const [showBooks, setShowBooks] = useState(false);

  // Calculator preview inputs
  const [pctProb, setPctProb] = useState(58);
  const [odds, setOdds] = useState(2.0);

  const update = (patch: Partial<BankrollState>) => {
    const next = { ...state, ...patch };
    setState(next);
    saveBankroll(next);
  };

  const rec = useMemo(
    () => recommendStake(state, pctProb / 100, odds),
    [state, pctProb, odds],
  );

  const stats = useMemo(() => {
    const settled = state.log.filter(l => l.result === "win" || l.result === "loss" || l.result === "push");
    const wins = settled.filter(l => l.result === "win").length;
    const losses = settled.filter(l => l.result === "loss").length;
    const pnl = state.log.reduce((s, l) => s + (l.pnl ?? 0), 0);
    const staked = state.log.reduce((s, l) => s + l.stake, 0);
    const roi = staked > 0 ? (pnl / staked) * 100 : 0;
    return { wins, losses, pnl, roi, settled: settled.length, pending: state.log.filter(l => l.result === "pending").length };
  }, [state.log]);

  const today = new Date().toISOString().slice(0, 10);
  const dailyRisked = state.dailyRisked[today] ?? 0;
  const dailyBudget = state.bankroll * (state.dailyRiskPct / 100);
  const dailyPct = Math.min(100, (dailyRisked / Math.max(1, dailyBudget)) * 100);

  const verdictColor =
    rec.verdict === "bet" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" :
    rec.verdict === "wait" ? "text-amber-400 bg-amber-500/10 border-amber-500/30" :
    "text-muted-foreground bg-muted/40 border-border";

  useEffect(() => {
    const refresh = () => setState(loadBankroll());
    window.addEventListener("bankroll-changed", refresh);
    return () => window.removeEventListener("bankroll-changed", refresh);
  }, []);

  return (
    <div className="space-y-4">
      {/* Bankroll header card */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/[0.04] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <Wallet className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Bankroll</p>
            <p className="font-mono text-2xl font-black leading-none">
              {state.bankroll.toLocaleString("sv-SE")} <span className="text-sm text-muted-foreground">{state.currency}</span>
            </p>
          </div>
          <button
            onClick={() => setShowSettings(v => !v)}
            className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Plan <ChevronDown className={cn("w-3 h-3 transition-transform", showSettings && "rotate-180")} />
          </button>
        </div>

        {/* Plan snapshot */}
        <div className="grid grid-cols-3 gap-2">
          <MetricPill icon={<Target className="w-3 h-3" />} label="Unit"       value={`${state.unitPct}%`} />
          <MetricPill icon={<Shield className="w-3 h-3" />} label="Max stake" value={`${state.maxStakePct}%`} />
          <MetricPill icon={<Calculator className="w-3 h-3" />} label="Kelly" value={`${state.kellyFraction}×`} />
        </div>

        {/* Daily risk bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Daily risk used</span>
            <span className="font-mono font-bold">
              {dailyRisked.toFixed(0)} / {dailyBudget.toFixed(0)} {state.currency}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                dailyPct >= 90 ? "bg-red-500" : dailyPct >= 60 ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${dailyPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-in fade-in-0 slide-in-from-top-1">
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="Bankroll"
              suffix={state.currency}
              value={state.bankroll}
              onChange={n => update({ bankroll: Math.max(0, n) })}
              step={100}
              hint="Total du är beredd att förlora över lång sikt."
            />
            <Field
              label="Unit"
              suffix="%"
              value={state.unitPct}
              onChange={n => update({ unitPct: Math.max(0.1, Math.min(10, n)) })}
              step={0.25}
              hint="Basinsats per bet vid neutral edge."
            />
            <Field
              label="Max stake"
              suffix="%"
              value={state.maxStakePct}
              onChange={n => update({ maxStakePct: Math.max(0.5, Math.min(15, n)) })}
              step={0.5}
              hint="Hård gräns per bet, oavsett edge."
            />
            <Field
              label="Kelly fraction"
              value={state.kellyFraction}
              onChange={n => update({ kellyFraction: Math.max(0.05, Math.min(1, n)) })}
              step={0.05}
              hint="0.25 = kvarts Kelly (rekommenderas)."
            />
            <Field
              label="Daily risk"
              suffix="%"
              value={state.dailyRiskPct}
              onChange={n => update({ dailyRiskPct: Math.max(1, Math.min(30, n)) })}
              step={1}
              hint="Max av bankroll per dag."
            />
            <Field
              label="Min edge"
              suffix="%"
              value={state.minEdgePct}
              onChange={n => update({ minEdgePct: Math.max(0, Math.min(20, n)) })}
              step={0.5}
              hint="Ingen bet under detta modelledge."
            />
          </div>
          <button
            onClick={() => {
              if (!confirm("Reset bankroll plan to defaults?")) return;
              const fresh: BankrollState = {
                ...state,
                unitPct: 1, maxStakePct: 3, kellyFraction: 0.25,
                dailyRiskPct: 5, minEdgePct: 3, dailyRisked: {},
              };
              setState(fresh); saveBankroll(fresh);
            }}
            className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-3 h-3" /> Reset plan defaults
          </button>
        </div>
      )}

      {/* Stake calculator */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Stake Calculator</h3>
          <span className="ml-auto text-[9px] text-muted-foreground">Preview a bet before placing it</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Model win %" suffix="%" value={pctProb}
            onChange={n => setPctProb(Math.max(1, Math.min(99, n)))} step={1} />
          <Field label="Bookmaker odds" value={odds}
            onChange={n => setOdds(Math.max(1.01, n))} step={0.05} />
        </div>

        <div className={cn("rounded-xl border p-3", verdictColor)}>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider font-bold">
              {rec.verdict === "bet" ? "Recommended stake" : rec.verdict === "wait" ? "Pause" : "Skip"}
            </span>
            {rec.verdict === "bet" && (
              <span className="font-mono text-lg font-black">
                {rec.stake.toLocaleString("sv-SE")} {state.currency}
              </span>
            )}
          </div>
          <p className="text-[10px] mt-0.5 opacity-90 leading-relaxed">{rec.reason}</p>
          {rec.verdict === "bet" && (
            <div className="grid grid-cols-3 gap-1 mt-2 text-[10px] font-mono">
              <span>Edge <b className="ml-0.5">{rec.edgePct.toFixed(1)}%</b></span>
              <span>EV <b className="ml-0.5">+{rec.expectedValue.toFixed(0)}</b></span>
              <span>Bank <b className="ml-0.5">{(rec.bankrollFraction * 100).toFixed(2)}%</b></span>
            </div>
          )}
        </div>

        <p className="text-[9px] text-muted-foreground leading-relaxed">
          Fractional Kelly caps risk. Even at a genuine edge we never risk more than{" "}
          <b>{state.maxStakePct}%</b> of the bank on one bet, or <b>{state.dailyRiskPct}%</b> per day.
          Målet är att vinna stort — inte varje gång.
        </p>
      </div>

      {/* Performance */}
      {(state.log.length > 0 || stats.pnl !== 0) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            {stats.pnl >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
            <h3 className="text-sm font-bold">Performance</h3>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <MetricPill label="P&L" value={`${stats.pnl >= 0 ? "+" : ""}${stats.pnl.toFixed(0)}`}
              valueClass={stats.pnl >= 0 ? "text-emerald-400" : "text-red-400"} />
            <MetricPill label="ROI" value={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`}
              valueClass={stats.roi >= 0 ? "text-emerald-400" : "text-red-400"} />
            <MetricPill label="Record" value={`${stats.wins}-${stats.losses}`} />
            <MetricPill label="Pending" value={`${stats.pending}`} />
          </div>

          {state.log.length > 0 && (
            <div className="space-y-1 pt-1">
              {state.log.slice(0, 5).map(l => (
                <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold truncate">{l.match}</p>
                    <p className="text-[9px] text-muted-foreground truncate">
                      {l.market} · {l.odds.toFixed(2)} · {l.stake} {state.currency}
                    </p>
                  </div>
                  {l.result === "pending" ? (
                    <div className="flex gap-0.5">
                      <button title="Won"  onClick={() => setState(settleBet(state, l.id, "win"))}  className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                      <button title="Lost" onClick={() => setState(settleBet(state, l.id, "loss"))} className="p-1 text-red-400 hover:bg-red-500/10 rounded"><XCircle className="w-3.5 h-3.5" /></button>
                      <button title="Push" onClick={() => setState(settleBet(state, l.id, "push"))} className="p-1 text-muted-foreground hover:bg-muted rounded"><MinusCircle className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <span className={cn(
                      "font-mono text-[10px] font-bold px-1.5 py-0.5 rounded",
                      (l.pnl ?? 0) > 0 ? "bg-emerald-500/15 text-emerald-400" :
                      (l.pnl ?? 0) < 0 ? "bg-red-500/15 text-red-400" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {(l.pnl ?? 0) > 0 ? "+" : ""}{(l.pnl ?? 0).toFixed(0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bookmakers */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <button
          onClick={() => setShowBooks(v => !v)}
          className="w-full flex items-center gap-2 text-left"
        >
          <Wallet className="w-4 h-4 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-bold">Bookmakers</p>
            <p className="text-[10px] text-muted-foreground">
              Swedish regulated books — filter which odds signals to display
            </p>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showBooks && "rotate-180")} />
        </button>
        {showBooks && <BookmakerFilter />}
      </div>
    </div>
  );
};

const MetricPill = ({
  icon, label, value, valueClass,
}: { icon?: React.ReactNode; label: string; value: string; valueClass?: string }) => (
  <div className="rounded-lg border border-border bg-card/60 px-2 py-1.5">
    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
      {icon} {label}
    </div>
    <div className={cn("font-mono text-sm font-black leading-none mt-0.5", valueClass)}>{value}</div>
  </div>
);
