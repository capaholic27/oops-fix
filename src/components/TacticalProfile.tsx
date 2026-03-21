import type { TacticalProfile as TacticalProfileType } from "@/lib/matchStats";

type Props = {
  profile: TacticalProfileType;
  teamName: string;
};

const BarMeter = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
);

export const TacticalProfileCard = ({ profile, teamName }: Props) => {
  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "550ms" }}>
      <div className="flex items-center justify-between mb-4">
        <span className="stat-label">Tactical Profile</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
          {profile.style}
        </span>
      </div>

      <div className="space-y-3">
        <BarMeter label="Pressing" value={profile.pressing} color="bg-stat-warn" />
        <BarMeter label="Attacking" value={profile.attacking} color="bg-stat-positive" />
        <BarMeter label="Defensive" value={profile.defensive} color="bg-primary" />
        <BarMeter label="Volatile" value={profile.volatile} color="bg-stat-negative" />
        <BarMeter label="Counter-Attack" value={profile.counterAttack} color="bg-accent" />
      </div>

      <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
        {profile.description}
      </p>
    </div>
  );
};
