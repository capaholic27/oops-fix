import { useState, useMemo, useCallback } from "react";
import { useMatches, useFixtures, type Fixture } from "@/hooks/useMatches";
import { getTeamMatchView } from "@/lib/matchStats";
import { MatchDetailSheet } from "@/components/MatchDetailSheet";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { AdBanner } from "@/components/AdBanner";
import { cn } from "@/lib/utils";
import { Flame, CalendarDays } from "lucide-react";
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

/* ── tiny form dots ── */
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

/* ── Team abbreviation ── */
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
const MatchRow = ({ match: m, allMatches, onSelect }: { match: Match; allMatches: Match[]; onSelect: (m: Match) => void }) => {
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
        {/* Home */}
        <div className="flex-1 h-full flex items-center justify-between pl-2 pr-1.5">
          <div className="flex items-center gap-1">
            <TeamLogo teamName={f.home_team} size="xs" />
            <div className="flex flex-col items-start">
              <span className="font-black text-[11px] tracking-wider text-foreground">{getAbbr(f.home_team)}</span>
              {homeForm.length > 0 && <FormDots form={homeForm} />}
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center justify-center h-full bg-primary/10 px-2.5 z-10">
          <span className="text-[9px] font-bold text-primary uppercase">vs</span>
          {f.match_time && <span className="text-[8px] text-muted-foreground font-mono">{f.match_time}</span>}
        </div>

        {/* Away */}
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

/* ── Stat bar item ── */
const StatBar = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex-1 min-w-0 text-center">
    <span className={cn("font-mono text-xs font-bold", color || "text-foreground")}>{value}</span>
    <p className="text-[7px] uppercase tracking-widest text-muted-foreground font-semibold mt-0.5">{label}</p>
  </div>
);

