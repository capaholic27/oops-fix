import { teams, type TeamStats } from "@/data/teamStats";

type TeamSelectorProps = {
  selectedTeam: TeamStats;
  onSelect: (team: TeamStats) => void;
};

export const TeamSelector = ({ selectedTeam, onSelect }: TeamSelectorProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {teams.map((team) => (
        <button
          key={team.id}
          onClick={() => onSelect(team)}
          className={`
            inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
            transition-all duration-200 border
            active:scale-[0.97]
            ${
              selectedTeam.id === team.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-foreground border-border hover:border-primary/40 hover:shadow-sm"
            }
          `}
        >
          <span className="text-base">{team.logo}</span>
          <span>{team.name}</span>
        </button>
      ))}
    </div>
  );
};
