import { useState, useMemo, useCallback } from "react";
import {
  Crown, Lock, Unlock, Target, Flag, AlertTriangle, Shield, TrendingUp,
  Crosshair, Sparkles, ChevronLeft, Search, Star, Loader2, Brain,
  BarChart3, Eye, Zap, X, ChevronRight,
} from "lucide-react";
import { useMatches, useTeamMatches, useFixtures } from "@/hooks/useMatches";
import {
  getTeamMatchView, aggregateStats, getUniqueTeams, getUniqueLeagues,
  type TeamMatchView, type AggregatedStats,
} from "@/lib/matchStats";
import { computeMentality, normalizeTeamName, isTournamentLeague } from "@/lib/teamNormalize";
import { predictMatch, computeLeagueAvgGoals, type PredictionResult, type TeamInput } from "@/lib/dixonColes";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { FormBadge } from "@/components/FormBadge";
import { MomentumChart } from "@/components/MomentumChart";
import { PredictedTacticalProfile } from "@/components/PredictedTacticalProfile";
import { WinProbabilityGauge } from "@/components/WinProbabilityGauge";
import { AdBanner } from "@/components/AdBanner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useFavorites } from "@/hooks/useFavorites";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PREMIUM_UNLOCKED_KEY = "fe_premium_unlocked";
function isPremiumUnlocked(): boolean {
  try { return localStorage.getItem(PREMIUM_UNLOCKED_KEY) === "true"; } catch { return false; }
}

type StatPredictionCategory = "corners" | "fouls" | "shots" | "cards" | "goals" | "cleanSheets" | "btts";

const STAT_CATEGORIES: { id: StatPredictionCategory; label: string; icon: React.ReactNode; emoji: string }[] = [
  { id: "corners", label: "Corners", icon: <Flag className="w-4 h-4" />, emoji: "🚩" },
  { id: "shots", label: "Shots", icon: <Crosshair className="w-4 h-4" />, emoji: "🎯" },
  { id: "fouls", label: "Fouls", icon: <Shield className="w-4 h-4" />, emoji: "⚠️" },
  { id: "cards", label: "Cards", icon: <AlertTriangle className="w-4 h-4" />, emoji: "🟨" },
  { id: "goals", label: "Goals", icon: <Target className="w-4 h-4" />, emoji: "⚽" },
  { id: "cleanSheets", label: "Clean Sheet", icon: <Shield className="w-4 h-4" />, emoji: "🧤" },
  { id: "btts", label: "BTTS", icon: <BarChart3 className="w-4 h-4" />, emoji: "📊" },
];

