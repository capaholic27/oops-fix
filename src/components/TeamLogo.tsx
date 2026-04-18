import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { normalizeTeamName } from "@/lib/teamNormalize";

/**
 * Static CDN badge map for popular teams – loads instantly, no API call needed.
 * Uses TheSportsDB CDN which is reliable and fast.
 */
const STATIC_BADGES: Record<string, string> = {
  // Premier League
  "Arsenal": "https://r2.thesportsdb.com/images/media/team/badge/uyhbfe1612467038.png",
  "Aston Villa": "https://r2.thesportsdb.com/images/media/team/badge/wsyuvp1448813371.png",
  "AFC Bournemouth": "https://r2.thesportsdb.com/images/media/team/badge/y9ocfx1548011888.png",
  "Bournemouth": "https://r2.thesportsdb.com/images/media/team/badge/y9ocfx1548011888.png",
  "Brentford": "https://r2.thesportsdb.com/images/media/team/badge/qqqwrq1421393789.png",
  "Brighton": "https://r2.thesportsdb.com/images/media/team/badge/5ythxr1698854925.png",
  "Brighton & Hove Albion": "https://r2.thesportsdb.com/images/media/team/badge/5ythxr1698854925.png",
  "Chelsea": "https://r2.thesportsdb.com/images/media/team/badge/yvwvtu1448813215.png",
  "Crystal Palace": "https://r2.thesportsdb.com/images/media/team/badge/xqwpup1448813405.png",
  "Everton": "https://r2.thesportsdb.com/images/media/team/badge/yqptws1448813306.png",
  "Fulham": "https://r2.thesportsdb.com/images/media/team/badge/xwwvyt1448813399.png",
  "Ipswich": "https://r2.thesportsdb.com/images/media/team/badge/tkuxqt1421591248.png",
  "Ipswich Town": "https://r2.thesportsdb.com/images/media/team/badge/tkuxqt1421591248.png",
  "Leicester": "https://r2.thesportsdb.com/images/media/team/badge/lbfnuw1613661682.png",
  "Leicester City": "https://r2.thesportsdb.com/images/media/team/badge/lbfnuw1613661682.png",
  "Liverpool": "https://r2.thesportsdb.com/images/media/team/badge/uvxuqq1448813372.png",
  "Manchester City": "https://r2.thesportsdb.com/images/media/team/badge/vwpvry1467462651.png",
  "Man City": "https://r2.thesportsdb.com/images/media/team/badge/vwpvry1467462651.png",
  "Manchester United": "https://r2.thesportsdb.com/images/media/team/badge/xzqdr11517660252.png",
  "Man United": "https://r2.thesportsdb.com/images/media/team/badge/xzqdr11517660252.png",
  "Newcastle": "https://r2.thesportsdb.com/images/media/team/badge/2psi711534010940.png",
  "Newcastle United": "https://r2.thesportsdb.com/images/media/team/badge/2psi711534010940.png",
  "Nottingham Forest": "https://r2.thesportsdb.com/images/media/team/badge/yrxrqp1448813383.png",
  "Nott'm Forest": "https://r2.thesportsdb.com/images/media/team/badge/yrxrqp1448813383.png",
  "Southampton": "https://r2.thesportsdb.com/images/media/team/badge/quvxsq1421747949.png",
  "Tottenham": "https://r2.thesportsdb.com/images/media/team/badge/5yryqr1448813356.png",
  "Tottenham Hotspur": "https://r2.thesportsdb.com/images/media/team/badge/5yryqr1448813356.png",
  "West Ham": "https://r2.thesportsdb.com/images/media/team/badge/dxyrxw1448813352.png",
  "West Ham United": "https://r2.thesportsdb.com/images/media/team/badge/dxyrxw1448813352.png",
  "Wolverhampton Wanderers": "https://r2.thesportsdb.com/images/media/team/badge/yqptyy1448813358.png",
  "Wolves": "https://r2.thesportsdb.com/images/media/team/badge/yqptyy1448813358.png",
  // La Liga
  "Real Madrid": "https://r2.thesportsdb.com/images/media/team/badge/vrespq1448813426.png",
  "Barcelona": "https://r2.thesportsdb.com/images/media/team/badge/xqwpup1448813390.png",
  "Atletico Madrid": "https://r2.thesportsdb.com/images/media/team/badge/xx3bri1704627291.png",
  "Sevilla": "https://r2.thesportsdb.com/images/media/team/badge/tqwtpx1448813432.png",
  "Real Sociedad": "https://r2.thesportsdb.com/images/media/team/badge/svwyxw1448813426.png",
  "Villarreal": "https://r2.thesportsdb.com/images/media/team/badge/wrtsxr1448813424.png",
  "Real Betis": "https://r2.thesportsdb.com/images/media/team/badge/uwvxvs1448813428.png",
  "Athletic Bilbao": "https://r2.thesportsdb.com/images/media/team/badge/xvwurs1448813419.png",
  // Serie A
  "Inter Milan": "https://r2.thesportsdb.com/images/media/team/badge/yy87ac1635070130.png",
  "AC Milan": "https://r2.thesportsdb.com/images/media/team/badge/uqypqx1467462041.png",
  "Juventus": "https://r2.thesportsdb.com/images/media/team/badge/pvskqz1611757482.png",
  "Napoli": "https://r2.thesportsdb.com/images/media/team/badge/yysusw1420811842.png",
  "AS Roma": "https://r2.thesportsdb.com/images/media/team/badge/shqroe1611757757.png",
  "Roma": "https://r2.thesportsdb.com/images/media/team/badge/shqroe1611757757.png",
  "Lazio": "https://r2.thesportsdb.com/images/media/team/badge/yrxrqp1448813388.png",
  "Atalanta": "https://r2.thesportsdb.com/images/media/team/badge/xss5xr1421764227.png",
  "Fiorentina": "https://r2.thesportsdb.com/images/media/team/badge/txsuxy1421762498.png",
  // Bundesliga
  "Bayern Munich": "https://r2.thesportsdb.com/images/media/team/badge/wuppsx1448813404.png",
  "Borussia Dortmund": "https://r2.thesportsdb.com/images/media/team/badge/vwvpvr1448813410.png",
  "RB Leipzig": "https://r2.thesportsdb.com/images/media/team/badge/yyu5t71550207722.png",
  "Bayer Leverkusen": "https://r2.thesportsdb.com/images/media/team/badge/sstptr1448813413.png",
  // Ligue 1
  "Paris Saint-Germain": "https://r2.thesportsdb.com/images/media/team/badge/rwqrrq1467462374.png",
  "PSG": "https://r2.thesportsdb.com/images/media/team/badge/rwqrrq1467462374.png",
  "Marseille": "https://r2.thesportsdb.com/images/media/team/badge/xwusxq1421757886.png",
  "Monaco": "https://r2.thesportsdb.com/images/media/team/badge/xvwxvs1421758032.png",
  "Lyon": "https://r2.thesportsdb.com/images/media/team/badge/yvpvqr1448813435.png",
  // Other
  "Ajax": "https://r2.thesportsdb.com/images/media/team/badge/yywpxs1448813422.png",
  "PSV Eindhoven": "https://r2.thesportsdb.com/images/media/team/badge/tyuxwq1448813414.png",
  "Feyenoord": "https://r2.thesportsdb.com/images/media/team/badge/xuqwqs1421768726.png",
  "Benfica": "https://r2.thesportsdb.com/images/media/team/badge/yrxrqp1448813378.png",
  "Porto": "https://r2.thesportsdb.com/images/media/team/badge/tpxwut1448813428.png",
  "Sporting CP": "https://r2.thesportsdb.com/images/media/team/badge/xsqpqr1448813430.png",
  "Celtic": "https://r2.thesportsdb.com/images/media/team/badge/ywqprr1448813318.png",
  "Rangers": "https://r2.thesportsdb.com/images/media/team/badge/upxrxp1448813362.png",
  "Galatasaray": "https://r2.thesportsdb.com/images/media/team/badge/rqqtyy1448813424.png",
  "Fenerbahce": "https://r2.thesportsdb.com/images/media/team/badge/upwwvs1448813410.png",
  "Besiktas": "https://r2.thesportsdb.com/images/media/team/badge/yxvswy1448813396.png",
};

const logoCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();
const loadedUrls = new Set<string>();

function lookupStatic(teamName: string): string | undefined {
  if (STATIC_BADGES[teamName]) return STATIC_BADGES[teamName];
  const norm = normalizeTeamName(teamName);
  if (STATIC_BADGES[norm]) return STATIC_BADGES[norm];
  return undefined;
}

async function fetchTeamBadge(teamName: string): Promise<string | null> {
  const staticUrl = lookupStatic(teamName);
  if (staticUrl) {
    logoCache.set(teamName, staticUrl);
    return staticUrl;
  }
  if (logoCache.has(teamName)) return logoCache.get(teamName)!;
  if (pendingRequests.has(teamName)) return pendingRequests.get(teamName)!;

  const promise = (async () => {
    try {
      const res = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) {
        logoCache.set(teamName, null);
        return null;
      }
      const data = await res.json();
      const badge = data?.teams?.[0]?.strBadge ?? null;
      logoCache.set(teamName, badge);
      return badge;
    } catch {
      return null;
    } finally {
      pendingRequests.delete(teamName);
    }
  })();

  pendingRequests.set(teamName, promise);
  return promise;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

type Props = {
  teamName: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  xs: "w-4 h-4 text-[6px]",
  sm: "w-6 h-6 text-[8px]",
  md: "w-8 h-8 text-[10px]",
  lg: "w-12 h-12 text-xs",
};

