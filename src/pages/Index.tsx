import { useState } from "react";
import { teams, type TeamStats } from "@/data/teamStats";
import { TeamSelector } from "@/components/TeamSelector";
import { StatCard } from "@/components/StatCard";
import { WinProbabilityGauge } from "@/components/WinProbabilityGauge";
import { FormBadge } from "@/components/FormBadge";
import { PlayerFoulsTable } from "@/components/PlayerFoulsTable";
import { Target, Flag, AlertTriangle, Shield, TrendingUp, BarChart3 } from "lucide-react";

const Index = () => {
  const [team, setTeam] = useState<TeamStats>(teams[0]);

  const winRate = ((team.wins / team.matchesPlayed) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">FootballEdge</h1>
              <p className="text-xs text-muted-foreground">Statistical advantage finder</p>
            </div>
          </div>
          <span className="text-xs font-mono text-muted-foreground hidden sm:block">
            Season 2024/25
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Team Selector */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Select Team
          </h2>
          <TeamSelector selectedTeam={team} onSelect={setTeam} />
        </section>

        {/* Team header */}
        <section
          key={team.id}
          className="flex items-center gap-4 opacity-0 animate-fade-up"
        >
          <span className="text-4xl">{team.logo}</span>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{team.name}</h2>
            <p className="text-sm text-muted-foreground">{team.league} · {team.matchesPlayed} matches played</p>
          </div>
          <div className="ml-auto flex gap-1.5">
            {team.formLast5.map((r, i) => (
              <FormBadge key={i} result={r} />
            ))}
          </div>
        </section>

        {/* Key Stats Grid */}
        <div key={`stats-${team.id}`} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <WinProbabilityGauge probability={team.winProbability} teamName={team.name} />

          <StatCard
            label="Win Rate"
            value={`${winRate}%`}
            icon={<TrendingUp className="w-4 h-4" />}
            trend={parseFloat(winRate) > 60 ? "positive" : parseFloat(winRate) > 40 ? "neutral" : "negative"}
            subtitle={`${team.wins}W ${team.draws}D ${team.losses}L`}
            delay={200}
          />

          <StatCard
            label="Avg Corners (For)"
            value={team.avgCornersFor.toFixed(1)}
            icon={<Flag className="w-4 h-4" />}
            trend="neutral"
            subtitle={`Against: ${team.avgCornersAgainst.toFixed(1)}`}
            delay={250}
          />

          <StatCard
            label="Avg Corners (Total)"
            value={(team.avgCornersFor + team.avgCornersAgainst).toFixed(1)}
            icon={<Flag className="w-4 h-4" />}
            trend="warn"
            subtitle="Per match combined"
            delay={300}
          />

          <StatCard
            label="Avg Yellow Cards"
            value={team.avgYellowCards.toFixed(1)}
            icon={<AlertTriangle className="w-4 h-4" />}
            trend="warn"
            subtitle={`Red: ${team.avgRedCards.toFixed(2)} per match`}
            delay={350}
          />

          <StatCard
            label="Avg Fouls Committed"
            value={team.avgFoulsCommitted.toFixed(1)}
            icon={<Shield className="w-4 h-4" />}
            trend="negative"
            subtitle={`Drawn: ${team.avgFoulsDrawn.toFixed(1)}`}
            delay={400}
          />

          <StatCard
            label="Over 2.5 Goals"
            value={`${team.over25Percentage}%`}
            icon={<Target className="w-4 h-4" />}
            trend={team.over25Percentage > 60 ? "positive" : "neutral"}
            subtitle={`Over 1.5: ${team.over15Percentage}%`}
            delay={450}
          />

          <StatCard
            label="Clean Sheets"
            value={team.cleanSheets}
            icon={<Shield className="w-4 h-4" />}
            trend="positive"
            subtitle={`BTTS: ${team.bttsPercentage}%`}
            delay={475}
          />
        </div>

        {/* Goals */}
        <div key={`goals-${team.id}`} className="grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            label="Goals Scored"
            value={team.goalsFor}
            trend="positive"
            subtitle={`${(team.goalsFor / team.matchesPlayed).toFixed(2)} per match`}
            delay={200}
          />
          <StatCard
            label="Goals Conceded"
            value={team.goalsAgainst}
            trend="negative"
            subtitle={`${(team.goalsAgainst / team.matchesPlayed).toFixed(2)} per match`}
            delay={250}
          />
        </div>

        {/* Player Fouls */}
        <div key={`players-${team.id}`} className="grid grid-cols-1">
          <PlayerFoulsTable players={team.players} />
        </div>

        {/* Footer */}
        <footer className="text-center py-6 text-xs text-muted-foreground">
          Data is illustrative. Connect a live API for real-time stats.
        </footer>
      </main>
    </div>
  );
};

export default Index;
