import { HelpCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Section = { title: string; body: string };
type PageGuide = { title: string; intro: string; sections: Section[]; tip?: string };

const GUIDES: Record<string, PageGuide> = {
  upcoming: {
    title: "Games",
    intro: "Browse fixtures and results across every league and tournament, and preview any upcoming match.",
    sections: [
      { title: "Date strip", body: "Horizontal date bar centers on Today. Tap any day to jump; swipe to scan the week. Double-tap the Games nav icon to reset back to Today." },
      { title: "League groups", body: "Matches are grouped by competition. Leagues and Tournaments (World Cup, Euros, AFCON, Copa) are separated so major events don't get buried." },
      { title: "Match cards", body: "Live scores update in real time. Upcoming matches are tappable — you'll get W/D/L probabilities, likely scorelines, and recommended bet markets with confidence levels." },
      { title: "Team logos & flags", body: "National teams show country flags, clubs show official Fotmob crests. Everything is cached for instant load." },
    ],
    tip: "Tap any upcoming fixture to open the prediction sheet with model odds and best-value markets.",
  },
  premium: {
    title: "Pro",
    intro: "Deep predictive analytics for the selected team — xG models, form indices, matchup comparisons and smart insights.",
    sections: [
      { title: "Overview tab", body: "Season snapshot: record, goals, clean sheets and headline ratings. Tap any metric card to see what it means and how it's calculated." },
      { title: "Advanced tab", body: "xG For/Against/Diff, Attack & Defense ratings, Form Index, shot volume and corner trends — every card is tappable for a plain-English explanation." },
      { title: "Trends tab", body: "Line charts for goals and xG over the last N matches, plus form momentum. Use the recency filter at the top of Stats to change the window." },
      { title: "Matchup tab", body: "Side-by-side comparison versus any opponent. Highlights mismatches and gives a confidence score for the projected outcome." },
    ],
    tip: "Free tier covers the top 9 leagues. Pro unlocks every competition plus full squad profiles.",
  },
  team: {
    title: "Stats",
    intro: "The team-centric hub — pick any club or national team and drill into their season.",
    sections: [
      { title: "Team switcher", body: "Search globally or browse by Favorites, Top Leagues, or All (grouped into Leagues and Tournaments). Star a team to pin it." },
      { title: "Recency filter", body: "The 'Past N matches' slider controls every calculation on this page. Recent games are weighted higher for form-based metrics." },
      { title: "Stat cards", body: "Corners, cards, fouls, shots, over 2.5, clean sheets — tap any card for a match-by-match breakdown with dates, opponents and referees." },
      { title: "League ranking & momentum", body: "Official Fotmob standings plus a momentum chart showing form direction. Recent Results below shows the last window with scores." },
      { title: "Squad Profiles", body: "Radar chart of team strengths. Tap any player to open their insight sheet: role, mentality, top attributes and tailored bet markets." },
      { title: "Upcoming fixtures", body: "Expandable drawer with the next matches for this team. Tap one for an instant prediction." },
    ],
    tip: "Double-tap the Stats nav icon to reset the team switcher and filters.",
  },
  edge: {
    title: "Edge",
    intro: "The betting workspace — build slips, track live odds and manage your bankroll.",
    sections: [
      { title: "Bet Builder", body: "AI-assisted slip construction. Pick markets (1X2, Over/Under, BTTS, Players) and let the model suggest legs with confidence scores. Swap any leg to find an alternative pick." },
      { title: "Live Odds", body: "Real-time prices from The Odds API across major bookmakers. Compare against the model's fair-value line to spot edge." },
      { title: "Edge Picks", body: "Curated high-confidence picks where model probability significantly beats implied odds." },
      { title: "Bankroll tab", body: "Set your starting bankroll and pick a risk profile (Conservative / Balanced / Aggressive). Uses fractional Kelly to suggest stake sizes and logs your P/L over time." },
      { title: "Vote & History", body: "Community votes on outcomes plus your own settled-bet history with ROI." },
    ],
    tip: "Bankroll is local to this device — clear browser storage and it resets.",
  },
  profile: {
    title: "You",
    intro: "Your account, preferences and app-wide settings.",
    sections: [
      { title: "Profile", body: "Username, avatar and sign-in details. Backed by Lovable Cloud auth." },
      { title: "Favorites", body: "3x3 grid of your starred teams. Reorder or remove them here; they surface first everywhere in the app." },
      { title: "Themes", body: "Six visual themes stored locally — pick whichever fits your vibe. Compact density and typography stay consistent across themes." },
      { title: "Sync", body: "Force a fresh data pull from Fotmob (fixtures, results, standings, WC/Euro history). Also available as the button in the header." },
    ],
    tip: "Sign out at the bottom of the page. Your bankroll and theme stay on this device.",
  },
};

const PAGE_KEYS = ["upcoming", "premium", "team", "edge", "profile"];

export const HelpSheet = ({ activeIdx }: { activeIdx: number }) => {
  const [open, setOpen] = useState(false);
  const key = PAGE_KEYS[activeIdx] ?? "team";
  const guide = GUIDES[key];

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`How ${guide.title} works`}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 animate-in fade-in-0 duration-150"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] bg-card border-t-2 border-foreground overflow-y-auto animate-in slide-in-from-bottom-4 duration-200 rounded-t-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card border-b border-border z-10 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">Guide</p>
                  <p className="text-sm font-bold leading-tight mt-0.5">How {guide.title} works</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-muted" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              <p className="text-xs text-foreground/85 leading-relaxed">{guide.intro}</p>

              <div className="space-y-2">
                {guide.sections.map((s, i) => (
                  <div key={s.title} className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "flex items-center justify-center w-5 h-5 rounded-md bg-primary/15 text-primary",
                        "font-mono text-[10px] font-bold"
                      )}>
                        {i + 1}
                      </span>
                      <p className="text-xs font-bold uppercase tracking-wider">{s.title}</p>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed pl-7">{s.body}</p>
                  </div>
                ))}
              </div>

              {guide.tip && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Pro tip</p>
                  <p className="text-xs text-foreground leading-relaxed">{guide.tip}</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