export const TeamLogo = ({ teamName, size = "sm", className }: Props) => {
  const initialUrl = lookupStatic(teamName) ?? logoCache.get(teamName) ?? null;
  const [badge, setBadge] = useState<string | null>(initialUrl);
  const [loaded, setLoaded] = useState<boolean>(() => !!initialUrl && loadedUrls.has(initialUrl));
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErrored(false);

    const staticUrl = lookupStatic(teamName);
    if (staticUrl) {
      setBadge(staticUrl);
      setLoaded(loadedUrls.has(staticUrl));
      return;
    }

    if (logoCache.has(teamName)) {
      const cached = logoCache.get(teamName) ?? null;
      setBadge(cached);
      setLoaded(!!cached && loadedUrls.has(cached));
    } else {
      setLoaded(false);
      fetchTeamBadge(teamName).then((url) => {
        if (cancelled) return;
        setBadge(url);
        if (url && loadedUrls.has(url)) setLoaded(true);
      });
    }
    return () => { cancelled = true; };
  }, [teamName]);

  const sizeClass = sizes[size];

  if (badge && !errored) {
    return (
      <div className={cn("flex-shrink-0 relative", sizeClass, className)}>
        {!loaded && (
          <div className={cn("absolute inset-0 rounded-full flex items-center justify-center font-bold font-mono bg-muted text-muted-foreground border border-border text-[inherit]", sizeClass)}>
            {getInitials(teamName)}
          </div>
        )}
        <img
          src={badge}
          alt={teamName}
          className={cn("w-full h-full object-contain", loaded ? "opacity-100" : "opacity-0")}
          onLoad={() => { loadedUrls.add(badge); setLoaded(true); }}
          onError={() => setErrored(true)}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex-shrink-0 rounded-full flex items-center justify-center font-bold font-mono bg-muted text-muted-foreground border border-border",
        sizeClass,
        className
      )}
    >
      {getInitials(teamName)}
    </div>
  );
};
