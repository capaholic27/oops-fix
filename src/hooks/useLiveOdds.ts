import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LiveOddsBookmaker = {
  key: string;
  title: string;
  markets: Array<{
    key: string;
    outcomes: Array<{ name: string; price: number; point?: number }>;
  }>;
};

export type LiveOddsResult = {
  found: boolean;
  bookmakers: LiveOddsBookmaker[];
};

const cache = new Map<string, Promise<LiveOddsResult>>();

/**
 * Fetch live odds for one fixture from The Odds API (via the fetch-odds
 * edge function). Cached in-memory for the session so we don't burn API
 * quota on repeat renders. Returns { found: false, bookmakers: [] } when
 * the key isn't configured or the fixture isn't listed yet.
 */
export function useLiveOdds(home: string | undefined | null, away: string | undefined | null): LiveOddsResult | null {
  const [state, setState] = useState<LiveOddsResult | null>(null);

  useEffect(() => {
    if (!home || !away) { setState(null); return; }
    const key = `${home}__${away}`.toLowerCase();
    let cancelled = false;

    const existing = cache.get(key);
    if (existing) {
      existing.then((r) => { if (!cancelled) setState(r); });
      return () => { cancelled = true; };
    }

    const p = (async (): Promise<LiveOddsResult> => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-odds?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
        const res = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string}`,
          },
        });
        const json = await res.json();
        return { found: !!json.found, bookmakers: json.bookmakers ?? [] };
      } catch {
        return { found: false, bookmakers: [] };
      }
    })();

    cache.set(key, p);
    p.then((r) => { if (!cancelled) setState(r); });
    return () => { cancelled = true; };
  }, [home, away]);

  return state;
}

/**
 * Extract the best decimal price for a specific outcome from a live odds
 * result. Returns null if no bookmaker priced this outcome.
 */
export function bestLivePrice(
  result: LiveOddsResult | null,
  market: "h2h" | "totals" | "btts",
  outcome: string,
  point?: number,
): { price: number; book: string } | null {
  if (!result?.found) return null;
  let best: { price: number; book: string } | null = null;
  for (const b of result.bookmakers) {
    const m = b.markets.find((mm) => mm.key === market);
    if (!m) continue;
    const target = m.outcomes.find((o) =>
      o.name.toLowerCase() === outcome.toLowerCase()
      && (point === undefined || o.point === point)
    );
    if (target && (!best || target.price > best.price)) {
      best = { price: target.price, book: b.title };
    }
  }
  return best;
}
