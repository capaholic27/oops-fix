import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useLiveOdds } from "@/hooks/useLiveOdds";

type Props = {
  home: string;
  away: string;
  /** "h2h" (1X2), "totals" (O/U), "btts". */
  market: "h2h" | "totals" | "btts";
  /** Outcome label as per The Odds API. e.g. home team name / "Draw" / "Over" / "Yes". */
  outcome: string;
  /** For totals only. */
  point?: number;
  /** Model probability used to render the fallback signal row when live data is unavailable. */
  fallbackFairProb?: number;
  fallbackSeed?: string;
  fallbackSide?: "home" | "draw" | "away" | "generic";
  className?: string;
};

const domainFor: Record<string, string> = {
  unibet_eu: "unibet.com",
  unibet: "unibet.com",
  betfair: "betfair.com",
  betfair_ex_eu: "betfair.com",
  williamhill: "williamhill.com",
  betsson: "betsson.com",
  bet365: "bet365.com",
  bwin: "bwin.com",
  betway: "betway.com",
  pinnacle: "pinnacle.com",
  marathonbet: "marathonbet.com",
  ladbrokes: "ladbrokes.com",
  coral: "coral.co.uk",
  matchbook: "matchbook.com",
  onexbet: "1xbet.com",
  sport888: "888sport.com",
  paddypower: "paddypower.com",
  skybet: "skybet.com",
  boylesports: "boylesports.com",
  betvictor: "betvictor.com",
  nordicbet: "nordicbet.com",
};

function logoFor(key: string, title: string): string {
  const domain = domainFor[key] ?? `${key.replace(/_.*$/, "")}.com`;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Renders real live odds for a fixture+market from The Odds API when
 * available; falls back to the signal-based BookmakerOddsRow if the key is
 * not configured or the fixture isn't listed.
 */
export const LiveOddsRow = ({
  home, away, market, outcome, point,
  fallbackFairProb, fallbackSeed, fallbackSide, className,
}: Props) => {
  const live = useLiveOdds(home, away);

  const rows = useMemo(() => {
    if (!live?.found) return null;
    const list: { key: string; title: string; price: number }[] = [];
    // Our team names may be short forms ("Man City") — map to the bookmaker's names.
    const want = outcome === home ? live.event?.home ?? outcome
      : outcome === away ? live.event?.away ?? outcome : outcome;
    for (const b of live.bookmakers) {
      const m = b.markets.find(mm => mm.key === market);
      if (!m) continue;
      const target = m.outcomes.find(o =>
        o.name.toLowerCase() === want.toLowerCase()
        && (point === undefined || o.point === point)
      );
      if (target) list.push({ key: b.key, title: b.title, price: target.price });
    }
    return list;
  }, [live, market, outcome, point, home, away]);

  if (live === null) {
    return <span className={cn("text-[10px] text-muted-foreground", className)}>Loading odds…</span>;
  }
  if (!rows || rows.length === 0) {
    return <span className={cn("text-[10px] text-muted-foreground", className)}>No bookmaker odds yet</span>;
  }

  const best = rows.reduce((m, r) => (r.price > m ? r.price : m), 0);

  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto scrollbar-none -mx-0.5 px-0.5", className)}>
      {rows.map(r => {
        const isBest = r.price === best && rows.length > 1;
        return (
          <div
            key={r.key}
            title={`${r.title} · ${r.price.toFixed(2)}`}
            className={cn(
              "shrink-0 flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-bold transition-colors",
              isBest
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-border bg-card/60 text-foreground"
            )}
          >
            <img
              src={logoFor(r.key, r.title)}
              alt=""
              width={12}
              height={12}
              loading="lazy"
              className="w-3 h-3 rounded-sm"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            <span>{r.price.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
};
