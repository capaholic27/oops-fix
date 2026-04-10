type WinProbabilityGaugeProps = {
  probability: number;
  teamName: string;
};

export const WinProbabilityGauge = ({ probability, teamName }: WinProbabilityGaugeProps) => {
  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "100ms" }}>
      <span className="stat-label">Win Probability</span>
      <div className="mt-4 mb-2 flex items-end gap-2">
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
    </div>
  );
};
