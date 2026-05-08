import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { useMatches, useFixtures, type Fixture } from "@/hooks/useMatches";
import { MatchDetailSheet } from "@/components/MatchDetailSheet";
import { FixturePredictSheet } from "@/components/FixturePredictSheet";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/matchStats";

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

type DayEntry = { date: string; matches: Match[]; fixtures: Fixture[] };

const MatchRow = ({ match: m, onSelect }: { match: Match; onSelect: (m: Match) => void }) => {
  const homeGoals = m.ft_home_goals ?? 0;
  const awayGoals = m.ft_away_goals ?? 0;
  const homeWin = homeGoals > awayGoals;
  const awayWin = awayGoals > homeGoals;

  return (
    <button
      onClick={() => onSelect(m)}
      className="w-full flex items-center h-12 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors px-3"
    >
      <div className="flex-1 flex items-center justify-end gap-2 pr-3">
        <span className={cn("text-sm font-medium", homeWin && "font-bold")}>{getAbbr(m.home_team)}</span>
        <TeamLogo teamName={m.home_team} size="xs" />
      </div>
      <div className="flex items-center gap-1 bg-foreground/5 rounded-lg px-3 py-1">
        <span className={cn("font-mono font-bold text-sm", homeWin && "text-foreground")}>{homeGoals}</span>
        <span className="text-xs text-muted-foreground">-</span>
        <span className={cn("font-mono font-bold text-sm", awayWin && "text-foreground")}>{awayGoals}</span>
      </div>
      <div className="flex-1 flex items-center justify-start gap-2 pl-3">
        <TeamLogo teamName={m.away_team} size="xs" />
        <span className={cn("text-sm font-medium", awayWin && "font-bold")}>{getAbbr(m.away_team)}</span>
      </div>
    </button>
  );
};

const FixtureRow = ({ fixture: f, onSelect }: { fixture: Fixture; onSelect: (f: Fixture) => void }) => (
  <button
    onClick={() => onSelect(f)}
    className="w-full flex items-center h-12 border-b border-border last:border-b-0 px-3 hover:bg-muted/50 transition-colors"
  >
    <div className="flex-1 flex items-center justify-end gap-2 pr-3">
      <span className="text-sm font-medium">{getAbbr(f.home_team)}</span>
      <TeamLogo teamName={f.home_team} size="xs" />
    </div>
    <div className="flex flex-col items-center justify-center px-3">
      <span className="text-xs font-semibold text-primary">vs</span>
      {f.match_time && <span className="text-[10px] text-muted-foreground font-mono">{f.match_time}</span>}
    </div>
    <div className="flex-1 flex items-center justify-start gap-2 pl-3">
      <TeamLogo teamName={f.away_team} size="xs" />
      <span className="text-sm font-medium">{getAbbr(f.away_team)}</span>
    </div>
  </button>
);

const LeagueGroup = ({ league, children }: { league: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <div className="flex items-center gap-2 px-1 mb-2">
      <LeagueLogo leagueName={league} size="xs" />
      <span className="text-xs font-semibold text-muted-foreground">{league}</span>
    </div>
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {children}
    </div>
  </div>
);

const UpcomingGamesPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();
  const { data: fixtures = [] } = useFixtures();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((m: Match) => setSelectedMatch(m), []);
  const handleClose = useCallback(() => setSelectedMatch(null), []);
  const handleSelectFixture = useCallback((f: Fixture) => setSelectedFixture(f), []);
  const handleCloseFixture = useCallback(() => setSelectedFixture(null), []);

  const today = useMemo(() => toDateStr(new Date()), []);

  const { days, todayIndex } = useMemo(() => {
    const dateSet = new Set<string>();
    allMatches.forEach(m => dateSet.add(m.match_date));
    fixtures.forEach(f => dateSet.add(f.match_date));
    // Always show today, even if no fixtures, so the bar starts there.
    dateSet.add(today);

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

    let todayIdx = days.findIndex(d => d.date === today);
    if (todayIdx === -1) {
      todayIdx = days.findIndex(d => d.date > today);
      if (todayIdx === -1) todayIdx = Math.max(0, days.length - 1);
    }

    return { days, todayIndex: todayIdx };
  }, [allMatches, fixtures, today]);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const activeIdx = selectedIdx ?? todayIndex;

  // Always default to today on mount/refresh; reset selection if route revisited.
  useEffect(() => {
    setSelectedIdx(null);
  }, [todayIndex]);

  useLayoutEffect(() => {
    if (!scrollRef.current || days.length === 0) return;
    const el = scrollRef.current.children[activeIdx] as HTMLElement | undefined;
    if (!el) return;
    const container = scrollRef.current;
    const target = el.offsetLeft - (container.clientWidth - el.clientWidth) / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: selectedIdx === null ? "auto" : "smooth" });
  }, [activeIdx, days.length, selectedIdx]);

  const currentDay = days[activeIdx];

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
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Date bar */}
      <div className="flex-shrink-0 border-b border-border bg-card">
        <div
          ref={scrollRef}
          className="flex overflow-x-auto gap-0"
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
                  "flex-shrink-0 flex flex-col items-center justify-center px-4 py-2.5 transition-all min-w-[78px] relative",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isToday
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isToday && !isActive && (
                  <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
                <span className="text-[11px] font-semibold whitespace-nowrap leading-tight">
                  {label}
                </span>
                <span className={cn("text-[10px] mt-0.5", isActive ? "opacity-90" : "opacity-60")}>
                  {matchCount} {matchCount === 1 ? "game" : "games"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Matches */}
      <div className="flex-1 overflow-y-auto p-4 pb-20 max-w-lg mx-auto w-full">
        {leagueGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">No matches on this date</p>
          </div>
        ) : (
          leagueGroups.map(([league, { matches, fixtures: fx }]) => (
            <LeagueGroup key={league} league={league}>
              {matches.map(m => (
                <MatchRow key={m.id} match={m} onSelect={handleSelect} />
              ))}
              {fx.map(f => (
                <FixtureRow key={f.id} fixture={f} onSelect={handleSelectFixture} />
              ))}
            </LeagueGroup>
          ))
        )}
      </div>

      {selectedMatch && (
        <MatchDetailSheet match={selectedMatch} allMatches={allMatches} onClose={handleClose} />
      )}
      {selectedFixture && (
        <FixturePredictSheet fixture={selectedFixture} onClose={handleCloseFixture} />
      )}
    </div>
  );
};

export default UpcomingGamesPage;
