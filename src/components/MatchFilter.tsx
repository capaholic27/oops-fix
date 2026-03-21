import { Input } from "@/components/ui/input";

type Props = {
  pastN: number;
  onPastNChange: (n: number) => void;
  leagueCode: string;
  onLeagueChange: (code: string) => void;
  leagues: { code: string; name: string }[];
};

export const MatchFilter = ({ pastN, onPastNChange, leagueCode, onLeagueChange, leagues }: Props) => {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <label className="stat-label">Past matches</label>
        <Input
          type="number"
          min={1}
          max={50}
          value={pastN}
          onChange={(e) => onPastNChange(Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
          className="w-20 h-9 font-mono text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label className="stat-label">League</label>
        <select
          value={leagueCode}
          onChange={(e) => onLeagueChange(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Leagues</option>
          {leagues.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
