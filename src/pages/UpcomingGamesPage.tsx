import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useMatches, useFixtures, type Fixture } from "@/hooks/useMatches";
import { getTeamMatchView } from "@/lib/matchStats";
import { MatchDetailSheet } from "@/components/MatchDetailSheet";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/matchStats";

/* ── helpers ── */
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

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string, today: string) {
  const diff = (new Date(dateStr + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000;
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/* ── Date bar item type ── */
type DayEntry = {
  date: string;
  matches: Match[];
  fixtures: Fixture[];
};

/* ── Match Row (result) ── */
const MatchRow = ({ match: m, onSelect }: { match: Match; onSelect: (m: Match) => void }) => {
  const homeGoals = m.ft_home_goals ?? 0;
  const awayGoals = m.ft_away_goals ?? 0;
  const homeWin = homeGoals > awayGoals;
  const awayWin = awayGoals > homeGoals;

  return (
    <button
      onClick={() => onSelect(m)}
      className="w-full flex items-center h-[44px] border-b-2 border-border last:border-b-0 hover:bg-muted/40 transition-colors"
    >
      {/* Home side */}
      <div className="flex-1 flex items-center justify-end gap-1.5 pr-2">
        <span className="font-bold text-[11px] tracking-wide text-foreground">{getAbbr(m.home_team)}</span>
        <TeamLogo teamName={m.home_team} size="xs" />
      </div>

      {/* Score block */}
      <div className="flex items-center gap-0 bg-foreground px-2.5 py-1 border-x-2 border-foreground">
        <span className={cn(
          "font-mono font-black text-sm min-w-[1rem] text-center",
          homeWin ? "text-primary-foreground" : "text-muted"
        )}>{homeGoals}</span>
        <span className="mx-1.5 text-[8px] font-bold text-muted uppercase">-</span>
        <span className={cn(
          "font-mono font-black text-sm min-w-[1rem] text-center",
          awayWin ? "text-primary-foreground" : "text-muted"
        )}>{awayGoals}</span>
      </div>

      {/* Away side */}
      <div className="flex-1 flex items-center justify-start gap-1.5 pl-2">
        <TeamLogo teamName={m.away_team} size="xs" />
        <span className="font-bold text-[11px] tracking-wide text-foreground">{getAbbr(m.away_team)}</span>
      </div>
    </button>
  );
};

/* ── Fixture Row (upcoming) ── */
const FixtureRow = ({ fixture: f }: { fixture: Fixture }) => (
  <div className="w-full flex items-center h-[44px] border-b-2 border-border last:border-b-0">
    {/* Home side */}
    <div className="flex-1 flex items-center justify-end gap-1.5 pr-2">
      <span className="font-bold text-[11px] tracking-wide text-foreground">{getAbbr(f.home_team)}</span>
      <TeamLogo teamName={f.home_team} size="xs" />
    </div>

    {/* VS block */}
    <div className="flex flex-col items-center justify-center bg-primary/15 px-3 py-1 border-x-2 border-border">
      <span className="text-[9px] font-black text-primary uppercase tracking-wider">vs</span>
      {f.match_time && <span className="text-[7px] text-muted-foreground font-mono">{f.match_time}</span>}
    </div>

    {/* Away side */}
    <div className="flex-1 flex items-center justify-start gap-1.5 pl-2">
      <TeamLogo teamName={f.away_team} size="xs" />
      <span className="font-bold text-[11px] tracking-wide text-foreground">{getAbbr(f.away_team)}</span>
    </div>
  </div>
);

/* ── League group ── */
const LeagueGroup = ({ league, children }: { league: string; children: React.ReactNode }) => (
  <div className="mb-3">
    <div className="flex items-center gap-1.5 px-1 mb-1">
      <LeagueLogo leagueName={league} size="xs" />
      <span className="text-[9px] uppercase tracking-[0.15em] text-primary font-black">{league}</span>
    </div>
    <div className="border-2 border-foreground bg-card shadow-[3px_3px_0_hsl(var(--foreground))] overflow-hidden">
      {children}
    </div>
  </div>
);

/* ── Main Page ── */
const UpcomingGamesPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();
  const { data: fixtures = [] } = useFixtures();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((m: Match) => setSelectedMatch(m), []);
  const handleClose = useCallback(() => setSelectedMatch(null), []);

  const today = useMemo(() => toDateStr(new Date()), []);

  // Build list of dates with data (past 14 days + future 30 days range)
  const { days, todayIndex } = useMemo(() => {
    // Collect all dates that have data
    const dateSet = new Set<string>();
    allMatches.forEach(m => dateSet.add(m.match_date));
    fixtures.forEach(f => dateSet.add(f.match_date));

    // Generate a range: 14 days back, 30 days forward
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 14);
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 30);

    const allDates: string[] = [];
    const d = new Date(rangeStart);
    while (d <= rangeEnd) {
      const ds = toDateStr(d);
      if (dateSet.has(ds)) allDates.push(ds);
      d.setDate(d.getDate() + 1);
    }

    // Build day entries
    const matchesByDate = new Map<string, Match[]>();
    allMatches.forEach(m => {
      if (!matchesByDate.has(m.match_date)) matchesByDate.set(m.match_date, []);
      matchesByDate.get(m.match_date)!.push(m);
    });
    const fixturesByDate = new Map<string, Fixture[]>();
    fixtures.forEach(f => {
      if (!fixturesByDate.has(f.match_date)) fixturesByDate.set(f.match_date, []);
      fixturesByDate.get(f.match_date)!.push(f);
    });

    const days: DayEntry[] = allDates.map(date => ({
      date,
      matches: matchesByDate.get(date) || [],
      fixtures: fixturesByDate.get(date) || [],
    }));

    // Find today or nearest date
    let todayIdx = days.findIndex(d => d.date === today);
    if (todayIdx === -1) {
      // Find nearest future date
      todayIdx = days.findIndex(d => d.date > today);
      if (todayIdx === -1) todayIdx = Math.max(0, days.length - 1);
    }

    return { days, todayIndex: todayIdx };
  }, [allMatches, fixtures, today]);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const activeIdx = selectedIdx ?? todayIndex;

  // Scroll the active date into view
  useEffect(() => {
    if (scrollRef.current && days.length > 0) {
      const el = scrollRef.current.children[activeIdx] as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: selectedIdx === null ? "auto" : "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [activeIdx, days.length, selectedIdx]);

  const currentDay = days[activeIdx];

  // Group current day's data by league
  const leagueGroups = useMemo(() => {
    if (!currentDay) return [];
    const map = new Map<string, { matches: Match[]; fixtures: Fixture[] }>();

    currentDay.matches.forEach(m => {
      if (!map.has(m.league_name)) map.set(m.league_name, { matches: [], fixtures: [] });
      map.get(m.league_name)!.matches.push(m);
    });
    currentDay.fixtures.forEach(f => {
      if (!map.has(f.league_name)) map.set(f.league_name, { matches: [], fixtures: [] });
      map.get(f.league_name)!.fixtures.push(f);
    });

    return Array.from(map.entries());
  }, [currentDay]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ═══ DATE BAR ═══ */}
      <div className="flex-shrink-0 border-b-2 border-foreground bg-card">
        <div
          ref={scrollRef}
          className="flex overflow-x-auto scrollbar-hide gap-0"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {days.map((day, i) => {
            const isToday = day.date === today;
            const isActive = i === activeIdx;
            const label = formatDateLabel(day.date, today);
            const matchCount = day.matches.length + day.fixtures.length;

            return (
              <button
                key={day.date}
                onClick={() => setSelectedIdx(i)}
                className={cn(
                  "flex-shrink-0 flex flex-col items-center px-3 py-2 transition-colors min-w-[72px] border-b-2",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30",
                  isToday && !isActive && "text-foreground"
                )}
              >
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-wider whitespace-nowrap",
                  isActive && "text-primary"
                )}>
                  {label}
                </span>
                <span className={cn(
                  "text-[8px] font-mono mt-0.5",
                  isActive ? "text-primary/70" : "text-muted-foreground/60"
                )}>
                  {matchCount} {matchCount === 1 ? "game" : "games"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ MATCHES FOR SELECTED DATE ═══ */}
      <div className="flex-1 overflow-y-auto p-3 pb-20 max-w-lg mx-auto w-full">
        {leagueGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-bold">No matches</p>
            <p className="text-[9px] text-muted-foreground mt-1">No games scheduled for this date</p>
          </div>
        ) : (
          leagueGroups.map(([league, { matches, fixtures: fx }]) => (
            <LeagueGroup key={league} league={league}>
              {matches.map(m => (
                <MatchRow key={m.id} match={m} onSelect={handleSelect} />
              ))}
              {fx.map(f => (
                <FixtureRow key={f.id} fixture={f} />
              ))}
            </LeagueGroup>
          ))
        )}
      </div>

      {selectedMatch && (
        <MatchDetailSheet match={selectedMatch} allMatches={allMatches} onClose={handleClose} />
      )}
    </div>
  );
};

export default UpcomingGamesPage;
