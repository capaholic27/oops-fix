import { useState, useMemo } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

type WinProbabilityGaugeProps = {
  probability: number;
  teamName: string;
  // Optional: for vs-mode
  allTeams?: string[];
  getOpponentWinProbability?: (opponent: string) => number | null;
};

export const WinProbabilityGauge = ({
  probability,
  teamName,
  allTeams,
  getOpponentWinProbability,
}: WinProbabilityGaugeProps) => {
  const [opponent, setOpponent] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  const oppProb = useMemo(() => {
    if (!opponent || !getOpponentWinProbability) return null;
    return getOpponentWinProbability(opponent);
  }, [opponent, getOpponentWinProbability]);

  const filteredTeams = useMemo(() => {
    if (!allTeams) return [];
    const q = search.toLowerCase().trim();
    return allTeams
      .filter((t) => t !== teamName && (!q || t.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [allTeams, teamName, search]);

  // Compute head-to-head split
  const teamA = probability;
  const teamB = oppProb ?? 0;
  const total = teamA + teamB || 1;
  const pctA = (teamA / total) * 100;
  const pctB = (teamB / total) * 100;

  return (
    <div className="stat-card opacity-0 animate-fade-up col-span-2" style={{ animationDelay: "100ms" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="stat-label">Win Probability</span>
        {allTeams && allTeams.length > 0 && (
          opponent ? (
            <button
              onClick={() => { setOpponent(null); setShowPicker(false); }}
              className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          ) : (
            <button
              onClick={() => setShowPicker(!showPicker)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md transition-all",
                showPicker ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Compare <ChevronDown className="w-3 h-3" />
            </button>
          )
        )}
      </div>

      {/* Opponent picker */}
      {showPicker && !opponent && (
        <div className="mb-3 rounded-xl border border-border bg-muted/50 p-2 animate-fade-up">
          <input
            type="text"
            placeholder="Search opponent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 px-3 text-xs rounded-lg border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 mb-1.5"
            autoFocus
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filteredTeams.map((t) => (
              <button
                key={t}
                onClick={() => { setOpponent(t); setShowPicker(false); setSearch(""); }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-md hover:bg-card transition-colors flex items-center gap-2"
              >
                <TeamLogo teamName={t} size="xs" />
                {t}
              </button>
            ))}
            {filteredTeams.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">No teams found</p>
            )}
          </div>
        </div>
      )}

      {/* Solo mode */}
      {!opponent && (
        <>
          <div className="mt-3 mb-2 flex items-end gap-2">
            <span className="font-mono text-4xl font-bold tracking-tighter leading-none text-foreground">
              {probability.toFixed(1)}
            </span>
            <span className="text-xl font-mono text-muted-foreground mb-0.5">%</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Based on {teamName}'s season performance
          </p>
          <div className="probability-bar">
            <div
              className="probability-fill"
              style={{ width: `${probability}%`, transition: "width 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground font-mono">0%</span>
            <span className="text-[10px] text-muted-foreground font-mono">100%</span>
          </div>
        </>
      )}

      {/* VS mode */}
      {opponent && oppProb !== null && (
        <div className="mt-2 animate-fade-up">
          {/* Team names + probabilities */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TeamLogo teamName={teamName} size="sm" />
              <div>
                <p className="text-xs font-bold leading-none">{teamName}</p>
                <p className="font-mono text-lg font-bold text-primary leading-tight">{teamA.toFixed(1)}%</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase">vs</span>
            <div className="flex items-center gap-2 text-right">
              <div>
                <p className="text-xs font-bold leading-none">{opponent}</p>
                <p className="font-mono text-lg font-bold text-foreground leading-tight">{teamB.toFixed(1)}%</p>
              </div>
              <TeamLogo teamName={opponent} size="sm" />
            </div>
          </div>

          {/* Split bar */}
          <div className="h-3 rounded-full overflow-hidden flex bg-muted">
            <div
              className="h-full bg-primary rounded-l-full transition-all duration-700"
              style={{ width: `${pctA}%` }}
            />
            <div
              className="h-full bg-foreground/30 rounded-r-full transition-all duration-700"
              style={{ width: `${pctB}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] font-mono text-primary font-semibold">{pctA.toFixed(0)}%</span>
            <span className="text-[10px] font-mono text-muted-foreground font-semibold">{pctB.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {opponent && oppProb === null && (
        <p className="text-xs text-muted-foreground mt-3">No data available for {opponent}</p>
      )}
    </div>
  );
};
