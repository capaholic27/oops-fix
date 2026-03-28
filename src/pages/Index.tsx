import { useState, useMemo } from "react";
import { useMatches, useTeamMatches, useSyncData } from "@/hooks/useMatches";
import {
  getTeamMatchView,
  aggregateStats,
  getUniqueTeams,
  getUniqueLeagues,
  type TeamMatchView,
} from "@/lib/matchStats";
import { StatCard } from "@/components/StatCard";
import { WinProbabilityGauge } from "@/components/WinProbabilityGauge";
import { MatchFilter } from "@/components/MatchFilter";
import { PredictedTacticalProfile } from "@/components/PredictedTacticalProfile";
import { RecentResults } from "@/components/RecentResults";
import { RankingsTable } from "@/components/RankingsTable";
import { TeamDropdown } from "@/components/TeamDropdown";
import { FormHistoryWindow } from "@/components/FormHistoryWindow";
import {
  Target,
  Flag,
  AlertTriangle,
  Shield,
  TrendingUp,
  Crosshair,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Index = () => {
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [leagueCode, setLeagueCode] = useState<string>("");
  const [pastN, setPastN] = useState<number>(10);

  const { data: allMatches = [], isLoading } = useMatches(leagueCode || undefined);
  const { data: teamMatches = [] } = useTeamMatches(selectedTeam || undefined, leagueCode || undefined);

  const syncData = useSyncData();

  const leagues = useMemo(() => getUniqueLeagues(allMatches), [allMatches]);
  const teams = useMemo(() => {
    const filtered = leagueCode
      ? allMatches.filter((m) => m.league_code === leagueCode)
      : allMatches;
    return getUniqueTeams(filtered);
  }, [allMatches, leagueCode]);

  // Auto-select first team when teams change
  useMemo(() => {
    if (teams.length > 0 && !teams.includes(selectedTeam)) {
      setSelectedTeam(teams[0]);
    }
  }, [teams, selectedTeam]);

  // If only ≤2 teams in filtered list, clear league filter to show all
  useMemo(() => {
    if (leagueCode && teams.length <= 2 && teams.length > 0) {
      // Don't auto-clear, but we'll show a hint
    }
  }, [leagueCode, teams]);

  const teamViews: TeamMatchView[] = useMemo(() => {
    if (!selectedTeam) return [];
    const views = teamMatches
      .map((m) => getTeamMatchView(m, selectedTeam))
      .filter((v): v is TeamMatchView => v !== null);
    return views.slice(-pastN);
  }, [teamMatches, selectedTeam, pastN]);

  const stats = useMemo(() => aggregateStats(teamViews), [teamViews]);
  const winRate = stats.matchesPlayed > 0 ? ((stats.wins / stats.matchesPlayed) * 100).toFixed(1) : "0.0";

  const handleSync = () => {
    toast.info("Syncing match data…");
    syncData.mutate(
      { season: "2526" },
      {
        onSuccess: (data) => {
          const totalInserted = data.results?.reduce((s: number, r: { inserted: number }) => s + r.inserted, 0) ?? 0;
          toast.success(`Synced ${totalInserted} matches across ${data.results?.length ?? 0} leagues`);
        },
        onError: (err) => {
          toast.error(`Sync failed: ${err.message}`);
        },
      }
    );
  };

  const leagueMatches = useMemo(
    () => (leagueCode ? allMatches.filter((m) => m.league_code === leagueCode) : []),
    [allMatches, leagueCode]
  );

  const currentLeagueName = leagues.find((l) => l.code === leagueCode)?.name ?? "";

  return (
    <div className="min-h-screen bg-background retro-stripe">
      {/* Header */}
      <header className="border-b-2 border-foreground bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-foreground bg-primary flex items-center justify-center shadow-[3px_3px_0_hsl(var(--foreground))]">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg leading-tight">FootballEdge</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                Statistical Advantage Finder
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hidden sm:block border border-border px-2 py-1">
              25/26
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncData.isPending}
              className="gap-1.5 uppercase tracking-wider text-xs font-bold border-2 border-foreground shadow-[2px_2px_0_hsl(var(--foreground))] hover:shadow-[3px_3px_0_hsl(var(--foreground))] hover:translate-x-[-1px] hover:translate-y-[-1px] active:shadow-none active:translate-x-0 active:translate-y-0 rounded-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncData.isPending ? "animate-spin" : ""}`} />
              {syncData.isPending ? "Syncing…" : "Sync"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Filters */}
        <section className="space-y-2">
          <h2 className="text-xs text-muted-foreground tracking-[0.2em]">Filters</h2>
          <MatchFilter
            pastN={pastN}
            onPastNChange={setPastN}
            leagueCode={leagueCode}
            onLeagueChange={(code) => {
              setLeagueCode(code);
              setSelectedTeam("");
            }}
            leagues={leagues}
          />
        </section>

        {/* Team Selector */}
        {teams.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xs text-muted-foreground tracking-[0.2em]">Team</h2>
              {leagueCode && teams.length <= 2 && (
                <button
                  onClick={() => { setLeagueCode(""); setSelectedTeam(""); }}
                  className="text-[10px] uppercase tracking-wider text-accent font-bold hover:underline"
                >
                  Show all leagues →
                </button>
              )}
            </div>
            <TeamDropdown
              teams={teams}
              selectedTeam={selectedTeam}
              onSelect={setSelectedTeam}
            />
          </section>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground uppercase tracking-wider">Loading match data…</p>
          </div>
        )}

        {!isLoading && allMatches.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <div className="inline-block border-2 border-foreground bg-card p-8 shadow-[6px_6px_0_hsl(var(--foreground))]">
              <p className="text-muted-foreground uppercase tracking-wider text-sm mb-4">No match data yet</p>
              <Button
                onClick={handleSync}
                disabled={syncData.isPending}
                className="gap-2 uppercase tracking-wider font-bold rounded-none border-2 border-foreground shadow-[3px_3px_0_hsl(var(--foreground))] hover:shadow-[4px_4px_0_hsl(var(--foreground))]"
              >
                <RefreshCw className={`w-4 h-4 ${syncData.isPending ? "animate-spin" : ""}`} />
                Sync Now
              </Button>
            </div>
          </div>
        )}

        {selectedTeam && stats.matchesPlayed > 0 && (
          <>
            {/* Team header — integrated into the design */}
            <section
              key={selectedTeam}
              className="border-2 border-foreground bg-card p-4 sm:p-5 shadow-[4px_4px_0_hsl(var(--foreground))] opacity-0 animate-fade-up relative z-40"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl sm:text-3xl leading-none">{selectedTeam}</h2>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mt-1">
                    {currentLeagueName || "All Leagues"} · Last {stats.matchesPlayed} matches
                  </p>
                </div>
                <FormHistoryWindow views={teamViews} formLast5={stats.formLast5} />
              </div>
            </section>

            {/* Key Stats Grid */}
            <div key={`stats-${selectedTeam}-${pastN}`} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <WinProbabilityGauge probability={stats.winProbability} teamName={selectedTeam} />

              <StatCard
                label="Win Rate"
                value={`${winRate}%`}
                icon={<TrendingUp className="w-4 h-4" />}
                trend={parseFloat(winRate) > 60 ? "positive" : parseFloat(winRate) > 40 ? "neutral" : "negative"}
                subtitle={`${stats.wins}W ${stats.draws}D ${stats.losses}L`}
                delay={200}
              />

              <StatCard
                label="Corners For"
                value={stats.avgCornersFor.toFixed(1)}
                icon={<Flag className="w-4 h-4" />}
                trend="neutral"
                subtitle={`Against: ${stats.avgCornersAgainst.toFixed(1)}`}
                delay={250}
              />

              <StatCard
                label="Corners Total"
                value={(stats.avgCornersFor + stats.avgCornersAgainst).toFixed(1)}
                icon={<Flag className="w-4 h-4" />}
                trend="warn"
                subtitle="Per match combined"
                delay={300}
              />

              <StatCard
                label="Yellow Cards"
                value={stats.avgYellowCards.toFixed(1)}
                icon={<AlertTriangle className="w-4 h-4" />}
                trend="warn"
                subtitle={`Red: ${stats.avgRedCards.toFixed(2)} per match`}
                delay={350}
              />

              <StatCard
                label="Fouls Committed"
                value={stats.avgFoulsCommitted.toFixed(1)}
                icon={<Shield className="w-4 h-4" />}
                trend="negative"
                subtitle={`Drawn: ${stats.avgFoulsDrawn.toFixed(1)}`}
                delay={400}
              />

              <StatCard
                label="Over 2.5 Goals"
                value={`${stats.over25Percentage.toFixed(1)}%`}
                icon={<Target className="w-4 h-4" />}
                trend={stats.over25Percentage > 60 ? "positive" : "neutral"}
                subtitle={`Over 1.5: ${stats.over15Percentage.toFixed(1)}%`}
                delay={450}
              />

              <StatCard
                label="Clean Sheets"
                value={stats.cleanSheets}
                icon={<Shield className="w-4 h-4" />}
                trend="positive"
                subtitle={`BTTS: ${stats.bttsPercentage.toFixed(1)}%`}
                delay={475}
              />
            </div>

            {/* Shots Stats */}
            <div key={`shots-${selectedTeam}`} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Shots For"
                value={stats.avgShotsFor.toFixed(1)}
                icon={<Crosshair className="w-4 h-4" />}
                trend="positive"
                subtitle={`Against: ${stats.avgShotsAgainst.toFixed(1)}`}
                delay={200}
              />
              <StatCard
                label="Shots on Target"
                value={stats.avgShotsOnTargetFor.toFixed(1)}
                icon={<Crosshair className="w-4 h-4" />}
                trend="positive"
                subtitle={`Against: ${stats.avgShotsOnTargetAgainst.toFixed(1)}`}
                delay={250}
              />
              <StatCard
                label="Goals Scored"
                value={stats.goalsFor}
                trend="positive"
                subtitle={`${(stats.goalsFor / stats.matchesPlayed).toFixed(2)} per match`}
                delay={300}
              />
              <StatCard
                label="Goals Conceded"
                value={stats.goalsAgainst}
                trend="negative"
                subtitle={`${(stats.goalsAgainst / stats.matchesPlayed).toFixed(2)} per match`}
                delay={350}
              />
            </div>

            {/* Tactical Profile + Shot Efficiency */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <PredictedTacticalProfile stats={stats} teamName={selectedTeam} />

              <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "575ms" }}>
                <span className="stat-label mb-4 block">Shot Efficiency</span>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">SOT / Total Shots</span>
                      <span className="font-mono font-semibold text-foreground">
                        {stats.avgShotsFor > 0
                          ? ((stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100).toFixed(1)
                          : "0"}%
                      </span>
                    </div>
                    <div className="probability-bar">
                      <div
                        className="probability-fill"
                        style={{
                          width: `${stats.avgShotsFor > 0 ? (stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">Goals / SOT</span>
                      <span className="font-mono font-semibold text-foreground">
                        {stats.avgShotsOnTargetFor > 0
                          ? (((stats.goalsFor / stats.matchesPlayed) / stats.avgShotsOnTargetFor) * 100).toFixed(1)
                          : "0"}%
                      </span>
                    </div>
                    <div className="probability-bar">
                      <div
                        className="h-full transition-all duration-700 ease-out bg-accent"
                        style={{
                          width: `${
                            stats.avgShotsOnTargetFor > 0
                              ? Math.min(100, ((stats.goalsFor / stats.matchesPlayed) / stats.avgShotsOnTargetFor) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t-2 border-border">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {stats.avgShotsOnTargetFor > 4
                        ? "⚡ High volume — creates many chances"
                        : stats.avgShotsOnTargetFor > 2
                        ? "◆ Moderate — selective in attack"
                        : "◇ Low volume — counter-attacking style"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Results */}
            <RecentResults views={teamViews} />

            {/* Rankings */}
            {leagueCode && leagueMatches.length > 0 && (
              <RankingsTable matches={leagueMatches} leagueName={currentLeagueName} />
            )}
          </>
        )}

        {/* Footer */}
        <footer className="text-center py-6 border-t-2 border-border">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
            Data sourced from football-data.co.uk · Season 2025/26
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Index;
