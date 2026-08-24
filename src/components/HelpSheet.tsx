import { HelpCircle, X, ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

import shotUpcoming from "@/assets/help/upcoming.png";
import shotTeam from "@/assets/help/team.png";
import shotPremium from "@/assets/help/premium.png";
import shotEdge from "@/assets/help/edge.png";
import shotProfile from "@/assets/help/profile.png";

/**
 * Region coords are normalized 0..1 relative to the *rendered image box*.
 * We render the screenshot with object-contain inside a fixed aspect frame,
 * so coordinates line up exactly regardless of viewport.
 */
type Step = {
  title: string;
  body: string;
  region: { x: number; y: number; w: number; h: number };
};

type PageGuide = {
  title: string;
  tagline: string;
  image: string;
  steps: Step[];
  tip?: string;
};

/**
 * Regions below are measured directly from the 804x1640 screenshots in
 * src/assets/help (px / 804 for x,w and px / 1640 for y,h), so the ring
 * traces the real element outline instead of an estimate.
 */
const GUIDES: Record<string, PageGuide> = {
  upcoming: {
    title: "Games",
    tagline: "Browse fixtures and predict any upcoming match.",
    image: shotUpcoming,
    steps: [
      { title: "Date strip", body: "Today is centered on open. Swipe or tap any day to jump. Double-tap the Games nav icon to snap back.", region: { x: 0, y: 0.064, w: 1, h: 0.064 } },
      { title: "Grouped by competition", body: "Leagues and Tournaments (World Cup, Euros, AFCON, Copa) are separated so major events don't get buried.", region: { x: 0.02, y: 0.141, w: 0.5, h: 0.03 } },
      { title: "Tap a match", body: "Any upcoming fixture opens a prediction sheet: W/D/L probabilities, likely scores, and best-value bet markets.", region: { x: 0.041, y: 0.175, w: 0.919, h: 0.065 } },
      { title: "Bottom navigation", body: "Five pages. Double-tap any icon to reset that page's state.", region: { x: 0, y: 0.927, w: 1, h: 0.073 } },
    ],
    tip: "Live scores update in real time when a match kicks off.",
  },
  premium: {
    title: "Pro",
    tagline: "Deep predictive analytics per team.",
    image: shotPremium,
    steps: [
      { title: "Unlock Pro", body: "Free covers the top 9 leagues. Pro unlocks every competition plus full squad profiles and advanced markets.", region: { x: 0.041, y: 0.303, w: 0.919, h: 0.055 } },
      { title: "Bet market probabilities", body: "AI-priced probabilities for every market: Over/Under, BTTS, Corners, Cards. Green = high edge, orange = low.", region: { x: 0.06, y: 0.398, w: 0.88, h: 0.031 } },
      { title: "Goals markets", body: "Over 1.5 / 2.5 / 3.5 and BTTS with model confidence. Tap any card for a plain-English breakdown.", region: { x: 0.075, y: 0.447, w: 0.85, h: 0.164 } },
      { title: "Corners & shots", body: "Advanced markets scroll below. Each metric is tappable for match-by-match history.", region: { x: 0.075, y: 0.633, w: 0.85, h: 0.161 } },
    ],
    tip: "Recency filter on the Stats page controls every calculation shown here.",
  },
  team: {
    title: "Stats",
    tagline: "The team-centric hub — pick any club or national team.",
    image: shotTeam,
    steps: [
      { title: "Favorites, Top, All", body: "Three tabs. Star teams to pin them to Favorites; browse Top Leagues instantly; explore All grouped into Leagues and Tournaments.", region: { x: 0.041, y: 0.14, w: 0.919, h: 0.045 } },
      { title: "Global search", body: "Search any team or league across every competition — instant fuzzy match.", region: { x: 0.041, y: 0.208, w: 0.919, h: 0.046 } },
      { title: "League grid", body: "Tap a league to open its team switcher. Official crests load instantly from cache.", region: { x: 0.041, y: 0.274, w: 0.919, h: 0.451 } },
      { title: "Generate Prediction", body: "Jump into a predicted matchup. Perfect when you already know which two teams you want.", region: { x: 0.041, y: 0.743, w: 0.919, h: 0.062 } },
    ],
    tip: "Double-tap the Stats nav icon to reset the team switcher.",
  },
  edge: {
    title: "Edge",
    tagline: "Your betting workspace — picks, live odds, bankroll.",
    image: shotEdge,
    steps: [
      { title: "Edge is a Pro feature", body: "Included with the Pro subscription. Unlocks bet builder, value alerts, and live odds comparison.", region: { x: 0.041, y: 0.301, w: 0.919, h: 0.198 } },
      { title: "Value picks", body: "Curated high-confidence picks where model probability significantly beats implied odds. Percentage = model confidence.", region: { x: 0.041, y: 0.525, w: 0.919, h: 0.114 } },
      { title: "Market & confidence", body: "Each card names the market, model confidence, and a plain-English reason. Tap a card to open the full breakdown.", region: { x: 0.041, y: 0.651, w: 0.919, h: 0.115 } },
      { title: "Bankroll tab", body: "Open Edge from the bottom nav, then switch to Bankroll: set your bankroll, pick a risk profile and get suggested stakes using fractional Kelly.", region: { x: 0.64, y: 0.927, w: 0.16, h: 0.073 } },
    ],
    tip: "Bankroll lives on this device — clear browser storage and it resets.",
  },
  profile: {
    title: "You",
    tagline: "Account, favorites, themes, and app settings.",
    image: shotProfile,
    steps: [
      { title: "Sign in / Sign up", body: "Backed by Lovable Cloud auth. Sync your favorites and preferences across devices.", region: { x: 0.041, y: 0.085, w: 0.919, h: 0.312 } },
      { title: "Email & password", body: "Sign in, or tap Sign Up to create an account instantly. Forgot password sends a reset link to your email.", region: { x: 0.101, y: 0.42, w: 0.798, h: 0.227 } },
      { title: "Themes", body: "Six visual themes stored locally. Compact density and typography stay consistent across all of them.", region: { x: 0.041, y: 0.746, w: 0.919, h: 0.178 } },
    ],
    tip: "Sign out at the bottom of the page. Theme and bankroll stay on this device.",
  },
};


const PAGE_KEYS = ["upcoming", "premium", "team", "edge", "profile"];

export const HelpSheet = ({ activeIdx }: { activeIdx: number }) => {
  const [open, setOpen] = useState(false);
  const key = PAGE_KEYS[activeIdx] ?? "team";
  const guide = GUIDES[key];
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) { setStepIdx(0); setPlaying(true); }
  }, [open, key]);

  useEffect(() => {
    if (!open || !playing) return;
    timerRef.current = window.setTimeout(() => {
      setStepIdx((i) => (i + 1) % guide.steps.length);
    }, 4000);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [open, playing, stepIdx, guide.steps.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const step = guide.steps[stepIdx];
  const regionStyle = useMemo(
    () => ({
      left: `${step.region.x * 100}%`,
      top: `${step.region.y * 100}%`,
      width: `${step.region.w * 100}%`,
      height: `${step.region.h * 100}%`,
    }),
    [step],
  );

  const go = (dir: -1 | 1) => {
    setPlaying(false);
    setStepIdx((i) => (i + dir + guide.steps.length) % guide.steps.length);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`How ${guide.title} works`}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in-0 duration-150"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-md max-h-[92vh] bg-card border-t border-border animate-in slide-in-from-bottom-4 duration-200 rounded-t-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <HelpCircle className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">Walkthrough</p>
                    <p className="text-sm font-bold leading-tight mt-0.5 truncate">How {guide.title} works</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2.5 -mr-1 rounded-md hover:bg-muted active:bg-muted touch-manipulation"
                  aria-label="Close"
                  type="button"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <p className="text-xs text-foreground/80 leading-relaxed">{guide.tagline}</p>

                {/* Phone-frame screenshot */}
                <div className="mx-auto w-[220px] rounded-[26px] border border-border bg-black p-1.5 shadow-xl">
                  <div className="relative rounded-[20px] overflow-hidden bg-background" style={{ aspectRatio: "402 / 820" }}>
                    <img
                      src={guide.image}
                      alt={`${guide.title} screen`}
                      className="absolute inset-0 w-full h-full object-fill select-none"
                      draggable={false}
                    />
                    {/* Highlight window — dims everything outside via a huge outer shadow */}
                    <div
                      style={regionStyle}
                      className="absolute rounded-md ring-2 ring-primary ring-offset-0 shadow-[0_0_0_9999px_rgba(0,0,0,0.62)] transition-all duration-500 ease-out pointer-events-none"
                    >

                      <span
                        className="absolute -top-2 -left-2 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-mono font-bold shadow-md"
                      >
                        {stepIdx + 1}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Caption */}
                <div
                  key={`caption-${stepIdx}`}
                  className="rounded-xl border border-primary/25 bg-primary/5 p-3 animate-in fade-in-0 duration-300"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-md bg-primary text-primary-foreground font-mono text-[10px] font-bold shrink-0">
                      {stepIdx + 1}
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider">{step.title}</p>
                  </div>
                  <p className="text-xs text-foreground/85 leading-relaxed">{step.body}</p>
                </div>

                {guide.tip && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pro tip</p>
                    <p className="text-xs text-foreground/90 leading-relaxed">{guide.tip}</p>
                  </div>
                )}
              </div>

              {/* Footer controls */}
              <div className="shrink-0 border-t border-border px-4 py-3 flex items-center gap-3 bg-card">
                <button
                  onClick={() => go(-1)}
                  className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition"
                  aria-label="Previous"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex-1 flex items-center justify-center gap-1.5">
                  {guide.steps.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setPlaying(false); setStepIdx(i); }}
                      aria-label={`Step ${i + 1}`}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        i === stepIdx ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                      )}
                    />
                  ))}
                </div>

                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => go(1)}
                  className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition"
                  aria-label="Next"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
