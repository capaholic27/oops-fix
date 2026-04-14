import { useState } from "react";
import { 
  Lock, Unlock, Crown, TrendingUp, Target, Shield, BarChart3, 
  Zap, Brain, Eye, Star, ChevronRight, Flame, Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdBanner } from "@/components/AdBanner";

const PREMIUM_UNLOCKED_KEY = "fe_premium_unlocked";

function isPremiumUnlocked(): boolean {
  try { return localStorage.getItem(PREMIUM_UNLOCKED_KEY) === "true"; } catch { return false; }
}

type PremiumFeature = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  detail: React.ReactNode;
};

const FEATURES: PremiumFeature[] = [
  {
    id: "xg",
    title: "Expected Goals (xG)",
    description: "Advanced xG analysis for every match prediction",
    icon: <Target className="w-5 h-5" />,
    detail: (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">Deep xG metrics including shot quality, big chances, and xG timeline per match.</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted p-3 text-center">
            <span className="text-lg font-bold text-primary">1.87</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">Home xG</p>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <span className="text-lg font-bold text-primary">0.94</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">Away xG</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "momentum",
    title: "Momentum Index",
    description: "Track form trajectory and momentum shifts over 20+ games",
    icon: <TrendingUp className="w-5 h-5" />,
    detail: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">See how team momentum evolves across the season with our proprietary momentum score.</p>
        <div className="flex items-end gap-1 h-12">
          {[40, 55, 45, 65, 70, 60, 75, 80, 85, 78, 82, 90].map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-primary/70" style={{ height: `${v}%` }} />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">Last 12 matches momentum trend</p>
      </div>
    ),
  },
  {
    id: "headtohead",
    title: "Head-to-Head Deep Dive",
    description: "Historical H2H stats, venue records, and scoring patterns",
    icon: <BarChart3 className="w-5 h-5" />,
    detail: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Last 10 meetings, goals per venue, first-goal advantage, and more.</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-stat-positive/10 p-2"><span className="font-bold text-stat-positive">5</span><p className="text-[10px] text-muted-foreground">Wins</p></div>
          <div className="rounded-lg bg-stat-warn/10 p-2"><span className="font-bold text-stat-warn">2</span><p className="text-[10px] text-muted-foreground">Draws</p></div>
          <div className="rounded-lg bg-stat-negative/10 p-2"><span className="font-bold text-stat-negative">3</span><p className="text-[10px] text-muted-foreground">Losses</p></div>
        </div>
      </div>
    ),
  },
  {
    id: "referee",
    title: "Referee Insights",
    description: "Card tendencies, foul thresholds, and penalty decisions per referee",
    icon: <Eye className="w-5 h-5" />,
    detail: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Know the ref before the match. Average cards, fouls called, and penalty rate.</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-lg bg-stat-warn/10 p-2 text-center">
            <span className="font-bold text-stat-warn">4.2</span>
            <p className="text-[10px] text-muted-foreground">Avg Yellows</p>
          </div>
          <div className="flex-1 rounded-lg bg-stat-negative/10 p-2 text-center">
            <span className="font-bold text-stat-negative">0.3</span>
            <p className="text-[10px] text-muted-foreground">Avg Reds</p>
          </div>
          <div className="flex-1 rounded-lg bg-primary/10 p-2 text-center">
            <span className="font-bold text-primary">28%</span>
            <p className="text-[10px] text-muted-foreground">Pen Rate</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "tactical",
    title: "Tactical Breakdown",
    description: "Formation matchups, pressing intensity, and build-up play analysis",
    icon: <Brain className="w-5 h-5" />,
    detail: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Predicted formation, pressing triggers, and tactical weaknesses to exploit.</p>
        <div className="flex justify-center gap-4 py-2">
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-1">
              <span className="text-xs font-bold text-primary">4-3-3</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Home</p>
          </div>
          <div className="text-center flex items-center text-muted-foreground text-xs font-bold">vs</div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-1">
              <span className="text-xs font-bold text-primary">3-5-2</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Away</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "injuries",
    title: "Injury & Suspension Tracker",
    description: "Real-time squad availability and impact ratings",
    icon: <Shield className="w-5 h-5" />,
    detail: (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Key absences and their estimated impact on team performance.</p>
        <div className="space-y-1.5">
          {[
            { name: "K. De Bruyne", status: "Injured", impact: "High" },
            { name: "R. Dias", status: "Suspended", impact: "Medium" },
          ].map((p) => (
            <div key={p.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted text-xs">
              <span className="font-medium flex-1">{p.name}</span>
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", p.impact === "High" ? "bg-stat-negative/10 text-stat-negative" : "bg-stat-warn/10 text-stat-warn")}>{p.status}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

const PremiumPage = () => {
  const [unlocked, setUnlocked] = useState(isPremiumUnlocked);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  const togglePremium = () => {
    const next = !unlocked;
    setUnlocked(next);
    localStorage.setItem(PREMIUM_UNLOCKED_KEY, String(next));
  };

  return (
    <div className="min-h-full p-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="text-center space-y-2 pt-2">
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto",
          unlocked ? "bg-primary/10" : "bg-muted"
        )}>
          {unlocked ? <Crown className="w-8 h-8 text-primary" /> : <Lock className="w-8 h-8 text-muted-foreground" />}
        </div>
        <h1 className="text-2xl font-bold">{unlocked ? "Pro Unlocked" : "Go Pro"}</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {unlocked
            ? "You have full access to all premium analytics and insights."
            : "Unlock advanced insights, deep analytics, and exclusive predictions."}
        </p>
      </div>

      {/* Toggle button (dev/test) */}
      <button
        onClick={togglePremium}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all",
          unlocked
            ? "bg-muted text-muted-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
        )}
      >
        {unlocked ? <Unlock className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
        {unlocked ? "Lock (Test Mode)" : "Unlock Pro — Free Trial"}
      </button>

      {/* Premium features */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          {unlocked ? "Your Pro Features" : "What You Get"}
        </h2>
        {FEATURES.map((f) => {
          const isExpanded = expandedFeature === f.id;
          const isLocked = !unlocked;
          return (
            <div key={f.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setExpandedFeature(isExpanded ? null : f.id)}
                className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-muted/50 transition-colors"
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  isLocked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                )}>
                  {f.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{f.title}</span>
                    {isLocked && <Lock className="w-3 h-3 text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{f.description}</p>
                </div>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
              </button>
              {isExpanded && (
                <div className="px-3.5 pb-3.5 animate-fade-up">
                  {isLocked ? (
                    <div className="rounded-lg bg-muted/50 p-4 text-center">
                      <Lock className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
                      <p className="text-xs text-muted-foreground">Unlock Pro to access this feature</p>
                    </div>
                  ) : (
                    f.detail
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats summary for Pro users */}
      {unlocked && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Pro Stats Summary</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-background p-2.5">
              <Flame className="w-4 h-4 text-primary mx-auto mb-1" />
              <span className="text-lg font-bold">87%</span>
              <p className="text-[10px] text-muted-foreground">Prediction Accuracy</p>
            </div>
            <div className="rounded-lg bg-background p-2.5">
              <Star className="w-4 h-4 text-primary mx-auto mb-1" />
              <span className="text-lg font-bold">142</span>
              <p className="text-[10px] text-muted-foreground">Insights Generated</p>
            </div>
            <div className="rounded-lg bg-background p-2.5">
              <TrendingUp className="w-4 h-4 text-primary mx-auto mb-1" />
              <span className="text-lg font-bold">+12%</span>
              <p className="text-[10px] text-muted-foreground">Edge vs Market</p>
            </div>
          </div>
        </div>
      )}

      <AdBanner variant="interstitial" />
    </div>
  );
};

export default PremiumPage;
