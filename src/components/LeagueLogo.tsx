import { useState } from "react";
import { cn } from "@/lib/utils";

const LEAGUE_LOGOS: Record<string, string> = {
  "Premier League": "https://r2.thesportsdb.com/images/media/league/badge/gasy9d1737743125.png",
  "La Liga": "https://r2.thesportsdb.com/images/media/league/badge/ja4it51687628717.png",
  "Serie A": "https://r2.thesportsdb.com/images/media/league/badge/67q3q21679951383.png",
  "Bundesliga": "https://r2.thesportsdb.com/images/media/league/badge/teqh1b1679952008.png",
  "Ligue 1": "https://r2.thesportsdb.com/images/media/league/badge/9f7z9d1742983155.png",
  "Championship": "https://r2.thesportsdb.com/images/media/league/badge/ty5a681688770169.png",
  "Champions League": "https://r2.thesportsdb.com/images/media/league/badge/facv1u1742998896.png",
  "Europa League": "https://r2.thesportsdb.com/images/media/league/badge/mlsr7d1718774547.png",
  "Eredivisie": "https://r2.thesportsdb.com/images/media/league/badge/5cdsu21725984946.png",
  "Primeira Liga": "https://r2.thesportsdb.com/images/media/league/badge/lkfko71751917970.png",
  "Super Lig": "https://r2.thesportsdb.com/images/media/league/badge/h7xx231601671132.png",
  "Super League Greece": "https://r2.thesportsdb.com/images/media/league/badge/jm7ky01602788843.png",
  "Scottish Premiership": "https://r2.thesportsdb.com/images/media/league/badge/72d3zc1688333496.png",
  "Scottish Championship": "https://r2.thesportsdb.com/images/media/league/badge/i57nok1721301867.png",
  "League One": "https://r2.thesportsdb.com/images/media/league/badge/afedb31688770443.png",
  "League Two": "https://r2.thesportsdb.com/images/media/league/badge/jmb3ms1688770451.png",
  "La Liga 2": "https://r2.thesportsdb.com/images/media/league/badge/r7u6821688425700.png",
  "Bundesliga 2": "https://r2.thesportsdb.com/images/media/league/badge/hl40981534764789.png",
  "Allsvenskan": "https://r2.thesportsdb.com/images/media/league/badge/denok11707459183.png",
  "Scottish League One": "https://r2.thesportsdb.com/images/media/league/badge/i57nok1721301867.png",
  "Conference League": "https://r2.thesportsdb.com/images/media/league/badge/e5j0kd1718774650.png",
  "World Cup": "https://r2.thesportsdb.com/images/media/league/badge/z0kkx41679951498.png",
  "Euros": "https://r2.thesportsdb.com/images/media/league/badge/u0igkn1687622466.png",
  "AFCON": "https://r2.thesportsdb.com/images/media/league/badge/2ozyuh1547275239.png",
  "FIFA Club World Cup": "https://r2.thesportsdb.com/images/media/league/badge/rsyyrq1471617835.png",
  "Copa America": "https://r2.thesportsdb.com/images/media/league/badge/bwp1bj1625084862.png",
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
  "La Liga 2": "L2",
  "Bundesliga 2": "B2",
  "Allsvenskan": "AS",
  "Conference League": "CL",
  "World Cup": "WC",
  "Euros": "EU",
  "AFCON": "AF",
  "FIFA Club World Cup": "CW",
  "Copa America": "CA",
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
  const [errored, setErrored] = useState(false);

  if (url && !errored) {
    return (
      <img
        src={url}
        alt={leagueName}
        className={cn("flex-shrink-0 object-contain", sizeClass, className)}
        loading="lazy"
        onError={() => setErrored(true)}
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
