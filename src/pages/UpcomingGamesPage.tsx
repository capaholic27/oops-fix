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
      <span
        key={i}
        className={cn(
          "w-[5px] h-[5px] rounded-full",
          r === "W" && "bg-stat-positive",
          r === "D" && "bg-stat-warn",
          r === "L" && "bg-stat-negative"
        )}
      />
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
    "Osasuna": "OSA", "Getafe": "GET", "Mallorca": "MLL", "Rayo Vallecano": "RAY",
    "Alaves": "ALA", "Las Palmas": "LPA", "Vallecano": "VAL", "Valladolid": "VLD",
    "Leganes": "LEG", "Espanol": "ESP",
    "Bayern Munich": "BAY", "Dortmund": "BVB", "Leverkusen": "LEV",
    "RB Leipzig": "RBL", "Frankfurt": "SGE", "Freiburg": "SCF",
    "Wolfsburg": "WOB", "Stuttgart": "VFB", "Union Berlin": "UNB",
    "Werder Bremen": "SVW", "Augsburg": "FCA", "M'gladbach": "BMG",
    "Mainz": "M05", "Hoffenheim": "TSG", "Bochum": "BOC", "Heidenheim": "HDH",
    "St Pauli": "STP", "Holstein Kiel": "KIE",
    "Inter": "INT", "AC Milan": "MIL", "Napoli": "NAP", "Juventus": "JUV",
    "Atalanta": "ATA", "Roma": "ROM", "Lazio": "LAZ", "Fiorentina": "FIO",
    "Bologna": "BOL", "Torino": "TOR", "Monza": "MON", "Udinese": "UDI",
    "Empoli": "EMP", "Cagliari": "CAG", "Genoa": "GEN", "Parma": "PAR",
    "Verona": "VER", "Lecce": "LEC", "Como": "COM", "Venezia": "VEN",
    "Paris SG": "PSG", "Marseille": "OM", "Monaco": "MON", "Lyon": "OL",
    "Lille": "LIL", "Nice": "NIC", "Lens": "LEN", "Rennes": "REN",
    "Strasbourg": "STR", "Toulouse": "TOU", "Montpellier": "MTP",
    "Nantes": "NAN", "Le Havre": "HAC", "Reims": "REI", "Brest": "BRE",
    "Angers": "ANG", "Auxerre": "AUX", "St Etienne": "STE",
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

/* ── League group component ── */
const LeagueGroup = ({ league, children }: { league: string; children: React.ReactNode }) => (
  <div className="mb-2">
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
  const [activeTab, setActiveTab] = useState<"upcoming" | "results">("upcoming");
  const [visibleDates, setVisibleDates] = useState(3);

  const handleSelect = useCallback((m: Match) => setSelectedMatch(m), []);
  const handleClose = useCallback(() => setSelectedMatch(null), []);

  // Upcoming fixtures grouped by date → league
  const upcomingGrouped = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = fixtures.filter((f) => f.match_date >= today);
    const map = new Map<string, Fixture[]>();
    upcoming.forEach((f) => {
      const existing = map.get(f.match_date) || [];
      existing.push(f);
      map.set(f.match_date, existing);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [fixtures]);

  // Results grouped by date → league (last 80)
  const resultsGrouped = useMemo(() => {
    const sorted = [...allMatches]
      .sort((a, b) => b.match_date.localeCompare(a.match_date))
      .slice(0, 80);
    const map = new Map<string, Match[]>();
    sorted.forEach((m) => {
      const existing = map.get(m.match_date) || [];
      existing.push(m);
      map.set(m.match_date, existing);
    });
    return Array.from(map.entries());
  }, [allMatches]);

  // Quick stats
  const stats = useMemo(() => {
    const recent = [...allMatches].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 80);
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

  const hasUpcoming = upcomingGrouped.length > 0;

  // Auto-select results tab if no upcoming
  const tab = !hasUpcoming && activeTab === "upcoming" ? "results" : activeTab;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Loading…</p>
      </div>
    );
  }

  const visibleUpcoming = upcomingGrouped.slice(0, visibleDates);
  const visibleResults = resultsGrouped.slice(0, visibleDates);

  return (
    <div className="p-3 pb-20 max-w-lg mx-auto">
      {/* Tab switcher */}
      <div className="flex items-center gap-0 mb-3 border border-border rounded-lg overflow-hidden bg-muted/30">
        {hasUpcoming && (
          <button
            onClick={() => { setActiveTab("upcoming"); setVisibleDates(3); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
              tab === "upcoming" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Upcoming
            <span className="text-[9px] opacity-70">({fixtures.filter(f => f.match_date >= new Date().toISOString().slice(0, 10)).length})</span>
          </button>
        )}
        <button
          onClick={() => { setActiveTab("results"); setVisibleDates(3); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
            tab === "results" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Trophy className="w-3.5 h-3.5" />
          Results
        </button>
      </div>

      {/* Quick stats strip */}
      {tab === "results" && (
        <div className="flex items-center justify-between px-3 py-1.5 mb-3 border border-border rounded-md bg-card text-center">
          <div>
            <span className="font-mono text-xs font-bold text-stat-positive">{stats.hw}%</span>
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Home</p>
          </div>
          <div>
            <span className="font-mono text-xs font-bold text-stat-warn">{stats.dr}%</span>
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Draw</p>
          </div>
          <div>
            <span className="font-mono text-xs font-bold text-stat-negative">{stats.aw}%</span>
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Away</p>
          </div>
          <div>
            <span className="font-mono text-xs font-bold text-primary">{stats.avg}</span>
            <p className="text-[7px] uppercase tracking-widest text-muted-foreground">Avg Goals</p>
          </div>
        </div>
      )}

      {/* UPCOMING TAB */}
      {tab === "upcoming" && (
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
              <div key={date} className="mb-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-0.5">
                  {formatted}
                </div>
                {Array.from(byLeague.entries()).map(([league, lf]) => (
                  <LeagueGroup key={league} league={league}>
                    {lf.map((f) => (
                      <FixtureRow key={f.id} fixture={f} allMatches={allMatches} />
                    ))}
                  </LeagueGroup>
                ))}
              </div>
            );
          })}
          {visibleDates < upcomingGrouped.length && (
            <button
              onClick={() => setVisibleDates((v) => v + 3)}
              className="w-full flex items-center justify-center gap-1 py-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Show more dates
            </button>
          )}
          {upcomingGrouped.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">No upcoming fixtures available</p>
          )}
        </>
      )}

      {/* RESULTS TAB */}
      {tab === "results" && (
        <>
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
              <div key={date} className="mb-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-0.5">
                  {formatted}
                </div>
                {Array.from(byLeague.entries()).map(([league, lm]) => (
                  <LeagueGroup key={league} league={league}>
                    {lm.map((m) => (
                      <MatchRow key={m.id} match={m} onSelect={handleSelect} />
                    ))}
                  </LeagueGroup>
                ))}
              </div>
            );
          })}
          {visibleDates < resultsGrouped.length && (
            <button
              onClick={() => setVisibleDates((v) => v + 3)}
              className="w-full flex items-center justify-center gap-1 py-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Show more dates
            </button>
          )}
        </>
      )}

      {selectedMatch && (
        <MatchDetailSheet match={selectedMatch} allMatches={allMatches} onClose={handleClose} />
      )}
    </div>
  );
};

export default UpcomingGamesPage;
