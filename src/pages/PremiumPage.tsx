import { useState, useMemo, useCallback } from "react";
import {
  Crown, Lock, Unlock, Target, Flag, AlertTriangle, Shield, TrendingUp,
  Crosshair, Sparkles, ChevronLeft, Search, Star, Loader2, Brain,
  BarChart3, Eye, Zap, X, ChevronRight, Trophy, Users, Activity, Percent,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Minus, Info, Home, Plane,
  Swords, LineChart as LineChartIcon, Gauge,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ResponsiveContainer as RechartsResponsiveContainer,
  ComposedChart as RechartsComposedChart,
  CartesianGrid as RechartsCartesianGrid,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
  Tooltip as RechartsTooltip,
  Area as RechartsArea,
  Line as RechartsLine,
} from "recharts";
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
import { MetricInfoSheet } from "@/components/MetricInfoSheet";
import { AdBanner } from "@/components/AdBanner";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useFavorites } from "@/hooks/useFavorites";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { PREMIUM_UNLOCKED_KEY, isPremiumUnlocked, emitPremiumChanged } from "@/lib/premium";
import { useTeamPlayers } from "@/hooks/useTeamPlayers";
import { useTeamInjuries, classifyInjury, type TeamInjury } from "@/hooks/useTeamInjuries";

type StatPredictionCategory = "corners" | "fouls" | "shots" | "cards" | "goals" | "cleanSheets" | "btts";
type StatKey = "record" | "corners" | "cards" | "fouls" | "shots" | "over25" | "cleanSheets";

type MetricInfoKey =
  | "formIndex" | "attack" | "defense" | "mentality"
  | "xgFor" | "xgAgainst" | "xgDiff" | "goalsVsXg"
  | "betMarkets" | "homeAway" | "vsStrength";

