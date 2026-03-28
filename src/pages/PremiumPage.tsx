import { Lock } from "lucide-react";

const PremiumPage = () => (
  <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
    <div className="retro-border bg-card p-8 max-w-sm w-full">
      <Lock className="w-10 h-10 text-accent mx-auto mb-3" />
      <h2 className="text-lg mb-1">Premium</h2>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
        Advanced insights & analytics
      </p>
      <div className="border-2 border-border bg-muted p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          🔒 Unlock with Premium
        </p>
      </div>
    </div>
  </div>
);

export default PremiumPage;
