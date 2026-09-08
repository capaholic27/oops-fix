import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { leagueGroupFor, type LeagueGroup } from "@/lib/leagues";

type LeagueOption = { code: string; name: string };

type Props = {
  /** All matches for the team(s) — used to derive which leagues are available. */
  matches: { league_code: string; league_name: string }[];
  /** Currently selected league filter: "all" or a league_code. */
  value: string;
  onChange: (value: string) => void;
  /** Compact variant for inline use (team banner); full for the prediction dialog. */
  variant?: "compact" | "full";
  /** Label override for the full variant. */
  label?: string;
};

const GROUP_LABELS: Record<LeagueGroup, string> = {
  domestic: "Leagues",
  tournament: "Tournaments",
  international: "International",
  friendlies: "Friendlies",
};

/**
 * Dropdown that lets the user filter stats/predictions by a specific
 * competition or "All" (every recent match). Leagues are grouped into
 * Leagues, Tournaments, International, and Friendlies.
 */
export function LeagueFilterDropdown({
  matches,
  value,
  onChange,
  variant = "full",
  label = "Choose League",
}: Props) {
  const leagues = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matches) {
      if (!map.has(m.league_code)) map.set(m.league_code, m.league_name);
    }
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [matches]);

  const grouped = useMemo(() => {
    const groups: Record<string, LeagueOption[]> = {};
    for (const l of leagues) {
      const g = leagueGroupFor(l.name);
      (groups[g] ??= []).push(l);
    }
    return groups;
  }, [leagues]);

  const groupOrder: LeagueGroup[] = ["domestic", "tournament", "international", "friendlies"];

  if (variant === "compact") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 px-2 text-xs font-medium rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
      >
        <option value="all">All Competitions</option>
        {groupOrder.map((g) =>
          (grouped[g] ?? []).map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))
        )}
      </select>
    );
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground font-medium mb-1.5 block">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full h-9 px-3 pr-8 text-sm rounded-xl border border-border bg-card",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer appearance-none"
          )}
        >
          <option value="all">All (all recent matches)</option>
          {groupOrder.map((g) =>
            (grouped[g] ?? []).map((l) => (
              <option key={l.code} value={l.code}>
                {GROUP_LABELS[g]} · {l.name}
              </option>
            ))
          )}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">▼</span>
      </div>
    </div>
  );
}