/* ─── Stat Prediction Dialog ─── */
const StatPredictionDialog = ({
  open,
  onOpenChange,
  category,
  teamName,
  opponentName,
  stats,
  opponentStats,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category: StatPredictionCategory;
  teamName: string;
  opponentName?: string;
  stats: AggregatedStats;
  opponentStats: AggregatedStats | null;
}) => {
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<string | null>(null);
  const cat = STAT_CATEGORIES.find(c => c.id === category)!;

  const handlePredict = useCallback(async () => {
    setPredicting(true);
    setPrediction(null);
    try {
      const body: any = {
        teamName,
        stats,
        recentForm: stats.formLast5,
        statCategory: category,
      };
      if (opponentName && opponentStats) {
        body.upcomingOpponent = opponentName;
        body.opponentStats = opponentStats;
        body.opponentForm = opponentStats.formLast5;
      }
      body.matchContext = `Focus your analysis EXCLUSIVELY on "${cat.label}" stats. Provide detailed prediction for ${cat.label.toLowerCase()} in this match including: expected numbers, over/under lines, trends, and betting angles specific to ${cat.label.toLowerCase()}.`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predict-match`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(body),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Error ${response.status}`);
      setPrediction(data.prediction);
      toast.success(`${cat.label} prediction ready!`);
    } catch (err: any) {
      toast.error(err?.message || "Prediction failed");
    } finally {
      setPredicting(false);
    }
  }, [teamName, opponentName, stats, opponentStats, category]);

  const getStatSummary = () => {
    switch (category) {
      case "corners":
        return [
          { label: "Avg For", value: stats.avgCornersFor.toFixed(1), opp: opponentStats?.avgCornersFor.toFixed(1) },
          { label: "Avg Against", value: stats.avgCornersAgainst.toFixed(1), opp: opponentStats?.avgCornersAgainst.toFixed(1) },
          { label: "Total Avg", value: (stats.avgCornersFor + stats.avgCornersAgainst).toFixed(1), opp: opponentStats ? (opponentStats.avgCornersFor + opponentStats.avgCornersAgainst).toFixed(1) : undefined },
        ];
      case "shots":
        return [
          { label: "Shots For", value: stats.avgShotsFor.toFixed(1), opp: opponentStats?.avgShotsFor.toFixed(1) },
          { label: "SOT For", value: stats.avgShotsOnTargetFor.toFixed(1), opp: opponentStats?.avgShotsOnTargetFor.toFixed(1) },
          { label: "Shots Against", value: stats.avgShotsAgainst.toFixed(1), opp: opponentStats?.avgShotsAgainst.toFixed(1) },
        ];
      case "fouls":
        return [
          { label: "Committed", value: stats.avgFoulsCommitted.toFixed(1), opp: opponentStats?.avgFoulsCommitted.toFixed(1) },
          { label: "Drawn", value: stats.avgFoulsDrawn.toFixed(1), opp: opponentStats?.avgFoulsDrawn.toFixed(1) },
        ];
      case "cards":
        return [
          { label: "Yellows", value: stats.avgYellowCards.toFixed(1), opp: opponentStats?.avgYellowCards.toFixed(1) },
          { label: "Reds", value: stats.avgRedCards.toFixed(2), opp: opponentStats?.avgRedCards.toFixed(2) },
        ];
      case "goals":
        return [
          { label: "GF/Game", value: (stats.goalsFor / stats.matchesPlayed).toFixed(2), opp: opponentStats ? (opponentStats.goalsFor / opponentStats.matchesPlayed).toFixed(2) : undefined },
          { label: "GA/Game", value: (stats.goalsAgainst / stats.matchesPlayed).toFixed(2), opp: opponentStats ? (opponentStats.goalsAgainst / opponentStats.matchesPlayed).toFixed(2) : undefined },
          { label: "Over 2.5", value: `${stats.over25Percentage.toFixed(0)}%`, opp: opponentStats ? `${opponentStats.over25Percentage.toFixed(0)}%` : undefined },
        ];
      case "cleanSheets":
        return [
          { label: "Clean Sheets", value: `${stats.cleanSheets}/${stats.matchesPlayed}`, opp: opponentStats ? `${opponentStats.cleanSheets}/${opponentStats.matchesPlayed}` : undefined },
          { label: "CS %", value: `${((stats.cleanSheets / stats.matchesPlayed) * 100).toFixed(0)}%`, opp: opponentStats ? `${((opponentStats.cleanSheets / opponentStats.matchesPlayed) * 100).toFixed(0)}%` : undefined },
        ];
      case "btts":
        return [
          { label: "BTTS %", value: `${stats.bttsPercentage.toFixed(0)}%`, opp: opponentStats ? `${opponentStats.bttsPercentage.toFixed(0)}%` : undefined },
          { label: "Over 1.5", value: `${stats.over15Percentage.toFixed(0)}%`, opp: opponentStats ? `${opponentStats.over15Percentage.toFixed(0)}%` : undefined },
          { label: "Over 2.5", value: `${stats.over25Percentage.toFixed(0)}%`, opp: opponentStats ? `${opponentStats.over25Percentage.toFixed(0)}%` : undefined },
        ];
      default:
        return [];
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed left-[50%] translate-x-[-50%] translate-y-0 top-[max(0.5rem,env(safe-area-inset-top))] bottom-[max(5rem,env(safe-area-inset-bottom))] w-[calc(100vw-1rem)] max-w-md flex flex-col p-0 gap-0 rounded-2xl border border-primary/20 shadow-xl [&>button:last-child]:hidden overflow-hidden sm:top-[50%] sm:bottom-auto sm:max-h-[85vh] sm:translate-y-[-50%]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-2">
            <span className="text-lg">{cat.emoji}</span>
            <span className="text-sm font-bold">{cat.label} Prediction</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary text-primary-foreground">PRO</span>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1.5 hover:bg-muted transition-colors rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 0 }}>
          {/* Teams */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <TeamLogo teamName={teamName} size="md" />
              <span className="text-sm font-bold">{teamName}</span>
            </div>
            {opponentName && (
              <>
                <span className="text-xs font-bold text-muted-foreground">VS</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{opponentName}</span>
                  <TeamLogo teamName={opponentName} size="md" />
                </div>
              </>
            )}
          </div>

          {/* Stat Summary Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 bg-primary/5 border-b border-border">
              <span className="text-xs font-semibold text-primary">{cat.emoji} {cat.label} Breakdown</span>
            </div>
            <div className="divide-y divide-border">
              {opponentName && opponentStats && (
                <div className="flex items-center py-2 px-3">
                  <span className="font-mono text-[10px] font-bold text-primary w-16 text-right">{teamName.slice(0, 8)}</span>
                  <span className="flex-1 text-center text-[10px] text-muted-foreground font-medium">Stat</span>
                  <span className="font-mono text-[10px] font-bold text-primary w-16">{opponentName.slice(0, 8)}</span>
                </div>
              )}
              {getStatSummary().map((row, i) => (
                <div key={i} className="flex items-center py-2 px-3">
                  <span className="font-mono text-xs font-semibold w-16 text-right">{row.value}</span>
                  <span className="flex-1 text-center text-[10px] text-muted-foreground font-medium">{row.label}</span>
                  {row.opp && <span className="font-mono text-xs font-semibold w-16">{row.opp}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* AI Prediction */}
          {prediction && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-primary">AI Analysis</span>
              </div>
              <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{prediction}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-border bg-card p-3">
          <button
            onClick={prediction ? () => { setPrediction(null); } : handlePredict}
            disabled={predicting}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all",
              prediction
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90 shadow-md",
              predicting && "opacity-70 cursor-wait"
            )}
          >
            {predicting ? <Loader2 className="w-4 h-4 animate-spin" /> : prediction ? <X className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {predicting ? "Analyzing…" : prediction ? "Clear & Close" : `Predict ${cat.label}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ─── Pro Stat Card ─── */
const ProStatCard = ({
  label,
  value,
  icon,
  subtitle,
  trend,
  onPredict,
  locked,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: "positive" | "negative" | "neutral" | "warn";
  onPredict: () => void;
  locked: boolean;
  delay?: number;
}) => {
  const trendColor = {
    positive: "text-stat-positive",
    negative: "text-stat-negative",
    neutral: "text-foreground",
    warn: "text-stat-warn",
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-3 opacity-0 animate-fade-up relative overflow-hidden group"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Shimmer accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={cn("font-mono text-xl font-bold leading-none", trend ? trendColor[trend] : "text-foreground")}>
          {value}
        </div>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>}
        <button
          onClick={(e) => { e.stopPropagation(); onPredict(); }}
          disabled={locked}
          className={cn(
            "mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all",
            locked
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
          )}
        >
          {locked ? <Lock className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          {locked ? "Unlock Pro" : "Predict"}
        </button>
      </div>
    </div>
  );
};

/* ─── Pro Team Selector ─── */
const ProTeamSelector = ({
  allTeams,
  onSelect,
}: {
  allTeams: string[];
  onSelect: (team: string) => void;
}) => {
  const [search, setSearch] = useState("");
  const { favorites, isFavorite } = useFavorites();
  const searchLower = search.toLowerCase().trim();

  const favTeams = useMemo(() => allTeams.filter(t => isFavorite(t)), [allTeams, favorites]);
  const filtered = useMemo(() => {
    if (!searchLower) return [];
    return allTeams.filter(t => t.toLowerCase().includes(searchLower)).slice(0, 12);
  }, [allTeams, searchLower]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search any team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-4 text-sm rounded-xl border border-primary/20 bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      </div>

      {filtered.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map(team => (
            <button
              key={team}
              onClick={() => { onSelect(team); setSearch(""); }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-primary/5 transition-colors flex items-center gap-3 border-b border-border last:border-b-0"
            >
              <TeamLogo teamName={team} size="sm" />
              {team}
            </button>
          ))}
        </div>
      )}

      {/* Favorites */}
      {!searchLower && favTeams.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Your Favorites</span>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {favTeams.map(team => (
              <button
                key={team}
                onClick={() => onSelect(team)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
              >
                <TeamLogo teamName={team} size="sm" />
                <span className="text-xs font-semibold truncate">{team}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!searchLower && favTeams.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <Crown className="w-8 h-8 text-primary/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Search for a team to start</p>
          <p className="text-xs text-muted-foreground">Star teams on the Stats page to see them here</p>
        </div>
      )}
    </div>
  );
};

/* ─── Pro Dashboard ─── */
const ProDashboard = ({
  teamName,
  onBack,
  allMatches,
  unlocked,
}: {
  teamName: string;
  onBack: () => void;
  allMatches: any[];
  unlocked: boolean;
}) => {
  const [pastN, setPastN] = useState(15);
  const [statPrediction, setStatPrediction] = useState<StatPredictionCategory | null>(null);
  const [manualOpponent, setManualOpponent] = useState<string | null>(null);
  const [oppSearch, setOppSearch] = useState("");

  const { data: teamMatches = [] } = useTeamMatches(teamName);
  const { data: fixtures = [] } = useFixtures(teamName);
  const allTeams = useMemo(() => getUniqueTeams(allMatches), [allMatches]);

  const allTeamViews: TeamMatchView[] = useMemo(() => {
    return teamMatches
      .map((m) => getTeamMatchView(m, teamName))
      .filter((v): v is TeamMatchView => v !== null);
  }, [teamMatches, teamName]);

  const teamViews = useMemo(() => allTeamViews.slice(-pastN), [allTeamViews, pastN]);
  const stats = useMemo(() => aggregateStats(teamViews), [teamViews]);

  const nextOpponentName = useMemo(() => {
    if (manualOpponent) return manualOpponent;
    if (fixtures.length === 0) return undefined;
    const today = new Date().toISOString().split("T")[0];
    const next = fixtures.find((f) => f.match_date >= today);
    if (!next) return undefined;
    return next.home_team === teamName ? next.away_team : next.home_team;
  }, [fixtures, teamName, manualOpponent]);

  const opponentStats = useMemo(() => {
    if (!nextOpponentName) return null;
    const views = allMatches
      .map((m: any) => getTeamMatchView(m, nextOpponentName))
      .filter((v): v is TeamMatchView => v !== null)
      .slice(-pastN);
    return views.length > 0 ? aggregateStats(views) : null;
  }, [nextOpponentName, allMatches, pastN]);

  const winRate = stats.matchesPlayed > 0 ? ((stats.wins / stats.matchesPlayed) * 100).toFixed(1) : "0.0";
  const mentality = computeMentality(allTeamViews.map(v => v.result));

  const oppSearchFiltered = useMemo(() => {
    if (!oppSearch.trim()) return [];
    return allTeams.filter(t => t !== teamName && t.toLowerCase().includes(oppSearch.toLowerCase())).slice(0, 8);
  }, [allTeams, oppSearch, teamName]);

  if (stats.matchesPlayed === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">No match data for {teamName}</p>
        <button onClick={onBack} className="mt-3 text-sm text-primary font-medium hover:underline">← Back</button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Back + Filter */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Last</span>
          <select
            value={pastN}
            onChange={(e) => setPastN(Number(e.target.value))}
            className="h-7 px-2 text-xs font-mono font-medium rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Premium Team Banner */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-lg relative overflow-hidden">
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[9px] font-bold bg-primary text-primary-foreground">PRO</div>
        <div className="flex items-start gap-3 mb-3">
          <TeamLogo teamName={teamName} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold leading-tight truncate">{teamName}</h2>
            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
              Last {pastN} matches · {stats.matchesPlayed} analyzed
            </p>
            <div className="flex gap-1 mt-1.5">
              {stats.formLast5.map((r, i) => <FormBadge key={i} result={r} />)}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="font-mono text-xl font-bold text-primary leading-none">{winRate}%</span>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Win Rate</p>
          </div>
        </div>
      </section>

      {/* Opponent selector */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Next Opponent</span>
          {nextOpponentName && (
            <button onClick={() => setManualOpponent(null)} className="text-[10px] text-primary font-medium hover:underline">Reset</button>
          )}
        </div>
        {nextOpponentName ? (
          <div className="flex items-center gap-2">
            <TeamLogo teamName={nextOpponentName} size="sm" />
            <span className="text-sm font-semibold">{nextOpponentName}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No upcoming fixture found</p>
        )}
        <div className="mt-2 relative">
          <input
            type="text"
            placeholder="Change opponent…"
            value={oppSearch}
            onChange={(e) => setOppSearch(e.target.value)}
            className="w-full h-8 px-3 text-xs rounded-lg border border-border bg-muted/50 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
          {oppSearchFiltered.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg border border-border bg-card shadow-lg max-h-32 overflow-y-auto">
              {oppSearchFiltered.map(t => (
                <button
                  key={t}
                  onClick={() => { setManualOpponent(t); setOppSearch(""); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 border-b border-border last:border-b-0"
                >
                  <TeamLogo teamName={t} size="xs" />{t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Premium Stats Grid with Predict buttons */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Pro Analytics</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ProStatCard
            label="Goals"
            value={`${(stats.goalsFor / stats.matchesPlayed).toFixed(2)} / ${(stats.goalsAgainst / stats.matchesPlayed).toFixed(2)}`}
            icon={<Target className="w-4 h-4" />}
            trend={stats.goalsFor / stats.matchesPlayed > 1.5 ? "positive" : "neutral"}
            subtitle={`GF: ${stats.goalsFor} · GA: ${stats.goalsAgainst}`}
            onPredict={() => setStatPrediction("goals")}
            locked={!unlocked}
            delay={100}
          />
          <ProStatCard
            label="Corners"
            value={stats.avgCornersFor.toFixed(1)}
            icon={<Flag className="w-4 h-4" />}
            trend="neutral"
            subtitle={`vs ${stats.avgCornersAgainst.toFixed(1)} · Total ${(stats.avgCornersFor + stats.avgCornersAgainst).toFixed(1)}`}
            onPredict={() => setStatPrediction("corners")}
            locked={!unlocked}
            delay={150}
          />
          <ProStatCard
            label="Shots"
            value={stats.avgShotsFor.toFixed(1)}
            icon={<Crosshair className="w-4 h-4" />}
            trend="positive"
            subtitle={`SOT: ${stats.avgShotsOnTargetFor.toFixed(1)} · vs ${stats.avgShotsAgainst.toFixed(1)}`}
            onPredict={() => setStatPrediction("shots")}
            locked={!unlocked}
            delay={200}
          />
          <ProStatCard
            label="Cards"
            value={stats.avgYellowCards.toFixed(1)}
            icon={<AlertTriangle className="w-4 h-4" />}
            trend="warn"
            subtitle={`🟡 Y · ${stats.avgRedCards.toFixed(2)} 🔴 R`}
            onPredict={() => setStatPrediction("cards")}
            locked={!unlocked}
            delay={250}
          />
          <ProStatCard
            label="Fouls"
            value={stats.avgFoulsCommitted.toFixed(1)}
            icon={<Shield className="w-4 h-4" />}
            trend="negative"
            subtitle={`Drawn: ${stats.avgFoulsDrawn.toFixed(1)}`}
            onPredict={() => setStatPrediction("fouls")}
            locked={!unlocked}
            delay={300}
          />
          <ProStatCard
            label="Clean Sheets"
            value={`${stats.cleanSheets}/${stats.matchesPlayed}`}
            icon={<Shield className="w-4 h-4" />}
            trend="positive"
            subtitle={`${((stats.cleanSheets / stats.matchesPlayed) * 100).toFixed(0)}% rate`}
            onPredict={() => setStatPrediction("cleanSheets")}
            locked={!unlocked}
            delay={350}
          />
          <ProStatCard
            label="BTTS"
            value={`${stats.bttsPercentage.toFixed(0)}%`}
            icon={<BarChart3 className="w-4 h-4" />}
            trend={stats.bttsPercentage > 60 ? "warn" : "neutral"}
            subtitle={`O2.5: ${stats.over25Percentage.toFixed(0)}% · O1.5: ${stats.over15Percentage.toFixed(0)}%`}
            onPredict={() => setStatPrediction("btts")}
            locked={!unlocked}
            delay={400}
          />
          {/* Mentality card */}
          <div className="rounded-xl border border-border bg-card p-3 opacity-0 animate-fade-up relative overflow-hidden" style={{ animationDelay: "450ms" }}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mentality</span>
                <span className="text-lg">{mentality.emoji}</span>
              </div>
              <span className="font-mono text-sm font-bold text-foreground leading-none">{mentality.label}</span>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{mentality.description}</p>
              <div className="mt-2">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${mentality.intensity}%`,
                      background: mentality.intensity > 75 ? 'hsl(var(--stat-negative))' : mentality.intensity > 50 ? 'hsl(var(--stat-warn))' : 'hsl(var(--primary))',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced sections */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Deep Analytics</span>
        </div>

        {/* Win Probability Gauge */}
        <div className="grid grid-cols-2 gap-3">
          <WinProbabilityGauge
            probability={stats.winProbability}
            teamName={teamName}
            allTeams={allTeams}
            getOpponentWinProbability={(opp) => {
              const oppViews = allMatches
                .map((m: any) => getTeamMatchView(m, opp))
                .filter((v): v is TeamMatchView => v !== null)
                .slice(-pastN);
              if (oppViews.length === 0) return null;
              return aggregateStats(oppViews).winProbability;
            }}
          />
          {/* Shot efficiency */}
          <div className="rounded-xl border border-border bg-card p-3 opacity-0 animate-fade-up" style={{ animationDelay: "500ms" }}>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Shot Efficiency</span>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">SOT/Shots</span>
                  <span className="font-mono font-semibold">{stats.avgShotsFor > 0 ? ((stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100).toFixed(0) : "0"}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${stats.avgShotsFor > 0 ? (stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100 : 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Goals/SOT</span>
                  <span className="font-mono font-semibold">{stats.avgShotsOnTargetFor > 0 ? (((stats.goalsFor / stats.matchesPlayed) / stats.avgShotsOnTargetFor) * 100).toFixed(0) : "0"}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-stat-warn transition-all duration-700" style={{ width: `${stats.avgShotsOnTargetFor > 0 ? Math.min(100, ((stats.goalsFor / stats.matchesPlayed) / stats.avgShotsOnTargetFor) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Momentum Chart */}
      <MomentumChart views={teamViews} teamName={teamName} />

      {/* Tactical */}
      <PredictedTacticalProfile
        stats={stats}
        teamName={teamName}
        views={teamViews}
        opponentStats={opponentStats}
        opponentName={nextOpponentName}
        allFixtures={[]}
        allMatches={allMatches}
        onFixtureChange={() => {}}
        onOpponentSelect={(opp) => setManualOpponent(opp)}
      />

      <AdBanner variant="inline" />

      {/* Stat Prediction Dialog */}
      {statPrediction && (
        <StatPredictionDialog
          open={!!statPrediction}
          onOpenChange={(v) => { if (!v) setStatPrediction(null); }}
          category={statPrediction}
          teamName={teamName}
          opponentName={nextOpponentName}
          stats={stats}
          opponentStats={opponentStats}
        />
      )}
    </div>
  );
};

/* ─── Main Premium Page ─── */
const PremiumPage = () => {
  const [unlocked, setUnlocked] = useState(isPremiumUnlocked);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const { data: allMatches = [], isLoading } = useMatches();
  const allTeams = useMemo(() => getUniqueTeams(allMatches), [allMatches]);

  const togglePremium = () => {
    const next = !unlocked;
    setUnlocked(next);
    localStorage.setItem(PREMIUM_UNLOCKED_KEY, String(next));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (selectedTeam) {
    return (
      <ProDashboard
        teamName={selectedTeam}
        onBack={() => setSelectedTeam("")}
        allMatches={allMatches}
        unlocked={unlocked}
      />
    );
  }

  return (
    <div className="min-h-full p-4 pb-24 max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="text-center space-y-2 pt-2">
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg",
          unlocked
            ? "bg-gradient-to-br from-primary to-primary/70"
            : "bg-muted"
        )}>
          {unlocked
            ? <Crown className="w-8 h-8 text-primary-foreground" />
            : <Lock className="w-8 h-8 text-muted-foreground" />}
        </div>
        <h1 className="text-2xl font-bold">{unlocked ? "Pro Analytics" : "Go Pro"}</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {unlocked
            ? "Select a team to access premium per-stat AI predictions and deep analytics."
            : "Unlock AI-powered predictions for every stat — corners, shots, cards, fouls, and more."}
        </p>
      </div>

      {/* Unlock toggle */}
      <button
        onClick={togglePremium}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all",
          unlocked
            ? "bg-muted text-muted-foreground hover:bg-muted/80"
            : "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90 shadow-md"
        )}
      >
        {unlocked ? <Unlock className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
        {unlocked ? "Lock (Dev Mode)" : "Unlock Pro — Free Trial"}
      </button>

      {/* Feature preview when locked */}
      {!unlocked && (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Per-Stat AI Predictions</span>
          <div className="grid grid-cols-2 gap-2">
            {STAT_CATEGORIES.map(cat => (
              <div key={cat.id} className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5 opacity-60">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  {cat.icon}
                </div>
                <div>
                  <span className="text-xs font-semibold">{cat.label}</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className="text-[9px] text-muted-foreground">Pro Only</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team selector when unlocked */}
      {unlocked && (
        <ProTeamSelector allTeams={allTeams} onSelect={setSelectedTeam} />
      )}

      <AdBanner variant="interstitial" />
    </div>
  );
};

export default PremiumPage;
