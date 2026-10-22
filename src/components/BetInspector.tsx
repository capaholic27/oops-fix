import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Crosshair, Gauge, Loader2, RotateCcw, X } from "lucide-react";
import { useMatches, useTeamCatalog } from "@/hooks/useMatches";
import { useTeamPlayers } from "@/hooks/useTeamPlayers";
import { getTeamMatchView, aggregateStats, filterRecentViews, type TeamMatchView } from "@/lib/matchStats";
import { predictMatch, computeLeagueAvgGoals, type TeamInput } from "@/lib/dixonColes";
import { buildPredictionMarkets, type MarketOutcome } from "@/lib/predictionMarkets";
import { matchesTeamQuery, uniqueTeamNames } from "@/lib/teamNormalize";
import { TeamLogo } from "@/components/TeamLogo";
import { cn } from "@/lib/utils";

/** A single outcome the user has in mind for their bet. */
type BetPick = { marketId: string; marketLabel: string; outcome: MarketOutcome };

const SIZE = 52;

function verdictFor(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Strong", color: "text-stat-positive" };
  if (score >= 65) return { label: "Solid", color: "text-stat-positive" };
  if (score >= 50) return { label: "Moderate", color: "text-stat-warn" };
  if (score >= 35) return { label: "Speculative", color: "text-stat-warn" };
  return { label: "Long shot", color: "text-stat-negative" };
}

/** Circular 0-100 gauge. */
function ConfidenceGauge({ score }: { score: number }) {
  const verdict = verdictFor(score);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const stroke = score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`Confidence ${score} out of 100`}>
        <circle cx="56" cy="56" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        <circle
          cx="56" cy="56" r={radius} fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          transform="rotate(-90 56 56)"
        />
        <text x="56" y="52" textAnchor="middle" fill="hsl(var(--foreground))" fontSize="26" fontWeight="700" fontFamily="ui-monospace, monospace">{score}</text>
        <text x="56" y="70" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10">/ 100</text>
      </svg>
      <p className={cn("text-xs font-semibold", verdict.color)}>{verdict.label} confidence</p>
    </div>
  );
}

