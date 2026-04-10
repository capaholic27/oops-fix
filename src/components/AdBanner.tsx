import { cn } from "@/lib/utils";

type Props = {
  variant?: "inline" | "sidebar" | "interstitial";
  className?: string;
};

export const AdBanner = ({ variant = "inline", className }: Props) => {
  if (variant === "interstitial") {
    return (
      <div className={cn("flex items-center justify-center p-6", className)}>
        <div className="w-full max-w-sm border border-dashed border-border rounded-xl bg-muted/20 p-8 text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-muted flex items-center justify-center">
            <span className="text-[10px] font-semibold text-muted-foreground">AD</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Sponsored Content</p>
          <p className="text-[10px] text-muted-foreground">320×480</p>
        </div>
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div className={cn("hidden lg:block w-[160px] flex-shrink-0", className)}>
        <div className="sticky top-20 border border-dashed border-border rounded-xl bg-muted/10 p-3 text-center space-y-1.5">
          <span className="text-[8px] text-muted-foreground font-medium block">Ad · 160×600</span>
          <div className="w-full aspect-[160/600] bg-gradient-to-b from-muted/20 to-muted/5 border border-border rounded-lg flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground font-mono">Skyscraper</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("my-3 mx-auto max-w-lg", className)}>
      <div className="border border-dashed border-border rounded-xl bg-muted/10 px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[7px] text-muted-foreground font-medium px-1.5 py-0.5 border border-border rounded-md bg-card flex-shrink-0">Ad</span>
          <span className="text-[9px] text-muted-foreground truncate">Your ad here · 320×50</span>
        </div>
        <div className="w-16 h-8 bg-gradient-to-r from-primary/5 to-primary/10 border border-border rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-[7px] font-medium text-muted-foreground">CTA</span>
        </div>
      </div>
    </div>
  );
};
