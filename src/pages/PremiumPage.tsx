import { useState, useMemo, useCallback } from "react";
import {
  Crown, Lock, Unlock, Target, Flag, AlertTriangle, Shield, TrendingUp,
  Crosshair, Sparkles, ChevronLeft, Search, Star, Loader2, Brain,
  BarChart3, Eye, Zap, X, ChevronRight, Trophy, Users, Activity, Percent,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Minus,
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
import { PlayerHighlights, PredictionDialog } from "@/pages/TeamPage";
import { PredictedTacticalProfile } from "@/components/PredictedTacticalProfile";
import { MatchVote } from "@/components/MatchVote";
import { StatCardDetail } from "@/components/StatCardDetail";
import { AdBanner } from "@/components/AdBanner";
import { TeamSwitcher } from "@/components/TeamSwitcher";
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
  delay = 0,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: "positive" | "negative" | "neutral" | "warn";
  delay?: number;
  onClick?: () => void;
}) => {
  const trendColor = {
    positive: "text-stat-positive",
    negative: "text-stat-negative",
    neutral: "text-foreground",
    warn: "text-stat-warn",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "text-left rounded-xl border border-border bg-card p-3 opacity-0 animate-fade-up relative overflow-hidden transition-all",
        onClick && "hover:border-primary/40 hover:shadow-md active:scale-[0.98] cursor-pointer"
      )}
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
      </div>
    </button>
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
  onSwitchTeam,
}: {
  teamName: string;
  onBack: () => void;
  allMatches: any[];
  unlocked: boolean;
  onSwitchTeam: (team: string) => void;
}) => {
  const [pastN, setPastN] = useState(15);
  const [showPredict, setShowPredict] = useState(false);
  const [openStat, setOpenStat] = useState<StatKey | null>(null);

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
    const q = oppSearch.toLowerCase().trim();
    const candidates = allTeams.filter(t => t !== teamName);
    if (!q) return candidates;
    // Prefix matches first, then substring — show all matches, no cap
    const prefix: string[] = [];
    const contains: string[] = [];
    for (const t of candidates) {
      const lower = t.toLowerCase();
      if (lower.startsWith(q)) prefix.push(t);
      else if (lower.includes(q)) contains.push(t);
    }
    return [...prefix, ...contains];
  }, [allTeams, oppSearch, teamName]);

  // ─── Derived insights ───
  const gfPerGame = stats.matchesPlayed > 0 ? stats.goalsFor / stats.matchesPlayed : 0;
  const gaPerGame = stats.matchesPlayed > 0 ? stats.goalsAgainst / stats.matchesPlayed : 0;
  const scoredCount = teamViews.filter(v => v.goalsFor > 0).length;
  const scoredPct = stats.matchesPlayed > 0 ? (scoredCount / stats.matchesPlayed) * 100 : 0;
  const twoOrMoreCount = teamViews.filter(v => v.goalsFor >= 2).length;
  const twoOrMorePct = stats.matchesPlayed > 0 ? (twoOrMoreCount / stats.matchesPlayed) * 100 : 0;
  const concededCount = teamViews.filter(v => v.goalsAgainst > 0).length;
  const concededPct = stats.matchesPlayed > 0 ? (concededCount / stats.matchesPlayed) * 100 : 0;
  const over35Count = teamViews.filter(v => v.goalsFor + v.goalsAgainst > 3).length;
  const over35Pct = stats.matchesPlayed > 0 ? (over35Count / stats.matchesPlayed) * 100 : 0;
  const over45Count = teamViews.filter(v => v.goalsFor + v.goalsAgainst > 4).length;
  const over45Pct = stats.matchesPlayed > 0 ? (over45Count / stats.matchesPlayed) * 100 : 0;
  const totalCornersAvg = stats.avgCornersFor + stats.avgCornersAgainst;
  const totalCardsAvg = stats.avgYellowCards + stats.avgRedCards * 2;
  const totalSotAvg = stats.avgShotsOnTargetFor + stats.avgShotsOnTargetAgainst;

  if (stats.matchesPlayed === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">No match data for {teamName}</p>
        <button onClick={onBack} className="mt-3 text-sm text-primary font-medium hover:underline">← Back</button>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4 pb-24 max-w-lg mx-auto">
      {/* Back + Filter */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <TeamSwitcher currentTeam={teamName} allTeams={allTeams} onSelect={onSwitchTeam} />
        </div>
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

      {/* ─── Hero Banner ─── */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.06] p-4 shadow-lg relative overflow-hidden">
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-md text-[9px] font-bold bg-primary text-primary-foreground tracking-wider">PRO</div>
        <div className="flex items-start gap-3">
          <TeamLogo teamName={teamName} size="lg" />
          <div className="flex-1 min-w-0 pr-12">
            <h2 className="text-xl font-bold leading-tight truncate">{teamName}</h2>
            <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">
              {teamMatches[0]?.league_name || "League"} · {stats.matchesPlayed} matches
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div className="flex gap-1 flex-wrap">
              {stats.formLast5.map((r, i) => <FormBadge key={i} result={r} />)}
            </div>
            {allTeamViews.length > 5 && (
              <button
                onClick={() => setShowAllResults((v) => !v)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md transition-all",
                  showAllResults ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {showAllResults ? <ChevronLeft className="w-3 h-3 rotate-90" /> : <ChevronRight className="w-3 h-3 rotate-90" />}
                {showAllResults ? "Less" : "More"}
              </button>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <span className="font-mono text-2xl font-bold text-primary leading-none">{winRate}%</span>
            <p className="text-[10px] text-muted-foreground font-medium mt-1">Win Rate</p>
          </div>
        </div>
        <button
          onClick={() => setShowPredict(true)}
          disabled={!unlocked}
          className={cn(
            "mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all",
            unlocked
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {unlocked ? <Sparkles className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          {unlocked ? "Generate Prediction" : "Unlock Pro to Predict"}
        </button>
        {showAllResults && allTeamViews.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5 max-h-56 overflow-y-auto">
            {allTeamViews.slice(-20).reverse().map((v, i) => {
              const dateStr = new Date(v.match.match_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <FormBadge result={v.result} />
                  <span className="text-muted-foreground font-mono w-14 flex-shrink-0">{dateStr}</span>
                  <span className="font-medium truncate flex-1">
                    <span className="text-muted-foreground text-[9px] mr-1">{v.isHome ? "vs" : "@"}</span>
                    {v.opponent}
                  </span>
                  <span className="font-mono font-bold flex-shrink-0">{v.goalsFor}-{v.goalsAgainst}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Win Probability ─── */}
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

      {/* ─── Opponent Selector ─── */}
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
            <span className="text-sm font-semibold truncate">{nextOpponentName}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No upcoming fixture found</p>
        )}
        <div className="mt-2 relative">
          <div className="relative">
            <input
              type="text"
              placeholder="Change opponent…"
              value={oppSearch}
              onChange={(e) => setOppSearch(e.target.value)}
              className="w-full h-8 px-3 pr-7 text-xs rounded-lg border border-border bg-muted/50 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
            {oppSearch && (
              <button
                onClick={() => setOppSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {oppSearch.trim() && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
              {oppSearchFiltered.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-muted-foreground text-center">No teams found</p>
              ) : (
                oppSearchFiltered.slice(0, 30).map(t => (
                  <button
                    key={t}
                    onClick={() => { setManualOpponent(t); setOppSearch(""); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 border-b border-border last:border-b-0"
                  >
                    <TeamLogo teamName={t} size="xs" />{t}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Record + Mentality ─── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-3 opacity-0 animate-fade-up" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Record</span>
            <TrendingUp className="w-3.5 h-3.5 text-stat-positive" />
          </div>
          <div className="font-mono text-2xl font-bold text-stat-positive leading-none tracking-tight">
            {stats.wins}<span className="text-muted-foreground mx-1 font-normal">·</span>{stats.draws}<span className="text-muted-foreground mx-1 font-normal">·</span>{stats.losses}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 font-medium">
            {stats.goalsFor} GF · {stats.goalsAgainst} GA · {stats.wins * 3 + stats.draws} pts
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 opacity-0 animate-fade-up" style={{ animationDelay: "150ms" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mentality</span>
            <span className="text-base leading-none">{mentality.emoji}</span>
          </div>
          <div className="font-mono text-sm font-bold text-foreground leading-tight">{mentality.label}</div>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${mentality.intensity}%`,
                background: mentality.intensity > 75 ? 'hsl(var(--stat-negative))' : mentality.intensity > 50 ? 'hsl(var(--stat-warn))' : 'hsl(var(--primary))',
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug line-clamp-2">{mentality.description}</p>
        </div>
      </div>

      {/* ─── Pro Stats Grid ─── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Pro Stats</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ProStatCard label="Goals" value={`${gfPerGame.toFixed(2)}`} icon={<Target className="w-4 h-4" />} trend={gfPerGame > 1.5 ? "positive" : "neutral"} subtitle={`${gaPerGame.toFixed(2)} GA · O2.5 ${stats.over25Percentage.toFixed(0)}%`} delay={200} />
          <ProStatCard label="Corners" value={stats.avgCornersFor.toFixed(1)} icon={<Flag className="w-4 h-4" />} trend="neutral" subtitle={`vs ${stats.avgCornersAgainst.toFixed(1)} · Σ ${totalCornersAvg.toFixed(1)}`} delay={250} />
          <ProStatCard label="Shots" value={stats.avgShotsFor.toFixed(1)} icon={<Crosshair className="w-4 h-4" />} trend="positive" subtitle={`SOT ${stats.avgShotsOnTargetFor.toFixed(1)} · vs ${stats.avgShotsAgainst.toFixed(1)}`} delay={300} />
          <ProStatCard label="Cards" value={stats.avgYellowCards.toFixed(1)} icon={<AlertTriangle className="w-4 h-4" />} trend="warn" subtitle={`🟡 + ${stats.avgRedCards.toFixed(2)} 🔴`} delay={350} />
          <ProStatCard label="Fouls" value={stats.avgFoulsCommitted.toFixed(1)} icon={<Shield className="w-4 h-4" />} trend="negative" subtitle={`Drawn ${stats.avgFoulsDrawn.toFixed(1)}`} delay={400} />
          <ProStatCard label="Clean Sheets" value={`${stats.cleanSheets}/${stats.matchesPlayed}`} icon={<Shield className="w-4 h-4" />} trend="positive" subtitle={`${((stats.cleanSheets / stats.matchesPlayed) * 100).toFixed(0)}% rate`} delay={450} />
          <ProStatCard label="BTTS" value={`${stats.bttsPercentage.toFixed(0)}%`} icon={<BarChart3 className="w-4 h-4" />} trend={stats.bttsPercentage > 60 ? "warn" : "neutral"} subtitle={`O1.5 ${stats.over15Percentage.toFixed(0)}%`} delay={500} />
          <ProStatCard label="SOT Rate" value={`${stats.avgShotsFor > 0 ? ((stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100).toFixed(0) : "0"}%`} icon={<Crosshair className="w-4 h-4" />} trend="positive" subtitle={`Conversion accuracy`} delay={550} />
        </div>
      </div>

      {/* ─── Bet Markets Probability ─── */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/[0.04] p-4 opacity-0 animate-fade-up shadow-md" style={{ animationDelay: "600ms" }}>
        <div className="flex items-center gap-2 mb-3">
          <Percent className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Bet Markets Probability</span>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Goals</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ProbabilityRow label="Over 1.5" pct={stats.over15Percentage} />
              <ProbabilityRow label="Over 2.5" pct={stats.over25Percentage} />
              <ProbabilityRow label="Over 3.5" pct={over35Pct} />
              <ProbabilityRow label="Over 4.5" pct={over45Pct} />
              <ProbabilityRow label="BTTS" pct={stats.bttsPercentage} />
              <ProbabilityRow label="Team Scores" pct={scoredPct} />
            </div>
          </div>
          <div className="pt-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Flag className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Corners (avg {totalCornersAvg.toFixed(1)})</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ProbabilityRow label="Over 8.5" pct={Math.min(95, Math.max(5, (totalCornersAvg / 8.5) * 50))} compact />
              <ProbabilityRow label="Over 9.5" pct={Math.min(95, Math.max(5, (totalCornersAvg / 9.5) * 50))} compact />
              <ProbabilityRow label="Over 10.5" pct={Math.min(95, Math.max(5, (totalCornersAvg / 10.5) * 50))} compact />
            </div>
          </div>
          <div className="pt-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Crosshair className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Shots on Target (avg {totalSotAvg.toFixed(1)})</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ProbabilityRow label="Over 7.5 SOT" pct={Math.min(95, Math.max(5, (totalSotAvg / 7.5) * 50))} />
              <ProbabilityRow label="Over 9.5 SOT" pct={Math.min(95, Math.max(5, (totalSotAvg / 9.5) * 50))} />
            </div>
          </div>
          <div className="pt-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cards (avg {totalCardsAvg.toFixed(1)})</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ProbabilityRow label="Over 3.5 Cards" pct={Math.min(95, Math.max(5, (totalCardsAvg / 3.5) * 50))} />
              <ProbabilityRow label="Over 4.5 Cards" pct={Math.min(95, Math.max(5, (totalCardsAvg / 4.5) * 50))} />
            </div>
          </div>
          <div className="pt-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Shield className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Defensive</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ProbabilityRow label="Clean Sheet" pct={(stats.cleanSheets / stats.matchesPlayed) * 100} />
              <ProbabilityRow label="Concedes" pct={concededPct} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Key Insights ─── */}
      <div className="rounded-2xl border border-border bg-card p-4 opacity-0 animate-fade-up" style={{ animationDelay: "650ms" }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Key Insights</span>
        </div>
        <div className="space-y-2.5 text-xs leading-relaxed">
          <Insight icon={<CheckCircle2 className="w-3.5 h-3.5 text-stat-positive" />} text={<>{teamName} has scored in <span className="font-bold text-primary">{scoredPct.toFixed(0)}%</span> of matches ({scoredCount}/{stats.matchesPlayed})</>} />
          <Insight icon={<CheckCircle2 className="w-3.5 h-3.5 text-stat-positive" />} text={<>Scored 2+ goals in <span className="font-bold text-primary">{twoOrMorePct.toFixed(0)}%</span> of matches ({twoOrMoreCount}/{stats.matchesPlayed})</>} />
          <Insight icon={<Activity className="w-3.5 h-3.5 text-stat-warn" />} text={<>Conceded in <span className="font-bold text-stat-warn">{concededPct.toFixed(0)}%</span> of matches</>} />
          <Insight icon={<Flag className="w-3.5 h-3.5 text-primary" />} text={<>Average <span className="font-bold text-primary">{totalCornersAvg.toFixed(1)}</span> total corners per match</>} />
          <Insight icon={<AlertTriangle className="w-3.5 h-3.5 text-stat-warn" />} text={<>Avg <span className="font-bold text-stat-warn">{stats.avgYellowCards.toFixed(1)}</span> yellows + <span className="font-bold">{stats.avgFoulsCommitted.toFixed(1)}</span> fouls per game</>} />
          <Insight icon={<Trophy className="w-3.5 h-3.5 text-primary" />} text={<>Mentality: <span className="font-bold">{mentality.label}</span> · {mentality.intensity}/100 intensity</>} />
        </div>
      </div>

      {/* ─── Squad Insights ─── */}
      <PlayerInsights teamViews={teamViews} teamName={teamName} />

      {/* ─── Player Leaderboard (Top 5) ─── */}
      <PlayerHighlights teamName={teamName} />

      <MomentumChart views={teamViews} teamName={teamName} />

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

      <PredictionDialog
        open={showPredict}
        onOpenChange={setShowPredict}
        allMatches={allMatches}
      />
    </div>
  );
};

/* ─── Probability Row ─── */
const ProbabilityRow = ({ label, pct, compact }: { label: string; pct: number; compact?: boolean }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const colorClass = clamped >= 65 ? "text-stat-positive" : clamped >= 45 ? "text-primary" : clamped >= 30 ? "text-stat-warn" : "text-muted-foreground";
  const barClass = clamped >= 65 ? "bg-stat-positive" : clamped >= 45 ? "bg-primary" : clamped >= 30 ? "bg-stat-warn" : "bg-muted-foreground/40";
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2">
      <div className="flex items-center justify-between mb-1 gap-1">
        <span className={cn("text-[10px] font-medium text-muted-foreground truncate", compact && "text-[9px]")}>{label}</span>
        <span className={cn("font-mono text-xs font-bold flex-shrink-0", colorClass)}>{clamped.toFixed(0)}%</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700 ease-out", barClass)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
};

/* ─── Insight Row ─── */
const Insight = ({ icon, text }: { icon: React.ReactNode; text: React.ReactNode }) => (
  <div className="flex items-start gap-2">
    <span className="flex-shrink-0 mt-0.5">{icon}</span>
    <span className="text-foreground">{text}</span>
  </div>
);

/* ─── Squad Insights (data-driven from team match stats) ─── */
const PlayerInsights = ({ teamViews, teamName }: { teamViews: TeamMatchView[]; teamName: string }) => {
  if (teamViews.length === 0) return null;
  const totalGoals = teamViews.reduce((s, v) => s + v.goalsFor, 0);
  const totalSot = teamViews.reduce((s, v) => s + v.shotsOnTargetFor, 0);
  const totalFouls = teamViews.reduce((s, v) => s + v.foulsCommitted, 0);
  const totalCards = teamViews.reduce((s, v) => s + v.yellowCards + v.redCards, 0);
  const totalCorners = teamViews.reduce((s, v) => s + v.cornersFor, 0);

  const insights = [
    { label: "Goals", value: totalGoals, icon: <Target className="w-3.5 h-3.5" />, color: "text-stat-positive" },
    { label: "SOT", value: totalSot, icon: <Crosshair className="w-3.5 h-3.5" />, color: "text-primary" },
    { label: "Corners", value: totalCorners, icon: <Flag className="w-3.5 h-3.5" />, color: "text-primary" },
    { label: "Fouls", value: totalFouls, icon: <Shield className="w-3.5 h-3.5" />, color: "text-stat-warn" },
    { label: "Cards", value: totalCards, icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-stat-negative" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 opacity-0 animate-fade-up" style={{ animationDelay: "680ms" }}>
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground">Squad Insights</span>
        <span className="ml-auto text-[10px] text-muted-foreground font-medium">{teamViews.length} games</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {insights.map((it) => (
          <div key={it.label} className="rounded-lg bg-muted/40 p-2 text-center min-w-0">
            <span className={cn("inline-flex items-center justify-center", it.color)}>{it.icon}</span>
            <div className={cn("font-mono text-base font-bold mt-1 leading-none", it.color)}>{it.value}</div>
            <p className="text-[9px] text-muted-foreground mt-1 leading-tight truncate">{it.label}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Aggregate squad output across the last {teamViews.length} matches.
      </p>
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
        onSwitchTeam={setSelectedTeam}
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
