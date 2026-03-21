import { useState } from "react";
import { FormBadge } from "./FormBadge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamMatchView } from "@/lib/matchStats";

type Props = {
  views: TeamMatchView[];
  formLast5: ("W" | "D" | "L")[];
};

const ranges = [10, 20, 30, 40, 50] as const;

export const FormHistoryWindow = ({ views, formLast5 }: Props) => {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<number>(10);

  const extendedForm = views
    .slice(-range)
    .map((v) => v.result)
    .reverse();

  const wins = extendedForm.filter((r) => r === "W").length;
  const draws = extendedForm.filter((r) => r === "D").length;
  const losses = extendedForm.filter((r) => r === "L").length;

  return (
    <div className="flex items-center gap-2">
      {/* Last 5 badges */}
      <div className="flex gap-1">
        {formLast5.map((r, i) => (
          <FormBadge key={i} result={r} />
        ))}
      </div>

      {/* Expand button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex items-center gap-0.5 px-2 py-1.5 rounded-md border text-xs font-medium transition-all duration-200",
          "hover:shadow-sm active:scale-[0.97]",
          open
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-muted-foreground border-border hover:border-primary/40"
        )}
        title="View extended form"
      >
        {/* Mini W/L/D icons */}
        {!open && (
          <span className="flex gap-px">
            {formLast5.slice(0, 4).map((r, i) => (
              <span
                key={i}
                className={cn(
                  "w-1.5 h-3 rounded-[1px]",
                  r === "W" && "bg-stat-positive",
                  r === "D" && "bg-stat-warn",
                  r === "L" && "bg-stat-negative"
                )}
              />
            ))}
          </span>
        )}
        <ChevronRight
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            open && "rotate-90"
          )}
        />
      </button>

      {/* Expanded window */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-80 rounded-lg border border-border bg-card shadow-lg p-4 animate-in fade-in-0 slide-in-from-top-2 duration-150">
          {/* Range selector */}
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs text-muted-foreground font-medium">Last</span>
            {ranges.map((n) => (
              <button
                key={n}
                onClick={() => setRange(n)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-mono transition-colors",
                  range === n
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Summary */}
          <div className="flex gap-3 mb-3 text-xs">
            <span className="text-stat-positive font-semibold">{wins}W</span>
            <span className="text-stat-warn font-semibold">{draws}D</span>
            <span className="text-stat-negative font-semibold">{losses}L</span>
            <span className="text-muted-foreground ml-auto">
              {extendedForm.length} matches
            </span>
          </div>

          {/* Form grid */}
          <div className="flex flex-wrap gap-1">
            {extendedForm.map((r, i) => (
              <FormBadge key={i} result={r} />
            ))}
          </div>

          {extendedForm.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Not enough match data
            </p>
          )}
        </div>
      )}
    </div>
  );
};