/* ── Main Page ── */
const UpcomingGamesPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();
  const { data: fixtures = [] } = useFixtures();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const handleSelect = useCallback((m: Match) => setSelectedMatch(m), []);
  const handleClose = useCallback(() => setSelectedMatch(null), []);

  // Group upcoming fixtures by date → league
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

  // Group last 80 matches by date
  const grouped = useMemo(() => {
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

  // Summary stats
  const summaryStats = useMemo(() => {
    const recent = [...allMatches]
      .sort((a, b) => b.match_date.localeCompare(a.match_date))
      .slice(0, 80);

    const total = recent.length || 1;
    const totalGoals = recent.reduce((s, m) => s + (m.ft_home_goals ?? 0) + (m.ft_away_goals ?? 0), 0);
    const homeWins = recent.filter((m) => (m.ft_home_goals ?? 0) > (m.ft_away_goals ?? 0)).length;
    const awayWins = recent.filter((m) => (m.ft_away_goals ?? 0) > (m.ft_home_goals ?? 0)).length;
    const draws = recent.filter((m) => (m.ft_home_goals ?? 0) === (m.ft_away_goals ?? 0)).length;
    const over25 = recent.filter((m) => ((m.ft_home_goals ?? 0) + (m.ft_away_goals ?? 0)) > 2).length;
    const btts = recent.filter((m) => (m.ft_home_goals ?? 0) > 0 && (m.ft_away_goals ?? 0) > 0).length;
    const avgGoals = (totalGoals / total).toFixed(1);

    let topMatch: Match | null = null;
    let topGoals = 0;
    recent.forEach((m) => {
      const g = (m.ft_home_goals ?? 0) + (m.ft_away_goals ?? 0);
      if (g > topGoals) { topGoals = g; topMatch = m; }
    });

    return {
      total, avgGoals,
      homeWinPct: ((homeWins / total) * 100).toFixed(0),
      awayWinPct: ((awayWins / total) * 100).toFixed(0),
      drawPct: ((draws / total) * 100).toFixed(0),
      over25Pct: ((over25 / total) * 100).toFixed(0),
      bttsPct: ((btts / total) * 100).toFixed(0),
      topMatch, topGoals,
    };
  }, [allMatches]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-3 pb-20 max-w-lg mx-auto">

      {/* ─── UPCOMING FIXTURES ─── */}
      {upcomingGrouped.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 mb-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-bold">Upcoming</h2>
            <span className="ml-auto text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
              {fixtures.length} fixtures
            </span>
          </div>

          {upcomingGrouped.map(([date, dayFixtures]) => {
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
                {Array.from(byLeague.entries()).map(([league, leagueFixtures]) => (
                  <div key={league} className="mb-1.5">
                    <div className="flex items-center gap-1 px-1 mb-0.5">
                      <LeagueLogo leagueName={league} size="xs" />
                      <span className="text-[8px] uppercase tracking-[0.15em] text-primary font-bold">{league}</span>
                    </div>
                    <div className="border border-border bg-card rounded-sm overflow-hidden">
                      {leagueFixtures.map((f) => (
                        <FixtureRow key={f.id} fixture={f} allMatches={allMatches} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          <AdBanner variant="inline" />
        </>
      )}

      {/* ─── RESULTS ─── */}
      {grouped.length > 0 && (
        <>
          <h2 className="text-lg text-center mb-3">Results</h2>

          <div className="border border-border bg-card rounded-md overflow-hidden mb-3">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
              <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-bold">Last {summaryStats.total} Matches</span>
              <span className="font-mono text-[10px] font-bold text-primary">{summaryStats.avgGoals} avg goals</span>
            </div>
            <div className="flex divide-x divide-border py-2">
              <StatBar label="Home Win" value={`${summaryStats.homeWinPct}%`} color="text-stat-positive" />
              <StatBar label="Draw" value={`${summaryStats.drawPct}%`} color="text-stat-warn" />
              <StatBar label="Away Win" value={`${summaryStats.awayWinPct}%`} color="text-stat-negative" />
              <StatBar label="Over 2.5" value={`${summaryStats.over25Pct}%`} />
              <StatBar label="BTTS" value={`${summaryStats.bttsPct}%`} />
            </div>
          </div>

          {summaryStats.topMatch && (
            <button
              onClick={() => handleSelect(summaryStats.topMatch!)}
              className="w-full mb-3 border border-accent/30 bg-accent/5 rounded-md px-3 py-2 flex items-center gap-2 text-left hover:bg-accent/10 transition-colors"
            >
              <Flame className="w-4 h-4 text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase tracking-widest text-accent font-bold">Highest Scoring</p>
                <p className="text-[11px] font-semibold truncate">
                  {summaryStats.topMatch.home_team} {summaryStats.topMatch.ft_home_goals} – {summaryStats.topMatch.ft_away_goals} {summaryStats.topMatch.away_team}
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-accent">{summaryStats.topGoals} goals</span>
            </button>
          )}

          <AdBanner variant="inline" />

          {grouped.map(([date, matches], groupIdx) => {
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
              <div key={date}>
                <div className="mb-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-0.5">
                    {formatted}
                  </div>
                  {Array.from(byLeague.entries()).map(([league, leagueMatches]) => (
                    <div key={league} className="mb-1.5">
                      <div className="flex items-center gap-1 px-1 mb-0.5">
                        <LeagueLogo leagueName={league} size="xs" />
                        <span className="text-[8px] uppercase tracking-[0.15em] text-primary font-bold">{league}</span>
                      </div>
                      <div className="border border-border bg-card rounded-sm overflow-hidden">
                        {leagueMatches.map((m) => (
                          <MatchRow key={m.id} match={m} allMatches={allMatches} onSelect={handleSelect} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {groupIdx === 2 && <AdBanner variant="inline" />}
              </div>
            );
          })}
        </>
      )}

      <AdBanner variant="inline" />

      {selectedMatch && (
        <MatchDetailSheet match={selectedMatch} allMatches={allMatches} onClose={handleClose} />
      )}
    </div>
  );
};

export default UpcomingGamesPage;
