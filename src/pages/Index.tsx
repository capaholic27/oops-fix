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
  BarChart3,
  RefreshCw,
  Crosshair,
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

  const teamViews: TeamMatchView[] = useMemo(() => {
    if (!selectedTeam) return [];
    const views = teamMatches
      .map((m) => getTeamMatchView(m, selectedTeam))
      .filter((v): v is TeamMatchView => v !== null);
    // Take last N matches
    return views.slice(-pastN);
  }, [teamMatches, selectedTeam, pastN]);

  const stats = useMemo(() => aggregateStats(teamViews), [teamViews]);
  const winRate = stats.matchesPlayed > 0 ? ((stats.wins / stats.matchesPlayed) * 100).toFixed(1) : "0.0";

  const handleSync = () => {
    toast.info("Syncing match data from football-data.co.uk...");
    syncData.mutate(
      { season: "2425" },
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">FootballEdge</h1>
              <p className="text-xs text-muted-foreground">Statistical advantage finder</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground hidden sm:block">
              Season 2024/25
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncData.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncData.isPending ? "animate-spin" : ""}`} />
              {syncData.isPending ? "Syncing..." : "Sync Data"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Filters */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Filters
          </h2>
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
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Select Team
            </h2>
            <TeamDropdown
              teams={teams}
              selectedTeam={selectedTeam}
              onSelect={setSelectedTeam}
            />
          </section>
        )}

        {isLoading && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">Loading match data...</p>
          </div>
        )}

        {!isLoading && allMatches.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <p className="text-muted-foreground">No match data yet. Click "Sync Data" to pull stats from football-data.co.uk</p>
            <Button onClick={handleSync} disabled={syncData.isPending} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${syncData.isPending ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          </div>
        )}

        {selectedTeam && stats.matchesPlayed > 0 && (
          <>
            {/* Team header */}
            <section key={selectedTeam} className="flex items-center gap-4 opacity-0 animate-fade-up relative">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{selectedTeam}</h2>
                <p className="text-sm text-muted-foreground">
                  {currentLeagueName || "All Leagues"} · Last {stats.matchesPlayed} matches
                </p>
              </div>
              <div className="ml-auto">
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
                label="Avg Corners (For)"
                value={stats.avgCornersFor.toFixed(1)}
                icon={<Flag className="w-4 h-4" />}
                trend="neutral"
                subtitle={`Against: ${stats.avgCornersAgainst.toFixed(1)}`}
                delay={250}
              />

              <StatCard
                label="Avg Corners (Total)"
                value={(stats.avgCornersFor + stats.avgCornersAgainst).toFixed(1)}
                icon={<Flag className="w-4 h-4" />}
                trend="warn"
                subtitle="Per match combined"
                delay={300}
              />

              <StatCard
                label="Avg Yellow Cards"
                value={stats.avgYellowCards.toFixed(1)}
                icon={<AlertTriangle className="w-4 h-4" />}
                trend="warn"
                subtitle={`Red: ${stats.avgRedCards.toFixed(2)} per match`}
                delay={350}
              />

              <StatCard
                label="Avg Fouls Committed"
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
                label="Avg Shots (For)"
                value={stats.avgShotsFor.toFixed(1)}
                icon={<Crosshair className="w-4 h-4" />}
                trend="positive"
                subtitle={`Against: ${stats.avgShotsAgainst.toFixed(1)}`}
                delay={200}
              />
              <StatCard
                label="Avg Shots on Target"
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

            {/* Tactical Profile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <PredictedTacticalProfile stats={stats} teamName={selectedTeam} />

              <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "575ms" }}>
                <span className="stat-label mb-4 block">Shot Efficiency</span>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">SOT / Total Shots</span>
                      <span className="font-mono font-semibold text-foreground">
                        {stats.avgShotsFor > 0
                          ? ((stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100).toFixed(1)
                          : "0"}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-stat-positive transition-all duration-700"
                        style={{
                          width: `${stats.avgShotsFor > 0 ? (stats.avgShotsOnTargetFor / stats.avgShotsFor) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Goals / SOT</span>
                      <span className="font-mono font-semibold text-foreground">
                        {stats.avgShotsOnTargetFor > 0
                          ? (((stats.goalsFor / stats.matchesPlayed) / stats.avgShotsOnTargetFor) * 100).toFixed(1)
                          : "0"}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-700"
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

                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      {stats.avgShotsOnTargetFor > 4
                        ? "High volume shooter — creates many chances"
                        : stats.avgShotsOnTargetFor > 2
                        ? "Moderate shot output — selective in attack"
                        : "Low shot volume — likely defensive or counter-attacking"}
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
        <footer className="text-center py-6 text-xs text-muted-foreground">
          Data sourced from football-data.co.uk · Season 2024/25
        </footer>
      </main>
    </div>
  );
};

export default Index;
