import { useState, useMemo, useCallback, useEffect } from "react";
import { useMatches, useTeamMatches, useSyncData, useFixtures, useSyncFixtures, useStandings } from "@/hooks/useMatches";
import { useExtraTeamMatches } from "@/hooks/useExtraMatches";
import { supabase } from "@/integrations/supabase/client";
import {
  getTeamMatchView,
  aggregateStats,
  getUniqueTeams,
  getUniqueLeagues,
  filterRecentViews,
  type TeamMatchView,
} from "@/lib/matchStats";
import { normalizeTeamName, computeMentality } from "@/lib/teamNormalize";
import { localToday } from "@/lib/datetime";
import { predictMatch, computeLeagueAvgGoals, type PredictionResult, type TeamInput } from "@/lib/dixonColes";
import { StatCard } from "@/components/StatCard";
import { StatCardDetail } from "@/components/StatCardDetail";
import { MatchVote } from "@/components/MatchVote";
import { PredictedTacticalProfile } from "@/components/PredictedTacticalProfile";
import { RecentResults } from "@/components/RecentResults";
import { RankingsTable } from "@/components/RankingsTable";
import { FormBadge } from "@/components/FormBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { LeagueFilterDropdown } from "@/components/LeagueFilterDropdown";
import { AdBanner } from "@/components/AdBanner";
import { MomentumChart } from "@/components/MomentumChart";
import { UpcomingFixtures } from "@/components/UpcomingFixtures";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getSyntheticSquad } from "@/lib/playerNames";
import { useFavorites } from "@/hooks/useFavorites";
import { useTeamPlayers, type RealPlayer } from "@/hooks/useTeamPlayers";
import { LineupSelector } from "@/components/LineupSelector";
import { PlayerPropsPanel } from "@/components/PlayerPropsPanel";
import { PredictionGuide } from "@/components/PredictionGuide";
import { computeLineupImpact, computePlayerProps, type PredictionMode } from "@/lib/playerProps";
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

/* Top leagues for the box grid (domestic leagues only, no tournaments).
 * Imported from shared premium helper so Stats + Pro pages stay in sync. */
import { TOP_LEAGUES, TOP_LEAGUES_SET, isPremiumUnlocked, subscribePremium } from "@/lib/premium";
import { leagueGroupFor, isNonDomesticLeague, mergeSupportedLeagues, type LeagueGroup } from "@/lib/leagues";
import { Lock } from "lucide-react";


