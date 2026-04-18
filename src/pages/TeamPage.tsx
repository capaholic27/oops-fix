import { useState, useMemo, useCallback } from "react";
import { useMatches, useTeamMatches, useSyncData, useFixtures, useSyncFixtures, useSyncApiFootball } from "@/hooks/useMatches";
import { supabase } from "@/integrations/supabase/client";
import {
  getTeamMatchView,
  aggregateStats,
  getUniqueTeams,
  getUniqueLeagues,
  type TeamMatchView,
} from "@/lib/matchStats";
import { isTournamentLeague, normalizeTeamName, computeMentality } from "@/lib/teamNormalize";
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
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { useFavorites } from "@/hooks/useFavorites";
import {
  Target, Flag, AlertTriangle, Shield, TrendingUp, Crosshair,
  RefreshCw, ChevronLeft, ChevronRight, Sparkles, X, Loader2,
  Search, ArrowRight, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StatKey = "record" | "corners" | "cards" | "fouls" | "shots" | "over25" | "cleanSheets";

/* Top leagues for the box grid (domestic leagues only, no tournaments) */
const TOP_LEAGUES = [
  "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
  "Eredivisie", "Primeira Liga", "Championship", "Major League Soccer",
];

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
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {formLast5.map((r, i) => <FormBadge key={i} result={r} />)}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all",
            expanded
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[10px] text-muted-foreground font-medium">Last</span>
            {([10, 20, 30, 40, 50] as const).map((n) => (
              <button key={n} onClick={() => setRange(n)} className={cn(
                "px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md transition-colors",
                range === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}>{n}</button>
            ))}
          </div>
          <div className="flex gap-3 mb-2 text-xs font-semibold">
            <span className="text-stat-positive">{wins}W</span>
            <span className="text-stat-warn">{draws}D</span>
            <span className="text-stat-negative">{losses}L</span>
            <span className="text-muted-foreground ml-auto font-mono text-[10px]">{extendedForm.length} matches</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {extendedForm.map((r, i) => <FormBadge key={i} result={r} />)}
          </div>
        </div>
      )}
    </div>
  );
};

type FilterTab = "favorites" | "top" | "all";

