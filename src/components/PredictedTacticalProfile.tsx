import { predictNextMatchStyles, type StylePrediction } from "@/lib/tacticalPredictor";
import type { AggregatedStats, TeamMatchView } from "@/lib/matchStats";
import { Calendar } from "lucide-react";

type Props = {
  stats: AggregatedStats;
  teamName: string;
  views: TeamMatchView[];
  opponentStats?: AggregatedStats | null;
  opponentName?: string;
  nextFixture?: { date: string; isHome: boolean } | null;
};

export const PredictedTacticalProfile = ({ stats, teamName, views, opponentStats, opponentName }: Props) => {
  const predictions = predictNextMatchStyles(stats, views, opponentStats);
  const topStyle = predictions[0];

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "550ms" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="stat-label">Predicted Game Style</span>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Next match
        </span>
      </div>
      {opponentName ? (
        <p className="text-xs text-muted-foreground mb-4">
          How {teamName} will likely play <span className="font-semibold text-foreground">vs {opponentName}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mb-4">
          Prediction based on {teamName}'s recent patterns & form
        </p>
      )}

      <div className="space-y-2.5">
        {predictions.map((p, i) => (
          <div key={p.style} className="group">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold ${
                    i === 0 ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {i + 1}. {p.style}
                </span>
                {i === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                    Most likely
                  </span>
                )}
              </div>
              <span
                className={`font-mono text-sm font-bold ${
                  i === 0 ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {p.probability}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${p.color}`}
                style={{
                  width: `${p.probability}%`,
                  opacity: i === 0 ? 1 : 0.6,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug opacity-0 max-h-0 group-hover:opacity-100 group-hover:max-h-8 transition-all duration-200 overflow-hidden">
              {p.description}
            </p>
          </div>
        ))}
      </div>

      {/* Context note */}
      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {topStyle.probability > 30
            ? `${teamName} will most likely play a ${topStyle.style.toLowerCase()} style. ${topStyle.description}.`
            : `${teamName} shows a balanced approach — no dominant style predicted.`}
        </p>
      </div>
    </div>
  );
};