/** Compact team search + select, shared by the home and away slots. */
function TeamPick({ label, value, exclude, teams, onChange }: {
  label: string;
  value: string;
  exclude: string;
  teams: string[];
  onChange: (team: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = teams.filter(t => t !== exclude && matchesTeamQuery(t, search)).slice(0, 12);
  return (
    <div>
      <label className="text-xs text-muted-foreground font-medium mb-1.5 block">{label}</label>
      {value ? (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo teamName={value} size="sm" />
            <p className="text-sm font-semibold truncate">{value}</p>
          </div>
          <button onClick={() => onChange("")} className="text-xs text-primary font-medium hover:underline shrink-0">Change</button>
        </div>
      ) : (
        <>
          <input
            type="text" placeholder="Search team…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-card mt-1.5">
            {filtered.map(team => (
              <button
                key={team} onClick={() => { onChange(team); setSearch(""); }}
                className="w-full text-left px-3 py-2 text-sm border-b border-border last:border-b-0 hover:bg-muted flex items-center gap-2"
              >
                <TeamLogo teamName={team} size="xs" />{team}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Bet Inspector — a draggable circular widget. Tap it to pick the two teams,
 * tap the bet markets you already have in mind, and get a 0-100 model
 * confidence rating for your bet.
 */
export function BetInspector() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(() => ({ x: window.innerWidth - SIZE - 12, y: window.innerHeight - 170 }));
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);

  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [picks, setPicks] = useState<BetPick[]>([]);
  const [evaluated, setEvaluated] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const verdictRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (evaluated) verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [evaluated]);

  const { data: allMatches = [] } = useMatches();
  const catalog = useTeamCatalog();
  const { data: squadHome = [] } = useTeamPlayers(home || undefined);
  const { data: squadAway = [] } = useTeamPlayers(away || undefined);
  const teams = useMemo(() => uniqueTeamNames([...catalog, ...allMatches.flatMap(m => [m.home_team, m.away_team])]), [catalog, allMatches]);

  const viewsFor = (team: string): TeamMatchView[] =>
    filterRecentViews(allMatches.map(m => getTeamMatchView(m, team)).filter((v): v is TeamMatchView => v !== null)).slice(-10);

  const marketData = useMemo(() => {
    if (!home || !away) return null;
    const homeViews = viewsFor(home);
    const awayViews = viewsFor(away);
    if (homeViews.length < 3 || awayViews.length < 3) return null;
    const statsHome = aggregateStats(homeViews);
    const statsAway = aggregateStats(awayViews);
    const recent = (vs: TeamMatchView[]) => {
      const last5 = vs.slice(-5);
      return {
        scored: last5.reduce((s, v) => s + v.goalsFor, 0),
        conceded: last5.reduce((s, v) => s + v.goalsAgainst, 0),
        n: last5.length,
      };
    };
    const input = (stats: typeof statsHome, r: ReturnType<typeof recent>): TeamInput => ({
      goalsScored: stats.goalsFor,
      goalsConceded: stats.goalsAgainst,
      matchesPlayed: stats.matchesPlayed,
      recentGoalsScored: r.scored,
      recentGoalsConceded: r.conceded,
      recentMatches: r.n,
    });
    const pred = predictMatch(input(statsHome, recent(homeViews)), input(statsAway, recent(awayViews)), computeLeagueAvgGoals(allMatches));
    const markets = buildPredictionMarkets({
      prediction: pred, home, away, statsHome, statsAway, homeViews, awayViews, squadHome, squadAway,
    }).filter(m => m.outcomes.length > 0);
    return { markets };
  }, [home, away, allMatches, squadHome, squadAway]);

  const togglePick = (marketId: string, marketLabel: string, outcome: MarketOutcome) => {
    setEvaluated(false);
    setPicks(current => {
      const key = `${marketId}::${outcome.label}`;
      const exists = current.some(p => `${p.marketId}::${p.outcome.label}` === key);
      return exists
        ? current.filter(p => `${p.marketId}::${p.outcome.label}` !== key)
        : [...current, { marketId, marketLabel, outcome }];
    });
  };

  const reset = () => {
    setPicks([]);
    setEvaluated(false);
    setEvaluating(false);
  };

  const evaluate = () => {
    if (!picks.length || evaluating) return;
    setEvaluated(false);
    setEvaluating(true);
    window.setTimeout(() => { setEvaluated(true); setEvaluating(false); }, 650);
  };

  const score = useMemo(() => {
    if (!picks.length) return null;
    const combined = picks.reduce((acc, p) => acc * p.outcome.probability / 100, 1) * 100;
    return Math.round(Math.min(100, Math.max(0, combined)));
  }, [picks]);

  // ─── Draggable circular handle ───
  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* capture is best-effort; movement still tracked */ }
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    setPos({
      x: Math.min(Math.max(4, d.baseX + dx), window.innerWidth - SIZE - 4),
      y: Math.min(Math.max(4, d.baseY + dy), window.innerHeight - SIZE - 4),
    });
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) setOpen(true);
  };

  return (
    <>
      <button
        aria-label="Bet Inspector — tap to check a bet, drag to move"
        title="Bet Inspector — drag to move, tap to open"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE, touchAction: "none" }}
        className="fixed z-[90] rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 flex items-center justify-center active:scale-95 transition-transform border-2 border-primary-foreground/20"
      >
        <Crosshair className="w-5 h-5" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-card border-t sm:border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Bet Inspector</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-muted" aria-label="Close Bet Inspector">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Team selection */}
              {!marketData && (
                <div className="space-y-3">
                  <TeamPick label="Home team" value={home} exclude={away} teams={teams} onChange={t => { setHome(t); reset(); }} />
                  {home && <TeamPick label="Away team" value={away} exclude={home} teams={teams} onChange={t => { setAway(t); reset(); }} />}
                  {home && away && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Not enough recent match data for both teams to model this matchup.
                    </p>
                  )}
                </div>
              )}

              {marketData && (
                <>
                  {/* Matchup line */}
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1">
                    <div className="flex items-center gap-2 min-w-0"><TeamLogo teamName={home} size="sm" /><span className="text-xs font-semibold truncate">{home}</span></div>
                    <span className="text-[10px] text-muted-foreground">VS</span>
                    <div className="flex items-center justify-end gap-2 min-w-0"><span className="text-xs font-semibold truncate text-right">{away}</span><TeamLogo teamName={away} size="sm" /></div>
                  </div>
                  <button onClick={() => { setHome(""); setAway(""); reset(); }} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Change teams</button>

                  {/* Verdict */}
                  {evaluated && score !== null && (
                    <section ref={verdictRef} className="border border-[#2c2c2e] bg-[#151517] rounded-2xl p-3 space-y-3" aria-label="Bet evaluation">
                      <div className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-primary" />
                        <h3 className="text-xs font-semibold uppercase tracking-wide">Your bet, rated by the model</h3>
                      </div>
                      <ConfidenceGauge score={score} />
                      <div className="divide-y divide-border">
                        {picks.map(p => (
                          <div key={`${p.marketId}-${p.outcome.label}`} className="flex items-center justify-between gap-3 py-1.5">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{p.outcome.label}</p>
                              <p className="text-[9px] text-muted-foreground">{p.marketLabel}</p>
                            </div>
                            <span className="font-mono text-xs font-bold text-primary shrink-0">{p.outcome.probability.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[9px] leading-relaxed text-muted-foreground">
                        {picks.length > 1
                          ? "Score = the combined chance of every leg landing (all selections must win together)."
                          : "Score = the model's estimated chance of your selection."}
                        {" "}Dixon-Coles model · normal time only · an estimated probability, not a guarantee of value.
                      </p>
                    </section>
                  )}

                  {/* Market picker */}
                  <div className="space-y-2">
                    <h3 className="text-[10px] uppercase font-semibold text-muted-foreground">Tap the markets you have in mind</h3>
                    {marketData.markets.map(market => (
                      <div key={market.id} className="rounded-xl border border-[#2c2c2e] bg-[#151517] px-3 pt-2.5 pb-3">
                        <div className="flex items-center justify-between gap-2 pb-2">
                          <p className="text-[10px] font-semibold text-neutral-400">{market.label}</p>
                          <span className="text-[9px] font-medium" style={{ color: market.confidence === "Strong" ? "#2ecc71" : market.confidence === "Moderate" ? "#f1c40f" : "#f87171" }}>{market.confidence}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {market.outcomes.map(outcome => {
                            const key = `${market.id}::${outcome.label}`;
                            const selected = picks.some(p => `${p.marketId}::${p.outcome.label}` === key);
                            return (
                              <button
                                key={key}
                                onClick={() => togglePick(market.id, market.label, outcome)}
                                aria-pressed={selected}
                                className={cn(
                                  "flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-all active:scale-95",
                                  selected
                                    ? "border-[#2ecc71] bg-[#2ecc71]/15 text-white font-semibold"
                                    : "border-[#2c2c2e] bg-white/5 text-neutral-300 hover:bg-white/10"
                                )}
                              >
                                {selected && <Check className="w-3 h-3" style={{ color: "#2ecc71" }} />}
                                {outcome.label}
                                <span className="font-mono" style={{ color: `#${Math.round(outcome.probability) >= 60 ? "2ecc71" : Math.round(outcome.probability) >= 40 ? "f1c40f" : "f87171"}` }}>{outcome.probability.toFixed(0)}%</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={evaluate}
                      disabled={picks.length === 0 || evaluating}
                      className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      {evaluating
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Evaluating…</>
                        : <><Gauge className="w-4 h-4" /> Evaluate bet{picks.length > 0 ? ` (${picks.length})` : ""}</>}
                    </button>
                    {picks.length > 0 && (
                      <button onClick={reset} className="h-10 px-3 rounded-xl border border-border text-muted-foreground hover:bg-muted" aria-label="Clear picks">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
