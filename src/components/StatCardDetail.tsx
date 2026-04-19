import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { FormBadge } from "./FormBadge";
import type { TeamMatchView } from "@/lib/matchStats";

type StatKey = "record" | "corners" | "cards" | "fouls" | "shots" | "over25" | "cleanSheets";

type Props = {
  statKey: StatKey;
  views: TeamMatchView[];
  onClose: () => void;
};

const labels: Record<StatKey, string> = {
  record: "Results",
  corners: "Corners",
  cards: "Cards",
  fouls: "Fouls",
  shots: "Shots",
  over25: "Goals",
  cleanSheets: "Clean Sheets",
};

const descriptions: Record<StatKey, string> = {
  record: "Final score of each match — goals scored vs. goals conceded.",
  corners: "Corner kicks won by the team vs. corners conceded to the opponent.",
  cards: "Yellow (Y) and red (R) cards picked up in each match.",
  fouls: "Fouls committed by the team, with fouls drawn (suffered) shown in brackets.",
  shots: "Total shots taken with shots on target (SOT) shown alongside.",
  over25: "Combined goals in the match — useful for over/under 2.5 trends.",
  cleanSheets: "Matches where the team kept the opponent off the scoresheet.",
};

function getStatValue(v: TeamMatchView, key: StatKey): string {
  switch (key) {
    case "record": return `${v.goalsFor}-${v.goalsAgainst}`;
    case "corners": return `${v.cornersFor}-${v.cornersAgainst}`;
    case "cards": return `${v.yellowCards}Y ${v.redCards}R`;
    case "fouls": return `${v.foulsCommitted} (${v.foulsDrawn} drawn)`;
    case "shots": return `${v.shotsFor} (${v.shotsOnTargetFor} SOT)`;
    case "over25": return `${v.goalsFor + v.goalsAgainst} total`;
    case "cleanSheets": return v.goalsAgainst === 0 ? "✅ Clean" : `${v.goalsAgainst} conceded`;
  }
}

export const StatCardDetail = ({ statKey, views, onClose }: Props) => {
  const reversed = [...views].reverse();

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 animate-in fade-in-0 duration-150" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[70vh] bg-card border-t-2 border-foreground overflow-y-auto animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b-2 border-border z-10">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">{labels[statKey]} — Match by Match</span>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="px-3 pb-2 text-[11px] text-muted-foreground leading-snug">
            {descriptions[statKey]}
          </p>
        </div>

        {/* Match rows */}
        <div className="divide-y divide-border">
          {reversed.map((v, i) => (
            <div key={i} className="px-3 py-2 flex items-center gap-2 text-xs">
              <FormBadge result={v.result} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold truncate">
                    {v.isHome ? "vs" : "@"} {v.opponent}
                  </span>
                  <span className="text-muted-foreground font-mono">
                    {v.goalsFor}-{v.goalsAgainst}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(v.match.match_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}
                  {v.match.league_name}
                  {v.match.referee && ` · Ref: ${v.match.referee}`}
                </div>
              </div>
              <span className={cn(
                "font-mono font-bold text-[11px] whitespace-nowrap",
                statKey === "cleanSheets" && v.goalsAgainst === 0 && "text-stat-positive",
                statKey === "cards" && (v.yellowCards + v.redCards) >= 3 && "text-stat-warn",
              )}>
                {getStatValue(v, statKey)}
              </span>
            </div>
          ))}
        </div>

        {reversed.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No match data</p>
        )}
      </div>
    </div>,
    document.body
  );
};
