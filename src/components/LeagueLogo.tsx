import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Fotmob serves crisp, lightweight league badges via a deterministic CDN URL.
 * Using these (instead of TheSportsDB) means logos render instantly without
 * an extra resolver call, and we get coverage for leagues TheSportsDB missed
 * (MLS, Serie B, A-League, etc.).
 *
 * URL format: https://images.fotmob.com/image_resources/logo/leaguelogo/{id}.png
 */
const FOTMOB_LEAGUE = (id: number) =>
  `https://images.fotmob.com/image_resources/logo/leaguelogo/${id}.png`;

const LEAGUE_FOTMOB_ID: Record<string, number> = {
  // Top 5
  "Premier League": 47,
  "La Liga": 87,
  "Serie A": 55,
  "Bundesliga": 54,
  "Ligue 1": 53,
  // Domestic 2nd tiers
  "Championship": 48,
  "La Liga 2": 140,
  "Bundesliga 2": 146,
  "Serie B": 86,
  "Ligue 2": 110,
  // Other top European leagues
  "Eredivisie": 57,
  "Primeira Liga": 61,
  "Super Lig": 71,
  "Süper Lig": 71,
  "Super League Greece": 67,
  "Scottish Premiership": 64,
  "Scottish Championship": 65,
  "Allsvenskan": 67,
  "Eliteserien": 59,
  // English lower
  "League One": 108,
  "League Two": 109,
  // UEFA / FIFA
  "Champions League": 42,
  "UEFA Champions League": 42,
  "Europa League": 73,
  "UEFA Europa League": 73,
  "Conference League": 10216,
  "UEFA Conference League": 10216,
  // Americas
  "Major League Soccer": 130,
  "MLS": 130,
  "Liga MX": 230,
  "Brasileirao": 268,
  "Serie A Brazil": 268,
  // Asia / Oceania
  "A-League": 113,
  "A-League Men": 113,
  "J1 League": 168,
  "K League 1": 175,
  "Saudi Pro League": 536,
  // Internationals
  "World Cup": 77,
  "Euros": 50,
  "AFCON": 6427,
  "Copa America": 44,
  "FIFA Club World Cup": 78,
  "Nations League": 10204,
  "UEFA Nations League": 10204,
  "International": 114,
  "Friendlies": 489,
  "Club Friendlies": 489,
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
  "Conference League": "EC",
  "Super Lig": "TR",
  "Süper Lig": "TR",
  "Super League Greece": "GR",
  "Scottish Premiership": "SP",
  "Scottish Championship": "SC",
  "League One": "L1",
  "League Two": "L2",
  "La Liga 2": "L2",
  "Bundesliga 2": "B2",
  "Serie B": "SB",
  "Allsvenskan": "AS",
  "Major League Soccer": "ML",
  "MLS": "ML",
  "A-League": "AL",
  "A-League Men": "AL",
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
  const id = LEAGUE_FOTMOB_ID[leagueName];
  const sizeClass = sizes[size];
  const [errored, setErrored] = useState(false);

  if (id && !errored) {
    return (
      <img
        src={FOTMOB_LEAGUE(id)}
        alt={leagueName}
        className={cn("flex-shrink-0 object-contain", sizeClass, className)}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
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
