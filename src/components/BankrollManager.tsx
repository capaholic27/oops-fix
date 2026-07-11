import { useEffect, useMemo, useState } from "react";
import {
  Wallet, TrendingUp, TrendingDown, Calculator,
  ChevronDown, CheckCircle2, XCircle, MinusCircle, Shield, Target, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadBankroll, saveBankroll, recommendStake, settleBet, PROFILES,
  type BankrollState, type RiskProfile,
} from "@/lib/bankroll";
import { BookmakerFilter } from "@/components/BookmakerFilter";

/**
 * Number input that accepts empty and partial values while the user is
 * editing (fixes the "can't erase, jumps to 99" bug from the clamped input).
 * Commits the parsed number on blur or Enter.
 */
const NumberField = ({
  label, value, onCommit, suffix, min, max, step = 1, hint,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) => {
  const [text, setText] = useState(() => String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const commit = () => {
    if (text.trim() === "") { setText(String(value)); return; }
    let n = Number(text);
    if (!Number.isFinite(n)) { setText(String(value)); return; }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(String(n));
    if (n !== value) onCommit(n);
  };

  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:border-primary/40">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          step={step}
          onChange={(e) => setText(e.target.value.replace(/[^0-9.\-]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
          className="flex-1 w-full bg-transparent text-sm font-mono font-bold focus:outline-none"
        />
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-[9px] text-muted-foreground leading-snug">{hint}</p>}
    </label>
  );
};

const PROFILE_ICON: Record<RiskProfile, typeof Shield> = {
  conservative: Shield,
  balanced: Target,
  aggressive: Zap,
};

export const BankrollManager = () => {
  const [state, setState] = useState<BankrollState>(loadBankroll);
  const [showBooks, setShowBooks] = useState(false);
  const [showLog, setShowLog] = useState(true);

  // Calculator preview inputs — text so user can freely edit.
  const [probText, setProbText] = useState("58");
  const [oddsText, setOddsText] = useState("2.00");
  const pctProb = Math.min(99, Math.max(1, Number(probText) || 0));
  const oddsVal = Math.max(1.01, Number(oddsText) || 1.01);

  const update = (patch: Partial<BankrollState>) => {
    const next = { ...state, ...patch };
    setState(next);
    saveBankroll(next);
  };

  const profile = PROFILES[state.profile];
  const rec = useMemo(
    () => recommendStake(state, pctProb / 100, oddsVal),
    [state, pctProb, oddsVal],
  );

  const stats = useMemo(() => {
    const settled = state.log.filter(l => l.result === "win" || l.result === "loss" || l.result === "push");
    const wins = settled.filter(l => l.result === "win").length;
    const losses = settled.filter(l => l.result === "loss").length;
    const pnl = state.log.reduce((s, l) => s + (l.pnl ?? 0), 0);
    const staked = state.log.reduce((s, l) => s + l.stake, 0);
    const roi = staked > 0 ? (pnl / staked) * 100 : 0;
    return { wins, losses, pnl, roi, pending: state.log.filter(l => l.result === "pending").length };
  }, [state.log]);

  const today = new Date().toISOString().slice(0, 10);
  const dailyRisked = state.dailyRisked[today] ?? 0;
  const dailyBudget = state.bankroll * (profile.dailyRiskPct / 100);
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
      {/* Bankroll card */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/[0.04] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Bankroll</p>
            <p className="font-mono text-2xl font-black leading-none">
              {state.bankroll.toLocaleString("en-US")}{" "}
              <span className="text-sm text-muted-foreground">{state.currency}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Bankroll"
            suffix={state.currency}
            value={state.bankroll}
            onCommit={(n) => update({ bankroll: Math.max(0, n) })}
            min={0}
            step={100}
          />
          <NumberField
            label="Min edge"
            suffix="%"
            value={state.minEdgePct}
            onCommit={(n) => update({ minEdgePct: n })}
            min={0}
            max={20}
            step={0.5}
            hint="Skip anything below this."
          />
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

      {/* Risk profile picker */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-bold">Risk profile</p>
          <p className="text-[10px] text-muted-foreground">Pick one — we handle the math.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PROFILES) as RiskProfile[]).map((key) => {
            const p = PROFILES[key];
            const Icon = PROFILE_ICON[key];
            const active = state.profile === key;
            return (
              <button
                key={key}
                onClick={() => update({ profile: key })}
                className={cn(
                  "rounded-xl border p-2.5 text-left transition-all",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/40"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={cn("w-3.5 h-3.5", active ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-[11px] font-bold", active ? "text-primary" : "text-foreground")}>
                    {p.label}
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground leading-snug">{p.description}</p>
                <p className="text-[9px] font-mono mt-1 text-muted-foreground">
                  Max {p.maxStakePct}% · Day {p.dailyRiskPct}%
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stake calculator */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Stake calculator</h3>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Model win %</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:border-primary/40">
              <input
                type="text"
                inputMode="decimal"
                value={probText}
                onChange={(e) => setProbText(e.target.value.replace(/[^0-9.]/g, ""))}
                className="flex-1 w-full bg-transparent text-sm font-mono font-bold focus:outline-none"
              />
              <span className="text-[10px] text-muted-foreground">%</span>
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bookmaker odds</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:border-primary/40">
              <input
                type="text"
                inputMode="decimal"
                value={oddsText}
                onChange={(e) => setOddsText(e.target.value.replace(/[^0-9.]/g, ""))}
                className="flex-1 w-full bg-transparent text-sm font-mono font-bold focus:outline-none"
              />
            </div>
          </label>
        </div>

        <div className={cn("rounded-xl border p-3", verdictColor)}>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider font-bold">
              {rec.verdict === "bet" ? "Suggested stake" : rec.verdict === "wait" ? "Pause" : "Skip"}
            </span>
            {rec.verdict === "bet" && (
              <span className="font-mono text-lg font-black">
                {rec.stake.toLocaleString("en-US")} {state.currency}
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
          Never more than <b>{profile.maxStakePct}%</b> of your bankroll on one bet, or <b>{profile.dailyRiskPct}%</b> per day.
          The goal is to win big — not every time.
        </p>
      </div>

      {/* Performance */}
      {(state.log.length > 0 || stats.pnl !== 0) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <button onClick={() => setShowLog(v => !v)} className="w-full flex items-center gap-2">
            {stats.pnl >= 0
              ? <TrendingUp className="w-4 h-4 text-emerald-400" />
              : <TrendingDown className="w-4 h-4 text-red-400" />}
            <h3 className="text-sm font-bold flex-1 text-left">Performance</h3>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showLog && "rotate-180")} />
          </button>
          <div className="grid grid-cols-4 gap-2">
            <MetricPill label="P&L" value={`${stats.pnl >= 0 ? "+" : ""}${stats.pnl.toFixed(0)}`}
              valueClass={stats.pnl >= 0 ? "text-emerald-400" : "text-red-400"} />
            <MetricPill label="ROI" value={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`}
              valueClass={stats.roi >= 0 ? "text-emerald-400" : "text-red-400"} />
            <MetricPill label="Record" value={`${stats.wins}-${stats.losses}`} />
            <MetricPill label="Pending" value={`${stats.pending}`} />
          </div>

          {showLog && state.log.length > 0 && (
            <div className="space-y-1 pt-1">
              {state.log.slice(0, 8).map(l => (
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
        <button onClick={() => setShowBooks(v => !v)} className="w-full flex items-center gap-2 text-left">
          <Wallet className="w-4 h-4 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-bold">Bookmakers</p>
            <p className="text-[10px] text-muted-foreground">Choose which books' odds to display.</p>
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
