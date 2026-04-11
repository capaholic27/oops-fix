import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const logoCache = new Map<string, string | null>();

async function fetchTeamBadge(teamName: string): Promise<string | null> {
  if (logoCache.has(teamName)) return logoCache.get(teamName)!;

  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`,
      { signal: AbortSignal.timeout(5000) }
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
    logoCache.set(teamName, null);
    return null;
  }
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
  const [badge, setBadge] = useState<string | null>(logoCache.get(teamName) ?? null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setErrored(false);

    if (logoCache.has(teamName)) {
      setBadge(logoCache.get(teamName)!);
    } else {
      fetchTeamBadge(teamName).then((url) => {
        if (!cancelled) setBadge(url);
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
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          loading="lazy"
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
