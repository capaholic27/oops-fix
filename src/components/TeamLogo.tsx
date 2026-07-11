import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { normalizeTeamName } from "@/lib/teamNormalize";

const TEAM_LOGO = (id: number | string) =>
  `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;

/**
 * In-memory cache (URL by team name). Survives component re-mounts during a
 * single page session so logos render instantly the second time around.
 */
const memCache = new Map<string, string | null>();
const loadedUrls = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Read the entire team_logos table once on first mount and prime the in-memory
 * cache. This means after the first paint, EVERY known team's logo is already
 * available locally, so subsequent renders pop in instantly.
 */
let primedPromise: Promise<void> | null = null;
function primeFromDb(): Promise<void> {
  if (primedPromise) return primedPromise;
  primedPromise = (async () => {
    try {
      const { data } = await supabase
        .from("team_logos")
        .select("team_name, logo_url")
        .limit(2000);
      for (const row of data ?? []) {
        if (row.logo_url) memCache.set(row.team_name, row.logo_url);
      }
    } catch (e) {
      console.warn("team_logos prime failed", e);
    }
  })();
  return primedPromise;
}

async function fetchTeamLogo(teamName: string): Promise<string | null> {
  if (memCache.has(teamName)) return memCache.get(teamName)!;
  const norm = normalizeTeamName(teamName);
  if (memCache.has(norm)) return memCache.get(norm)!;

  const key = teamName;
  if (inflight.has(key)) return inflight.get(key)!;

  const p = (async () => {
    // Try DB direct (covers any name variant)
    try {
      const { data } = await supabase
        .from("team_logos")
        .select("team_name, logo_url, fotmob_id")
        .or(`team_name.eq.${teamName.replace(/,/g, " ")},team_name.eq.${norm.replace(/,/g, " ")}`)
        .limit(1)
        .maybeSingle();
      if (data?.logo_url) {
        memCache.set(teamName, data.logo_url);
        memCache.set(norm, data.logo_url);
        return data.logo_url;
      }
    } catch { /* ignore */ }

    // Fall back to the resolver edge function
    try {
      const { data } = await supabase.functions.invoke("resolve-team-logo", {
        body: { team: teamName },
      });
      const url = (data?.logo_url as string | null) ?? null;
      memCache.set(teamName, url);
      memCache.set(norm, url);
      return url;
    } catch {
      memCache.set(teamName, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
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
  /** Pass when you already know the Fotmob team id (e.g. from standings rows). */
  fotmobId?: number | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  xs: "w-4 h-4 text-[6px]",
  sm: "w-6 h-6 text-[8px]",
  md: "w-8 h-8 text-[10px]",
  lg: "w-12 h-12 text-xs",
};

import { getCountryInfo, flagUrl } from "@/lib/countries";

const flagSizes = {
  xs: "w-4 h-4",
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-12 h-12",
} as const;

export const TeamLogo = ({ teamName, fotmobId, size = "sm", className }: Props) => {
  // National teams: render the modern country flag (not the federation crest,
  // which is often outdated). Flagcdn is instant and deterministic.
  const country = getCountryInfo(teamName);
  if (country) {
    return (
      <div className={cn("flex-shrink-0 rounded-full overflow-hidden border border-border bg-muted", flagSizes[size], className)}>
        <img
          src={flagUrl(country.iso2, size === "lg" ? 160 : 80)}
          alt={teamName}
          className="w-full h-full object-cover"
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  const fromId = fotmobId ? TEAM_LOGO(fotmobId) : null;
  const initial =
    fromId ??
    memCache.get(teamName) ??
    memCache.get(normalizeTeamName(teamName)) ??
    null;

  const [badge, setBadge] = useState<string | null>(initial);
  const [loaded, setLoaded] = useState<boolean>(() => !!initial && loadedUrls.has(initial));
  const [errored, setErrored] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setErrored(false);

    if (fromId) {
      setBadge(fromId);
      setLoaded(loadedUrls.has(fromId));
      return () => { mounted.current = false; };
    }

    const cached =
      memCache.get(teamName) ?? memCache.get(normalizeTeamName(teamName));
    if (cached !== undefined) {
      setBadge(cached);
      setLoaded(!!cached && loadedUrls.has(cached));
    } else {
      setLoaded(false);
      // Prime once per session, then resolve.
      primeFromDb().then(() => {
        if (!mounted.current) return;
        const primed =
          memCache.get(teamName) ?? memCache.get(normalizeTeamName(teamName));
        if (primed !== undefined) {
          setBadge(primed);
          if (primed && loadedUrls.has(primed)) setLoaded(true);
          if (primed) return;
        }
        // Still nothing — go fetch.
        fetchTeamLogo(teamName).then((url) => {
          if (!mounted.current) return;
          setBadge(url);
          if (url && loadedUrls.has(url)) setLoaded(true);
        });
      });
    }
    return () => { mounted.current = false; };
  }, [teamName, fromId]);

  const sizeClass = sizes[size];

  if (badge && !errored) {
    return (
      <div className={cn("flex-shrink-0 relative", sizeClass, className)}>
        {!loaded && (
          <div className={cn(
            "absolute inset-0 rounded-full flex items-center justify-center font-bold font-mono bg-muted text-muted-foreground border border-border text-[inherit]",
            sizeClass
          )}>
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