const METRIC_INFO: Record<MetricInfoKey, { title: string; description: string; tip: string }> = {
  formIndex: {
    title: "Form Index",
    description: "A 0–100 score that summarizes the team's last 5 results. Recent matches carry more weight than older ones, so a strong win this weekend matters more than a draw a month ago.",
    tip: "Above 70 = hot streak, below 35 = cold spell. Pair with the trend arrow on the Trends tab to see if form is climbing or fading.",
  },
  attack: {
    title: "Attack Rating",
    description: "A 0–100 composite of goals per match, shots on target and expected goals (xG). It captures how dangerous the team is going forward.",
    tip: "Compare to the opponent's Defense Rating. A 20-point edge is a meaningful mismatch worth backing.",
  },
  defense: {
    title: "Defense Rating",
    description: "A 0–100 composite of goals conceded, clean sheet rate and xG against. Higher means a more solid defense.",
    tip: "Teams with Defense ≥ 65 are strong clean-sheet candidates, especially at home or vs. lower-ranked sides.",
  },
  mentality: {
    title: "Mentality",
    description: "Reads the team's psychological profile from recent results. Confidence, fragility and consistency are all factored in.",
    tip: "A confident team is a great backing pick; a fragile one is a strong fade in tight matches.",
  },
  xgFor: {
    title: "Expected Goals (xG) For",
    description: "Average chance quality the team creates per match. xG converts every shot into a probability of scoring (e.g. a tap-in ~0.7, a long shot ~0.04).",
    tip: "Above 1.6 per match = elite attack. Below 1.0 = chance creation issue.",
  },
  xgAgainst: {
    title: "Expected Goals (xG) Against",
    description: "Average chance quality conceded per match. Lower is better — it means opponents rarely get good looks.",
    tip: "Below 1.0 is excellent defending; above 1.6 means the back line is leaking high-quality chances.",
  },
  xgDiff: {
    title: "xG Differential",
    description: "xG For minus xG Against. Positive numbers mean the team creates better chances than it concedes.",
    tip: "Sustained positive xG diff is the single best long-term predictor of league position.",
  },
  goalsVsXg: {
    title: "Goals vs xG",
    description: "Difference between actual goals scored and expected goals. Positive = clinical finishing; negative = wasteful.",
    tip: "Big swings in either direction tend to regress to the mean — fade overperformers, back underperformers.",
  },
  betMarkets: {
    title: "Bet Markets Probability",
    description: "Empirical hit rates for popular markets, derived from how often each outcome occurred in the team's recent matches.",
    tip: "Treat anything above 60% as a solid base for a bet builder leg, but always cross-check with the opponent's own profile.",
  },
  homeAway: {
    title: "Home vs Away Splits",
    description: "Performance broken down by venue. Some teams are fortresses at home but struggle on the road (or vice versa).",
    tip: "If home/away splits differ by 25%+, weight your prediction toward the venue of the next fixture.",
  },
  vsStrength: {
    title: "Performance vs Strength",
    description: "Results split by opponent quality. Top-tier opponents (≥55% league win rate) vs lower-tier opponents.",
    tip: "Watch for 'flat-track bullies' — teams that crush weak sides but disappear vs the top half.",
  },
};

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
  const [openMetric, setOpenMetric] = useState<MetricInfoKey | null>(null);

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

  const nextFixture = useMemo(() => {
    if (fixtures.length === 0) return null;
    const today = new Date().toISOString().split("T")[0];
    return fixtures.find((f) => f.match_date >= today) ?? null;
  }, [fixtures]);

  const nextOpponentName = useMemo(() => {
    if (!nextFixture) return undefined;
    return nextFixture.home_team === teamName ? nextFixture.away_team : nextFixture.home_team;
  }, [nextFixture, teamName]);

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

  // ─── Predictive Analytics ───
  const homeViews = allTeamViews.filter(v => v.isHome).slice(-pastN);
  const awayViews = allTeamViews.filter(v => !v.isHome).slice(-pastN);
  const homeStats = aggregateStats(homeViews);
  const awayStats = aggregateStats(awayViews);

  // xG proxy: blend goals + SOT conversion (≈0.31 league-wide)
  const xgFor = (0.6 * gfPerGame) + (0.4 * stats.avgShotsOnTargetFor * 0.31);
  const xgAgainst = (0.6 * gaPerGame) + (0.4 * stats.avgShotsOnTargetAgainst * 0.31);
  const xgDiff = xgFor - xgAgainst;

  // Form Index: weighted last 5 (most recent weighted heaviest)
  const last5 = teamViews.slice(-5);
  let weightedPts = 0, weightSum = 0;
  last5.forEach((v, i) => {
    const w = i + 1;
    const pts = v.result === "W" ? 3 : v.result === "D" ? 1 : 0;
    weightedPts += pts * w;
    weightSum += 3 * w;
  });
  const formIndex = weightSum > 0 ? Math.round((weightedPts / weightSum) * 100) : 0;

  // Attack & Defense ratings (0-100)
  const attackRating = Math.min(100, Math.round(
    (gfPerGame / 3) * 50 +
    (stats.avgShotsOnTargetFor / 7) * 30 +
    (xgFor / 2.5) * 20
  ));
  const defenseRating = Math.min(100, Math.round(
    Math.max(0, (1 - gaPerGame / 2.5)) * 50 +
    (stats.cleanSheets / Math.max(1, stats.matchesPlayed)) * 30 +
    Math.max(0, (1 - xgAgainst / 2.5)) * 20
  ));

  // Confidence (0-100)
  const sampleScore = Math.min(40, stats.matchesPlayed * 2);
  const consistencyScore = Math.min(30, Math.abs(parseFloat(winRate) - 50) * 0.6);
  const qualityScore = Math.min(30, Math.abs(xgDiff) * 30);
  const confidence = Math.round(sampleScore + consistencyScore + qualityScore);

  // Match prediction (Dixon-Coles) when an opponent exists
  let prediction: PredictionResult | null = null;
  if (opponentStats && nextOpponentName) {
    const leagueAvg = computeLeagueAvgGoals(allMatches as any);
    const homeIsTeam = nextFixture ? nextFixture.home_team === teamName : true;
    const teamInput: TeamInput = {
      goalsScored: stats.goalsFor,
      goalsConceded: stats.goalsAgainst,
      matchesPlayed: stats.matchesPlayed,
      recentGoalsScored: last5.reduce((s, v) => s + v.goalsFor, 0),
      recentGoalsConceded: last5.reduce((s, v) => s + v.goalsAgainst, 0),
      recentMatches: last5.length,
    };
    const oppInput: TeamInput = {
      goalsScored: opponentStats.goalsFor,
      goalsConceded: opponentStats.goalsAgainst,
      matchesPlayed: opponentStats.matchesPlayed,
    };
    prediction = homeIsTeam
      ? predictMatch(teamInput, oppInput, leagueAvg)
      : predictMatch(oppInput, teamInput, leagueAvg);
  }
  const teamWinPct = prediction
    ? (nextFixture && nextFixture.home_team === teamName ? prediction.homeWin : prediction.awayWin)
    : null;
  const oppWinPct = prediction
    ? (nextFixture && nextFixture.home_team === teamName ? prediction.awayWin : prediction.homeWin)
    : null;
  const drawPct = prediction?.draw ?? null;

  // Performance vs Top vs Bottom teams (using opponent winrate)
  const opponentStrength = new Map<string, { wins: number; played: number }>();
  for (const m of allMatches as any[]) {
    const h = normalizeTeamName(m.home_team);
    const a = normalizeTeamName(m.away_team);
    const hr = m.ft_home_goals > m.ft_away_goals ? "h" : m.ft_home_goals < m.ft_away_goals ? "a" : "d";
    const upd = (k: string, w: boolean) => {
      const cur = opponentStrength.get(k) ?? { wins: 0, played: 0 };
      cur.played++;
      if (w) cur.wins++;
      opponentStrength.set(k, cur);
    };
    upd(h, hr === "h");
    upd(a, hr === "a");
  }
  const topOpps: TeamMatchView[] = [];
  const botOpps: TeamMatchView[] = [];
  for (const v of teamViews) {
    const opp = opponentStrength.get(normalizeTeamName(v.opponent));
    const wr = opp && opp.played > 0 ? opp.wins / opp.played : 0.4;
    (wr >= 0.55 ? topOpps : botOpps).push(v);
  }
  const splitTop = aggregateStats(topOpps);
  const splitBot = aggregateStats(botOpps);

  // H2H last meetings
  const h2hViews = nextOpponentName
    ? allTeamViews.filter(v => normalizeTeamName(v.opponent) === normalizeTeamName(nextOpponentName)).slice(-6).reverse()
    : [];

  // Trend data
  const trendData = teamViews.map((v, i) => {
    const sotXG = v.shotsOnTargetFor * 0.31;
    const xg = 0.6 * v.goalsFor + 0.4 * sotXG;
    return { idx: i + 1, goals: v.goalsFor, conceded: v.goalsAgainst, xg: Number(xg.toFixed(2)), result: v.result };
  });

  // Trend direction
  let trendDir: "up" | "down" | "stable" = "stable";
  let trendDelta = 0;
  if (teamViews.length >= 6) {
    const mid = Math.floor(teamViews.length / 2);
    const ptsAvg = (arr: TeamMatchView[]) => arr.reduce((s, v) => s + (v.result === "W" ? 3 : v.result === "D" ? 1 : 0), 0) / Math.max(1, arr.length);
    trendDelta = ptsAvg(teamViews.slice(mid)) - ptsAvg(teamViews.slice(0, mid));
    trendDir = trendDelta > 0.3 ? "up" : trendDelta < -0.3 ? "down" : "stable";
  }

  // Smart Insights
  const smartInsights: { tone: "pos" | "neg" | "info"; text: string }[] = [];
  if (xgDiff > 0.6) smartInsights.push({ tone: "pos", text: `Outperforming opponents by ${xgDiff.toFixed(2)} xG/match — sustained quality, not luck.` });
  else if (xgDiff < -0.4) smartInsights.push({ tone: "neg", text: `Underwater by ${Math.abs(xgDiff).toFixed(2)} xG/match — chance creation lags concession.` });
  if (formIndex >= 70) smartInsights.push({ tone: "pos", text: `Form Index ${formIndex}/100 — peak rhythm in recent matches.` });
  else if (formIndex <= 30) smartInsights.push({ tone: "neg", text: `Form Index ${formIndex}/100 — recent results trending poorly.` });
  if (homeStats.matchesPlayed >= 3 && awayStats.matchesPlayed >= 3) {
    const hpts = (homeStats.wins * 3 + homeStats.draws) / homeStats.matchesPlayed;
    const apts = (awayStats.wins * 3 + awayStats.draws) / awayStats.matchesPlayed;
    if (hpts - apts > 0.7) smartInsights.push({ tone: "info", text: `Strong home bias: ${hpts.toFixed(1)} pts/home vs ${apts.toFixed(1)} pts/away.` });
    else if (apts - hpts > 0.5) smartInsights.push({ tone: "info", text: `Travels well: ${apts.toFixed(1)} pts/away vs ${hpts.toFixed(1)} pts/home.` });
  }
  if (splitTop.matchesPlayed >= 3 && splitBot.matchesPlayed >= 3) {
    if (splitTop.winProbability > 50) smartInsights.push({ tone: "pos", text: `Beats top sides ${splitTop.winProbability.toFixed(0)}% — credible vs quality opposition.` });
    else if (splitBot.winProbability < 40) smartInsights.push({ tone: "neg", text: `Only ${splitBot.winProbability.toFixed(0)}% win rate vs lower teams — drops easy points.` });
  }
  if (trendDir === "up") smartInsights.push({ tone: "pos", text: `Trending up: +${trendDelta.toFixed(2)} pts/match in the second half of sample.` });
  if (trendDir === "down") smartInsights.push({ tone: "neg", text: `Trending down: ${trendDelta.toFixed(2)} pts/match drop in recent matches.` });
  if (prediction && teamWinPct != null && oppWinPct != null) {
    const head = teamWinPct >= 50 ? `Model favors ${teamName} (${teamWinPct.toFixed(0)}%)` : `Model favors ${nextOpponentName} (${oppWinPct.toFixed(0)}%)`;
    smartInsights.push({ tone: "info", text: `${head} for the next match. Confidence ${confidence}/100.` });
  }

  // Key prediction factors
  const predictionFactors: { label: string; value: string; tone: "pos" | "neg" | "info"; weight: number }[] = [
    { label: "Recent Form", value: `${formIndex}/100`, tone: formIndex >= 60 ? "pos" : formIndex <= 35 ? "neg" : "info", weight: formIndex },
    { label: "Attack Strength", value: `${attackRating}/100`, tone: attackRating >= 65 ? "pos" : attackRating <= 35 ? "neg" : "info", weight: attackRating },
    { label: "Defense Strength", value: `${defenseRating}/100`, tone: defenseRating >= 65 ? "pos" : defenseRating <= 35 ? "neg" : "info", weight: defenseRating },
    { label: "xG Differential", value: `${xgDiff >= 0 ? "+" : ""}${xgDiff.toFixed(2)}`, tone: xgDiff > 0.3 ? "pos" : xgDiff < -0.3 ? "neg" : "info", weight: Math.min(100, Math.max(0, 50 + xgDiff * 30)) },
  ];
  if (opponentStats) {
    const matchupQuality = xgFor - (opponentStats.goalsAgainst / opponentStats.matchesPlayed);
    predictionFactors.push({
      label: "Opp. Defense Weakness",
      value: matchupQuality > 0.3 ? "Exploitable" : matchupQuality < -0.2 ? "Solid" : "Average",
      tone: matchupQuality > 0.3 ? "pos" : matchupQuality < -0.2 ? "neg" : "info",
      weight: Math.min(100, Math.max(0, 50 + matchupQuality * 40)),
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
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

      {/* Hero */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.06] p-4 shadow-lg relative overflow-hidden">
        <div className="flex items-start gap-3">
          <TeamLogo teamName={teamName} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl font-bold leading-tight truncate">{teamName}</h2>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary text-primary-foreground tracking-wider flex-shrink-0">PRO</span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">
              {teamMatches[0]?.league_name || "League"} · {stats.matchesPlayed} matches
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="font-mono text-2xl font-bold text-primary leading-none">{winRate}%</span>
            <p className="text-[10px] text-muted-foreground font-medium mt-1">Win Rate</p>
          </div>
        </div>
        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <ProFormStrip views={allTeamViews} formLast5={stats.formLast5} />
          </div>
          <button
            onClick={() => setShowPredict(true)}
            disabled={!unlocked}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex-shrink-0",
              unlocked
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {unlocked ? <Sparkles className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            Predict
          </button>
        </div>
      </section>

      {/* Tabbed Predictive Dashboard */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-9 bg-muted/60 rounded-xl">
          <TabsTrigger value="overview" className="text-[11px] font-semibold rounded-lg">Overview</TabsTrigger>
          <TabsTrigger value="advanced" className="text-[11px] font-semibold rounded-lg">Advanced</TabsTrigger>
          <TabsTrigger value="trends" className="text-[11px] font-semibold rounded-lg">Trends</TabsTrigger>
          <TabsTrigger value="matchup" className="text-[11px] font-semibold rounded-lg">Matchup</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <MatchPredictionCard
            teamName={teamName}
            opponentName={nextOpponentName}
            teamWinPct={teamWinPct}
            drawPct={drawPct}
            oppWinPct={oppWinPct}
            confidence={confidence}
            factors={predictionFactors}
            isHomeNext={nextFixture ? nextFixture.home_team === teamName : null}
          />

          <SmartInsightsCard insights={smartInsights} />

          <div className="grid grid-cols-3 gap-2">
            <RatingCard label="Form Index" value={formIndex} icon={<Activity className="w-3.5 h-3.5" />} tooltip="Weighted points in last 5 matches (0–100). More recent results count more." />
            <RatingCard label="Attack" value={attackRating} icon={<Target className="w-3.5 h-3.5" />} tooltip="Composite of goals/match, shots on target, and xG (0–100)." />
            <RatingCard label="Defense" value={defenseRating} icon={<Shield className="w-3.5 h-3.5" />} tooltip="Composite of goals conceded, clean sheet rate, and xG against (0–100)." />
          </div>

          <div className="rounded-2xl border border-border bg-card p-3">
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
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{mentality.description}</p>
          </div>

          {nextFixture && (
            <MatchVote
              homeTeam={nextFixture.home_team}
              awayTeam={nextFixture.away_team}
              matchDate={nextFixture.match_date}
            />
          )}
        </TabsContent>

        {/* ADVANCED */}
        <TabsContent value="advanced" className="space-y-4 mt-4">
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/[0.04] p-4 shadow-md">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Expected Goals (xG)</span>
              <MetricTooltip text="Expected Goals: data-driven proxy for chance quality based on shots on target conversion blended with actual goals." />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <XgTile label="xG For" value={xgFor.toFixed(2)} sub="per match" tone="pos" />
              <XgTile label="xG Against" value={xgAgainst.toFixed(2)} sub="per match" tone="neg" />
              <XgTile label="xG Diff" value={`${xgDiff >= 0 ? "+" : ""}${xgDiff.toFixed(2)}`} sub={xgDiff >= 0 ? "outperforming" : "underwater"} tone={xgDiff >= 0 ? "pos" : "neg"} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <XgTile label="Goals / Match" value={gfPerGame.toFixed(2)} sub="actual" tone="info" small />
              <XgTile label="Goals vs xG" value={`${(gfPerGame - xgFor) >= 0 ? "+" : ""}${(gfPerGame - xgFor).toFixed(2)}`} sub={(gfPerGame - xgFor) >= 0 ? "clinical" : "wasteful"} tone={(gfPerGame - xgFor) >= 0 ? "pos" : "neg"} small />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Pro Stats</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ProStatCard label="Goals" value={`${gfPerGame.toFixed(2)}`} icon={<Target className="w-4 h-4" />} trend={gfPerGame > 1.5 ? "positive" : "neutral"} subtitle={`${gaPerGame.toFixed(2)} GA · O2.5 ${stats.over25Percentage.toFixed(0)}%`} delay={200} onClick={() => setOpenStat("over25")} />
              <ProStatCard label="Corners" value={stats.avgCornersFor.toFixed(1)} icon={<Flag className="w-4 h-4" />} trend="neutral" subtitle={`vs ${stats.avgCornersAgainst.toFixed(1)} · Σ ${totalCornersAvg.toFixed(1)}`} delay={250} onClick={() => setOpenStat("corners")} />
              <ProStatCard label="Shots" value={stats.avgShotsFor.toFixed(1)} icon={<Crosshair className="w-4 h-4" />} trend="positive" subtitle={`SOT ${stats.avgShotsOnTargetFor.toFixed(1)} · vs ${stats.avgShotsAgainst.toFixed(1)}`} delay={300} onClick={() => setOpenStat("shots")} />
              <ProStatCard label="Cards" value={stats.avgYellowCards.toFixed(1)} icon={<AlertTriangle className="w-4 h-4" />} trend="warn" subtitle={`🟡 + ${stats.avgRedCards.toFixed(2)} 🔴`} delay={350} onClick={() => setOpenStat("cards")} />
              <ProStatCard label="Fouls" value={stats.avgFoulsCommitted.toFixed(1)} icon={<Shield className="w-4 h-4" />} trend="negative" subtitle={`Drawn ${stats.avgFoulsDrawn.toFixed(1)}`} delay={400} onClick={() => setOpenStat("fouls")} />
              <ProStatCard label="Clean Sheets" value={`${stats.cleanSheets}/${stats.matchesPlayed}`} icon={<Shield className="w-4 h-4" />} trend="positive" subtitle={`${((stats.cleanSheets / stats.matchesPlayed) * 100).toFixed(0)}% rate`} delay={450} onClick={() => setOpenStat("cleanSheets")} />
              <ProStatCard label="BTTS" value={`${stats.bttsPercentage.toFixed(0)}%`} icon={<BarChart3 className="w-4 h-4" />} trend={stats.bttsPercentage > 60 ? "warn" : "neutral"} subtitle={`O1.5 ${stats.over15Percentage.toFixed(0)}%`} delay={500} onClick={() => setOpenStat("over25")} />
              <ProStatCard label="Record" value={`${stats.wins}-${stats.draws}-${stats.losses}`} icon={<TrendingUp className="w-4 h-4" />} trend="positive" subtitle={`${stats.goalsFor} GF · ${stats.goalsAgainst} GA`} delay={550} onClick={() => setOpenStat("record")} />
            </div>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/[0.04] p-4 shadow-md">
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

          <PlayerInsights teamViews={teamViews} teamName={teamName} />
          <PlayerHighlights teamName={teamName} />
        </TabsContent>

        {/* TRENDS */}
        <TabsContent value="trends" className="space-y-4 mt-4">
          <TrendDirectionCard direction={trendDir} delta={trendDelta} formIndex={formIndex} />
          <TrendChart data={trendData} title="Goals & xG over time" />
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
            onOpponentSelect={() => {}}
          />
        </TabsContent>

        {/* MATCHUP */}
        <TabsContent value="matchup" className="space-y-4 mt-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Home className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">Home vs Away</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SplitTile label="Home" icon={<Home className="w-3.5 h-3.5" />} stats={homeStats} />
              <SplitTile label="Away" icon={<Plane className="w-3.5 h-3.5" />} stats={awayStats} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">Performance vs Strength</span>
              <MetricTooltip text="Opponents split by their league win-rate. ≥55% = top, <55% = lower." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SplitTile label="vs Top Teams" icon={<ArrowUpRight className="w-3.5 h-3.5" />} stats={splitTop} />
              <SplitTile label="vs Lower Teams" icon={<ArrowDownRight className="w-3.5 h-3.5" />} stats={splitBot} />
            </div>
          </div>

          {nextOpponentName && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Swords className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">Head-to-Head · vs {nextOpponentName}</span>
              </div>
              {h2hViews.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recent meetings on record.</p>
              ) : (
                <div className="space-y-1.5">
                  {h2hViews.map((v, i) => {
                    const dateStr = new Date(v.match.match_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-2 text-[11px]">
                        <FormBadge result={v.result} />
                        <span className="font-mono text-muted-foreground w-16">{dateStr}</span>
                        <span className="flex-1 text-muted-foreground truncate">
                          <span className="text-[9px] mr-1">{v.isHome ? "vs" : "@"}</span>
                          {v.opponent}
                        </span>
                        <span className="font-mono font-bold">{v.goalsFor}-{v.goalsAgainst}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {opponentStats && nextOpponentName && (
            <MatchupComparison
              teamName={teamName}
              oppName={nextOpponentName}
              teamStats={stats}
              oppStats={opponentStats}
              teamXg={xgFor}
              teamXga={xgAgainst}
              teamAttack={attackRating}
              teamDefense={defenseRating}
            />
          )}
        </TabsContent>
      </Tabs>

      <AdBanner variant="inline" />

      <PredictionDialog
        open={showPredict}
        onOpenChange={setShowPredict}
        allMatches={allMatches}
      />

      {openStat && (
        <StatCardDetail statKey={openStat} views={teamViews} onClose={() => setOpenStat(null)} />
      )}
    </div>
    </TooltipProvider>
  );
};

/* ─── Predictive analytics sub-components ─── */

const MetricTooltip = ({ text }: { text: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button type="button" className="text-muted-foreground/70 hover:text-primary transition-colors">
        <Info className="w-3 h-3" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-snug">{text}</TooltipContent>
  </Tooltip>
);

const MatchPredictionCard = ({
  teamName, opponentName, teamWinPct, drawPct, oppWinPct, confidence, factors, isHomeNext,
}: {
  teamName: string;
  opponentName?: string;
  teamWinPct: number | null;
  drawPct: number | null;
  oppWinPct: number | null;
  confidence: number;
  factors: { label: string; value: string; tone: "pos" | "neg" | "info"; weight: number }[];
  isHomeNext: boolean | null;
}) => {
  if (teamWinPct == null || oppWinPct == null || drawPct == null || !opponentName) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Match Prediction</span>
        </div>
        <p className="text-xs text-muted-foreground">No upcoming fixture detected — prediction will appear once the next match is scheduled.</p>
      </div>
    );
  }
  const total = teamWinPct + drawPct + oppWinPct;
  const tw = (teamWinPct / total) * 100;
  const dw = (drawPct / total) * 100;
  const aw = (oppWinPct / total) * 100;
  const confTone = confidence >= 70 ? "text-stat-positive" : confidence >= 45 ? "text-primary" : "text-stat-warn";

  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-card to-primary/[0.05] p-4 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-primary uppercase tracking-wider">Match Prediction</span>
        <span className="ml-auto text-[10px] font-mono font-bold text-muted-foreground">
          {isHomeNext ? "HOME" : "AWAY"} vs {opponentName}
        </span>
      </div>

      <div className="mb-1 flex h-7 rounded-lg overflow-hidden border border-border">
        <div className="bg-stat-positive flex items-center justify-center text-[10px] font-bold text-background" style={{ width: `${tw}%` }}>
          {tw >= 12 ? `${teamWinPct.toFixed(0)}%` : ""}
        </div>
        <div className="bg-muted-foreground/40 flex items-center justify-center text-[10px] font-bold text-background" style={{ width: `${dw}%` }}>
          {dw >= 12 ? `${drawPct.toFixed(0)}%` : ""}
        </div>
        <div className="bg-stat-negative flex items-center justify-center text-[10px] font-bold text-background" style={{ width: `${aw}%` }}>
          {aw >= 12 ? `${oppWinPct.toFixed(0)}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-muted-foreground mb-3">
        <span className="truncate max-w-[35%]">{teamName} Win</span>
        <span>Draw</span>
        <span className="truncate max-w-[35%] text-right">{opponentName} Win</span>
      </div>

      <div className="rounded-xl border border-border bg-background/50 p-2.5 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Confidence</span>
            <MetricTooltip text="Confidence (0–100): blends sample size, recent form consistency, and the strength of the xG signal." />
          </div>
          <span className={cn("font-mono text-sm font-bold", confTone)}>{confidence}/100</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-700", confidence >= 70 ? "bg-stat-positive" : confidence >= 45 ? "bg-primary" : "bg-stat-warn")} style={{ width: `${confidence}%` }} />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Key Factors</span>
        </div>
        <div className="space-y-1.5">
          {factors.map((f) => (
            <div key={f.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-32 text-muted-foreground truncate">{f.label}</span>
              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full",
                  f.tone === "pos" ? "bg-stat-positive" : f.tone === "neg" ? "bg-stat-negative" : "bg-primary"
                )} style={{ width: `${Math.max(8, Math.min(100, f.weight))}%` }} />
              </div>
              <span className={cn("font-mono font-bold w-16 text-right",
                f.tone === "pos" ? "text-stat-positive" : f.tone === "neg" ? "text-stat-negative" : "text-foreground"
              )}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const SmartInsightsCard = ({ insights }: { insights: { tone: "pos" | "neg" | "info"; text: string }[] }) => {
  if (insights.length === 0) return null;
  const iconFor = (t: "pos" | "neg" | "info") =>
    t === "pos" ? <CheckCircle2 className="w-3.5 h-3.5 text-stat-positive" />
    : t === "neg" ? <AlertTriangle className="w-3.5 h-3.5 text-stat-negative" />
    : <Activity className="w-3.5 h-3.5 text-primary" />;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground">Smart Insights</span>
        <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Auto-generated</span>
      </div>
      <div className="space-y-2 text-xs leading-relaxed">
        {insights.map((it, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">{iconFor(it.tone)}</span>
            <span className="text-foreground">{it.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RatingCard = ({ label, value, icon, tooltip }: { label: string; value: number; icon: React.ReactNode; tooltip: string }) => {
  const tone = value >= 65 ? "text-stat-positive" : value >= 40 ? "text-primary" : "text-stat-warn";
  const bar = value >= 65 ? "bg-stat-positive" : value >= 40 ? "bg-primary" : "bg-stat-warn";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1 text-muted-foreground">
          {icon}
          <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <MetricTooltip text={tooltip} />
      </div>
      <div className={cn("font-mono text-xl font-bold leading-none", tone)}>{value}</div>
      <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", bar)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
};

const XgTile = ({ label, value, sub, tone, small }: { label: string; value: string; sub: string; tone: "pos" | "neg" | "info"; small?: boolean }) => {
  const c = tone === "pos" ? "text-stat-positive" : tone === "neg" ? "text-stat-negative" : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-background/50 p-2.5">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("font-mono font-bold leading-none mt-1", small ? "text-base" : "text-lg", c)}>{value}</p>
      <p className="text-[9px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
};

const SplitTile = ({ label, icon, stats }: { label: string; icon: React.ReactNode; stats: AggregatedStats }) => {
  const wr = stats.matchesPlayed > 0 ? stats.winProbability : 0;
  const ppg = stats.matchesPlayed > 0 ? (stats.wins * 3 + stats.draws) / stats.matchesPlayed : 0;
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono text-base font-bold text-foreground leading-none">
        {stats.wins}-{stats.draws}-{stats.losses}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{stats.matchesPlayed} matches</p>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
        <div>
          <p className="text-muted-foreground">Win %</p>
          <p className="font-mono font-bold text-primary">{wr.toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">PPG</p>
          <p className="font-mono font-bold text-foreground">{ppg.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

const TrendDirectionCard = ({ direction, delta, formIndex }: { direction: "up" | "down" | "stable"; delta: number; formIndex: number }) => {
  const cfg = direction === "up"
    ? { icon: <ArrowUpRight className="w-4 h-4" />, label: "Improving", c: "text-stat-positive", bg: "bg-stat-positive/10 border-stat-positive/30" }
    : direction === "down"
    ? { icon: <ArrowDownRight className="w-4 h-4" />, label: "Declining", c: "text-stat-negative", bg: "bg-stat-negative/10 border-stat-negative/30" }
    : { icon: <Minus className="w-4 h-4" />, label: "Stable", c: "text-primary", bg: "bg-primary/10 border-primary/30" };
  return (
    <div className={cn("rounded-2xl border p-4 flex items-center gap-3", cfg.bg)}>
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", cfg.c)}>{cfg.icon}</div>
      <div className="flex-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Performance Trend</p>
        <p className={cn("text-base font-bold", cfg.c)}>{cfg.label}</p>
        <p className="text-[10px] text-muted-foreground">Δ {delta > 0 ? "+" : ""}{delta.toFixed(2)} pts/match · Form Index {formIndex}/100</p>
      </div>
    </div>
  );
};

const TrendChart = ({ data, title }: { data: { idx: number; goals: number; conceded: number; xg: number; result: string }[]; title: string }) => {
  if (data.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <LineChartIcon className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground">{title}</span>
        <MetricTooltip text="Goals scored vs conceded vs xG per match (oldest → newest)." />
      </div>
      <div className="h-44">
        <RechartsResponsiveContainer width="100%" height="100%">
          <RechartsComposedChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="goalsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--stat-positive))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--stat-positive))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="concGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--stat-negative))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--stat-negative))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <RechartsCartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <RechartsXAxis dataKey="idx" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <RechartsYAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <RechartsTooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            />
            <RechartsArea type="monotone" dataKey="goals" stroke="hsl(var(--stat-positive))" fill="url(#goalsGrad)" strokeWidth={2} name="Goals" />
            <RechartsArea type="monotone" dataKey="conceded" stroke="hsl(var(--stat-negative))" fill="url(#concGrad)" strokeWidth={2} name="Conceded" />
            <RechartsLine type="monotone" dataKey="xg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} strokeDasharray="4 2" name="xG" />
          </RechartsComposedChart>
        </RechartsResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-stat-positive" />Goals</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-stat-negative" />Conceded</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />xG</span>
      </div>
    </div>
  );
};

const MatchupComparison = ({
  teamName, oppName, teamStats, oppStats, teamXg, teamXga, teamAttack, teamDefense,
}: {
  teamName: string; oppName: string;
  teamStats: AggregatedStats; oppStats: AggregatedStats;
  teamXg: number; teamXga: number;
  teamAttack: number; teamDefense: number;
}) => {
  const oppGfPg = oppStats.goalsFor / Math.max(1, oppStats.matchesPlayed);
  const oppGaPg = oppStats.goalsAgainst / Math.max(1, oppStats.matchesPlayed);
  const oppXg = (0.6 * oppGfPg) + (0.4 * oppStats.avgShotsOnTargetFor * 0.31);
  const oppXga = (0.6 * oppGaPg) + (0.4 * oppStats.avgShotsOnTargetAgainst * 0.31);
  const oppAttack = Math.min(100, Math.round(
    (oppGfPg / 3) * 50 + (oppStats.avgShotsOnTargetFor / 7) * 30 + (oppXg / 2.5) * 20
  ));
  const oppDefense = Math.min(100, Math.round(
    Math.max(0, (1 - oppGaPg / 2.5)) * 50 + (oppStats.cleanSheets / Math.max(1, oppStats.matchesPlayed)) * 30 + Math.max(0, (1 - oppXga / 2.5)) * 20
  ));

  const rows: { label: string; a: number; b: number; fmt?: (n: number) => string; higherBetter?: boolean }[] = [
    { label: "Win %", a: teamStats.winProbability, b: oppStats.winProbability, fmt: (n) => `${n.toFixed(0)}%`, higherBetter: true },
    { label: "Goals/Match", a: teamStats.goalsFor / teamStats.matchesPlayed, b: oppGfPg, fmt: (n) => n.toFixed(2), higherBetter: true },
    { label: "Conceded/Match", a: teamStats.goalsAgainst / teamStats.matchesPlayed, b: oppGaPg, fmt: (n) => n.toFixed(2), higherBetter: false },
    { label: "xG", a: teamXg, b: oppXg, fmt: (n) => n.toFixed(2), higherBetter: true },
    { label: "xG Against", a: teamXga, b: oppXga, fmt: (n) => n.toFixed(2), higherBetter: false },
    { label: "Attack Rating", a: teamAttack, b: oppAttack, fmt: (n) => `${n}`, higherBetter: true },
    { label: "Defense Rating", a: teamDefense, b: oppDefense, fmt: (n) => `${n}`, higherBetter: true },
    { label: "Avg Shots", a: teamStats.avgShotsFor, b: oppStats.avgShotsFor, fmt: (n) => n.toFixed(1), higherBetter: true },
    { label: "Avg Corners", a: teamStats.avgCornersFor, b: oppStats.avgCornersFor, fmt: (n) => n.toFixed(1), higherBetter: true },
    { label: "Clean Sheet %", a: (teamStats.cleanSheets / Math.max(1, teamStats.matchesPlayed)) * 100, b: (oppStats.cleanSheets / Math.max(1, oppStats.matchesPlayed)) * 100, fmt: (n) => `${n.toFixed(0)}%`, higherBetter: true },
  ];

  const mismatches = rows
    .map((r) => {
      const gap = Math.abs(r.a - r.b);
      const ref = Math.max(Math.abs(r.a), Math.abs(r.b), 1);
      const winner = r.higherBetter ? (r.a > r.b ? teamName : oppName) : (r.a < r.b ? teamName : oppName);
      return { label: r.label, gap, normGap: gap / ref, winner };
    })
    .sort((x, y) => y.normGap - x.normGap)
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-card to-primary/[0.04] p-4 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-primary uppercase tracking-wider">Matchup Comparison</span>
      </div>

      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-border">
        <div className="flex-1 flex items-center gap-2">
          <TeamLogo teamName={teamName} size="sm" />
          <span className="text-[11px] font-bold truncate">{teamName}</span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground">VS</span>
        <div className="flex-1 flex items-center gap-2 justify-end">
          <span className="text-[11px] font-bold truncate text-right">{oppName}</span>
          <TeamLogo teamName={oppName} size="sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const fmt = r.fmt ?? ((n: number) => n.toFixed(2));
          const aBetter = r.higherBetter ? r.a > r.b : r.a < r.b;
          const bBetter = r.higherBetter ? r.b > r.a : r.b < r.a;
          return (
            <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <span className={cn("font-mono text-[11px] text-right tabular-nums", aBetter ? "font-bold text-stat-positive" : "text-foreground")}>{fmt(r.a)}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider whitespace-nowrap">{r.label}</span>
              <span className={cn("font-mono text-[11px] tabular-nums", bBetter ? "font-bold text-stat-positive" : "text-foreground")}>{fmt(r.b)}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="w-3 h-3 text-stat-warn" />
          <span className="text-[10px] font-bold text-stat-warn uppercase tracking-wider">Key Mismatches</span>
        </div>
        <div className="space-y-1.5">
          {mismatches.map((m) => (
            <div key={m.label} className="flex items-center gap-2 text-[11px]">
              <span className="flex-1 text-muted-foreground truncate">{m.label}</span>
              <span className="font-bold text-primary">{m.winner}</span>
              <span className="font-mono text-[10px] text-muted-foreground">+{(m.normGap * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Pro Form Strip (badges + More toggle, like Stats page) ─── */
const ProFormStrip = ({ views, formLast5 }: { views: TeamMatchView[]; formLast5: ("W" | "D" | "L")[] }) => {
  const [expanded, setExpanded] = useState(false);
  const extendedViews = views.slice().reverse();
  const extendedForm = extendedViews.map((v) => v.result);
  const wins = extendedForm.filter((r) => r === "W").length;
  const draws = extendedForm.filter((r) => r === "D").length;
  const losses = extendedForm.filter((r) => r === "L").length;

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {formLast5.map((r, i) => <FormBadge key={i} result={r} />)}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all",
            expanded ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 rounded-xl border border-border bg-card p-3">
          <div className="flex gap-3 mb-2 text-xs font-semibold">
            <span className="text-stat-positive">{wins}W</span>
            <span className="text-stat-warn">{draws}D</span>
            <span className="text-stat-negative">{losses}L</span>
            <span className="text-muted-foreground ml-auto font-mono text-[10px]">{extendedForm.length} matches</span>
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {extendedViews.map((v, i) => {
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
        </div>
      )}
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

/* ─── Squad Insights — real injury data + per-player impact narratives ───
 * Pulls live injuries/suspensions from API-Football via the
 * `fetch-team-injuries` edge function, matches them against the squad,
 * and explains how each absence affects the next match. */
type PlayerStatus = {
  state: "available" | "doubtful" | "injured" | "suspended" | "returning";
  detail: string;          // "ACL — long-term absence"
  reason: string | null;   // raw reason from API ("Knee Injury")
  impactPct: number;       // -100..+100 net effect on team strength
  impactLabel: string;     // human-readable explanation
  weeksOut: number;
};

/** Normalize a player name for fuzzy matching across providers
 *  ("M. Salah" vs "Mohamed Salah" vs "Mohamed M. Salah" -> "salah") */
function nameKey(name: string): string {
  if (!name) return "";
  // Take last token, strip punctuation & accents, lowercase
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z\s]/g, " ")
    .trim()
    .split(/\s+/);
  if (cleaned.length === 0) return "";
  // Use last name (most distinctive across short/long forms)
  return cleaned[cleaned.length - 1].toLowerCase();
}

function buildStatus(
  injury: TeamInjury | undefined,
  importance: number,
  goals: number,
  assists: number,
  position: string,
): PlayerStatus {
  if (!injury) {
    return {
      state: "available",
      detail: "Match fit · expected to be available",
      reason: null,
      impactPct: 0,
      impactLabel: "No change to projected XI",
      weeksOut: 0,
    };
  }

  const cls = classifyInjury(injury);
  // Scale base impact by player importance (star striker hurts more than 4th-CB).
  // Importance is 0..1 (relative to top contributor on the team).
  const baseImpact = cls.severity * 25; // up to 25 pts for a critical absence
  const scaledImpact = Math.round(baseImpact * (0.4 + importance * 0.6) * (cls.severity < 0 ? -1 : -1));
  // Returning players have negative severity → flip sign so impact becomes positive
  const finalImpact = cls.severity < 0 ? Math.abs(scaledImpact) : scaledImpact;

  // Build a position-aware narrative
  const pos = position.toUpperCase();
  const isAttacker = pos.startsWith("ATT") || pos === "F" || pos === "ST" || pos.includes("W");
  const isMidfielder = pos.startsWith("MID") || pos === "M";
  const isDefender = pos.startsWith("DEF") || pos === "D" || pos === "CB" || pos === "LB" || pos === "RB";
  const isGK = pos.startsWith("GOAL") || pos === "G";

  let impactLabel: string;
  if (cls.state === "returning") {
    impactLabel = "First-team option returns — boosts depth & rotation";
  } else if (finalImpact <= -18) {
    impactLabel = isAttacker
      ? `Major attacking blow — ${goals}G ${assists}A absent from the front line`
      : isMidfielder
      ? "Major midfield loss — control & ball progression weakened"
      : isDefender
      ? "Major defensive blow — backline reshuffle, more chances conceded"
      : isGK
      ? "Goalkeeper change — clean-sheet probability drops"
      : "Major blow — first-choice starter ruled out";
  } else if (finalImpact <= -10) {
    impactLabel = isAttacker
      ? "Meaningful attacking loss — goal output likely to dip"
      : isMidfielder
      ? "Midfield disruption — tempo and creativity affected"
      : isDefender
      ? "Defensive reshuffle — set-piece risk increases"
      : "Meaningful loss — output likely to dip";
  } else if (finalImpact < 0) {
    impactLabel = cls.state === "doubtful"
      ? "Late call — minor disruption if ruled out"
      : "Squad rotation — depth player covers the role";
  } else {
    impactLabel = "No measurable impact on next match";
  }

  return {
    state: cls.state,
    detail: cls.label,
    reason: injury.reason,
    impactPct: finalImpact,
    impactLabel,
    weeksOut: cls.weeksOut,
  };
}

const PlayerInsights = ({ teamViews, teamName }: { teamViews: TeamMatchView[]; teamName: string }) => {
  const { data: realPlayers = [] } = useTeamPlayers(teamName);
  const { data: injuries = [], isLoading: injuriesLoading } = useTeamInjuries(teamName);

  // Index injuries by last-name key for fuzzy match
  const injuryByKey = useMemo(() => {
    const m = new Map<string, TeamInjury>();
    for (const inj of injuries) {
      const k = nameKey(inj.playerName);
      if (k && !m.has(k)) m.set(k, inj);
    }
    return m;
  }, [injuries]);

  type Ranked = { name: string; position: string; goals: number; assists: number; apps: number; importance: number; photo?: string | null; number?: number | null };
  const ranked: Ranked[] = useMemo(() => {
    if (realPlayers.length > 0) {
      const sorted = [...realPlayers].sort((a, b) =>
        (b.goals * 2 + b.assists * 1.5 + (b.appearances || 0) * 0.1) -
        (a.goals * 2 + a.assists * 1.5 + (a.appearances || 0) * 0.1)
      );
      const max = Math.max(1, sorted[0].goals * 2 + sorted[0].assists * 1.5);
      return sorted.slice(0, 24).map((p) => ({
        name: p.name,
        position: p.position || "—",
        goals: p.goals,
        assists: p.assists,
        apps: p.appearances || 0,
        importance: Math.min(1, (p.goals * 2 + p.assists * 1.5) / max),
        photo: p.photo,
        number: p.number,
      }));
    }
    return [];
  }, [realPlayers]);

  if (teamViews.length === 0 && ranked.length === 0) return null;

  const totalGoals = teamViews.reduce((s, v) => s + v.goalsFor, 0);
  const totalSot = teamViews.reduce((s, v) => s + v.shotsOnTargetFor, 0);
  const totalCorners = teamViews.reduce((s, v) => s + v.cornersFor, 0);
  const totalFouls = teamViews.reduce((s, v) => s + v.foulsCommitted, 0);
  const totalCards = teamViews.reduce((s, v) => s + v.yellowCards + v.redCards, 0);

  const aggregates = [
    { label: "Goals", value: totalGoals, icon: <Target className="w-3.5 h-3.5" />, color: "text-stat-positive" },
    { label: "SOT", value: totalSot, icon: <Crosshair className="w-3.5 h-3.5" />, color: "text-primary" },
    { label: "Corners", value: totalCorners, icon: <Flag className="w-3.5 h-3.5" />, color: "text-primary" },
    { label: "Fouls", value: totalFouls, icon: <Shield className="w-3.5 h-3.5" />, color: "text-stat-warn" },
    { label: "Cards", value: totalCards, icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-stat-negative" },
  ];

  // Per-player insights — use real injury data when available
  const playerInsights = ranked.map((p) => {
    const inj = injuryByKey.get(nameKey(p.name));
    const status = buildStatus(inj, p.importance, p.goals, p.assists, p.position);
    const ga = p.goals + p.assists;
    return { ...p, status, ga };
  });

  // Surface unmatched API injuries (e.g. youth/loan players not in our top 24)
  const matchedKeys = new Set(ranked.map((p) => nameKey(p.name)));
  const unmatchedInjuries = injuries.filter((i) => !matchedKeys.has(nameKey(i.playerName)));

  const netImpact = Math.max(-50, Math.min(25,
    playerInsights.reduce((s, p) => s + p.status.impactPct, 0)
  ));
  const netLabel = netImpact <= -25
    ? "Significantly weakened"
    : netImpact <= -12
    ? "Moderately weakened"
    : netImpact < 0
    ? "Slightly affected"
    : netImpact > 0
    ? "Boosted by returning player"
    : "Full strength available";
  const netColor = netImpact <= -12 ? "text-stat-negative" : netImpact < 0 ? "text-stat-warn" : "text-stat-positive";

  const counts = {
    available: playerInsights.filter((p) => p.status.state === "available").length,
    doubtful: playerInsights.filter((p) => p.status.state === "doubtful").length + unmatchedInjuries.filter((i) => (i.type || "").toLowerCase().includes("question")).length,
    injured: playerInsights.filter((p) => p.status.state === "injured").length + unmatchedInjuries.filter((i) => !(i.type || "").toLowerCase().includes("question") && !SUSP_RE.test(i.reason || "")).length,
    suspended: playerInsights.filter((p) => p.status.state === "suspended").length + unmatchedInjuries.filter((i) => SUSP_RE.test(i.reason || "")).length,
    returning: playerInsights.filter((p) => p.status.state === "returning").length,
  };

  // Sort: issues first (most impactful), then top performers
  const sortedInsights = [...playerInsights].sort((a, b) => {
    const aIssue = a.status.state !== "available" ? 1 : 0;
    const bIssue = b.status.state !== "available" ? 1 : 0;
    if (aIssue !== bIssue) return bIssue - aIssue;
    if (aIssue) return a.status.impactPct - b.status.impactPct;
    return b.ga - a.ga;
  });

  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sortedInsights : sortedInsights.slice(0, 6);

  const dataLabel = injuries.length > 0 ? "Live injuries · API-Football" : injuriesLoading ? "Loading injuries…" : "No reported injuries";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 opacity-0 animate-fade-up space-y-4" style={{ animationDelay: "680ms" }}>
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground">Squad Insights</span>
        <span className="ml-auto text-[10px] text-muted-foreground font-medium">
          {ranked.length > 0 ? `${ranked.length} players` : `${teamViews.length} games`}
        </span>
      </div>

      {teamViews.length > 0 && (
        <div className="grid grid-cols-5 gap-1.5">
          {aggregates.map((it) => (
            <div key={it.label} className="rounded-lg bg-muted/40 p-2 text-center min-w-0">
              <span className={cn("inline-flex items-center justify-center", it.color)}>{it.icon}</span>
              <div className={cn("font-mono text-base font-bold mt-1 leading-none", it.color)}>{it.value}</div>
              <p className="text-[9px] text-muted-foreground mt-1 leading-tight truncate">{it.label}</p>
            </div>
          ))}
        </div>
      )}

      {ranked.length > 0 && (
        <>
          <div className="rounded-xl border border-border bg-background/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Availability</span>
              </div>
              <span className={cn("text-[10px] font-bold", netColor)}>
                {netImpact > 0 ? "+" : ""}{netImpact}% · {netLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill color="bg-stat-positive/15 text-stat-positive" label={`${counts.available} fit`} />
              {counts.returning > 0 && <Pill color="bg-primary/15 text-primary" label={`${counts.returning} returning`} />}
              {counts.doubtful > 0 && <Pill color="bg-stat-warn/15 text-stat-warn" label={`${counts.doubtful} doubtful`} />}
              {counts.injured > 0 && <Pill color="bg-stat-negative/15 text-stat-negative" label={`${counts.injured} injured`} />}
              {counts.suspended > 0 && <Pill color="bg-stat-negative/15 text-stat-negative" label={`${counts.suspended} suspended`} />}
            </div>
            <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider pt-0.5">{dataLabel}</p>
          </div>

          <div className="space-y-1.5">
            {visible.map((p) => (
              <PlayerInsightRow key={p.name} player={p} />
            ))}
          </div>

          {/* Surface injuries to players not in our top-24 list (squad depth players) */}
          {unmatchedInjuries.length > 0 && expanded && (
            <div className="space-y-1.5 pt-1 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Other absentees</p>
              {unmatchedInjuries.slice(0, 8).map((inj) => {
                const cls = classifyInjury(inj);
                return (
                  <div key={`${inj.playerName}-${inj.fixtureDate}`} className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-background/30 p-2">
                    <span className={cn(
                      "mt-1.5 w-2 h-2 rounded-full flex-shrink-0",
                      cls.state === "suspended" || cls.state === "injured" ? "bg-stat-negative" :
                      cls.state === "doubtful" ? "bg-stat-warn" : "bg-primary"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{inj.playerName}</p>
                      <p className="text-[10px] text-muted-foreground">{cls.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(sortedInsights.length > 6 || unmatchedInjuries.length > 0) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-[10px] font-semibold text-primary hover:underline pt-1"
            >
              {expanded ? "Show less" : `Show all${unmatchedInjuries.length ? ` + ${unmatchedInjuries.length} other absentees` : ` ${sortedInsights.length} players`}`}
            </button>
          )}

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Live injury data from API-Football, mapped to projected impact on the next match.
            Cached for 12h — verify with official team news close to kickoff.
          </p>
        </>
      )}
    </div>
  );
};

const SUSP_RE = /suspend|red card|yellow|ban/i;

const Pill = ({ label, color }: { label: string; color: string }) => (
  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", color)}>{label}</span>
);

const PlayerInsightRow = ({ player }: { player: {
  name: string; position: string; goals: number; assists: number; apps: number;
  status: PlayerStatus; ga: number; number?: number | null;
} }) => {
  const { status } = player;
  const dot =
    status.state === "available" ? "bg-stat-positive" :
    status.state === "returning" ? "bg-primary" :
    status.state === "doubtful" ? "bg-stat-warn" :
    "bg-stat-negative";

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/40 p-2.5">
      <span className={cn("mt-1.5 w-2 h-2 rounded-full flex-shrink-0", dot)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className="text-xs font-bold text-foreground truncate">{player.name}</span>
          {typeof player.number === "number" && (
            <span className="font-mono text-[9px] text-muted-foreground">#{player.number}</span>
          )}
          <span className="text-[9px] font-mono text-muted-foreground uppercase">{player.position}</span>
          {status.state !== "available" && status.weeksOut > 0 && (
            <span className="ml-auto text-[9px] font-mono font-semibold text-muted-foreground">
              ~{status.weeksOut}w out
            </span>
          )}
        </div>
        <p className="text-[10.5px] text-muted-foreground leading-snug">
          <span className="text-foreground font-medium">{status.detail}.</span>{" "}
          {status.impactPct !== 0 && (
            <span className={status.impactPct < 0 ? "text-stat-negative font-semibold" : "text-stat-positive font-semibold"}>
              {status.impactPct > 0 ? "+" : ""}{status.impactPct}% team impact ·{" "}
            </span>
          )}
          {status.impactLabel}.
        </p>
        <div className="flex items-center gap-2 mt-1 text-[9.5px] text-muted-foreground font-mono">
          <span><span className="text-foreground font-bold">{player.goals}</span>G</span>
          <span><span className="text-foreground font-bold">{player.assists}</span>A</span>
          <span><span className="text-foreground font-bold">{player.apps}</span> apps</span>
        </div>
      </div>
    </div>
  );
};

/* ─── Locked Tease Preview — mock of Bet Markets Probability ─── */
const ProLockedTease = () => {
  const groups: { title: string; rows: { label: string; pct: number }[] }[] = [
    {
      title: "Goals Markets",
      rows: [
        { label: "Over 1.5", pct: 84 },
        { label: "Over 2.5", pct: 67 },
        { label: "Over 3.5", pct: 41 },
        { label: "BTTS", pct: 58 },
      ],
    },
    {
      title: "Corners Markets",
      rows: [
        { label: "Over 8.5", pct: 72 },
        { label: "Over 9.5", pct: 55 },
        { label: "Over 10.5", pct: 38 },
      ],
    },
    {
      title: "Cards Markets",
      rows: [
        { label: "Over 3.5 Cards", pct: 63 },
        { label: "Over 4.5 Cards", pct: 44 },
      ],
    },
  ];

  const colorFor = (pct: number) =>
    pct >= 65 ? "text-stat-positive" : pct >= 45 ? "text-primary" : pct >= 30 ? "text-stat-warn" : "text-muted-foreground";

  const features: { icon: React.ReactNode; title: string; desc: string }[] = [
    { icon: <Brain className="w-4 h-4" />, title: "Powerful AI Predictions", desc: "Per-stat AI analysis on corners, cards, shots & goals." },
    { icon: <Eye className="w-4 h-4" />, title: "Key Match Insights", desc: "Edges, trends and value angles surfaced automatically." },
    { icon: <Users className="w-4 h-4" />, title: "Squad Info", desc: "Top scorers, assist leaders and player form at a glance." },
    { icon: <Percent className="w-4 h-4" />, title: "Bet Markets Probability", desc: "Live model odds for goals, corners and cards markets." },
    { icon: <Activity className="w-4 h-4" />, title: "Tactical Profile", desc: "Predicted playing style vs the next opponent." },
    { icon: <Trophy className="w-4 h-4" />, title: "Head-to-Head Edge", desc: "Win probability gauge powered by Dixon-Coles." },
  ];

  // Smooth blur via mask: feathered top→bottom (no banding)
  const blurMask =
    "linear-gradient(to bottom, transparent 0%, transparent 18%, rgba(0,0,0,0.25) 32%, rgba(0,0,0,0.6) 48%, rgba(0,0,0,0.9) 65%, #000 80%)";


  return (
    <div className="space-y-5">
      {/* ── Teased Bet Markets section ── */}
      <div className="relative -mx-1">
        <div className="px-1 pointer-events-none select-none" aria-hidden>
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/[0.04] p-4 shadow-md space-y-4">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                Bet Markets Probability
              </span>
              <span className="ml-auto px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold">
                PRO
              </span>
            </div>

            {groups.map((g) => (
              <div key={g.title} className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {g.title}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {g.rows.map((r) => (
                    <div key={r.label} className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] font-medium text-muted-foreground">{r.label}</span>
                        <span className={cn("font-mono-data text-sm font-bold", colorFor(r.pct))}>
                          {r.pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${r.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Smooth blur — feathered mask */}
        <div
          className="pointer-events-none absolute inset-0 backdrop-blur-md"
          style={{ WebkitMaskImage: blurMask, maskImage: blurMask }}
        />
        {/* Smooth fade into background */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background) / 0) 0%, hsl(var(--background) / 0) 30%, hsl(var(--background) / 0.15) 50%, hsl(var(--background) / 0.45) 70%, hsl(var(--background) / 0.8) 88%, hsl(var(--background)) 100%)",
          }}
        />
      </div>

      {/* ── Crisp "What's inside Pro" feature section ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold tracking-tight">What's inside Pro</h2>
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
    emitPremiumChanged();
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

      {/* Tease preview when locked — clear at top, fades into bg at bottom */}
      {!unlocked && <ProLockedTease />}

      {/* Team selector when unlocked */}
      {unlocked && (
        <ProTeamSelector allTeams={allTeams} onSelect={setSelectedTeam} />
      )}

      <AdBanner variant="interstitial" />
    </div>
  );
};

export default PremiumPage;
