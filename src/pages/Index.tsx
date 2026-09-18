import { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarDays, Lock, Zap, Crosshair, User, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncData, useAutoSync } from "@/hooks/useMatches";
import { toast } from "sonner";
import { applyTheme, getStoredTheme } from "@/lib/themes";
import { useViewportInsets } from "@/hooks/useViewportInsets";

import UpcomingGamesPage from "@/pages/UpcomingGamesPage";
import PremiumPage from "@/pages/PremiumPage";
import TeamPage from "@/pages/TeamPage";
import EdgePage from "@/pages/EdgePage";
import ProfilePage from "@/pages/ProfilePage";
import { AdBanner } from "@/components/AdBanner";
import { HelpSheet } from "@/components/HelpSheet";

const PAGES = [
  { id: "upcoming", label: "Games", icon: CalendarDays },
  { id: "premium", label: "Pro", icon: Lock },
  { id: "team", label: "Stats", icon: Zap },
  { id: "edge", label: "Edge", icon: Crosshair },
  { id: "profile", label: "You", icon: User },
];

const DOUBLE_TAP_MS = 350;

const Index = () => {
  const [activePage, setActivePage] = useState(2);
  const [resetKeys, setResetKeys] = useState([0, 0, 0, 0, 0]);
  const lastTapRef = useRef<{ idx: number; time: number }>({ idx: -1, time: 0 });
  
  const syncData = useSyncData();

  // Data refreshes itself: server-side scheduled jobs are the primary path,
  // this is the silent catch-up if a user opens the app on stale data.
  useAutoSync();

  // Keep the shell above the on-screen keyboard so search fields stay usable.
  useViewportInsets();

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  const handleNavTap = useCallback((idx: number) => {
    const now = Date.now();
    const last = lastTapRef.current;

    if (idx === activePage && idx === last.idx && now - last.time < DOUBLE_TAP_MS) {
      // Double tap on active page → reset it
      setResetKeys(prev => {
        const next = [...prev];
        next[idx] = prev[idx] + 1;
        return next;
      });
      lastTapRef.current = { idx: -1, time: 0 };
    } else {
      setActivePage(idx);
      lastTapRef.current = { idx, time: now };
    }
  }, [activePage]);

  // Optional manual override — data already refreshes on its own.
  const handleSync = () => {
    toast.info("Refreshing…");
    syncData.mutate(
      { season: "2627" },
      {
        onSuccess: (data) => {
          const total = data.results?.reduce((s: number, r: { inserted: number }) => s + r.inserted, 0) ?? 0;
          toast.success(`Up to date · ${total} matches`);
        },
        onError: (err) => toast.error(`Refresh failed: ${err.message}`),
      }
    );
  };


  return (
    <div
      className="flex flex-col bg-background overflow-hidden"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-none tracking-tight">FootballEdge</h1>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">2025/26 Season</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HelpSheet activeIdx={activePage} />
            <button
              onClick={handleSync}
              disabled={syncData.isPending}
              className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncData.isPending && "animate-spin")} />
              {syncData.isPending ? "…" : "Sync"}
            </button>
          </div>
        </div>
      </header>

      {/* Page area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative overflow-hidden overflow-y-auto">
          <div className={cn("w-full h-full", 0 !== activePage && "hidden")}>
            <UpcomingGamesPage key={resetKeys[0]} isActive={activePage === 0} />
          </div>
          <div className={cn("w-full h-full", 1 !== activePage && "hidden")}>
            <PremiumPage key={resetKeys[1]} />
          </div>
          <div className={cn("w-full h-full", 2 !== activePage && "hidden")}>
            <TeamPage key={resetKeys[2]} />
          </div>
          <div className={cn("w-full h-full", 3 !== activePage && "hidden")}>
            <EdgePage key={resetKeys[3]} />
          </div>
          <div className={cn("w-full h-full", 4 !== activePage && "hidden")}>
            <ProfilePage key={resetKeys[4]} />
          </div>
        </div>
        <AdBanner variant="sidebar" />
      </div>

      {/* Bottom Nav */}
      <nav className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm">
        <div className="flex max-w-md mx-auto">
          {PAGES.map((page, i) => {
            const Icon = page.icon;
            const isActive = i === activePage;
            return (
              <button
                key={page.id}
                onClick={() => handleNavTap(i)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
                )}
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{page.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Index;
