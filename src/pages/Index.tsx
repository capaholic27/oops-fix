import { useState, useRef, useEffect, useCallback } from "react";
import {
  CalendarDays, Lock, Zap, Newspaper, User, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncData } from "@/hooks/useMatches";
import { toast } from "sonner";

import UpcomingGamesPage from "@/pages/UpcomingGamesPage";
import PremiumPage from "@/pages/PremiumPage";
import TeamPage from "@/pages/TeamPage";
import NewsPage from "@/pages/NewsPage";
import ProfilePage from "@/pages/ProfilePage";

const PAGES = [
  { id: "upcoming", label: "Games", icon: CalendarDays },
  { id: "premium", label: "Pro", icon: Lock },
  { id: "team", label: "Stats", icon: Zap },
  { id: "news", label: "News", icon: Newspaper },
  { id: "profile", label: "You", icon: User },
];

const PAGE_COMPONENTS = [UpcomingGamesPage, PremiumPage, TeamPage, NewsPage, ProfilePage];

const Index = () => {
  const [activePage, setActivePage] = useState(2); // page 3 = index 2
  const containerRef = useRef<HTMLDivElement>(null);
  const syncData = useSyncData();

  // Swipe handling
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [swiping, setSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const goToPage = useCallback((idx: number) => {
    setActivePage(Math.max(0, Math.min(4, idx)));
    setSwipeOffset(0);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    // Only horizontal swipe
    if (Math.abs(dx) > Math.abs(dy) * 1.2) {
      setSwipeOffset(dx);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (Math.abs(swipeOffset) > 80) {
      if (swipeOffset > 0 && activePage > 0) goToPage(activePage - 1);
      else if (swipeOffset < 0 && activePage < 4) goToPage(activePage + 1);
      else setSwipeOffset(0);
    } else {
      setSwipeOffset(0);
    }
    touchStart.current = null;
    setSwiping(false);
  }, [swipeOffset, activePage, goToPage]);

  const handleSync = () => {
    toast.info("Syncing…");
    syncData.mutate(
      { season: "2526" },
      {
        onSuccess: (data) => {
          const total = data.results?.reduce((s: number, r: { inserted: number }) => s + r.inserted, 0) ?? 0;
          toast.success(`Synced ${total} matches`);
        },
        onError: (err) => toast.error(`Sync failed: ${err.message}`),
      }
    );
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b-2 border-foreground bg-card flex-shrink-0 z-50">
        <div className="max-w-6xl mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 border-2 border-foreground bg-primary flex items-center justify-center shadow-[2px_2px_0_hsl(var(--foreground))]">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm leading-none">FootballEdge</h1>
              <p className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">25/26</p>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={syncData.isPending}
            className="flex items-center gap-1 px-2 h-7 text-[10px] font-bold uppercase tracking-wider border-2 border-foreground bg-card shadow-[2px_2px_0_hsl(var(--foreground))] hover:shadow-[3px_3px_0_hsl(var(--foreground))] transition-shadow"
          >
            <RefreshCw className={cn("w-3 h-3", syncData.isPending && "animate-spin")} />
            {syncData.isPending ? "…" : "Sync"}
          </button>
        </div>
      </header>

      {/* Page dots indicator */}
      <div className="flex justify-center gap-1.5 py-1.5 bg-card/80 border-b border-border flex-shrink-0">
        {PAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => goToPage(i)}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              i === activePage ? "bg-primary w-4" : "bg-border hover:bg-muted-foreground"
            )}
          />
        ))}
      </div>

      {/* Swipeable page area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={cn("flex h-full", !swiping && "transition-transform duration-300 ease-out")}
          style={{ transform: `translateX(calc(-${activePage * 100}% + ${swipeOffset}px))` }}
        >
          {PAGE_COMPONENTS.map((PageComp, i) => (
            <div key={i} className="w-full h-full flex-shrink-0 overflow-y-auto retro-stripe">
              <PageComp />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Nav */}
      <nav className="flex-shrink-0 border-t-2 border-foreground bg-card">
        <div className="flex">
          {PAGES.map((page, i) => {
            const Icon = page.icon;
            return (
              <button
                key={page.id}
                onClick={() => goToPage(i)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors",
                  i === activePage
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-bold uppercase tracking-wider">{page.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Index;
