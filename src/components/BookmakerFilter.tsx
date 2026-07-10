import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SE_BOOKMAKERS,
  bookmakerLogo,
  loadActiveBookmakerIds,
  saveActiveBookmakerIds,
} from "@/lib/bookmakers";

/** Grid of bookmaker toggle chips for the Bankroll tab / settings. */
export const BookmakerFilter = ({ compact = false }: { compact?: boolean }) => {
  const [ids, setIds] = useState<string[]>(loadActiveBookmakerIds);

  useEffect(() => { saveActiveBookmakerIds(ids); }, [ids]);

  const toggle = (id: string) =>
    setIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const allOn = ids.length === SE_BOOKMAKERS.length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold">Swedish Bookmakers</p>
          <p className="text-[10px] text-muted-foreground">
            Select which regulated books to track. {ids.length}/{SE_BOOKMAKERS.length} active.
          </p>
        </div>
        <button
          onClick={() => setIds(allOn ? [] : SE_BOOKMAKERS.map(b => b.id))}
          className="text-[10px] font-bold text-primary hover:underline"
        >
          {allOn ? "Clear" : "Select all"}
        </button>
      </div>
      <div className={cn("grid gap-1.5", compact ? "grid-cols-3" : "grid-cols-2")}>
        {SE_BOOKMAKERS.map(b => {
          const on = ids.includes(b.id);
          return (
            <button
              key={b.id}
              onClick={() => toggle(b.id)}
              className={cn(
                "group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all",
                on
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card/40 opacity-60 hover:opacity-100"
              )}
            >
              <img
                src={bookmakerLogo(b)}
                alt=""
                className="w-5 h-5 rounded-md shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold truncate">{b.short}</p>
                <p className="text-[9px] text-muted-foreground truncate">
                  Margin {((b.margin - 1) * 100).toFixed(1)}%
                </p>
              </div>
              <div
                className={cn(
                  "w-4 h-4 rounded-md border flex items-center justify-center shrink-0",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                )}
              >
                {on && <Check className="w-3 h-3" strokeWidth={3} />}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground leading-relaxed">
        Odds shown across the app are live signals from our probability engine, priced with each
        book's typical margin and bias. Connect an odds feed to swap in real-time prices.
      </p>
    </div>
  );
};
