import { useState, useEffect, useCallback } from "react";
import {
  CalendarDays, Lock, Zap, Newspaper, User, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncData } from "@/hooks/useMatches";
import { toast } from "sonner";
import { applyTheme, getStoredTheme } from "@/lib/themes";

import UpcomingGamesPage from "@/pages/UpcomingGamesPage";
import PremiumPage from "@/pages/PremiumPage";
import TeamPage from "@/pages/TeamPage";
import NewsPage from "@/pages/NewsPage";
import ProfilePage from "@/pages/ProfilePage";
import { AdBanner } from "@/components/AdBanner";

const PAGES = [
  { id: "upcoming", label: "Games", icon: CalendarDays },
  { id: "premium", label: "Pro", icon: Lock },
  { id: "team", label: "Stats", icon: Zap },
  { id: "news", label: "News", icon: Newspaper },
  { id: "profile", label: "You", icon: User },
];

const PAGE_COMPONENTS = [UpcomingGamesPage, PremiumPage, TeamPage, NewsPage, ProfilePage];

const Index = () => {
  const [activePage, setActivePage] = useState(2);
  
  const syncData = useSyncData();

  // Apply stored theme on mount
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  const goToPage = useCallback((idx: number) => {
    setActivePage(Math.max(0, Math.min(4, idx)));
  }, []);

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

      {/* Page area with optional sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative overflow-hidden overflow-y-auto retro-stripe">
          {PAGE_COMPONENTS.map((PageComp, i) => (
            <div key={i} className={cn("w-full h-full", i !== activePage && "hidden")}>
              <PageComp />
            </div>
          ))}
        </div>

        {/* Desktop sidebar ad */}
        <AdBanner variant="sidebar" />
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