/* ─── Form Strip ─── */
const FormStrip = ({ views, formLast5 }: { views: TeamMatchView[]; formLast5: ("W" | "D" | "L")[] }) => {
  const [expanded, setExpanded] = useState(false);
  const extendedViews = views.slice().reverse();
  const extendedForm = extendedViews.map((v) => v.result);
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
          <div className="flex gap-3 mb-2 text-xs font-semibold">
            <span className="text-stat-positive">{wins}W</span>
            <span className="text-stat-warn">{draws}D</span>
            <span className="text-stat-negative">{losses}L</span>
            <span className="text-muted-foreground ml-auto font-mono text-[10px]">{extendedForm.length} matches</span>
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {extendedViews.map((v, i) => {
              const dateStr = new Date(v.match.match_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <FormBadge result={v.result} />
                  <span className="text-muted-foreground font-mono w-14 flex-shrink-0">{dateStr}</span>
                  <span className="font-medium truncate flex-1">
                    <span className="text-muted-foreground text-[9px] mr-1">{v.isHome ? "vs" : "@"}</span>
                    {v.opponent}
                    <span className="text-muted-foreground/60 text-[8px] ml-1">· {v.match.league_name}</span>
                  </span>
                  <span className="font-mono font-bold flex-shrink-0">{v.goalsFor}-{v.goalsAgainst}</span>
                </div>
              );
            })}
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

  // Pro / Free tier gating — free users can only access top-9 leagues.
  const [unlocked, setUnlocked] = useState<boolean>(isPremiumUnlocked());
  useEffect(() => subscribePremium(setUnlocked), []);
  const canAccessLeague = (name: string) => unlocked || TOP_LEAGUES_SET.has(name);
  const tryOpenLeague = (l: { code: string; name: string }) => {
    if (!canAccessLeague(l.name)) {
      toast.error(`${l.name} is a Pro league — unlock Pro to access all leagues.`);
      return;
    }
    setSelectedLeague(l);
  };
  const trySelectTeam = (team: string, leagueCode: string, leagueName?: string) => {
    if (leagueName && !canAccessLeague(leagueName)) {
      toast.error(`${leagueName} is a Pro league — unlock Pro to access all leagues.`);
      return;
    }
    onSelectTeam(team, leagueCode);
  };

  // Official current-season tables — the authoritative roster per league.
  // When a new season starts, promoted teams appear and relegated teams
  // disappear automatically once the standings sync runs.
  const { data: standings } = useStandings();

  const teamsByLeague = useMemo(() => {
    const byCode = new Map((standings ?? []).map((s) => [s.league_code, s]));
    const map: Record<string, string[]> = {};
    leagues.forEach((l) => {
      const rows = byCode.get(l.code)?.rows ?? [];
      if (rows.length > 0) {
        // Current-season table = current teams, ordered by position.
        // Dedupe defensively (grouped tables can repeat a team).
        const seen = new Set<string>();
        map[l.code] = [...rows]
          .sort((a, b) => a.position - b.position)
          .map((r) => r.name)
          .filter((n) => {
            const k = normalizeTeamName(n || "").toLowerCase();
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
          });
      } else {
        // No table yet (e.g. tournaments before kick-off) — fall back to
        // teams seen in fixtures/recent matches.
        const filtered = allMatches.filter((m: any) => m.league_code === l.code);
        map[l.code] = getUniqueTeams(filtered);
      }
    });
    return map;
  }, [leagues, allMatches, standings]);

  const searchLower = search.toLowerCase().trim();

  const searchResults = useMemo(() => {
    if (!searchLower) return null;
    const results: { team: string; league: { code: string; name: string }; locked: boolean }[] = [];
    leagues.forEach((l) => {
      (teamsByLeague[l.code] || []).forEach((team) => {
        if (team.toLowerCase().includes(searchLower)) {
          const locked = !canAccessLeague(l.name);
          results.push({ team, league: l, locked });
        }
      });
    });
    // Show allowed first, then locked
    results.sort((a, b) => Number(a.locked) - Number(b.locked));
    return results;
  }, [searchLower, leagues, teamsByLeague, unlocked]);

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
      if (isNonDomesticLeague(l.name)) return;
      (teamsByLeague[l.code] || []).forEach((team) => {
        const norm = normalizeTeamName(team);
        if (isFavorite(team) && !seen.has(norm)) {
          seen.add(norm);
          results.push({ team, league: l });
        }
      });
    });
    // Second pass: add non-domestic teams (tournaments, internationals, friendlies)
    leagues.forEach((l) => {
      if (!isNonDomesticLeague(l.name)) return;
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
                onClick={() => trySelectTeam(team, selectedLeague.code, selectedLeague.name)}
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
          {searchResults.map(({ team, league: l, locked }) => (
            <div key={`${l.code}-${team}`} className={cn("flex items-center border-b border-border last:border-b-0", locked && "opacity-60")}>
              <button
                onClick={() => trySelectTeam(team, l.code, l.name)}
                className="flex-1 text-left px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-3"
              >
                <TeamLogo teamName={team} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{team}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{l.name}</span>
                </div>
                {locked && <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
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
                        onClick={() => trySelectTeam(fav.team, fav.league.code, fav.league.name)}
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
                  onClick={() => tryOpenLeague(l)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all aspect-square justify-center"
                >
                  <LeagueLogo leagueName={l.name} size="md" />
                  <span className="text-[11px] font-medium text-center leading-tight">{l.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* All competitions — grouped into Leagues, Tournaments, International, Friendlies */}
          {filter === "all" && (() => {
            const groups: { label: string; group: LeagueGroup }[] = [
              { label: "Leagues", group: "domestic" },
              { label: "Tournaments", group: "tournament" },
              { label: "International", group: "international" },
              { label: "Friendlies", group: "friendlies" },
            ];
            const renderRow = (l: { code: string; name: string }) => {
              const locked = !canAccessLeague(l.name);
              return (
                <button
                  key={l.code}
                  onClick={() => tryOpenLeague(l)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left",
                    locked && "opacity-60"
                  )}
                >
                  <LeagueLogo leagueName={l.name} size="sm" />
                  <span className="text-sm font-medium flex-1">{l.name}</span>
                  {locked ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                      <Lock className="w-3 h-3" /> Pro
                    </span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              );
            };
            return (
              <div className="space-y-5">
                {groups.map(({ label, group }) => {
                  const items = leagues.filter((l) => leagueGroupFor(l.name) === group);
                  if (items.length === 0) return null;
                  return (
                    <div key={group} className="space-y-2">
                      <h3 className="stat-label px-1">{label}</h3>
                      <div className="space-y-2">{items.map(renderRow)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

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
type RankedPlayer = { name: string; value: number; number?: number | null; photoUrl?: string | null };

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

/* Generate a generic 5-player leaderboard for teams not in the mock map.
 * Uses synthetic but realistic player names + shirt numbers, deterministic per team. */
function generateFallbackLeaderboard(teamName: string): Record<PlayerHighlightCategory, RankedPlayer[]> {
  // Reuse a shared squad so the same fake players appear across categories
  const squad = getSyntheticSquad(teamName, 12);
  // Different category orderings (indexes into squad) to avoid identical leaderboards
  const orders: Record<PlayerHighlightCategory, number[]> = {
    scorer:     [0, 2, 1, 4, 3],
    assists:    [1, 0, 3, 2, 5],
    shots:      [0, 1, 3, 2, 4],
    fouls:      [6, 5, 7, 4, 1],
    foulsDrawn: [2, 0, 3, 1, 4],
    cards:      [5, 7, 6, 3, 8],
  };
  const bases: Record<PlayerHighlightCategory, [number, number]> = {
    scorer: [12, 2], assists: [9, 1], shots: [64, 8],
    fouls: [22, 3], foulsDrawn: [32, 4], cards: [6, 1],
  };
  const build = (cat: PlayerHighlightCategory): RankedPlayer[] => {
    const [base, step] = bases[cat];
    return orders[cat].map((idx, i) => {
      const p = squad[idx % squad.length];
      return { name: p.name, value: Math.max(1, base - step * i), number: p.number };
    });
  };
  return {
    scorer: build("scorer"),
    assists: build("assists"),
    shots: build("shots"),
    fouls: build("fouls"),
    foulsDrawn: build("foulsDrawn"),
    cards: build("cards"),
  };
}

export const PlayerHighlights = ({ teamName }: { teamName: string }) => {
  const [active, setActive] = useState<PlayerHighlightCategory>("scorer");
  const { data: realPlayers = [] } = useTeamPlayers(teamName);

  // Build leaderboard from REAL data when available; else mock; else synthetic.
  // For categories with no real data (Fotmob only exposes top performers per
  // category), fall back to the mock per-category so users always see something.
  const leaderboard = useMemo<Record<PlayerHighlightCategory, RankedPlayer[]>>(() => {
    const fallback = PLAYER_LEADERBOARD[teamName] ?? generateFallbackLeaderboard(teamName);
    if (realPlayers.length === 0) return fallback;

    const top = (key: (p: typeof realPlayers[number]) => number): RankedPlayer[] =>
      [...realPlayers]
        .filter((p) => key(p) > 0)
        .sort((a, b) => key(b) - key(a))
        .slice(0, 5)
        .map((p) => ({ name: p.name, value: key(p), number: p.number, photoUrl: p.photo }));
    const cardsTotal = (p: typeof realPlayers[number]) => (p.yellow ?? 0) + (p.red ?? 0);
    const pick = (cat: PlayerHighlightCategory, real: RankedPlayer[]) =>
      real.length > 0 ? real : fallback[cat];
    return {
      scorer:     pick("scorer",     top((p) => p.goals ?? 0)),
      assists:    pick("assists",    top((p) => p.assists ?? 0)),
      shots:      pick("shots",      top((p) => p.shots ?? 0)),
      fouls:      pick("fouls",      top((p) => p.fouls ?? 0)),
      foulsDrawn: pick("foulsDrawn", top((p) => p.foulsDrawn ?? 0)),
      cards:      pick("cards",      top(cardsTotal)),
    };
  }, [realPlayers, teamName]);

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
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Player Leaderboard</span>
        <span className="text-[9px] font-mono text-muted-foreground">TOP 5</span>
      </div>
      <p className="text-[9px] text-muted-foreground mb-2">
        {realPlayers.length > 0 ? "2025/26 season stats from official data" : "Current season estimates"}
      </p>
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-1 px-1 pb-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActive(cat.id)}
            className={cn(
              "flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg transition-all whitespace-nowrap",
              active === cat.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {cat.icon}
            <span>{cat.label}</span>
          </button>
        ))}
      </div>
      {players.length > 0 ? (
        <div className="space-y-1.5 animate-fade-up">
          {players.map((p, i) => {
            const pct = (p.value / maxVal) * 100;
            return (
              <div key={`${p.name}-${i}`} className="flex items-center gap-2">
                <span className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-mono font-bold flex-shrink-0",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>{i + 1}</span>
                <PlayerAvatar name={p.name} number={p.number ?? undefined} photoUrl={p.photoUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold truncate">
                      {p.name}
                      {typeof p.number === "number" && (
                        <span className="ml-1 text-[9px] font-mono text-muted-foreground">#{p.number}</span>
                      )}
                    </span>
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
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  // Form & predictions use ALL of a team's recent matches across every
  // competition (domestic, tournaments, internationals, friendlies) so the
  // win-rate reflects current form rather than a single league's older games.
  const { data: allMatches = [] } = useMatches();
  const { data: teamMatches = [] } = useTeamMatches(selectedTeam);
  // Fetch friendly/international results not in the DB (INTL + FRLY from Fotmob)
  const extraMatches = useExtraTeamMatches(selectedTeam);
  const { data: fixtures = [] } = useFixtures(selectedTeam);
  const { data: allFixtures = [] } = useFixtures();
  const leagues = useMemo(() => mergeSupportedLeagues(getUniqueLeagues(allMatches)), [allMatches]);
  const currentLeagueName = leagues.find((l) => l.code === leagueCode)?.name ?? "All Leagues";

  const nextFixture = useMemo(() => {
    if (selectedFixtureId) {
      return fixtures.find((f) => f.id === selectedFixtureId) ?? null;
    }
    if (fixtures.length === 0) return null;
    const today = localToday();
    return fixtures.find((f) => f.match_date >= today) ?? null;
  }, [fixtures, selectedFixtureId]);

  const nextOpponentName = useMemo(() => {
    if (manualOpponent) return manualOpponent;
    if (!nextFixture) return undefined;
    return nextFixture.home_team === selectedTeam ? nextFixture.away_team : nextFixture.home_team;
  }, [nextFixture, selectedTeam, manualOpponent]);

  const nextOpponentStats = useMemo(() => {
    if (!nextOpponentName) return null;
    const oppViews = filterRecentViews(
      allMatches
        .filter((m) => leagueFilter === "all" || m.league_code === leagueFilter)
        .map((m) => getTeamMatchView(m, nextOpponentName))
        .filter((v): v is TeamMatchView => v !== null)
    ).slice(-pastN);
    return oppViews.length > 0 ? aggregateStats(oppViews) : null;
  }, [nextOpponentName, allMatches, pastN, leagueFilter]);

  // Merge DB matches with extra friendly/international results, dedup by key
  const allTeamMatches = useMemo(() => {
    if (extraMatches.length === 0) return teamMatches;
    const seen = new Set(
      teamMatches.map((m) =>
        `${m.match_date}|${normalizeTeamName(m.home_team).toLowerCase()}|${normalizeTeamName(m.away_team).toLowerCase()}`
      )
    );
    const fresh = extraMatches.filter(
      (m) => !seen.has(`${m.match_date}|${normalizeTeamName(m.home_team).toLowerCase()}|${normalizeTeamName(m.away_team).toLowerCase()}`)
    );
    return [...teamMatches, ...fresh].sort((a, b) => a.match_date.localeCompare(b.match_date));
  }, [teamMatches, extraMatches]);

  const allTeamViews: TeamMatchView[] = useMemo(() => {
    if (!selectedTeam) return [];
    return filterRecentViews(
      allTeamMatches
        .map((m) => getTeamMatchView(m, selectedTeam))
        .filter((v): v is TeamMatchView => v !== null)
    );
  }, [allTeamMatches, selectedTeam]);

  // When a specific league is selected, filter views to that competition only
  // so stats and predictions reflect performance in that specific league.
  const filteredTeamViews = useMemo(() => {
    if (leagueFilter === "all") return allTeamViews;
    return allTeamViews.filter((v) => v.match.league_code === leagueFilter);
  }, [allTeamViews, leagueFilter]);

  const teamViews = useMemo(() => filteredTeamViews.slice(-pastN), [filteredTeamViews, pastN]);
  const stats = useMemo(() => aggregateStats(teamViews), [teamViews]);
  const winRate = stats.matchesPlayed > 0 ? ((stats.wins / stats.matchesPlayed) * 100).toFixed(1) : "0.0";

  const leagueMatches = useMemo(
    () => (leagueCode ? allMatches.filter((m) => m.league_code === leagueCode) : []),
    [allMatches, leagueCode]
  );

  // Leagues this team has actually played in — for the filter dropdown.
  const teamLeagueMatches = useMemo(() => allTeamMatches, [allTeamMatches]);

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
                  {stats.matchesPlayed} matches
                </p>
                <LeagueFilterDropdown
                  matches={teamLeagueMatches}
                  value={leagueFilter}
                  onChange={setLeagueFilter}
                  variant="compact"
                />
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
            <FormStrip views={filteredTeamViews} formLast5={stats.formLast5} />
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

      {/* Fan Vote on next fixture */}
      {nextFixture && (
        <MatchVote
          homeTeam={nextFixture.home_team}
          awayTeam={nextFixture.away_team}
          matchDate={nextFixture.match_date}
        />
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Record" value={`${stats.wins}-${stats.draws}-${stats.losses}`} icon={<TrendingUp className="w-4 h-4" />} trend={parseFloat(winRate) > 50 ? "positive" : "neutral"} subtitle={`${stats.goalsFor} GF · ${stats.goalsAgainst} GA`} delay={150} onClick={() => setOpenStat("record")} />
        <StatCard label="Corners" value={stats.avgCornersFor.toFixed(1)} icon={<Flag className="w-4 h-4" />} trend="neutral" subtitle={`vs ${stats.avgCornersAgainst.toFixed(1)} · Total ${(stats.avgCornersFor + stats.avgCornersAgainst).toFixed(1)}`} delay={200} onClick={() => setOpenStat("corners")} />
        <StatCard label="Cards" value={stats.avgYellowCards.toFixed(1)} icon={<AlertTriangle className="w-4 h-4" />} trend="warn" subtitle={`🟡 Y · ${stats.avgRedCards.toFixed(2)} 🔴 R`} delay={250} onClick={() => setOpenStat("cards")} />
        <StatCard label="Fouls" value={stats.avgFoulsCommitted.toFixed(1)} icon={<Shield className="w-4 h-4" />} trend="negative" subtitle={`Drawn: ${stats.avgFoulsDrawn.toFixed(1)}`} delay={300} onClick={() => setOpenStat("fouls")} />
        <StatCard label="Shots" value={stats.avgShotsFor.toFixed(1)} icon={<Crosshair className="w-4 h-4" />} trend="positive" subtitle={`SOT: ${stats.avgShotsOnTargetFor.toFixed(1)} · vs ${stats.avgShotsAgainst.toFixed(1)}`} delay={350} onClick={() => setOpenStat("shots")} />
        <StatCard label="Over 2.5" value={`${stats.over25Percentage.toFixed(0)}%`} icon={<Target className="w-4 h-4" />} trend={stats.over25Percentage > 60 ? "positive" : "neutral"} subtitle={`O1.5: ${stats.over15Percentage.toFixed(0)}% · BTTS: ${stats.bttsPercentage.toFixed(0)}%`} delay={400} onClick={() => setOpenStat("over25")} />
        <StatCard label="Clean Sheets" value={stats.cleanSheets} icon={<Shield className="w-4 h-4" />} trend="positive" subtitle={`${(stats.goalsAgainst / stats.matchesPlayed).toFixed(2)} GA/match`} delay={450} onClick={() => setOpenStat("cleanSheets")} />
        {(() => {
          const mentality = computeMentality(filteredTeamViews.map(v => v.result));
          return (
            <div className="rounded-2xl border border-border bg-card p-3 opacity-0 animate-fade-up" style={{ animationDelay: "475ms" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mentality</span>
                <span className="text-base leading-none">{mentality.emoji}</span>
              </div>
              <div className="font-mono text-sm font-bold text-foreground leading-tight">{mentality.label}</div>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${mentality.intensity}%`,
                    background: mentality.intensity > 75 ? 'hsl(var(--stat-negative))' : mentality.intensity > 50 ? 'hsl(var(--stat-warn))' : 'hsl(var(--primary))',
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug line-clamp-2">{mentality.description}</p>
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
      <RecentResults views={filteredTeamViews} />

      {leagueCode && (
        <RankingsTable leagueCode={leagueCode} leagueName={currentLeagueName} />
      )}

      {openStat && (
        <StatCardDetail statKey={openStat} views={teamViews} onClose={() => setOpenStat(null)} />
      )}
    </div>
  );
};

/* ─── Prediction Dialog (standalone) ─── */
export const PredictionDialog = ({
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
  const [mode, setMode] = useState<PredictionMode>("full");
  const [squadA, setSquadA] = useState<RealPlayer[]>([]);
  const [squadB, setSquadB] = useState<RealPlayer[]>([]);
  const [outA, setOutA] = useState<Set<string>>(new Set());
  const [outB, setOutB] = useState<Set<string>>(new Set());
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const pastN = 10;

  const allTeams = useMemo(() => getUniqueTeams(allMatches), [allMatches]);

  // Matches for both selected teams — used to populate the league dropdown.
  const dialogLeagueMatches = useMemo(() => {
    if (!selectedTeamA && !selectedTeamB) return [];
    return allMatches.filter(
      (m: any) =>
        (selectedTeamA && (m.home_team === selectedTeamA || m.away_team === selectedTeamA)) ||
        (selectedTeamB && (m.home_team === selectedTeamB || m.away_team === selectedTeamB))
    );
  }, [allMatches, selectedTeamA, selectedTeamB]);

  const getTeamStats = useCallback(
    (teamName: string) => {
      if (!teamName) return null;
      const views = filterRecentViews(
        allMatches
          .filter((m: any) =>
            (m.home_team === teamName || m.away_team === teamName) &&
            (leagueFilter === "all" || m.league_code === leagueFilter)
          )
          .map((m: any) => getTeamMatchView(m, teamName))
          .filter((v: any): v is TeamMatchView => v !== null)
      ).slice(-pastN);
      return views.length > 0 ? aggregateStats(views) : null;
    },
    [allMatches, pastN, leagueFilter]
  );

  const statsA = useMemo(() => getTeamStats(selectedTeamA), [selectedTeamA, getTeamStats]);
  const statsB = useMemo(() => getTeamStats(selectedTeamB), [selectedTeamB, getTeamStats]);

  const impactA = useMemo(() => computeLineupImpact(squadA, outA), [squadA, outA]);
  const impactB = useMemo(() => computeLineupImpact(squadB, outB), [squadB, outB]);

  const dcResult = useMemo<PredictionResult | null>(() => {
    if (!statsA || !statsB || !selectedTeamA || !selectedTeamB) return null;
    const leagueAvg = computeLeagueAvgGoals(allMatches);
    const getRecentStats = (teamName: string) => {
      const views = filterRecentViews(
        allMatches
          .filter((m: any) =>
            (m.home_team === teamName || m.away_team === teamName) &&
            (leagueFilter === "all" || m.league_code === leagueFilter)
          )
          .map((m: any) => getTeamMatchView(m, teamName))
          .filter((v: any): v is TeamMatchView => v !== null)
      ).slice(-5);
      if (views.length === 0) return { scored: 0, conceded: 0, n: 0 };
      return { scored: views.reduce((s, v) => s + v.goalsFor, 0), conceded: views.reduce((s, v) => s + v.goalsAgainst, 0), n: views.length };
    };
    const recentA = getRecentStats(selectedTeamA);
    const recentB = getRecentStats(selectedTeamB);
    // Availability multipliers: losing attackers cuts goals scored, losing
    // defenders/keepers raises goals conceded.
    const homeInput: TeamInput = {
      goalsScored: statsA.goalsFor * impactA.attackMultiplier,
      goalsConceded: statsA.goalsAgainst * impactA.concedeMultiplier,
      matchesPlayed: statsA.matchesPlayed,
      recentGoalsScored: recentA.scored * impactA.attackMultiplier,
      recentGoalsConceded: recentA.conceded * impactA.concedeMultiplier,
      recentMatches: recentA.n,
    };
    const awayInput: TeamInput = {
      goalsScored: statsB.goalsFor * impactB.attackMultiplier,
      goalsConceded: statsB.goalsAgainst * impactB.concedeMultiplier,
      matchesPlayed: statsB.matchesPlayed,
      recentGoalsScored: recentB.scored * impactB.attackMultiplier,
      recentGoalsConceded: recentB.conceded * impactB.concedeMultiplier,
      recentMatches: recentB.n,
    };
    return predictMatch(homeInput, awayInput, leagueAvg);
  }, [statsA, statsB, selectedTeamA, selectedTeamB, allMatches, impactA, impactB, leagueFilter]);

  const handleReset = () => {
    setPrediction(null);
    setSelectedTeamA("");
    setSelectedTeamB("");
    setTeamSearch("");
    setOpponentSearch("");
    setMatchContext("");
    setShowAI(false);
    setMode("full");
    setSquadA([]);
    setSquadB([]);
    setOutA(new Set());
    setOutB(new Set());
    setLeagueFilter("all");
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
      body.predictionMode = mode;
      const lineupLines = [
        ...impactA.notes.map((n) => `${selectedTeamA}: ${n}`),
        ...impactB.notes.map((n) => `${selectedTeamB}: ${n}`),
      ];
      if (lineupLines.length > 0) body.unavailablePlayers = lineupLines;
      if (mode !== "full" && dcResult) {
        body.playerMarkets = {
          home: computePlayerProps(squadA, selectedTeamA, dcResult.lambdaHome, outA).slice(0, 6),
          away: computePlayerProps(squadB, selectedTeamB, dcResult.lambdaAway, outB).slice(0, 6),
        };
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
  }, [selectedTeamA, statsA, selectedTeamB, statsB, matchContext, mode, impactA, impactB, dcResult, squadA, squadB, outA, outB]);

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

          {/* How it works */}
          {!showAI && <PredictionGuide />}

          {/* League filter */}
          {selectedTeamA && selectedTeamB && !showAI && (
            <LeagueFilterDropdown
              matches={dialogLeagueMatches}
              value={leagueFilter}
              onChange={setLeagueFilter}
            />
          )}

          {/* Prediction type */}
          {selectedTeamA && selectedTeamB && !showAI && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Prediction type</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { key: "full" as PredictionMode, label: "Full match", hint: "1X2 · O/U · BTTS" },
                  { key: "players" as PredictionMode, label: "Player markets", hint: "Scorers · cards" },
                  { key: "both" as PredictionMode, label: "Both", hint: "Everything" },
                ]).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setMode(opt.key)}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-left transition-colors",
                      mode === opt.key ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    <p className={cn("text-[11px] font-semibold leading-tight", mode === opt.key && "text-primary")}>{opt.label}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{opt.hint}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Player availability */}
          {selectedTeamA && selectedTeamB && !showAI && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium block">
                Player availability <span className="text-[10px]">— injuries and suspensions are pre-selected</span>
              </label>
              <LineupSelector team={selectedTeamA} unavailable={outA} onChange={setOutA} onSquad={setSquadA} />
              <LineupSelector team={selectedTeamB} unavailable={outB} onChange={setOutB} onSquad={setSquadB} />
              {(impactA.notes.length > 0 || impactB.notes.length > 0) && (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 space-y-1">
                  {impactA.notes.map((n, i) => (
                    <p key={`a${i}`} className="text-[10px] text-muted-foreground">{selectedTeamA}: {n}</p>
                  ))}
                  {impactB.notes.map((n, i) => (
                    <p key={`b${i}`} className="text-[10px] text-muted-foreground">{selectedTeamB}: {n}</p>
                  ))}
                </div>
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

              {mode !== "full" && (
                <PlayerPropsPanel
                  homeTeam={selectedTeamA}
                  awayTeam={selectedTeamB}
                  homeSquad={squadA}
                  awaySquad={squadB}
                  homeOut={outA}
                  awayOut={outB}
                  lambdaHome={dcResult.lambdaHome}
                  lambdaAway={dcResult.lambdaAway}
                />
              )}



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
            Poisson-Dixon-Coles model · Last {pastN} {leagueFilter === "all" ? "matches (all comps)" : "matches in selected league"}
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
  const leagues = useMemo(() => mergeSupportedLeagues(getUniqueLeagues(allMatches)), [allMatches]);
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
    toast.info("Syncing fixtures & results from Fotmob…");
    syncFixtures.mutate(undefined, {
      onSuccess: (data) => {
        const fx = data.fotmobFixtures ?? data.inserted ?? 0;
        const res = data.resultsInserted ?? 0;
        toast.success(`Synced ${fx} fixtures & ${res} results`);
      },
      onError: (e) => toast.error(`Sync failed: ${e.message}`),
    });
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
