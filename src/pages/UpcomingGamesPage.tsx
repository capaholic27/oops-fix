import { useState, useMemo, useCallback } from "react";
import { useMatches, useFixtures, type Fixture } from "@/hooks/useMatches";
import { getTeamMatchView } from "@/lib/matchStats";
import { MatchDetailSheet } from "@/components/MatchDetailSheet";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { cn } from "@/lib/utils";
import { CalendarDays, Trophy, ChevronDown } from "lucide-react";
import type { Match } from "@/lib/matchStats";

/* ── helpers ── */
function getTeamFormQuick(team: string, allMatches: Match[], beforeDate: string, count = 5) {
  return allMatches
    .filter((m) => (m.home_team === team || m.away_team === team) && m.match_date < beforeDate)
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
    .slice(0, count)
    .map((m) => {
      const v = getTeamMatchView(m, team);
      return v ? v.result : null;
    })
    .filter(Boolean) as ("W" | "D" | "L")[];
}

const FormDots = ({ form }: { form: ("W" | "D" | "L")[] }) => (
  <div className="flex gap-[3px]">
    {form.map((r, i) => (
      <span key={i} className={cn(
        "w-[5px] h-[5px] rounded-full",
        r === "W" && "bg-stat-positive",
        r === "D" && "bg-stat-warn",
        r === "L" && "bg-stat-negative"
      )} />
    ))}
  </div>
);

function getAbbr(name: string) {
  const map: Record<string, string> = {
    "Arsenal": "ARS", "Aston Villa": "AVL", "Brighton": "BHA", "Bournemouth": "BOU",
    "Brentford": "BRE", "Burnley": "BUR", "Chelsea": "CHE", "Crystal Palace": "CRY",
    "Everton": "EVE", "Fulham": "FUL", "Leeds": "LEE", "Leicester": "LEI",
    "Liverpool": "LIV", "Man City": "MCI", "Man United": "MUN", "Newcastle": "NEW",
    "Nott'm Forest": "NFO", "Sunderland": "SUN", "Tottenham": "TOT", "West Ham": "WHU",
    "Wolves": "WOL", "Ipswich": "IPS", "Southampton": "SOU",
    "Real Madrid": "RMA", "Barcelona": "BAR", "Atletico Madrid": "ATM",
    "Sevilla": "SEV", "Real Sociedad": "RSO", "Villarreal": "VIL",
    "Athletic Club": "ATH", "Betis": "BET", "Girona": "GIR", "Celta": "CEL",
    "Bayern Munich": "BAY", "Dortmund": "BVB", "Leverkusen": "LEV",
    "RB Leipzig": "RBL", "Frankfurt": "SGE", "Freiburg": "SCF",
    "Inter": "INT", "AC Milan": "MIL", "Napoli": "NAP", "Juventus": "JUV",
    "Atalanta": "ATA", "Roma": "ROM", "Lazio": "LAZ", "Fiorentina": "FIO",
    "Paris SG": "PSG", "Marseille": "OM", "Monaco": "MON", "Lyon": "OL",
    "Lille": "LIL", "Nice": "NIC", "Lens": "LEN", "Rennes": "REN",
  };
  return map[name] || name.slice(0, 3).toUpperCase();
}

/* ── Match Row (results) ── */
const MatchRow = ({ match: m, onSelect }: { match: Match; onSelect: (m: Match) => void }) => {
  const homeGoals = m.ft_home_goals ?? 0;
  const awayGoals = m.ft_away_goals ?? 0;
  const homeWin = homeGoals > awayGoals;
  const awayWin = awayGoals > homeGoals;
  const isDraw = homeGoals === awayGoals;

  return (
    <button
      onClick={() => onSelect(m)}
      className="w-full flex items-center h-[38px] border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center w-full h-full">
        <div className={cn(
          "flex-1 h-full flex items-center justify-between pl-2 pr-1.5",
          homeWin && "bg-gradient-to-r from-stat-positive/20 to-stat-positive/5",
          awayWin && "bg-gradient-to-r from-stat-negative/12 to-stat-negative/5",
          isDraw && "bg-gradient-to-r from-stat-warn/12 to-stat-warn/5",
        )}>
          <TeamLogo teamName={m.home_team} size="xs" />
          <span className="font-black text-[11px] tracking-wider text-foreground">{getAbbr(m.home_team)}</span>
        </div>
        <div className="flex items-center h-full bg-foreground/90 px-2 gap-0 z-10">
          <span className="font-mono font-black text-sm text-background min-w-[1rem] text-center">{homeGoals}</span>
          <span className="mx-1 text-[9px] font-bold text-muted-foreground/60 uppercase">vs</span>
          <span className="font-mono font-black text-sm text-background min-w-[1rem] text-center">{awayGoals}</span>
        </div>
        <div className={cn(
          "flex-1 h-full flex items-center justify-between pr-2 pl-1.5",
          awayWin && "bg-gradient-to-l from-stat-positive/20 to-stat-positive/5",
          homeWin && "bg-gradient-to-l from-stat-negative/12 to-stat-negative/5",
          isDraw && "bg-gradient-to-l from-stat-warn/12 to-stat-warn/5",
        )}>
          <span className="font-black text-[11px] tracking-wider text-foreground">{getAbbr(m.away_team)}</span>
          <TeamLogo teamName={m.away_team} size="xs" />
        </div>
      </div>
    </button>
  );
};