/* ─── League Selection Screen (Box Logo Grid + All Leagues) ─── */
const LeagueSelector = ({
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
  const [filter, setFilter] = useState<FilterTab>("top");
  const [selectedLeague, setSelectedLeague] = useState<{ code: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [favSearch, setFavSearch] = useState("");
  const [showFavSearch, setShowFavSearch] = useState(false);
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

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

  // Top leagues that exist in our data
  const topLeagues = useMemo(() => {
    return TOP_LEAGUES
      .map(name => leagues.find(l => l.name === name))
      .filter(Boolean) as { code: string; name: string }[];
  }, [leagues]);

  // Favorite teams mapped to their primary (non-tournament) league only
  const favoriteTeams = useMemo(() => {
    const results: { team: string; league: { code: string; name: string } }[] = [];
    const seen = new Set<string>();
    // First pass: add from domestic leagues
    leagues.forEach((l) => {
      if (isTournamentLeague(l.name)) return;
      (teamsByLeague[l.code] || []).forEach((team) => {
        const norm = normalizeTeamName(team);
        if (isFavorite(team) && !seen.has(norm)) {
          seen.add(norm);
          results.push({ team, league: l });
        }
      });
    });
    // Second pass: add tournament-only teams that weren't found in domestic
    leagues.forEach((l) => {
      if (!isTournamentLeague(l.name)) return;
      (teamsByLeague[l.code] || []).forEach((team) => {
        const norm = normalizeTeamName(team);
        if (isFavorite(team) && !seen.has(norm)) {
          seen.add(norm);
          results.push({ team, league: l });
        }
      });
    });
    return results;
  }, [leagues, teamsByLeague, favorites]);

  // Team list for a selected league
  if (selectedLeague) {
    const teams = teamsByLeague[selectedLeague.code] || [];
    return (
      <div className="p-4 space-y-3 max-w-lg mx-auto pb-20">
        <button
          onClick={() => setSelectedLeague(null)}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3 mb-2">
          <LeagueLogo leagueName={selectedLeague.name} size="md" />
          <h2 className="text-lg font-bold">{selectedLeague.name}</h2>
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {teams.map((team) => (
            <div
              key={team}
              className="flex items-center border-b border-border last:border-b-0"
            >
              <button
                onClick={() => onSelectTeam(team, selectedLeague.code)}
                className="flex-1 text-left px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-3"
              >
                <TeamLogo teamName={team} size="sm" />
                {team}
              </button>
              <button
                onClick={() => toggleFavorite(team)}
                className="px-3 py-3 hover:bg-muted transition-colors"
              >
                <Star
                  className={cn(
                    "w-4 h-4 transition-colors",
                    isFavorite(team)
                      ? "fill-primary text-primary"
                      : "text-muted-foreground"
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-20">
      <h2 className="text-xl font-bold text-center">Select League</h2>

      {/* Filter Tabs: Favorites | Top Leagues (default) | All */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted">
        {([
          { id: "favorites" as FilterTab, label: "Favorites" },
          { id: "top" as FilterTab, label: "Top Leagues" },
          { id: "all" as FilterTab, label: "All" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all",
              filter === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.id === "favorites" && favorites.length > 0 && (
              <span className="ml-1 text-[10px] opacity-60">({favorites.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search teams or leagues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-4 text-sm rounded-xl border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      {/* Search results */}
      {searchResults ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden max-h-72 overflow-y-auto">
          {searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No teams found</p>
          )}
          {searchResults.map(({ team, league: l }) => (
            <div key={`${l.code}-${team}`} className="flex items-center border-b border-border last:border-b-0">
              <button
                onClick={() => onSelectTeam(team, l.code)}
                className="flex-1 text-left px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-3"
              >
                <TeamLogo teamName={team} size="sm" />
                <div>
                  <span className="font-medium">{team}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{l.name}</span>
                </div>
              </button>
              <button
                onClick={() => toggleFavorite(team)}
                className="px-3 py-3 hover:bg-muted transition-colors"
              >
                <Star className={cn("w-4 h-4 transition-colors", isFavorite(team) ? "fill-primary text-primary" : "text-muted-foreground")} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Favorites view */}
          {filter === "favorites" && (
            <>
              {/* Favorites as 3x3 box grid */}
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 9 }).map((_, i) => {
                  const fav = favoriteTeams[i];
                  if (fav) {
                    return (
                      <button
                        key={`fav-${fav.team}`}
                        onClick={() => onSelectTeam(fav.team, fav.league.code)}
                        className="relative flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all aspect-square justify-center"
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(fav.team); }}
                          className="absolute top-1.5 right-1.5 p-1"
                        >
                          <Star className="w-3 h-3 fill-primary text-primary" />
                        </button>
                        <TeamLogo teamName={fav.team} size="md" />
                        <span className="text-[10px] font-medium text-center leading-tight line-clamp-2">{fav.team}</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={`empty-${i}`}
                      onClick={() => setShowFavSearch(true)}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all aspect-square justify-center cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/25 flex items-center justify-center">
                        <span className="text-muted-foreground/40 text-lg leading-none">+</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/40">Add team</span>
                    </button>
                  );
                })}
              </div>

              {/* Dialog popup to add favorites */}
              <Dialog open={showFavSearch} onOpenChange={(open) => { setShowFavSearch(open); if (!open) setFavSearch(""); }}>
                <DialogContent className="max-w-sm mx-auto p-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-center">Add Favorite Team</h3>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search team to add..."
                        value={favSearch}
                        onChange={(e) => setFavSearch(e.target.value)}
                        className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    {favSearch.trim() ? (() => {
                      const q = favSearch.toLowerCase();
                      const results: { team: string; league: { code: string; name: string } }[] = [];
                      leagues.forEach((l) => {
                        (teamsByLeague[l.code] || []).forEach((team) => {
                          if (team.toLowerCase().includes(q) && !isFavorite(team)) {
                            results.push({ team, league: l });
                          }
                        });
                      });
                      if (results.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">No teams found</p>;
                      return (
                        <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                          {results.slice(0, 15).map(({ team, league: l }) => (
                            <button
                              key={`${l.code}-${team}`}
                              onClick={() => { toggleFavorite(team); setFavSearch(""); setShowFavSearch(false); }}
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-2 border-b border-border last:border-b-0"
                            >
                              <TeamLogo teamName={team} size="sm" />
                              <span className="font-medium">{team}</span>
                              <span className="text-muted-foreground text-xs ml-auto">{l.name}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })() : (
                      <p className="text-xs text-muted-foreground text-center py-4">Start typing to search teams</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}

          {/* Top Leagues grid */}
          {filter === "top" && (
            <div className="grid grid-cols-3 gap-3">
              {topLeagues.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setSelectedLeague(l)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all aspect-square justify-center"
                >
                  <LeagueLogo leagueName={l.name} size="md" />
                  <span className="text-[11px] font-medium text-center leading-tight">{l.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* All leagues list */}
          {filter === "all" && (
            <div className="space-y-2">
              {leagues.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setSelectedLeague(l)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                >
                  <LeagueLogo leagueName={l.name} size="sm" />
                  <span className="text-sm font-medium flex-1">{l.name}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {/* Generate Prediction button */}
          <button
            onClick={onOpenPredict}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Generate Prediction
          </button>
        </>
      )}
    </div>
  );
};

/* ─── Player Leaderboard (Top 5 per category) ─── */
export type PlayerHighlightCategory = "scorer" | "assists" | "shots" | "fouls" | "foulsDrawn" | "cards";
type RankedPlayer = { name: string; value: number };

// Mock player leaders data keyed by team name — top 5 ranked
const PLAYER_LEADERBOARD: Record<string, Record<PlayerHighlightCategory, RankedPlayer[]>> = {
  "Arsenal": {
    scorer: [{ name: "B. Saka", value: 14 }, { name: "K. Havertz", value: 13 }, { name: "G. Martinelli", value: 9 }, { name: "M. Ødegaard", value: 8 }, { name: "L. Trossard", value: 6 }],
    assists: [{ name: "M. Ødegaard", value: 11 }, { name: "B. Saka", value: 9 }, { name: "G. Martinelli", value: 6 }, { name: "K. Havertz", value: 5 }, { name: "D. Rice", value: 4 }],
    shots: [{ name: "K. Havertz", value: 84 }, { name: "B. Saka", value: 72 }, { name: "G. Martinelli", value: 65 }, { name: "M. Ødegaard", value: 56 }, { name: "D. Rice", value: 38 }],
    fouls: [{ name: "D. Rice", value: 32 }, { name: "J. Timber", value: 28 }, { name: "W. Saliba", value: 22 }, { name: "K. Havertz", value: 19 }, { name: "M. Ødegaard", value: 14 }],
    foulsDrawn: [{ name: "B. Saka", value: 48 }, { name: "M. Ødegaard", value: 36 }, { name: "G. Martinelli", value: 30 }, { name: "K. Havertz", value: 24 }, { name: "L. Trossard", value: 18 }],
    cards: [{ name: "D. Rice", value: 7 }, { name: "G. Martinelli", value: 5 }, { name: "J. Timber", value: 5 }, { name: "W. Saliba", value: 4 }, { name: "B. Saka", value: 3 }],
  },
  "Liverpool": {
    scorer: [{ name: "M. Salah", value: 19 }, { name: "D. Núñez", value: 14 }, { name: "L. Díaz", value: 11 }, { name: "C. Gakpo", value: 8 }, { name: "A. Mac Allister", value: 5 }],
    assists: [{ name: "M. Salah", value: 13 }, { name: "C. Gakpo", value: 9 }, { name: "A. Mac Allister", value: 8 }, { name: "L. Díaz", value: 7 }, { name: "D. Núñez", value: 6 }],
    shots: [{ name: "D. Núñez", value: 92 }, { name: "M. Salah", value: 89 }, { name: "L. Díaz", value: 68 }, { name: "C. Gakpo", value: 58 }, { name: "A. Mac Allister", value: 42 }],
    fouls: [{ name: "A. Mac Allister", value: 35 }, { name: "V. van Dijk", value: 24 }, { name: "C. Jones", value: 21 }, { name: "D. Núñez", value: 18 }, { name: "T. Alexander-Arnold", value: 16 }],
    foulsDrawn: [{ name: "M. Salah", value: 52 }, { name: "L. Díaz", value: 41 }, { name: "D. Núñez", value: 33 }, { name: "C. Gakpo", value: 26 }, { name: "A. Mac Allister", value: 19 }],
    cards: [{ name: "A. Mac Allister", value: 8 }, { name: "C. Jones", value: 6 }, { name: "V. van Dijk", value: 5 }, { name: "D. Núñez", value: 4 }, { name: "L. Díaz", value: 3 }],
  },
  "Manchester City": {
    scorer: [{ name: "E. Haaland", value: 22 }, { name: "P. Foden", value: 12 }, { name: "B. Silva", value: 7 }, { name: "K. De Bruyne", value: 6 }, { name: "Rodri", value: 5 }],
    assists: [{ name: "K. De Bruyne", value: 10 }, { name: "P. Foden", value: 8 }, { name: "B. Silva", value: 7 }, { name: "E. Haaland", value: 5 }, { name: "Rodri", value: 4 }],
    shots: [{ name: "E. Haaland", value: 95 }, { name: "P. Foden", value: 70 }, { name: "K. De Bruyne", value: 52 }, { name: "B. Silva", value: 48 }, { name: "Rodri", value: 40 }],
    fouls: [{ name: "Rodri", value: 38 }, { name: "B. Silva", value: 22 }, { name: "K. Walker", value: 18 }, { name: "P. Foden", value: 14 }, { name: "E. Haaland", value: 12 }],
    foulsDrawn: [{ name: "P. Foden", value: 44 }, { name: "K. De Bruyne", value: 36 }, { name: "B. Silva", value: 33 }, { name: "E. Haaland", value: 28 }, { name: "Rodri", value: 16 }],
    cards: [{ name: "Rodri", value: 9 }, { name: "K. Walker", value: 5 }, { name: "B. Silva", value: 4 }, { name: "E. Haaland", value: 3 }, { name: "P. Foden", value: 2 }],
  },
  "Real Madrid": {
    scorer: [{ name: "Vinícius Jr", value: 15 }, { name: "J. Bellingham", value: 12 }, { name: "Rodrygo", value: 9 }, { name: "F. Valverde", value: 6 }, { name: "L. Modrić", value: 3 }],
    assists: [{ name: "J. Bellingham", value: 9 }, { name: "Vinícius Jr", value: 9 }, { name: "L. Modrić", value: 7 }, { name: "Rodrygo", value: 6 }, { name: "F. Valverde", value: 5 }],
    shots: [{ name: "Vinícius Jr", value: 82 }, { name: "J. Bellingham", value: 68 }, { name: "Rodrygo", value: 58 }, { name: "F. Valverde", value: 50 }, { name: "L. Modrić", value: 32 }],
    fouls: [{ name: "F. Valverde", value: 30 }, { name: "Camavinga", value: 26 }, { name: "Tchouaméni", value: 24 }, { name: "J. Bellingham", value: 18 }, { name: "Vinícius Jr", value: 14 }],
    foulsDrawn: [{ name: "Vinícius Jr", value: 58 }, { name: "Rodrygo", value: 38 }, { name: "J. Bellingham", value: 30 }, { name: "L. Modrić", value: 22 }, { name: "F. Valverde", value: 18 }],
    cards: [{ name: "Camavinga", value: 8 }, { name: "F. Valverde", value: 6 }, { name: "Tchouaméni", value: 5 }, { name: "Vinícius Jr", value: 5 }, { name: "J. Bellingham", value: 4 }],
  },
  "Barcelona": {
    scorer: [{ name: "R. Lewandowski", value: 18 }, { name: "Raphinha", value: 11 }, { name: "L. Yamal", value: 7 }, { name: "Pedri", value: 4 }, { name: "F. de Jong", value: 3 }],
    assists: [{ name: "L. Yamal", value: 12 }, { name: "Pedri", value: 8 }, { name: "Raphinha", value: 7 }, { name: "F. de Jong", value: 6 }, { name: "R. Lewandowski", value: 4 }],
    shots: [{ name: "R. Lewandowski", value: 88 }, { name: "Raphinha", value: 64 }, { name: "L. Yamal", value: 60 }, { name: "Pedri", value: 38 }, { name: "F. de Jong", value: 30 }],
    fouls: [{ name: "F. de Jong", value: 28 }, { name: "Pedri", value: 22 }, { name: "R. Araújo", value: 20 }, { name: "Raphinha", value: 16 }, { name: "L. Yamal", value: 12 }],
    foulsDrawn: [{ name: "L. Yamal", value: 46 }, { name: "Pedri", value: 38 }, { name: "Raphinha", value: 32 }, { name: "R. Lewandowski", value: 24 }, { name: "F. de Jong", value: 18 }],
    cards: [{ name: "F. de Jong", value: 7 }, { name: "R. Araújo", value: 6 }, { name: "Pedri", value: 4 }, { name: "Raphinha", value: 4 }, { name: "L. Yamal", value: 2 }],
  },
};

/* Generate a generic 5-player leaderboard for teams not in the mock map */
function generateFallbackLeaderboard(teamName: string): Record<PlayerHighlightCategory, RankedPlayer[]> {
  const make = (suffix: string, base: number, step: number) => [
    { name: `${teamName} #9`, value: base },
    { name: `${teamName} #10`, value: Math.max(1, base - step) },
    { name: `${teamName} #7`, value: Math.max(1, base - step * 2) },
    { name: `${teamName} #11`, value: Math.max(1, base - step * 3) },
    { name: `${teamName} #6`, value: Math.max(1, base - step * 4) },
  ];
  return {
    scorer: make("st", 12, 2),
    assists: make("am", 9, 1),
    shots: make("sh", 64, 8),
    fouls: make("fc", 22, 3),
    foulsDrawn: make("fd", 32, 4),
    cards: make("cd", 6, 1),
  };
}

export const PlayerHighlights = ({ teamName }: { teamName: string }) => {
  const [active, setActive] = useState<PlayerHighlightCategory>("scorer");
  const leaderboard = PLAYER_LEADERBOARD[teamName] ?? generateFallbackLeaderboard(teamName);

  const categories: { id: PlayerHighlightCategory; label: string; icon: React.ReactNode; unit: string }[] = [
    { id: "scorer", label: "Goals", icon: <Target className="w-3 h-3" />, unit: "goals" },
    { id: "assists", label: "Assists", icon: <ArrowRight className="w-3 h-3" />, unit: "assists" },
    { id: "shots", label: "Shots", icon: <Crosshair className="w-3 h-3" />, unit: "shots" },
    { id: "fouls", label: "Fouls", icon: <Shield className="w-3 h-3" />, unit: "fouls" },
    { id: "foulsDrawn", label: "Drawn", icon: <Shield className="w-3 h-3" />, unit: "drawn" },
    { id: "cards", label: "Cards", icon: <AlertTriangle className="w-3 h-3" />, unit: "cards" },
  ];

  const players = leaderboard?.[active] ?? [];
  const activeCat = categories.find((c) => c.id === active)!;
  const maxVal = players[0]?.value ?? 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Player Leaderboard</span>
        <span className="text-[9px] font-mono text-muted-foreground">TOP 5</span>
      </div>
      <div className="flex gap-1.5 mb-3">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActive(cat.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all flex-1 justify-center",
              active === cat.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {cat.icon}
            <span className="truncate">{cat.label}</span>
          </button>
        ))}
      </div>
      {players.length > 0 ? (
        <div className="space-y-1.5 animate-fade-up">
          {players.map((p, i) => {
            const pct = (p.value / maxVal) * 100;
            return (
              <div key={p.name} className="flex items-center gap-2">
                <span className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-mono font-bold flex-shrink-0",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold truncate">{p.name}</span>
                    <span className="font-mono text-xs font-bold text-foreground flex-shrink-0">
                      {p.value} <span className="text-muted-foreground font-normal text-[10px]">{activeCat.unit}</span>
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", i === 0 ? "bg-primary" : "bg-foreground/40")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">No player data available</p>
      )}
    </div>
  );
};


type StatsProps = {
  selectedTeam: string;
  leagueCode: string;
  pastN: number;
  setPastN: (n: number) => void;
  onBack: () => void;
  onOpenPredict: () => void;
  allMatches: any[];
  onSwitchTeam: (team: string) => void;
};

const StatsDashboard = ({ selectedTeam, leagueCode, pastN, setPastN, onBack, onOpenPredict, allMatches: allMatchesProp, onSwitchTeam }: StatsProps) => {
  const [openStat, setOpenStat] = useState<StatKey | null>(null);
  const { toggleFavorite, isFavorite } = useFavorites();
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [manualOpponent, setManualOpponent] = useState<string | null>(null);
  const { data: allMatches = [] } = useMatches(leagueCode || undefined);
  const { data: teamMatches = [] } = useTeamMatches(selectedTeam, leagueCode || undefined);
  const { data: fixtures = [] } = useFixtures(selectedTeam);
  const { data: allFixtures = [] } = useFixtures();
  const leagues = useMemo(() => getUniqueLeagues(allMatches), [allMatches]);
  const currentLeagueName = leagues.find((l) => l.code === leagueCode)?.name ?? "All Leagues";

  const nextFixture = useMemo(() => {
    if (selectedFixtureId) {
      return fixtures.find((f) => f.id === selectedFixtureId) ?? null;
    }
    if (fixtures.length === 0) return null;
    const today = new Date().toISOString().split("T")[0];
    return fixtures.find((f) => f.match_date >= today) ?? null;
  }, [fixtures, selectedFixtureId]);

  const nextOpponentName = useMemo(() => {
    if (manualOpponent) return manualOpponent;
    if (!nextFixture) return undefined;
    return nextFixture.home_team === selectedTeam ? nextFixture.away_team : nextFixture.home_team;
  }, [nextFixture, selectedTeam, manualOpponent]);

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
        <p className="text-sm text-muted-foreground">No match data for {selectedTeam}</p>
        <button onClick={onBack} className="mt-3 text-sm text-primary font-medium hover:underline">← Pick another team</button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-20">
      {/* Back + Past N controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <TeamSwitcher
            currentTeam={selectedTeam}
            allTeams={getUniqueTeams(allMatchesProp)}
            onSelect={onSwitchTeam}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Last</span>
          <select
            value={pastN}
            onChange={(e) => setPastN(Number(e.target.value))}
            className="h-7 px-2 text-xs font-mono font-medium rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Team Banner */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <TeamLogo teamName={selectedTeam} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold leading-none">{selectedTeam}</h2>
                <button onClick={() => toggleFavorite(selectedTeam)} className="p-0.5">
                  <Star className={cn("w-4 h-4 transition-colors", isFavorite(selectedTeam) ? "fill-primary text-primary" : "text-muted-foreground")} />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <LeagueLogo leagueName={currentLeagueName} size="xs" />
                <p className="text-xs text-muted-foreground font-medium">
                  {currentLeagueName} · {stats.matchesPlayed} matches
                </p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono text-2xl font-bold text-primary leading-none">{winRate}%</span>
            <p className="text-[10px] text-muted-foreground font-medium">Win Rate</p>
          </div>
        </div>
        <div className="flex items-start justify-between mt-2 gap-2">
          <div className="flex-1 min-w-0">
            <FormStrip views={allTeamViews} formLast5={stats.formLast5} />
          </div>
          <button
            onClick={onOpenPredict}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            Predict
          </button>
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <WinProbabilityGauge
          probability={stats.winProbability}
          teamName={selectedTeam}
          allTeams={getUniqueTeams(allMatches)}
          getOpponentWinProbability={(opp) => {
            const oppViews = allMatches
              .map((m) => getTeamMatchView(m, opp))
              .filter((v): v is TeamMatchView => v !== null)
              .slice(-pastN);
            if (oppViews.length === 0) return null;
            return aggregateStats(oppViews).winProbability;
          }}
        />
        <StatCard label="Record" value={`${stats.wins}-${stats.draws}-${stats.losses}`} icon={<TrendingUp className="w-4 h-4" />} trend={parseFloat(winRate) > 50 ? "positive" : "neutral"} subtitle={`${stats.goalsFor} GF · ${stats.goalsAgainst} GA`} delay={150} onClick={() => setOpenStat("record")} />
        <StatCard label="Corners" value={stats.avgCornersFor.toFixed(1)} icon={<Flag className="w-4 h-4" />} trend="neutral" subtitle={`vs ${stats.avgCornersAgainst.toFixed(1)} · Total ${(stats.avgCornersFor + stats.avgCornersAgainst).toFixed(1)}`} delay={200} onClick={() => setOpenStat("corners")} />
        <StatCard label="Cards" value={stats.avgYellowCards.toFixed(1)} icon={<AlertTriangle className="w-4 h-4" />} trend="warn" subtitle={`🟡 Y · ${stats.avgRedCards.toFixed(2)} 🔴 R`} delay={250} onClick={() => setOpenStat("cards")} />
        <StatCard label="Fouls" value={stats.avgFoulsCommitted.toFixed(1)} icon={<Shield className="w-4 h-4" />} trend="negative" subtitle={`Drawn: ${stats.avgFoulsDrawn.toFixed(1)}`} delay={300} onClick={() => setOpenStat("fouls")} />
        <StatCard label="Shots" value={stats.avgShotsFor.toFixed(1)} icon={<Crosshair className="w-4 h-4" />} trend="positive" subtitle={`SOT: ${stats.avgShotsOnTargetFor.toFixed(1)} · vs ${stats.avgShotsAgainst.toFixed(1)}`} delay={350} onClick={() => setOpenStat("shots")} />
        <StatCard label="Over 2.5" value={`${stats.over25Percentage.toFixed(0)}%`} icon={<Target className="w-4 h-4" />} trend={stats.over25Percentage > 60 ? "positive" : "neutral"} subtitle={`O1.5: ${stats.over15Percentage.toFixed(0)}% · BTTS: ${stats.bttsPercentage.toFixed(0)}%`} delay={400} onClick={() => setOpenStat("over25")} />
        <StatCard label="Clean Sheets" value={stats.cleanSheets} icon={<Shield className="w-4 h-4" />} trend="positive" subtitle={`${(stats.goalsAgainst / stats.matchesPlayed).toFixed(2)} GA/match`} delay={450} onClick={() => setOpenStat("cleanSheets")} />
        {(() => {
          const mentality = computeMentality(allTeamViews.map(v => v.result));
          return (
            <div className="stat-card opacity-0 animate-fade-up col-span-2" style={{ animationDelay: "475ms" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="stat-label">Mentality</span>
                <span className="text-lg">{mentality.emoji}</span>
              </div>
              <span className="font-mono text-lg font-bold text-foreground leading-none">{mentality.label}</span>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{mentality.description}</p>
              <div className="mt-2">
                <div className="probability-bar">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${mentality.intensity}%`,
                      background: mentality.intensity > 75 ? 'hsl(var(--stat-negative))' : mentality.intensity > 50 ? 'hsl(var(--stat-warn))' : 'hsl(var(--primary))',
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium mt-0.5 block">Intensity: {mentality.intensity}%</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Player Highlights */}
      <PlayerHighlights teamName={selectedTeam} />

      <AdBanner variant="inline" />

      {/* Tactical + Efficiency */}
      <div className="grid grid-cols-1 gap-3">
        <PredictedTacticalProfile
          stats={stats}
          teamName={selectedTeam}
          views={teamViews}
          opponentStats={nextOpponentStats}
          opponentName={nextOpponentName}
          nextFixture={nextFixture ? { date: nextFixture.match_date, isHome: nextFixture.home_team === selectedTeam } : undefined}
          allFixtures={allFixtures}
          allMatches={allMatches}
          onFixtureChange={(f) => {
            setManualOpponent(null);
            setSelectedFixtureId(f.id);
          }}
          onOpponentSelect={(opp) => {
            setSelectedFixtureId(null);
            setManualOpponent(opp);
          }}
        />
      </div>

      <UpcomingFixtures
        teamName={selectedTeam}
        allMatches={allMatches}
        onSelectFixture={(home, away) => {
          onOpenPredict();
        }}
      />

      <MomentumChart views={teamViews} teamName={selectedTeam} />
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
  const [matchContext, setMatchContext] = useState("");
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

  const dcResult = useMemo<PredictionResult | null>(() => {
    if (!statsA || !statsB || !selectedTeamA || !selectedTeamB) return null;
    const leagueAvg = computeLeagueAvgGoals(allMatches);
    const getRecentStats = (teamName: string) => {
      const views = allMatches
        .filter((m: any) => m.home_team === teamName || m.away_team === teamName)
        .map((m: any) => getTeamMatchView(m, teamName))
        .filter((v: any): v is TeamMatchView => v !== null)
        .slice(-5);
      if (views.length === 0) return { scored: 0, conceded: 0, n: 0 };
      return { scored: views.reduce((s, v) => s + v.goalsFor, 0), conceded: views.reduce((s, v) => s + v.goalsAgainst, 0), n: views.length };
    };
    const recentA = getRecentStats(selectedTeamA);
    const recentB = getRecentStats(selectedTeamB);
    const homeInput: TeamInput = { goalsScored: statsA.goalsFor, goalsConceded: statsA.goalsAgainst, matchesPlayed: statsA.matchesPlayed, recentGoalsScored: recentA.scored, recentGoalsConceded: recentA.conceded, recentMatches: recentA.n };
    const awayInput: TeamInput = { goalsScored: statsB.goalsFor, goalsConceded: statsB.goalsAgainst, matchesPlayed: statsB.matchesPlayed, recentGoalsScored: recentB.scored, recentGoalsConceded: recentB.conceded, recentMatches: recentB.n };
    return predictMatch(homeInput, awayInput, leagueAvg);
  }, [statsA, statsB, selectedTeamA, selectedTeamB, allMatches]);

  const handleReset = () => {
    setPrediction(null);
    setSelectedTeamA("");
    setSelectedTeamB("");
    setTeamSearch("");
    setOpponentSearch("");
    setMatchContext("");
    setShowAI(false);
  };

  const handleRunPredict = useCallback(async () => {
    if (!selectedTeamA || !statsA) return;
    setPredicting(true);
    setPrediction(null);
    try {
      const body: any = { teamName: selectedTeamA, stats: statsA, recentForm: statsA.formLast5 };
      if (selectedTeamB && statsB) {
        body.upcomingOpponent = selectedTeamB;
        body.opponentStats = statsB;
        body.opponentForm = statsB.formLast5;
      }
      if (matchContext.trim()) {
        body.matchContext = matchContext.trim();
      }
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predict-match`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }, body: JSON.stringify(body) }
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

  const ComparisonRow = ({ label, a, b, better }: { label: string; a: string; b: string; better: "a" | "b" | "none" }) => (
    <div className="flex items-center py-2 px-3">
      <span className={cn("font-mono text-xs font-semibold w-16 text-right", better === "a" && "text-stat-positive")}>{a}</span>
      <span className="flex-1 text-center text-[10px] text-muted-foreground font-medium">{label}</span>
      <span className={cn("font-mono text-xs font-semibold w-16", better === "b" && "text-stat-positive")}>{b}</span>
    </div>
  );

  const hasBothTeams = selectedTeamA && statsA && selectedTeamB && statsB;

  const ProbBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <span className="font-mono text-xs font-semibold">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed left-[50%] translate-x-[-50%] translate-y-0 top-[max(0.5rem,env(safe-area-inset-top))] bottom-[max(5rem,env(safe-area-inset-bottom))] w-[calc(100vw-1rem)] max-w-md flex flex-col p-0 gap-0 rounded-2xl border border-border shadow-xl [&>button:last-child]:hidden overflow-hidden sm:top-[50%] sm:bottom-auto sm:max-h-[92vh] sm:translate-y-[-50%]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Match Prediction</span>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1.5 hover:bg-muted transition-colors rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
          {!showAI && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Home Team</label>
                {selectedTeamA ? (
                  <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TeamLogo teamName={selectedTeamA} size="sm" />
                      <p className="text-sm font-semibold">{selectedTeamA}</p>
                    </div>
                    <button onClick={() => setSelectedTeamA("")} className="text-xs text-primary font-medium hover:underline">Change</button>
                  </div>
                ) : (
                  <>
                    <input type="text" placeholder="Search team…" value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" autoFocus />
                    <div className="max-h-32 overflow-y-auto rounded-xl border border-border bg-card mt-1.5">
                      {allTeams.filter((t) => !teamSearch || t.toLowerCase().includes(teamSearch.toLowerCase())).slice(0, 15).map((team) => (
                        <button key={team} onClick={() => { setSelectedTeamA(team); setTeamSearch(""); }}
                          className="w-full text-left px-3 py-2 text-sm border-b border-border last:border-b-0 hover:bg-muted flex items-center gap-2">
                          <TeamLogo teamName={team} size="xs" />{team}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {selectedTeamA && (
                <>
                  <div className="flex items-center justify-center py-1">
                    <span className="text-xs font-bold text-muted-foreground">VS</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Away Team</label>
                    {selectedTeamB ? (
                      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <TeamLogo teamName={selectedTeamB} size="sm" />
                          <p className="text-sm font-semibold">{selectedTeamB}</p>
                        </div>
                        <button onClick={() => setSelectedTeamB("")} className="text-xs text-primary font-medium hover:underline">Change</button>
                      </div>
                    ) : (
                      <>
                        <input type="text" placeholder="Search opponent…" value={opponentSearch} onChange={(e) => setOpponentSearch(e.target.value)}
                          className="w-full h-9 px-3 text-sm rounded-xl border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        <div className="max-h-28 overflow-y-auto rounded-xl border border-border bg-card mt-1.5">
                          {allTeams.filter((t) => t !== selectedTeamA && (!opponentSearch || t.toLowerCase().includes(opponentSearch.toLowerCase()))).slice(0, 12).map((team) => (
                            <button key={team} onClick={() => { setSelectedTeamB(team); setOpponentSearch(""); }}
                              className="w-full text-left px-3 py-2 text-sm border-b border-border last:border-b-0 hover:bg-muted flex items-center gap-2">
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

          {/* Match context input */}
          {selectedTeamA && selectedTeamB && !showAI && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Match Context (optional)</label>
              <textarea
                value={matchContext}
                onChange={(e) => setMatchContext(e.target.value)}
                placeholder="e.g. Derby match, Champions League final, key player injured, must-win game, 2nd leg aggregate…"
                className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none min-h-[60px]"
                maxLength={300}
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right">{matchContext.length}/300</p>
            </div>
          )}

          {dcResult && hasBothTeams && !showAI && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-primary/5 border-b border-border">
                  <span className="text-xs font-semibold text-primary">📊 Match Probabilities</span>
                </div>
                <div className="p-3 space-y-2">
                  <ProbBar label={selectedTeamA} value={dcResult.homeWin} color="bg-stat-positive" />
                  <ProbBar label="Draw" value={dcResult.draw} color="bg-stat-warn" />
                  <ProbBar label={selectedTeamB} value={dcResult.awayWin} color="bg-stat-negative" />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground">⚽ Expected Goals</span>
                </div>
                <div className="flex items-center justify-around py-3">
                  <div className="text-center">
                    <p className="font-mono text-2xl font-bold">{dcResult.lambdaHome.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{selectedTeamA}</p>
                  </div>
                  <div className="text-xs font-bold text-muted-foreground">xG</div>
                  <div className="text-center">
                    <p className="font-mono text-2xl font-bold">{dcResult.lambdaAway.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{selectedTeamB}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground">🎯 Most Likely Scorelines</span>
                </div>
                <div className="divide-y divide-border">
                  {dcResult.topScorelines.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center px-3 py-2">
                      <span className="text-xs text-muted-foreground font-mono w-5">#{i + 1}</span>
                      <span className="font-mono text-sm font-semibold flex-1 text-center">{s.home} – {s.away}</span>
                      <span className="font-mono text-xs font-semibold text-primary">{(s.probability * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground">📈 Head to Head Stats</span>
                </div>
                <ComparisonRow label="Win %" a={`${statsA!.winProbability.toFixed(0)}%`} b={`${statsB!.winProbability.toFixed(0)}%`} better={statsA!.winProbability > statsB!.winProbability ? "a" : statsA!.winProbability < statsB!.winProbability ? "b" : "none"} />
                <ComparisonRow label="GF/G" a={(statsA!.goalsFor / statsA!.matchesPlayed).toFixed(1)} b={(statsB!.goalsFor / statsB!.matchesPlayed).toFixed(1)} better={statsA!.goalsFor / statsA!.matchesPlayed > statsB!.goalsFor / statsB!.matchesPlayed ? "a" : "b"} />
                <ComparisonRow label="GA/G" a={(statsA!.goalsAgainst / statsA!.matchesPlayed).toFixed(1)} b={(statsB!.goalsAgainst / statsB!.matchesPlayed).toFixed(1)} better={statsA!.goalsAgainst / statsA!.matchesPlayed < statsB!.goalsAgainst / statsB!.matchesPlayed ? "a" : "b"} />
                <ComparisonRow label="Shots" a={statsA!.avgShotsFor.toFixed(1)} b={statsB!.avgShotsFor.toFixed(1)} better={statsA!.avgShotsFor > statsB!.avgShotsFor ? "a" : "b"} />
                <ComparisonRow label="BTTS" a={`${statsA!.bttsPercentage.toFixed(0)}%`} b={`${statsB!.bttsPercentage.toFixed(0)}%`} better="none" />
                <ComparisonRow label="O2.5" a={`${statsA!.over25Percentage.toFixed(0)}%`} b={`${statsB!.over25Percentage.toFixed(0)}%`} better="none" />

                <div className="px-3 py-2 border-t border-border flex items-center justify-between bg-muted/20">
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] text-muted-foreground font-medium">Form</span>
                    <div className="flex gap-[2px]">{statsA!.formLast5.map((r, i) => <span key={i} className={cn("w-[6px] h-[6px] rounded-full", r === "W" && "bg-stat-positive", r === "D" && "bg-stat-warn", r === "L" && "bg-stat-negative")} />)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex gap-[2px]">{statsB!.formLast5.map((r, i) => <span key={i} className={cn("w-[6px] h-[6px] rounded-full", r === "W" && "bg-stat-positive", r === "D" && "bg-stat-warn", r === "L" && "bg-stat-negative")} />)}</div>
                    <span className="text-[8px] text-muted-foreground font-medium">Form</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showAI && prediction && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TeamLogo teamName={selectedTeamA} size="sm" />
                  <p className="text-sm font-semibold">{selectedTeamA}</p>
                </div>
                {selectedTeamB && (
                  <>
                    <span className="text-xs font-bold text-muted-foreground">VS</span>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{selectedTeamB}</p>
                      <TeamLogo teamName={selectedTeamB} size="sm" />
                    </div>
                  </>
                )}
              </div>

              {dcResult && (
                <div className="rounded-xl border border-border bg-card p-3 flex items-center justify-around">
                  <div className="text-center">
                    <p className="font-mono text-sm font-bold text-stat-positive">{dcResult.homeWin.toFixed(0)}%</p>
                    <p className="text-[8px] text-muted-foreground">Home</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-sm font-bold text-stat-warn">{dcResult.draw.toFixed(0)}%</p>
                    <p className="text-[8px] text-muted-foreground">Draw</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-sm font-bold text-stat-negative">{dcResult.awayWin.toFixed(0)}%</p>
                    <p className="text-[8px] text-muted-foreground">Away</p>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{prediction}</div>
              </div>
              <button onClick={handleReset}
                className="w-full py-2 text-xs font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                New Prediction
              </button>
            </div>
          )}
        </div>

        {/* Sticky bottom */}
        <div className="flex-shrink-0 border-t border-border bg-card pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {selectedTeamA && selectedTeamB && !showAI && (
            <div className="px-4 pt-3 pb-1 flex gap-2">
              <button onClick={handleRunPredict} disabled={predicting || !statsA}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  (predicting || !statsA) && "opacity-70 cursor-wait"
                )}>
                {predicting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {predicting ? "Analyzing…" : "AI Deep Analysis"}
              </button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center px-4 py-2">
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
  const syncApiFootball = useSyncApiFootball();
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
    toast.info("Syncing from API-Football…");
    syncApiFootball.mutate(
      { mode: "both" },
      {
        onSuccess: (data) => {
          toast.success(`Synced ${data.fixtures ?? 0} fixtures & ${data.results ?? 0} results from ${data.leaguesFetched ?? 0} leagues`);
        },
        onError: (err) => {
          toast.error(`API-Football sync failed: ${err.message}`);
          toast.info("Falling back to football-data.co.uk…");
          syncData.mutate({ season: "2526" }, {
            onSuccess: (data) => {
              const total = data.results?.reduce((s: number, r: { inserted: number }) => s + r.inserted, 0) ?? 0;
              toast.success(`Synced ${total} matches (fallback)`);
            },
            onError: (e) => toast.error(`Fallback sync failed: ${e.message}`),
          });
          syncFixtures.mutate(undefined, {
            onSuccess: (data) => toast.success(`Synced ${data.fixtures ?? 0} fixtures (fallback)`),
            onError: (e) => toast.error(`Fallback fixtures failed: ${e.message}`),
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (allMatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground mb-4">No data yet</p>
          <Button onClick={handleSync} disabled={syncData.isPending} className="gap-2 rounded-xl">
            <RefreshCw className={`w-4 h-4 ${syncData.isPending ? "animate-spin" : ""}`} />
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
          allMatches={allMatches}
          onSwitchTeam={(team) => {
            const m = allMatches.find((x: any) => x.home_team === team || x.away_team === team);
            const lc = m?.league_code || leagueCode;
            handleSelectTeam(team, lc);
          }}
        />
      ) : (
        <LeagueSelector
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
