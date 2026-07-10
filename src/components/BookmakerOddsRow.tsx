import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { bookmakerLogo, getActiveBookmakers, priceFor, type Bookmaker } from "@/lib/bookmakers";

type Props = {
  /** Deterministic seed so odds are stable for the same market. */
  seed: string;
  /** Model probability, 0..1. */
  fairProb: number;
  side?: "home" | "draw" | "away" | "generic";
  /** Highlight the best price. */
  highlightBest?: boolean;
  className?: string;
};

/** Inline row of bookmaker chips showing this market's live signal odds. */
export const BookmakerOddsRow = ({
  seed,
  fairProb,
  side = "generic",
  highlightBest = true,
  className,
}: Props) => {
  const [active, setActive] = useState<Bookmaker[]>(getActiveBookmakers);

  useEffect(() => {
    const refresh = () => setActive(getActiveBookmakers());
    window.addEventListener("bookmakers-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("bookmakers-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!active.length) return null;

  const rows = active.map(b => ({ b, odds: priceFor(b, fairProb, side, seed) }));
  const bestOdds = rows.reduce((m, r) => (r.odds > m ? r.odds : m), 0);

  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto scrollbar-none -mx-0.5 px-0.5", className)}>
      {rows.map(({ b, odds }) => {
        const isBest = highlightBest && odds === bestOdds && rows.length > 1;
        return (
          <div
            key={b.id}
            title={`${b.name} · ${odds.toFixed(2)}`}
            className={cn(
              "shrink-0 flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-bold transition-colors",
              isBest
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card/60 text-foreground"
            )}
          >
            <img
              src={bookmakerLogo(b)}
              alt=""
              width={12}
              height={12}
              loading="lazy"
              className="w-3 h-3 rounded-sm"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            <span>{odds.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
};
