import type { AggregatedStats } from "@/lib/matchStats";

type Props = {
  stats: AggregatedStats;
  teamName: string;
};

type StylePrediction = {
  style: string;
  probability: number;
  description: string;
  color: string;
};

function predictStyles(stats: AggregatedStats): StylePrediction[] {
  const tp = stats.tacticalProfile;

  // Normalize scores into probability distribution
  const raw = [
    { style: "Pressing", score: tp.pressing, color: "bg-stat-warn", description: "High press, aggressive recoveries, lots of fouls" },
    { style: "Attacking", score: tp.attacking, color: "bg-stat-positive", description: "Possession-dominant, high shot volume, creative play" },
    { style: "Defensive", score: tp.defensive, color: "bg-primary", description: "Deep block, low concession rate, solid structure" },
    { style: "Counter-Attack", score: tp.counterAttack, color: "bg-accent", description: "Efficient on transitions, clinical finishing" },
    { style: "Volatile", score: tp.volatile, color: "bg-stat-negative", description: "Unpredictable swings, high-scoring chaotic games" },
  ];

  const total = raw.reduce((s, r) => s + r.score, 0) || 1;
  return raw
    .map((r) => ({
      ...r,
      probability: Math.round((r.score / total) * 100),
    }))
    .sort((a, b) => b.probability - a.probability);
}

export const PredictedTacticalProfile = ({ stats, teamName }: Props) => {
  const predictions = predictStyles(stats);
  const topStyle = predictions[0];

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "550ms" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="stat-label">Predicted Game Style</span>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Next match
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Probability ranking based on {teamName}'s recent patterns
      </p>

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
