import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  teams: string[];
  selectedTeam: string;
  onSelect: (team: string) => void;
};

export const TeamDropdown = ({ teams, selectedTeam, onSelect }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = teams.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide",
          "border-2 bg-card text-foreground transition-all duration-150",
          "hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-0 active:translate-y-0",
          open
            ? "border-foreground shadow-[4px_4px_0_hsl(var(--foreground))]"
            : "border-border shadow-[3px_3px_0_hsl(var(--border))] hover:shadow-[5px_5px_0_hsl(var(--border))]"
        )}
      >
        <span className="truncate max-w-[200px]">
          {selectedTeam || "Select team…"}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-30 w-72 max-h-80 border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="p-2 border-b-2 border-border">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted border border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search teams…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full font-medium"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-56 p-1">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4 uppercase tracking-wider">
                No teams found
              </p>
            )}
            {filtered.map((team) => (
              <button
                key={team}
                onClick={() => {
                  onSelect(team);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm font-medium transition-colors",
                  selectedTeam === team
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
