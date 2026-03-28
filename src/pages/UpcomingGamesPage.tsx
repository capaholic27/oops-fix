import { CalendarDays } from "lucide-react";

const UpcomingGamesPage = () => (
  <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
    <div className="retro-border bg-card p-8 max-w-sm w-full">
      <CalendarDays className="w-10 h-10 text-primary mx-auto mb-3" />
      <h2 className="text-lg mb-1">Upcoming Games</h2>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        Fixture list coming soon
      </p>
    </div>
  </div>
);

export default UpcomingGamesPage;
