import { useState, useMemo, useRef, useEffect } from "react";
import { Repeat, Search, Star } from "lucide-react";
import { TeamLogo } from "./TeamLogo";
import { useFavorites } from "@/hooks/useFavorites";
import { matchesTeamQuery } from "@/lib/teamNormalize";
import { cn } from "@/lib/utils";

type Props = {
  currentTeam: string;
  allTeams: string[];
  onSelect: (team: string) => void;
};

export const TeamSwitcher = ({ currentTeam, allTeams, onSelect }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { isFavorite } = useFavorites();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const favTeams = useMemo(
    () => allTeams.filter((t) => isFavorite(t) && t !== currentTeam).slice(0, 8),
    [allTeams, isFavorite, currentTeam]
  );

  const results = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return allTeams
      .filter((t) => matchesTeamQuery(t, q) && t !== currentTeam)
      .slice(0, 12);
  }, [allTeams, search, currentTeam]);

  const handlePick = (team: string) => {
    onSelect(team);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors",
          open
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-foreground border-border hover:border-primary/40"
        )}
      >
        <Repeat className="w-3.5 h-3.5" />
        Switch
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team…"
                className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {search.trim() ? (
              results.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No teams found</p>
              ) : (
                results.map((team) => (
                  <button
                    key={team}
                    onClick={() => handlePick(team)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors border-b border-border last:border-b-0"
                  >
                    <TeamLogo teamName={team} size="sm" />
                    <span className="font-medium truncate">{team}</span>
                    {isFavorite(team) && <Star className="w-3 h-3 ml-auto fill-primary text-primary flex-shrink-0" />}
                  </button>
                ))
              )
            ) : favTeams.length > 0 ? (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  Favorites
                </div>
                {favTeams.map((team) => (
                  <button
                    key={team}
                    onClick={() => handlePick(team)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors border-b border-border last:border-b-0"
                  >
                    <TeamLogo teamName={team} size="sm" />
                    <span className="font-medium truncate">{team}</span>
                    <Star className="w-3 h-3 ml-auto fill-primary text-primary flex-shrink-0" />
                  </button>
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4 px-3">
                Type to search any team
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
