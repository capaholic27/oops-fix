import { cn } from "@/lib/utils";

const LEAGUE_LOGOS: Record<string, string> = {
  "Premier League": "https://www.thesportsdb.com/images/media/league/badge/i6o0kh1549879062.png",
  "La Liga": "https://www.thesportsdb.com/images/media/league/badge/7onmyv1534768460.png",
  "Serie A": "https://www.thesportsdb.com/images/media/league/badge/ocy2fe1566216901.png",
  "Bundesliga": "https://www.thesportsdb.com/images/media/league/badge/0j55yv1534764799.png",
  "Ligue 1": "https://www.thesportsdb.com/images/media/league/badge/8f5jmf1516458074.png",
  "Championship": "https://www.thesportsdb.com/images/media/league/badge/wsvyvq1535811932.png",
  "Eredivisie": "https://www.thesportsdb.com/images/media/league/badge/b0pam11637935089.png",
  "Primeira Liga": "https://www.thesportsdb.com/images/media/league/badge/dqo6r91549878326.png",
  "Champions League": "https://www.thesportsdb.com/images/media/league/badge/ygfwz71679951586.png",
  "Europa League": "https://www.thesportsdb.com/images/media/league/badge/b3fgmu1621772739.png",
  "Super Lig": "https://www.thesportsdb.com/images/media/league/badge/cjjji01637935101.png",
  "Super League Greece": "https://www.thesportsdb.com/images/media/league/badge/xrtxqx1549879000.png",
  "Scottish Premiership": "https://www.thesportsdb.com/images/media/league/badge/r2yvlq1535815090.png",
  "Scottish Championship": "https://www.thesportsdb.com/images/media/league/badge/auu7or1558105917.png",
  "League One": "https://www.thesportsdb.com/images/media/league/badge/jqkq1e1637935090.png",
  "League Two": "https://www.thesportsdb.com/images/media/league/badge/pzxzp51637935094.png",
};

const LEAGUE_SHORT: Record<string, string> = {
  "Premier League": "PL",
  "La Liga": "LL",
  "Serie A": "SA",
  "Bundesliga": "BL",
  "Ligue 1": "L1",
  "Championship": "CH",
  "Eredivisie": "ED",
  "Primeira Liga": "PT",
  "Champions League": "CL",
  "Europa League": "EL",
  "Super Lig": "TR",
  "Super League Greece": "GR",
  "Scottish Premiership": "SP",
  "Scottish Championship": "SC",
  "League One": "L1",
  "League Two": "L2",
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
        src={url}
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
