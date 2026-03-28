import { cn } from "@/lib/utils";

const LEAGUE_LOGOS: Record<string, string> = {
  "Premier League": "https://www.thesportsdb.com/images/media/league/badge/i6o0kh1549879062.png",
  "La Liga": "https://www.thesportsdb.com/images/media/league/badge/7onmyv1534768460.png",
  "Serie A": "https://www.thesportsdb.com/images/media/league/badge/ocy2fe1566216901.png",
  "Bundesliga": "https://www.thesportsdb.com/images/media/league/badge/0j55yv1534764799.png",
  "Ligue 1": "https://www.thesportsdb.com/images/media/league/badge/8f5jmf1516458074.png",
};

const LEAGUE_SHORT: Record<string, string> = {
  "Premier League": "PL",
  "La Liga": "LL",
  "Serie A": "SA",
  "Bundesliga": "BL",
  "Ligue 1": "L1",
};

type Props = {
  leagueName: string;
  size?: "xs" | "sm" | "md";
  className?: string;
};

const sizes = {
  xs: "w-3.5 h-3.5 text-[6px]",
  sm: "w-5 h-5 text-[7px]",
  md: "w-7 h-7 text-[9px]",
};

export const LeagueLogo = ({ leagueName, size = "sm", className }: Props) => {
  const url = LEAGUE_LOGOS[leagueName];
  const sizeClass = sizes[size];

  if (url) {
    return (
      <img
        src={url + "/tiny"}
        alt={leagueName}
        className={cn("flex-shrink-0 object-contain", sizeClass, className)}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex-shrink-0 rounded-sm flex items-center justify-center font-bold font-mono bg-primary/10 text-primary",
        sizeClass,
        className
      )}
    >
      {LEAGUE_SHORT[leagueName] ?? leagueName.slice(0, 2).toUpperCase()}
    </div>
  );
};
