import { useState, useMemo, useRef, useEffect } from "react";
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
import { PredictedTacticalProfile } from "@/components/PredictedTacticalProfile";
import { RecentResults } from "@/components/RecentResults";
import { RankingsTable } from "@/components/RankingsTable";
import { FormBadge } from "@/components/FormBadge";
import {
  Target,
  Flag,
  AlertTriangle,
  Shield,
  TrendingUp,
  Crosshair,
  RefreshCw,
  Zap,
  ChevronDown,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Inline Team Picker (portal-free, no overlap) ─── */
const TeamPicker = ({
  teams,
  selected,
  onSelect,
}: {
  teams: string[];
  selected: string;
  onSelect: (t: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = teams.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative z-50">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider",
          "border-2 bg-card transition-all duration-100",
          open
            ? "border-foreground shadow-[3px_3px_0_hsl(var(--foreground))]"
            : "border-border shadow-[2px_2px_0_hsl(var(--border))]"
        )}
      >
        <span className="truncate max-w-[140px]">{selected || "Team"}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 max-h-72 border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="p-1.5 border-b-2 border-border">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted border border-border">
              <Search className="w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-52 p-0.5">
            {filtered.map((team) => (
              <button
                key={team}
                onClick={() => { onSelect(team); setOpen(false); setSearch(""); }}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 text-xs transition-colors",
                  selected === team
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-foreground hover:bg-muted"
                )}
              >
                {team}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Form Strip (inline, no popup overlap) ─── */
const FormStrip = ({
  views,
  formLast5,
}: {
  views: TeamMatchView[];
  formLast5: ("W" | "D" | "L")[];
}) => {
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState(10);

  const extendedForm = views.slice(-range).map((v) => v.result).reverse();
  const wins = extendedForm.filter((r) => r === "W").length;
  const draws = extendedForm.filter((r) => r === "D").length;
  const losses = extendedForm.filter((r) => r === "L").length;

  return (
    <div>
      {/* Compact badges row */}
      <div className="flex items-center gap-1.5">
        <div className="flex gap-0.5">
          {formLast5.map((r, i) => (
            <FormBadge key={i} result={r} />
          ))}
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

      {/* Expanded section — rendered BELOW, not floating */}
      {expanded && (
        <div className="mt-2 border-2 border-border bg-card p-3 shadow-[3px_3px_0_hsl(var(--border))]">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Last</span>
            {([10, 20, 30, 40, 50] as const).map((n) => (
              <button
                key={n}
                onClick={() => setRange(n)}
                className={cn(
                  "px-1.5 py-0.5 text-[10px] font-mono font-bold border transition-colors",
                  range === n
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-2 text-xs font-bold">
            <span className="text-stat-positive">{wins}W</span>
            <span className="text-stat-warn">{draws}D</span>
            <span className="text-stat-negative">{losses}L</span>
            <span className="text-muted-foreground ml-auto font-mono text-[10px]">{extendedForm.length} matches</span>
          </div>
          <div className="flex flex-wrap gap-0.5">
            {extendedForm.map((r, i) => (
              <FormBadge key={i} result={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Main Page ─── */
const Index = () => {
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [leagueCode, setLeagueCode] = useState<string>("");
  const [pastN, setPastN] = useState<number>(10);

  const { data: allMatches = [], isLoading } = useMatches(leagueCode || undefined);
  const { data: teamMatches = [] } = useTeamMatches(selectedTeam || undefined, leagueCode || undefined);
  const syncData = useSyncData();

  const leagues = useMemo(() => getUniqueLeagues(allMatches), [allMatches]);
  const teams = useMemo(() => {
    const filtered = leagueCode ? allMatches.filter((m) => m.league_code === leagueCode) : allMatches;
    return getUniqueTeams(filtered);
  }, [allMatches, leagueCode]);

  useMemo(() => {
    if (teams.length > 0 && !teams.includes(selectedTeam)) setSelectedTeam(teams[0]);
  }, [teams, selectedTeam]);

  const teamViews: TeamMatchView[] = useMemo(() => {
    if (!selectedTeam) return [];
    return teamMatches
      .map((m) => getTeamMatchView(m, selectedTeam))
      .filter((v): v is TeamMatchView => v !== null)
      .slice(-pastN);
  }, [teamMatches, selectedTeam, pastN]);

  const stats = useMemo(() => aggregateStats(teamViews), [teamViews]);
  const winRate = stats.matchesPlayed > 0 ? ((stats.wins / stats.matchesPlayed) * 100).toFixed(1) : "0.0";

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

  const leagueMatches = useMemo(
    () => (leagueCode ? allMatches.filter((m) => m.league_code === leagueCode) : []),
    [allMatches, leagueCode]
  );
  const currentLeagueName = leagues.find((l) => l.code === leagueCode)?.name ?? "";

  return (
    <div className="min-h-screen bg-background retro-stripe">
      {/* ─── Header ─── */}
      <header className="border-b-2 border-foreground bg-card sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 border-2 border-foreground bg-primary flex items-center justify-center shadow-[2px_2px_0_hsl(var(--foreground))]">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm leading-none">FootballEdge</h1>
              <p className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">25/26</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncData.isPending}
            className="gap-1 uppercase tracking-wider text-[10px] font-bold border-2 border-foreground shadow-[2px_2px_0_hsl(var(--foreground))] hover:shadow-[3px_3px_0_hsl(var(--foreground))] rounded-none h-7 px-2"
          >
            <RefreshCw className={`w-3 h-3 ${syncData.isPending ? "animate-spin" : ""}`} />
            {syncData.isPending ? "…" : "Sync"}
          </Button>
        </div>
      </header>

      {/* ─── Controls Bar ─── */}
      <div className="sticky top-[49px] z-40 border-b-2 border-border bg-card/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-3 py-2 flex items-center gap-2 flex-wrap">
          {/* League */}
          <select
            value={leagueCode}
            onChange={(e) => { setLeagueCode(e.target.value); setSelectedTeam(""); }}
            className="h-7 border-2 border-border bg-background px-2 text-[10px] font-bold uppercase tracking-wider text-foreground shadow-[2px_2px_0_hsl(var(--border))] focus:outline-none"
          >
            <option value="">All Leagues</option>
            {leagues.map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>

          {/* Team */}
          {teams.length > 0 && (
            <TeamPicker teams={teams} selected={selectedTeam} onSelect={setSelectedTeam} />
          )}

          {/* Past N */}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Last</span>
            <input
              type="number"
              min={1}
              max={50}
              value={pastN}
              onChange={(e) => setPastN(Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
              className="w-10 h-7 border-2 border-border bg-background px-1.5 text-xs font-mono text-center shadow-[2px_2px_0_hsl(var(--border))] focus:outline-none"
            />
          </div>

          {/* Show all leagues hint */}
          {leagueCode && teams.length <= 2 && (
            <button
              onClick={() => { setLeagueCode(""); setSelectedTeam(""); }}
              className="text-[9px] uppercase tracking-wider text-accent font-bold hover:underline"
            >
              All leagues →
            </button>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-3 py-4 space-y-4">
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Loading…</p>
          </div>
        )}

        {!isLoading && allMatches.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-block border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_hsl(var(--foreground))]">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">No data yet</p>
              <Button onClick={handleSync} disabled={syncData.isPending} className="gap-1.5 uppercase tracking-wider text-xs font-bold rounded-none border-2 border-foreground shadow-[3px_3px_0_hsl(var(--foreground))]">
                <RefreshCw className={`w-3.5 h-3.5 ${syncData.isPending ? "animate-spin" : ""}`} />
                Sync Now
              </Button>
            </div>
          </div>
        )}

        {selectedTeam && stats.matchesPlayed > 0 && (
          <>
            {/* ─── Team Banner + Form ─── */}
            <section className="border-2 border-foreground bg-card p-3 shadow-[4px_4px_0_hsl(var(--foreground))]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-xl sm:text-2xl leading-none">{selectedTeam}</h2>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mt-0.5">
                    {currentLeagueName || "All Leagues"} · {stats.matchesPlayed} matches
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-2xl font-bold text-primary leading-none">{winRate}%</span>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Win Rate</p>
                </div>
              </div>
              <FormStrip views={teamViews} formLast5={stats.formLast5} />
            </section>

            {/* ─── Stats Grid ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              <WinProbabilityGauge probability={stats.winProbability} teamName={selectedTeam} />

              <StatCard label="Record" value={`${stats.wins}-${stats.draws}-${stats.losses}`} icon={<TrendingUp className="w-4 h-4" />} trend={parseFloat(winRate) > 50 ? "positive" : "neutral"} subtitle={`${stats.goalsFor} GF · ${stats.goalsAgainst} GA`} delay={150} />

              <StatCard label="Corners" value={stats.avgCornersFor.toFixed(1)} icon={<Flag className="w-4 h-4" />} trend="neutral" subtitle={`vs ${stats.avgCornersAgainst.toFixed(1)} · Total ${(stats.avgCornersFor + stats.avgCornersAgainst).toFixed(1)}`} delay={200} />

              <StatCard label="Cards" value={stats.avgYellowCards.toFixed(1)} icon={<AlertTriangle className="w-4 h-4" />} trend="warn" subtitle={`🟡 Y · ${stats.avgRedCards.toFixed(2)} 🔴 R`} delay={250} />

              <StatCard label="Fouls" value={stats.avgFoulsCommitted.toFixed(1)} icon={<Shield className="w-4 h-4" />} trend="negative" subtitle={`Drawn: ${stats.avgFoulsDrawn.toFixed(1)}`} delay={300} />

              <StatCard label="Shots" value={stats.avgShotsFor.toFixed(1)} icon={<Crosshair className="w-4 h-4" />} trend="positive" subtitle={`SOT: ${stats.avgShotsOnTargetFor.toFixed(1)} · vs ${stats.avgShotsAgainst.toFixed(1)}`} delay={350} />

              <StatCard label="Over 2.5" value={`${stats.over25Percentage.toFixed(0)}%`} icon={<Target className="w-4 h-4" />} trend={stats.over25Percentage > 60 ? "positive" : "neutral"} subtitle={`O1.5: ${stats.over15Percentage.toFixed(0)}% · BTTS: ${stats.bttsPercentage.toFixed(0)}%`} delay={400} />

              <StatCard label="Clean Sheets" value={stats.cleanSheets} icon={<Shield className="w-4 h-4" />} trend="positive" subtitle={`${(stats.goalsAgainst / stats.matchesPlayed).toFixed(2)} GA/match`} delay={450} />
            </div>

            {/* ─── Tactical + Efficiency ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
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

            {/* ─── Results + Rankings ─── */}
            <RecentResults views={teamViews} />
            {leagueCode && leagueMatches.length > 0 && (
              <RankingsTable matches={leagueMatches} leagueName={currentLeagueName} />
            )}
          </>
        )}

        <footer className="text-center py-4 border-t-2 border-border">
          <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
            football-data.co.uk · 2025/26
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Index;
