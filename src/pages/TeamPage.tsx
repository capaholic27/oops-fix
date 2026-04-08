import { useState, useMemo, useCallback } from "react";
import { useMatches, useTeamMatches, useSyncData, useFixtures, useSyncFixtures } from "@/hooks/useMatches";
import { supabase } from "@/integrations/supabase/client";
import {
  getTeamMatchView,
  aggregateStats,
  getUniqueTeams,
  getUniqueLeagues,
  type TeamMatchView,
} from "@/lib/matchStats";
import { predictMatch, computeLeagueAvgGoals, type PredictionResult, type TeamInput } from "@/lib/dixonColes";
import { StatCard } from "@/components/StatCard";
import { StatCardDetail } from "@/components/StatCardDetail";
import { WinProbabilityGauge } from "@/components/WinProbabilityGauge";
import { PredictedTacticalProfile } from "@/components/PredictedTacticalProfile";
import { RecentResults } from "@/components/RecentResults";
import { RankingsTable } from "@/components/RankingsTable";
import { FormBadge } from "@/components/FormBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { AdBanner } from "@/components/AdBanner";
import { MomentumChart } from "@/components/MomentumChart";
import { UpcomingFixtures } from "@/components/UpcomingFixtures";
import {
  Target, Flag, AlertTriangle, Shield, TrendingUp, Crosshair,
  RefreshCw, ChevronLeft, ChevronRight, Sparkles, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StatKey = "record" | "corners" | "cards" | "fouls" | "shots" | "over25" | "cleanSheets";

/* ─── Form Strip ─── */
const FormStrip = ({ views, formLast5 }: { views: TeamMatchView[]; formLast5: ("W" | "D" | "L")[] }) => {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState(10);
  const extendedForm = views.slice(-range).map((v) => v.result).reverse();
  const wins = extendedForm.filter((r) => r === "W").length;
  const draws = extendedForm.filter((r) => r === "D").length;
  const losses = extendedForm.filter((r) => r === "L").length;

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <div className="flex gap-0.5">
          {formLast5.map((r, i) => <FormBadge key={i} result={r} />)}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-2 transition-all",
            expanded
              ? "border-foreground bg-foreground text-background shadow-none"
              : "border-border bg-card text-muted-foreground shadow-[2px_2px_0_hsl(var(--border))]"
          )}
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 border-2 border-border bg-card p-3 shadow-[3px_3px_0_hsl(var(--border))]">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Last</span>
            {([10, 20, 30, 40, 50] as const).map((n) => (
              <button key={n} onClick={() => setRange(n)} className={cn(
                "px-1.5 py-0.5 text-[10px] font-mono font-bold border transition-colors",
                range === n ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}>{n}</button>
            ))}
          </div>
          <div className="flex gap-2 mb-2 text-xs font-bold">
            <span className="text-stat-positive">{wins}W</span>
            <span className="text-stat-warn">{draws}D</span>
            <span className="text-stat-negative">{losses}L</span>
            <span className="text-muted-foreground ml-auto font-mono text-[10px]">{extendedForm.length} matches</span>
          </div>
          <div className="flex flex-wrap gap-0.5">
            {extendedForm.map((r, i) => <FormBadge key={i} result={r} />)}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Team Selector Screen ─── */
const TeamSelector = ({
  leagues,
  allMatches,
  onSelectTeam,
  onOpenPredict,
}: {
  leagues: { code: string; name: string }[];
  allMatches: any[];
  onSelectTeam: (team: string, league: string) => void;
  onOpenPredict: () => void;
}) => {
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const teamsByLeague = useMemo(() => {
    const map: Record<string, string[]> = {};
    leagues.forEach((l) => {
      const filtered = allMatches.filter((m: any) => m.league_code === l.code);
      map[l.code] = getUniqueTeams(filtered);
    });
    return map;
  }, [leagues, allMatches]);

  const searchLower = search.toLowerCase().trim();

  const searchResults = useMemo(() => {
    if (!searchLower) return null;
    const results: { team: string; league: { code: string; name: string } }[] = [];
    leagues.forEach((l) => {
      (teamsByLeague[l.code] || []).forEach((team) => {
        if (team.toLowerCase().includes(searchLower)) {
          results.push({ team, league: l });
        }
      });
    });
    return results;
  }, [searchLower, leagues, teamsByLeague]);

  return (
    <div className="p-3 space-y-2 max-w-lg mx-auto pb-20">
      <h2 className="text-lg text-center mb-3">Select Team</h2>

      <input
        type="text"
        placeholder="Search team…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full h-8 px-3 text-xs border-2 border-border bg-background font-medium placeholder:text-muted-foreground focus:outline-none focus:border-primary shadow-[2px_2px_0_hsl(var(--border))]"
      />

      {searchResults ? (
        <div className="border-2 border-border bg-card shadow-[3px_3px_0_hsl(var(--border))] max-h-64 overflow-y-auto">
          {searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No teams found</p>
          )}
          {searchResults.map(({ team, league: l }) => (
            <button
              key={`${l.code}-${team}`}
              onClick={() => onSelectTeam(team, l.code)}
              className="w-full text-left px-4 py-2 text-xs text-foreground hover:bg-primary hover:text-primary-foreground transition-colors border-b border-border last:border-b-0"
            >
              <span className="font-semibold">{team}</span>
              <span className="text-muted-foreground ml-2 text-[10px]">{l.name}</span>
            </button>
          ))}
        </div>
      ) : (
        leagues.map((l) => (
          <div key={l.code} className="border-2 border-border bg-card shadow-[3px_3px_0_hsl(var(--border))]">
            <button
              onClick={() => setExpandedLeague(expandedLeague === l.code ? null : l.code)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-muted transition-colors"
            >
              <span>{l.name}</span>
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expandedLeague === l.code && "rotate-90")} />
            </button>
            {expandedLeague === l.code && (
              <div className="border-t-2 border-border max-h-52 overflow-y-auto">
                {(teamsByLeague[l.code] || []).map((team) => (
                  <button
                    key={team}
                    onClick={() => onSelectTeam(team, l.code)}
                    className="w-full text-left px-4 py-2 text-xs text-foreground hover:bg-primary hover:text-primary-foreground transition-colors border-b border-border last:border-b-0"
                  >
                    {team}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {/* Predict menu item */}
      <button
        onClick={onOpenPredict}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 mt-4 text-xs font-bold uppercase tracking-wider border-2 transition-all",
          "border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground",
          "shadow-[3px_3px_0_hsl(var(--primary))]",
        )}
      >
        <Sparkles className="w-4 h-4" />
        AI Match Prediction
      </button>
    </div>
  );
};

/* ─── Stats Dashboard ─── */
type StatsProps = {
  selectedTeam: string;
  leagueCode: string;
  pastN: number;
  setPastN: (n: number) => void;
  onBack: () => void;
  onOpenPredict: () => void;
};

const StatsDashboard = ({ selectedTeam, leagueCode, pastN, setPastN, onBack, onOpenPredict }: StatsProps) => {
  const [openStat, setOpenStat] = useState<StatKey | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const { data: allMatches = [] } = useMatches(leagueCode || undefined);
  const { data: teamMatches = [] } = useTeamMatches(selectedTeam, leagueCode || undefined);
  const { data: fixtures = [] } = useFixtures(selectedTeam);
  const { data: allFixtures = [] } = useFixtures();
  const leagues = useMemo(() => getUniqueLeagues(allMatches), [allMatches]);
  const currentLeagueName = leagues.find((l) => l.code === leagueCode)?.name ?? "All Leagues";

  // Find next fixture for this team (auto or user-selected)
  const nextFixture = useMemo(() => {
    if (selectedFixtureId) {
      return fixtures.find((f) => f.id === selectedFixtureId) ?? null;
    }
    if (fixtures.length === 0) return null;
    const today = new Date().toISOString().split("T")[0];
    return fixtures.find((f) => f.match_date >= today) ?? null;
  }, [fixtures, selectedFixtureId]);

  const nextOpponentName = useMemo(() => {
    if (!nextFixture) return undefined;
    return nextFixture.home_team === selectedTeam ? nextFixture.away_team : nextFixture.home_team;
  }, [nextFixture, selectedTeam]);

  // Get opponent stats if we have a next fixture
  const nextOpponentStats = useMemo(() => {
    if (!nextOpponentName) return null;
    const oppViews = allMatches
      .map((m) => getTeamMatchView(m, nextOpponentName))
      .filter((v): v is TeamMatchView => v !== null)
      .slice(-pastN);
    return oppViews.length > 0 ? aggregateStats(oppViews) : null;
  }, [nextOpponentName, allMatches, pastN]);

  const allTeamViews: TeamMatchView[] = useMemo(() => {
    if (!selectedTeam) return [];
    return teamMatches
      .map((m) => getTeamMatchView(m, selectedTeam))
      .filter((v): v is TeamMatchView => v !== null);
  }, [teamMatches, selectedTeam]);

  const teamViews = useMemo(() => allTeamViews.slice(-pastN), [allTeamViews, pastN]);

  const stats = useMemo(() => aggregateStats(teamViews), [teamViews]);
  const winRate = stats.matchesPlayed > 0 ? ((stats.wins / stats.matchesPlayed) * 100).toFixed(1) : "0.0";

  const leagueMatches = useMemo(
    () => (leagueCode ? allMatches.filter((m) => m.league_code === leagueCode) : []),
    [allMatches, leagueCode]
  );


  if (stats.matchesPlayed === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">No match data for {selectedTeam}</p>
        <button onClick={onBack} className="mt-3 text-xs text-primary font-bold uppercase hover:underline">← Pick another team</button>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 pb-20">
      {/* Back + Past N controls */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-3 h-3" /> Teams
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Last</span>
          <select
            value={pastN}
            onChange={(e) => setPastN(Number(e.target.value))}
            className="h-6 px-1.5 text-[10px] font-mono font-bold border-2 border-border bg-card shadow-[2px_2px_0_hsl(var(--border))] focus:outline-none focus:border-foreground"
          >
            {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Team Banner */}
      <section className="border-2 border-foreground bg-card p-3 shadow-[4px_4px_0_hsl(var(--foreground))]">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-3">
            <TeamLogo teamName={selectedTeam} size="lg" />
            <div>
              <h2 className="text-xl leading-none">{selectedTeam}</h2>
              <div className="flex items-center gap-1 mt-0.5">
                <LeagueLogo leagueName={currentLeagueName} size="xs" />
                <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                  {currentLeagueName} · {stats.matchesPlayed} matches
                </p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono text-2xl font-bold text-primary leading-none">{winRate}%</span>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Win Rate</p>
          </div>
        </div>
        <div className="flex items-start justify-between mt-2 gap-2">
          <div className="flex-1 min-w-0">
            <FormStrip views={allTeamViews} formLast5={stats.formLast5} />
          </div>
          <button
            onClick={onOpenPredict}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-2 transition-all flex-shrink-0 mt-0.5",
              "border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground",
              "shadow-[2px_2px_0_hsl(var(--primary))]",
            )}
          >
            <Sparkles className="w-3 h-3" />
            Predict
          </button>
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <WinProbabilityGauge probability={stats.winProbability} teamName={selectedTeam} />
        <StatCard label="Record" value={`${stats.wins}-${stats.draws}-${stats.losses}`} icon={<TrendingUp className="w-4 h-4" />} trend={parseFloat(winRate) > 50 ? "positive" : "neutral"} subtitle={`${stats.goalsFor} GF · ${stats.goalsAgainst} GA`} delay={150} onClick={() => setOpenStat("record")} />
        <StatCard label="Corners" value={stats.avgCornersFor.toFixed(1)} icon={<Flag className="w-4 h-4" />} trend="neutral" subtitle={`vs ${stats.avgCornersAgainst.toFixed(1)} · Total ${(stats.avgCornersFor + stats.avgCornersAgainst).toFixed(1)}`} delay={200} onClick={() => setOpenStat("corners")} />
        <StatCard label="Cards" value={stats.avgYellowCards.toFixed(1)} icon={<AlertTriangle className="w-4 h-4" />} trend="warn" subtitle={`🟡 Y · ${stats.avgRedCards.toFixed(2)} 🔴 R`} delay={250} onClick={() => setOpenStat("cards")} />
        <StatCard label="Fouls" value={stats.avgFoulsCommitted.toFixed(1)} icon={<Shield className="w-4 h-4" />} trend="negative" subtitle={`Drawn: ${stats.avgFoulsDrawn.toFixed(1)}`} delay={300} onClick={() => setOpenStat("fouls")} />
        <StatCard label="Shots" value={stats.avgShotsFor.toFixed(1)} icon={<Crosshair className="w-4 h-4" />} trend="positive" subtitle={`SOT: ${stats.avgShotsOnTargetFor.toFixed(1)} · vs ${stats.avgShotsAgainst.toFixed(1)}`} delay={350} onClick={() => setOpenStat("shots")} />
        <StatCard label="Over 2.5" value={`${stats.over25Percentage.toFixed(0)}%`} icon={<Target className="w-4 h-4" />} trend={stats.over25Percentage > 60 ? "positive" : "neutral"} subtitle={`O1.5: ${stats.over15Percentage.toFixed(0)}% · BTTS: ${stats.bttsPercentage.toFixed(0)}%`} delay={400} onClick={() => setOpenStat("over25")} />
        <StatCard label="Clean Sheets" value={stats.cleanSheets} icon={<Shield className="w-4 h-4" />} trend="positive" subtitle={`${(stats.goalsAgainst / stats.matchesPlayed).toFixed(2)} GA/match`} delay={450} onClick={() => setOpenStat("cleanSheets")} />
      </div>

      {/* Ad placement */}
      <AdBanner variant="inline" />

      {/* Tactical + Efficiency */}
      <div className="grid grid-cols-1 gap-2">
        <PredictedTacticalProfile
          stats={stats}
          teamName={selectedTeam}
          views={teamViews}
          opponentStats={nextOpponentStats}
          opponentName={nextOpponentName}
          nextFixture={nextFixture ? { date: nextFixture.match_date, isHome: nextFixture.home_team === selectedTeam } : undefined}
          allFixtures={allFixtures}
          allMatches={allMatches}
          onFixtureChange={(f) => setSelectedFixtureId(f.id)}
        />
        <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "500ms" }}>
          <span className="stat-label mb-3 block">Shot Efficiency</span>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider mb-1">
                <span className="text-muted-foreground font-semibold">SOT / Shots</span>
                <span className="font-mono font-bold text-foreground">
                  {stats.avgShotsFor > 0 ? ((stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100).toFixed(1) : "0"}%
                </span>
              </div>
              <div className="probability-bar">
                <div className="probability-fill" style={{ width: `${stats.avgShotsFor > 0 ? (stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider mb-1">
                <span className="text-muted-foreground font-semibold">Goals / SOT</span>
                <span className="font-mono font-bold text-foreground">
                  {stats.avgShotsOnTargetFor > 0 ? (((stats.goalsFor / stats.matchesPlayed) / stats.avgShotsOnTargetFor) * 100).toFixed(1) : "0"}%
                </span>
              </div>
              <div className="probability-bar">
                <div className="h-full transition-all duration-700 ease-out bg-accent" style={{ width: `${stats.avgShotsOnTargetFor > 0 ? Math.min(100, ((stats.goalsFor / stats.matchesPlayed) / stats.avgShotsOnTargetFor) * 100) : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Fixtures */}
      <UpcomingFixtures
        teamName={selectedTeam}
        allMatches={allMatches}
        onSelectFixture={(home, away) => {
          onOpenPredict();
        }}
      />

      {/* Performance Analysis */}
      <MomentumChart views={teamViews} teamName={selectedTeam} />

      {/* Recent Results */}
      <RecentResults views={teamViews} />

      {/* League Table */}
      {leagueCode && leagueMatches.length > 0 && (
        <RankingsTable matches={leagueMatches} leagueName={currentLeagueName} />
      )}

      {openStat && (
        <StatCardDetail statKey={openStat} views={teamViews} onClose={() => setOpenStat(null)} />
      )}
    </div>
  );
};

/* ─── Prediction Dialog (standalone) ─── */
const PredictionDialog = ({
  open,
  onOpenChange,
  allMatches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allMatches: any[];
}) => {
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [selectedTeamA, setSelectedTeamA] = useState("");
  const [selectedTeamB, setSelectedTeamB] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [opponentSearch, setOpponentSearch] = useState("");
  const [showAI, setShowAI] = useState(false);
  const pastN = 10;

  const allTeams = useMemo(() => getUniqueTeams(allMatches), [allMatches]);

  const getTeamStats = useCallback(
    (teamName: string) => {
      if (!teamName) return null;
      const views = allMatches
        .filter((m: any) => m.home_team === teamName || m.away_team === teamName)
        .map((m: any) => getTeamMatchView(m, teamName))
        .filter((v: any): v is TeamMatchView => v !== null)
        .slice(-pastN);
      return views.length > 0 ? aggregateStats(views) : null;
    },
    [allMatches, pastN]
  );

  const statsA = useMemo(() => getTeamStats(selectedTeamA), [selectedTeamA, getTeamStats]);
  const statsB = useMemo(() => getTeamStats(selectedTeamB), [selectedTeamB, getTeamStats]);

  // ── Dixon-Coles prediction ──
  const dcResult = useMemo<PredictionResult | null>(() => {
    if (!statsA || !statsB || !selectedTeamA || !selectedTeamB) return null;

    const leagueAvg = computeLeagueAvgGoals(allMatches);

    // Build recent form stats (last 5)
    const getRecentStats = (teamName: string) => {
      const views = allMatches
        .filter((m: any) => m.home_team === teamName || m.away_team === teamName)
        .map((m: any) => getTeamMatchView(m, teamName))
        .filter((v: any): v is TeamMatchView => v !== null)
        .slice(-5);
      if (views.length === 0) return { scored: 0, conceded: 0, n: 0 };
      return {
        scored: views.reduce((s, v) => s + v.goalsFor, 0),
        conceded: views.reduce((s, v) => s + v.goalsAgainst, 0),
        n: views.length,
      };
    };

    const recentA = getRecentStats(selectedTeamA);
    const recentB = getRecentStats(selectedTeamB);

    const homeInput: TeamInput = {
      goalsScored: statsA.goalsFor,
      goalsConceded: statsA.goalsAgainst,
      matchesPlayed: statsA.matchesPlayed,
      recentGoalsScored: recentA.scored,
      recentGoalsConceded: recentA.conceded,
      recentMatches: recentA.n,
    };

    const awayInput: TeamInput = {
      goalsScored: statsB.goalsFor,
      goalsConceded: statsB.goalsAgainst,
      matchesPlayed: statsB.matchesPlayed,
      recentGoalsScored: recentB.scored,
      recentGoalsConceded: recentB.conceded,
      recentMatches: recentB.n,
    };

    return predictMatch(homeInput, awayInput, leagueAvg);
  }, [statsA, statsB, selectedTeamA, selectedTeamB, allMatches]);

  const handleReset = () => {
    setPrediction(null);
    setSelectedTeamA("");
    setSelectedTeamB("");
    setTeamSearch("");
    setOpponentSearch("");
    setShowAI(false);
  };

  const handleRunPredict = useCallback(async () => {
    if (!selectedTeamA || !statsA) return;
    setPredicting(true);
    setPrediction(null);
    try {
      const body: any = {
        teamName: selectedTeamA,
        stats: statsA,
        recentForm: statsA.formLast5,
      };
      if (selectedTeamB && statsB) {
        body.upcomingOpponent = selectedTeamB;
        body.opponentStats = statsB;
        body.opponentForm = statsB.formLast5;
      }
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
      if (!data?.prediction) throw new Error(data?.error || "No prediction returned");
      setPrediction(data.prediction);
      setShowAI(true);
      toast.success("AI prediction ready!");
    } catch (err: any) {
      console.error("Predict error:", err);
      toast.error(err?.message || "Prediction failed — try again");
    } finally {
      setPredicting(false);
    }
  }, [selectedTeamA, statsA, selectedTeamB, statsB]);

  /* Helper: compact stat row */
  const ComparisonRow = ({ label, a, b, better }: { label: string; a: string; b: string; better: "a" | "b" | "none" }) => (
    <div className="flex items-center py-[5px] px-2">
      <span className={cn("font-mono text-[11px] font-bold w-16 text-right", better === "a" && "text-stat-positive")}>{a}</span>
      <span className="flex-1 text-center text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <span className={cn("font-mono text-[11px] font-bold w-16", better === "b" && "text-stat-positive")}>{b}</span>
    </div>
  );

  const hasBothTeams = selectedTeamA && statsA && selectedTeamB && statsB;

  /* Probability bar helper */
  const ProbBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="space-y-0.5">
      <div className="flex justify-between">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <span className="font-mono text-[11px] font-bold">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed left-[50%] translate-x-[-50%] translate-y-0 top-[max(0.5rem,env(safe-area-inset-top))] bottom-[max(5rem,env(safe-area-inset-bottom))] w-[calc(100vw-1rem)] max-w-md flex flex-col p-0 gap-0 border-2 border-primary shadow-[4px_4px_0_hsl(var(--primary)/0.3)] [&>button:last-child]:hidden overflow-hidden sm:top-[50%] sm:bottom-auto sm:max-h-[92vh] sm:translate-y-[-50%]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b-2 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-primary">Match Prediction</span>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1 hover:bg-muted transition-colors border border-border rounded-sm">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-2.5 space-y-2.5" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
          {/* ── TEAM SELECTION ── */}
          {!showAI && (
            <div className="space-y-2">
              {/* Team A */}
              <div>
                <label className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">Home Team</label>
                {selectedTeamA ? (
                  <div className="flex items-center justify-between border border-primary bg-primary/5 px-2 py-1.5 rounded-sm">
                    <div className="flex items-center gap-1.5">
                      <TeamLogo teamName={selectedTeamA} size="sm" />
                      <p className="text-[11px] font-bold">{selectedTeamA}</p>
                    </div>
                    <button onClick={() => setSelectedTeamA("")} className="text-[8px] text-primary uppercase tracking-wider hover:underline">Change</button>
                  </div>
                ) : (
                  <>
                    <input type="text" placeholder="Search team…" value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)}
                      className="w-full h-6 px-2 text-[11px] border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:border-primary rounded-sm" autoFocus />
                    <div className="max-h-28 overflow-y-auto border border-border bg-card rounded-sm mt-1">
                      {allTeams.filter((t) => !teamSearch || t.toLowerCase().includes(teamSearch.toLowerCase())).slice(0, 15).map((team) => (
                        <button key={team} onClick={() => { setSelectedTeamA(team); setTeamSearch(""); }}
                          className="w-full text-left px-2 py-1 text-[11px] border-b border-border last:border-b-0 hover:bg-muted flex items-center gap-1.5">
                          <TeamLogo teamName={team} size="xs" />{team}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* VS + Team B */}
              {selectedTeamA && (
                <>
                  <div className="flex items-center justify-center py-0.5">
                    <span className="text-[10px] font-black text-muted-foreground tracking-wider">VS</span>
                  </div>
                  <div>
                    <label className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">Away Team</label>
                    {selectedTeamB ? (
                      <div className="flex items-center justify-between border border-border bg-muted/30 px-2 py-1.5 rounded-sm">
                        <div className="flex items-center gap-1.5">
                          <TeamLogo teamName={selectedTeamB} size="sm" />
                          <p className="text-[11px] font-bold">{selectedTeamB}</p>
                        </div>
                        <button onClick={() => setSelectedTeamB("")} className="text-[8px] text-primary uppercase tracking-wider hover:underline">Change</button>
                      </div>
                    ) : (
                      <>
                        <input type="text" placeholder="Search opponent…" value={opponentSearch} onChange={(e) => setOpponentSearch(e.target.value)}
                          className="w-full h-6 px-2 text-[11px] border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:border-primary rounded-sm" />
                        <div className="max-h-24 overflow-y-auto border border-border bg-card rounded-sm mt-1">
                          {allTeams.filter((t) => t !== selectedTeamA && (!opponentSearch || t.toLowerCase().includes(opponentSearch.toLowerCase()))).slice(0, 12).map((team) => (
                            <button key={team} onClick={() => { setSelectedTeamB(team); setOpponentSearch(""); }}
                              className="w-full text-left px-2 py-1 text-[11px] border-b border-border last:border-b-0 hover:bg-muted flex items-center gap-1.5">
                              <TeamLogo teamName={team} size="xs" />{team}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── DIXON-COLES STATISTICAL PREDICTION ── */}
          {dcResult && hasBothTeams && !showAI && (
            <div className="space-y-2">
              {/* Win probabilities */}
              <div className="border border-border bg-card rounded-sm overflow-hidden">
                <div className="px-2 py-1 bg-primary/10 border-b border-border">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-primary">📊 Match Probabilities</span>
                </div>
                <div className="p-2.5 space-y-2">
                  <ProbBar label={selectedTeamA} value={dcResult.homeWin} color="bg-stat-positive" />
                  <ProbBar label="Draw" value={dcResult.draw} color="bg-stat-warn" />
                  <ProbBar label={selectedTeamB} value={dcResult.awayWin} color="bg-stat-negative" />
                </div>
              </div>

              {/* Expected goals */}
              <div className="border border-border bg-card rounded-sm overflow-hidden">
                <div className="px-2 py-1 bg-muted/60 border-b border-border">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-muted-foreground">⚽ Expected Goals</span>
                </div>
                <div className="flex items-center justify-around py-2.5">
                  <div className="text-center">
                    <p className="font-mono text-2xl font-bold text-foreground">{dcResult.lambdaHome.toFixed(2)}</p>
                    <p className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">{selectedTeamA}</p>
                  </div>
                  <div className="text-[10px] font-black text-muted-foreground">xG</div>
                  <div className="text-center">
                    <p className="font-mono text-2xl font-bold text-foreground">{dcResult.lambdaAway.toFixed(2)}</p>
                    <p className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">{selectedTeamB}</p>
                  </div>
                </div>
              </div>

              {/* Top scorelines */}
              <div className="border border-border bg-card rounded-sm overflow-hidden">
                <div className="px-2 py-1 bg-muted/60 border-b border-border">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-muted-foreground">🎯 Most Likely Scorelines</span>
                </div>
                <div className="divide-y divide-border">
                  {dcResult.topScorelines.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center px-2.5 py-1.5">
                      <span className="text-[9px] text-muted-foreground font-mono w-4">#{i + 1}</span>
                      <span className="font-mono text-[12px] font-bold flex-1 text-center">
                        {s.home} – {s.away}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-primary">{(s.probability * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats comparison */}
              <div className="border border-border bg-card rounded-sm overflow-hidden">
                <div className="px-2 py-1 bg-muted/60 border-b border-border">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-muted-foreground">📈 Head to Head Stats</span>
                </div>
                <ComparisonRow label="Win %" a={`${statsA!.winProbability.toFixed(0)}%`} b={`${statsB!.winProbability.toFixed(0)}%`} better={statsA!.winProbability > statsB!.winProbability ? "a" : statsA!.winProbability < statsB!.winProbability ? "b" : "none"} />
                <ComparisonRow label="GF/G" a={(statsA!.goalsFor / statsA!.matchesPlayed).toFixed(1)} b={(statsB!.goalsFor / statsB!.matchesPlayed).toFixed(1)} better={statsA!.goalsFor / statsA!.matchesPlayed > statsB!.goalsFor / statsB!.matchesPlayed ? "a" : "b"} />
                <ComparisonRow label="GA/G" a={(statsA!.goalsAgainst / statsA!.matchesPlayed).toFixed(1)} b={(statsB!.goalsAgainst / statsB!.matchesPlayed).toFixed(1)} better={statsA!.goalsAgainst / statsA!.matchesPlayed < statsB!.goalsAgainst / statsB!.matchesPlayed ? "a" : "b"} />
                <ComparisonRow label="Shots" a={statsA!.avgShotsFor.toFixed(1)} b={statsB!.avgShotsFor.toFixed(1)} better={statsA!.avgShotsFor > statsB!.avgShotsFor ? "a" : "b"} />
                <ComparisonRow label="BTTS" a={`${statsA!.bttsPercentage.toFixed(0)}%`} b={`${statsB!.bttsPercentage.toFixed(0)}%`} better="none" />
                <ComparisonRow label="O2.5" a={`${statsA!.over25Percentage.toFixed(0)}%`} b={`${statsB!.over25Percentage.toFixed(0)}%`} better="none" />

                {/* Form dots */}
                <div className="px-2 py-1.5 border-t border-border flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-1">
                    <span className="text-[7px] text-muted-foreground font-semibold">Form</span>
                    <div className="flex gap-[2px]">{statsA!.formLast5.map((r, i) => <span key={i} className={cn("w-[5px] h-[5px] rounded-full", r === "W" && "bg-stat-positive", r === "D" && "bg-stat-warn", r === "L" && "bg-stat-negative")} />)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex gap-[2px]">{statsB!.formLast5.map((r, i) => <span key={i} className={cn("w-[5px] h-[5px] rounded-full", r === "W" && "bg-stat-positive", r === "D" && "bg-stat-warn", r === "L" && "bg-stat-negative")} />)}</div>
                    <span className="text-[7px] text-muted-foreground font-semibold">Form</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── AI PREDICTION RESULT ── */}
          {showAI && prediction && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <TeamLogo teamName={selectedTeamA} size="sm" />
                  <p className="text-[11px] font-bold">{selectedTeamA}</p>
                </div>
                {selectedTeamB && (
                  <>
                    <span className="text-[10px] font-black text-muted-foreground">VS</span>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-bold">{selectedTeamB}</p>
                      <TeamLogo teamName={selectedTeamB} size="sm" />
                    </div>
                  </>
                )}
              </div>

              {/* Show DC probabilities summary even in AI view */}
              {dcResult && (
                <div className="border border-border bg-card rounded-sm p-2 flex items-center justify-around">
                  <div className="text-center">
                    <p className="font-mono text-sm font-bold text-stat-positive">{dcResult.homeWin.toFixed(0)}%</p>
                    <p className="text-[7px] uppercase text-muted-foreground">Home</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-sm font-bold text-stat-warn">{dcResult.draw.toFixed(0)}%</p>
                    <p className="text-[7px] uppercase text-muted-foreground">Draw</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-sm font-bold text-stat-negative">{dcResult.awayWin.toFixed(0)}%</p>
                    <p className="text-[7px] uppercase text-muted-foreground">Away</p>
                  </div>
                </div>
              )}

              <div className="border border-primary/20 bg-primary/5 p-2.5 rounded-sm">
                <div className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">{prediction}</div>
              </div>
              <button onClick={handleReset}
                className="w-full py-1.5 text-[9px] font-bold uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors rounded-sm">
                New Prediction
              </button>
            </div>
          )}
        </div>

        {/* Sticky bottom */}
        <div className="flex-shrink-0 border-t border-border bg-card pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {selectedTeamA && selectedTeamB && !showAI && (
            <div className="px-2.5 pt-2 pb-1 flex gap-2">
              <button onClick={handleRunPredict} disabled={predicting || !statsA}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider border-2 transition-all rounded-sm",
                  "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                  "shadow-[2px_2px_0_hsl(var(--primary)/0.3)]",
                  (predicting || !statsA) && "opacity-70 cursor-wait"
                )}>
                {predicting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {predicting ? "Analyzing…" : "AI Deep Analysis"}
              </button>
            </div>
          )}
          <p className="text-[7px] text-muted-foreground text-center uppercase tracking-wider px-2.5 py-1">
            Poisson-Dixon-Coles model · Last {pastN} matches
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ─── Main Team Page (Page 3) ─── */
const TeamPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();
  const syncData = useSyncData();
  const syncFixtures = useSyncFixtures();
  const leagues = useMemo(() => getUniqueLeagues(allMatches), [allMatches]);
  const [showPredictionModal, setShowPredictionModal] = useState(false);

  const [selectedTeam, setSelectedTeam] = useState<string>(() => localStorage.getItem("fe_team") || "");
  const [leagueCode, setLeagueCode] = useState<string>(() => localStorage.getItem("fe_league") || "");
  const [pastN, setPastN] = useState<number>(() => parseInt(localStorage.getItem("fe_pastN") || "10"));
  const [showStats, setShowStats] = useState<boolean>(() => !!localStorage.getItem("fe_team"));

  const handleSelectTeam = (team: string, league: string) => {
    setSelectedTeam(team);
    setLeagueCode(league);
    setShowStats(true);
    localStorage.setItem("fe_team", team);
    localStorage.setItem("fe_league", league);
  };

  const handleBack = () => {
    setShowStats(false);
    setSelectedTeam("");
    setLeagueCode("");
    localStorage.removeItem("fe_team");
    localStorage.removeItem("fe_league");
  };

  const handleSetPastN = (n: number) => {
    setPastN(n);
    localStorage.setItem("fe_pastN", String(n));
  };

  const handleSync = () => {
    toast.info("Syncing matches & fixtures…");
    syncData.mutate(
      { season: "2526" },
      {
        onSuccess: (data) => {
          const total = data.results?.reduce((s: number, r: { inserted: number }) => s + r.inserted, 0) ?? 0;
          toast.success(`Synced ${total} matches`);
        },
        onError: (err) => toast.error(`Match sync failed: ${err.message}`),
      }
    );
    syncFixtures.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(`Synced ${data.fixtures ?? 0} upcoming fixtures`);
      },
      onError: (err) => toast.error(`Fixtures sync failed: ${err.message}`),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Loading…</p>
      </div>
    );
  }

  if (allMatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="retro-border bg-card p-6 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">No data yet</p>
          <Button onClick={handleSync} disabled={syncData.isPending} className="gap-1.5 uppercase tracking-wider text-xs font-bold rounded-none border-2 border-foreground shadow-[3px_3px_0_hsl(var(--foreground))]">
            <RefreshCw className={`w-3.5 h-3.5 ${syncData.isPending ? "animate-spin" : ""}`} />
            Sync Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showStats && selectedTeam ? (
        <StatsDashboard
          selectedTeam={selectedTeam}
          leagueCode={leagueCode}
          pastN={pastN}
          setPastN={handleSetPastN}
          onBack={handleBack}
          onOpenPredict={() => setShowPredictionModal(true)}
        />
      ) : (
        <TeamSelector
          leagues={leagues}
          allMatches={allMatches}
          onSelectTeam={handleSelectTeam}
          onOpenPredict={() => setShowPredictionModal(true)}
        />
      )}
      <PredictionDialog
        open={showPredictionModal}
        onOpenChange={setShowPredictionModal}
        allMatches={allMatches}
      />
    </>
  );
};

export default TeamPage;
