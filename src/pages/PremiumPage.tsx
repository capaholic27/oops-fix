import { Lock } from "lucide-react";
import { AdBanner } from "@/components/AdBanner";

const PremiumPage = () => (
  <div className="min-h-full flex flex-col items-center justify-center p-6 text-center gap-6">
    <div className="rounded-2xl border border-border bg-card p-8 max-w-sm w-full shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-xl font-bold mb-2">Go Premium</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Unlock advanced insights, detailed analytics, and exclusive predictions.
      </p>
      <div className="rounded-xl bg-muted p-4">
        <p className="text-xs text-muted-foreground font-medium">
          🔒 Coming soon
        </p>
      </div>
    </div>
    <AdBanner variant="interstitial" />
  </div>
);

export default PremiumPage;
