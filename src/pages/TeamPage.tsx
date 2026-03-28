import { useState, useMemo, useCallback } from "react";
import { useMatches, useTeamMatches, useSyncData } from "@/hooks/useMatches";
import { supabase } from "@/integrations/supabase/client";
import {
  getTeamMatchView,
  aggregateStats,
  getUniqueTeams,
  getUniqueLeagues,
  type TeamMatchView,
} from "@/lib/matchStats";
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
import {
  Target, Flag, AlertTriangle, Shield, TrendingUp, Crosshair,
  RefreshCw, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
}: {
  leagues: { code: string; name: string }[];
  allMatches: any[];
  onSelectTeam: (team: string, league: string) => void;
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

  // Flat search results across all leagues
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
    <div className="p-3 space-y-2 max-w-lg mx-auto">
      <h2 className="text-lg text-center mb-3">Select Team</h2>

      {/* Search */}
      <input
        type="text"
        placeholder="Search team…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full h-8 px-3 text-xs border-2 border-border bg-background font-medium placeholder:text-muted-foreground focus:outline-none focus:border-primary shadow-[2px_2px_0_hsl(var(--border))]"
      />

      {/* Search results */}
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
        /* League folders */
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
};

const StatsDashboard = ({ selectedTeam, leagueCode, pastN, setPastN, onBack }: StatsProps) => {
  const [openStat, setOpenStat] = useState<StatKey | null>(null);
  const { data: allMatches = [] } = useMatches(leagueCode || undefined);
  const { data: teamMatches = [] } = useTeamMatches(selectedTeam, leagueCode || undefined);
  const leagues = useMemo(() => getUniqueLeagues(allMatches), [allMatches]);
  const currentLeagueName = leagues.find((l) => l.code === leagueCode)?.name ?? "All Leagues";

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
        <FormStrip views={allTeamViews} formLast5={stats.formLast5} />
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
        <PredictedTacticalProfile stats={stats} teamName={selectedTeam} />
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

      <RecentResults views={teamViews} />
      {leagueCode && leagueMatches.length > 0 && (
        <RankingsTable matches={leagueMatches} leagueName={currentLeagueName} />
      )}

      {openStat && (
        <StatCardDetail statKey={openStat} views={teamViews} onClose={() => setOpenStat(null)} />
      )}
    </div>
  );
};

/* ─── Main Team Page (Page 3) ─── */
const TeamPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();
  const syncData = useSyncData();
  const leagues = useMemo(() => getUniqueLeagues(allMatches), [allMatches]);

  // Persist selection in localStorage
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
    toast.info("Syncing…");
    syncData.mutate(
      { season: "2526" },
      {
        onSuccess: (data) => {
          const total = data.results?.reduce((s: number, r: { inserted: number }) => s + r.inserted, 0) ?? 0;
          toast.success(`Synced ${total} matches`);
        },
        onError: (err) => toast.error(`Sync failed: ${err.message}`),
      }
    );
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

  if (showStats && selectedTeam) {
    return (
      <StatsDashboard
        selectedTeam={selectedTeam}
        leagueCode={leagueCode}
        pastN={pastN}
        setPastN={handleSetPastN}
        onBack={handleBack}
      />
    );
  }

  return <TeamSelector leagues={leagues} allMatches={allMatches} onSelectTeam={handleSelectTeam} />;
};

export default TeamPage;