/* ── Fixture Row (upcoming) ── */
const FixtureRow = ({ fixture: f, allMatches }: { fixture: Fixture; allMatches: Match[] }) => {
  const homeForm = getTeamFormQuick(f.home_team, allMatches, f.match_date, 5);
  const awayForm = getTeamFormQuick(f.away_team, allMatches, f.match_date, 5);

  return (
    <div className="w-full flex items-center h-[42px] border-b border-border last:border-b-0">
      <div className="flex items-center w-full h-full">
        <div className="flex-1 h-full flex items-center justify-between pl-2 pr-1.5">
          <div className="flex items-center gap-1">
            <TeamLogo teamName={f.home_team} size="xs" />
            <div className="flex flex-col items-start">
              <span className="font-black text-[11px] tracking-wider text-foreground">{getAbbr(f.home_team)}</span>
              {homeForm.length > 0 && <FormDots form={homeForm} />}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center h-full bg-primary/10 px-2.5 z-10">
          <span className="text-[9px] font-bold text-primary uppercase">vs</span>
          {f.match_time && <span className="text-[8px] text-muted-foreground font-mono">{f.match_time}</span>}
        </div>
        <div className="flex-1 h-full flex items-center justify-between pr-2 pl-1.5">
          <div className="flex items-center gap-1">
            <div className="flex flex-col items-end">
              <span className="font-black text-[11px] tracking-wider text-foreground">{getAbbr(f.away_team)}</span>
              {awayForm.length > 0 && <FormDots form={awayForm} />}
            </div>
            <TeamLogo teamName={f.away_team} size="xs" />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── League group ── */
const LeagueGroup = ({ league, children }: { league: string; children: React.ReactNode }) => (
  <div className="mb-1.5">
    <div className="flex items-center gap-1 px-1 mb-0.5">
      <LeagueLogo leagueName={league} size="xs" />
      <span className="text-[8px] uppercase tracking-[0.15em] text-primary font-bold">{league}</span>
    </div>
    <div className="border border-border bg-card rounded-sm overflow-hidden">
      {children}
    </div>
  </div>
);

/* ── Main Page ── */
const UpcomingGamesPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();
  const { data: fixtures = [] } = useFixtures();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showMoreUpcoming, setShowMoreUpcoming] = useState(false);
  const [showMoreResults, setShowMoreResults] = useState(false);

  const handleSelect = useCallback((m: Match) => setSelectedMatch(m), []);
  const handleClose = useCallback(() => setSelectedMatch(null), []);

  const today = new Date().toISOString().slice(0, 10);

  // Upcoming fixtures grouped by date → league
  const upcomingGrouped = useMemo(() => {
    const upcoming = fixtures.filter((f) => f.match_date >= today);
    const map = new Map<string, Fixture[]>();
    upcoming.forEach((f) => {
      const existing = map.get(f.match_date) || [];
      existing.push(f);
      map.set(f.match_date, existing);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [fixtures, today]);

  // Results grouped by date (most recent first, last 60)
  const resultsGrouped = useMemo(() => {
    const sorted = [...allMatches]
      .sort((a, b) => b.match_date.localeCompare(a.match_date))
      .slice(0, 60);
    const map = new Map<string, Match[]>();
    sorted.forEach((m) => {
      const existing = map.get(m.match_date) || [];
      existing.push(m);
      map.set(m.match_date, existing);
    });
    return Array.from(map.entries());
  }, [allMatches]);

  // Quick stats from recent results
  const stats = useMemo(() => {
    const recent = [...allMatches].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 60);
    const t = recent.length || 1;
    const totalG = recent.reduce((s, m) => s + (m.ft_home_goals ?? 0) + (m.ft_away_goals ?? 0), 0);
    const hw = recent.filter((m) => (m.ft_home_goals ?? 0) > (m.ft_away_goals ?? 0)).length;
    const dr = recent.filter((m) => (m.ft_home_goals ?? 0) === (m.ft_away_goals ?? 0)).length;
    return {
      avg: (totalG / t).toFixed(1),
      hw: ((hw / t) * 100).toFixed(0),
      dr: ((dr / t) * 100).toFixed(0),
      aw: ((((t - hw - dr)) / t) * 100).toFixed(0),
    };
  }, [allMatches]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Loading…</p>
      </div>
    );
  }

  const visibleUpcoming = showMoreUpcoming ? upcomingGrouped : upcomingGrouped.slice(0, 2);
  const visibleResults = showMoreResults ? resultsGrouped.slice(0, 8) : resultsGrouped.slice(0, 3);

  return (
    <div className="p-3 pb-20 max-w-lg mx-auto space-y-4">

      {/* ═══ UPCOMING SECTION ═══ */}
      <section>
        <div className="flex items-center gap-1.5 mb-2">
          <CalendarDays className="w-3.5 h-3.5 text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Upcoming</h2>
          {upcomingGrouped.length > 0 && (
            <span className="text-[9px] text-muted-foreground ml-auto font-mono">
              {fixtures.filter(f => f.match_date >= today).length} matches
            </span>
          )}
        </div>

        {upcomingGrouped.length === 0 ? (
          <div className="border border-border bg-card rounded-sm px-3 py-6 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">No upcoming fixtures</p>
            <p className="text-[8px] text-muted-foreground mt-1">Tap Sync to fetch the latest schedule</p>
          </div>
        ) : (
          <>
            {visibleUpcoming.map(([date, dayFixtures]) => {
              const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
                weekday: "short", day: "numeric", month: "short",
              });
              const byLeague = new Map<string, Fixture[]>();
              dayFixtures.forEach((f) => {
                const existing = byLeague.get(f.league_name) || [];
                existing.push(f);
                byLeague.set(f.league_name, existing);
              });
              return (
                <div key={date} className="mb-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-0.5">{formatted}</div>
                  {Array.from(byLeague.entries()).map(([league, lf]) => (
                    <LeagueGroup key={league} league={league}>
                      {lf.map((f) => <FixtureRow key={f.id} fixture={f} allMatches={allMatches} />)}
                    </LeagueGroup>
                  ))}
                </div>
              );
            })}
            {upcomingGrouped.length > 2 && (
              <button onClick={() => setShowMoreUpcoming(!showMoreUpcoming)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors">
                <ChevronDown className={cn("w-3 h-3 transition-transform", showMoreUpcoming && "rotate-180")} />
                {showMoreUpcoming ? "Show less" : `Show ${upcomingGrouped.length - 2} more`}
              </button>
            )}
          </>
        )}
      </section>

      {/* ═══ RESULTS SECTION ═══ */}
      <section>
        <div className="flex items-center gap-1.5 mb-2">
          <Trophy className="w-3.5 h-3.5 text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Results</h2>
        </div>

        {/* Stats strip */}
        <div className="flex items-center justify-between px-3 py-1.5 mb-2 border border-border rounded-md bg-card">
          <div className="text-center">
            <span className="font-mono text-[11px] font-bold text-stat-positive">{stats.hw}%</span>
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Home</p>
          </div>
          <div className="text-center">
            <span className="font-mono text-[11px] font-bold text-stat-warn">{stats.dr}%</span>
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Draw</p>
          </div>
          <div className="text-center">
            <span className="font-mono text-[11px] font-bold text-stat-negative">{stats.aw}%</span>
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Away</p>
          </div>
          <div className="text-center">
            <span className="font-mono text-[11px] font-bold text-primary">{stats.avg}</span>
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Avg Gls</p>
          </div>
        </div>

        {visibleResults.map(([date, matches]) => {
          const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
            weekday: "short", day: "numeric", month: "short",
          });
          const byLeague = new Map<string, Match[]>();
          matches.forEach((m) => {
            const existing = byLeague.get(m.league_name) || [];
            existing.push(m);
            byLeague.set(m.league_name, existing);
          });
          return (
            <div key={date} className="mb-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-0.5">{formatted}</div>
              {Array.from(byLeague.entries()).map(([league, lm]) => (
                <LeagueGroup key={league} league={league}>
                  {lm.map((m) => <MatchRow key={m.id} match={m} onSelect={handleSelect} />)}
                </LeagueGroup>
              ))}
            </div>
          );
        })}

        {resultsGrouped.length > 3 && (
          <button onClick={() => setShowMoreResults(!showMoreResults)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors">
            <ChevronDown className={cn("w-3 h-3 transition-transform", showMoreResults && "rotate-180")} />
            {showMoreResults ? "Show less" : "Show more results"}
          </button>
        )}
      </section>

      {selectedMatch && (
        <MatchDetailSheet match={selectedMatch} allMatches={allMatches} onClose={handleClose} />
      )}
    </div>
  );
};

export default UpcomingGamesPage;
