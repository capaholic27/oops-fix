import { useEffect, useMemo, useState } from "react";
import { ChevronDown, UserCheck, UserX } from "lucide-react";
import { useTeamPlayers, type RealPlayer } from "@/hooks/useTeamPlayers";
import { useTeamInjuries } from "@/hooks/useTeamInjuries";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamLogo } from "@/components/TeamLogo";
import { goalShare } from "@/lib/playerProps";
import { cn } from "@/lib/utils";

type Props = {
  team: string;
  /** Names of players marked unavailable */
  unavailable: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Bubble the squad up so the parent can run the impact / props model */
  onSquad?: (players: RealPlayer[]) => void;
};

/** Loose match between injury-feed names and squad names. */
function sameName(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  const la = na.split(" ").pop() || "", lb = nb.split(" ").pop() || "";
  return la.length > 3 && la === lb;
}

export const LineupSelector = ({ team, unavailable, onChange, onSquad }: Props) => {
  const { data: players = [], isLoading } = useTeamPlayers(team);
  const { data: injuries = [] } = useTeamInjuries(team);
  const [open, setOpen] = useState(false);
  const [seeded, setSeeded] = useState("");

  const shares = useMemo(() => goalShare(players), [players]);

  useEffect(() => {
    if (players.length > 0) onSquad?.(players);
  }, [players, onSquad]);

  // Pre-deselect players flagged by the live injury feed (once per team).
  useEffect(() => {
    if (seeded === team || players.length === 0) return;
    const flagged = players
      .filter((p) => injuries.some((i) => i.playerName && sameName(i.playerName, p.name)))
      .map((p) => p.name);
    setSeeded(team);
    if (flagged.length > 0) onChange(new Set(flagged));
    else onChange(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, players, injuries, seeded]);

  const toggle = (name: string) => {
    const next = new Set(unavailable);
    next.has(name) ? next.delete(name) : next.add(name);
    onChange(next);
  };

  const ranked = useMemo(
    () => [...players].sort((a, b) => (shares.get(b.name) ?? 0) - (shares.get(a.name) ?? 0)),
    [players, shares],
  );

  const outCount = unavailable.size;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2.5">
        <TeamLogo teamName={team} size="xs" />
        <div className="flex-1 text-left">
          <p className="text-xs font-semibold leading-tight">{team}</p>
          <p className="text-[10px] text-muted-foreground">
            {isLoading
              ? "Loading squad…"
              : players.length === 0
                ? "Squad unavailable"
                : outCount > 0
                  ? `${outCount} marked out · ${players.length - outCount} available`
                  : `${players.length} players available`}
          </p>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && players.length > 0 && (
        <div className="border-t border-border max-h-56 overflow-y-auto divide-y divide-border">
          {ranked.map((p) => {
            const out = unavailable.has(p.name);
            const injured = injuries.find((i) => i.playerName && sameName(i.playerName, p.name));
            return (
              <button
                key={p.name}
                onClick={() => toggle(p.name)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                  out ? "bg-stat-negative/5 opacity-60" : "hover:bg-muted/40",
                )}
              >
                <PlayerAvatar name={p.name} photo={p.photo} size="xs" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold truncate">{p.name}</p>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {p.position || "—"} · {p.goals}G {p.assists}A
                    {injured ? ` · ${injured.reason || "unavailable"}` : ""}
                  </p>
                </div>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {((shares.get(p.name) ?? 0) * 100).toFixed(0)}%
                </span>
                {out ? (
                  <UserX className="w-3.5 h-3.5 text-stat-negative flex-shrink-0" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 text-stat-positive flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
