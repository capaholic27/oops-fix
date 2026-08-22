import { useState } from "react";
import { ChevronDown, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS: { title: string; body: string }[] = [
  {
    title: "1 · Pick the two teams",
    body:
      "Home team first, then the away team. The model reads their last 10 matches from the live database, so both teams need at least 3 played games.",
  },
  {
    title: "2 · Choose the prediction type",
    body:
      "Full match gives 1X2, over/under, BTTS, corners and cards. Player markets gives anytime scorer, assists and card risk. Both runs the two together.",
  },
  {
    title: "3 · Set player availability",
    body:
      "Injured and suspended players are pre-deselected from the live injury feed. Deselect anyone else who won't play — the model lowers that team's expected goals by the share of goal involvements you removed, and leaks more goals when defenders are missing.",
  },
  {
    title: "4 · Add match context (optional)",
    body:
      "One line is enough: derby, cup final, must-win, second leg. It shifts risk and tactics in the written analysis, never the calibrated numbers.",
  },
  {
    title: "5 · Read the output",
    body:
      "Probabilities come from Poisson + Dixon-Coles over 10,000 simulations. Confidence is the model's probability, not a guarantee — anything under 55% is a coin-flip market, treat it as information rather than a tip.",
  },
];

export const PredictionGuide = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <GraduationCap className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold flex-1">How this prediction works</span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border pt-2.5">
          {STEPS.map((s) => (
            <div key={s.title}>
              <p className="text-[11px] font-semibold text-foreground">{s.title}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{s.body}</p>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border pt-2">
            Predictions are statistical estimates for entertainment and research. Never stake more than
            your bankroll plan allows.
          </p>
        </div>
      )}
    </div>
  );
};
