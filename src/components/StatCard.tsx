import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: "positive" | "negative" | "neutral" | "warn";
  subtitle?: string;
  className?: string;
  delay?: number;
  onClick?: () => void;
};

export const StatCard = ({ label, value, icon, trend, subtitle, className, delay = 0, onClick }: StatCardProps) => {
  const trendColor = {
    positive: "text-stat-positive",
    negative: "text-stat-negative",
    neutral: "text-foreground",
    warn: "text-stat-warn",
  };

  return (
    <div
      className={cn(
        "stat-card opacity-0 animate-fade-up",
        onClick && "cursor-pointer active:scale-[0.98] transition-transform",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="stat-label">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className={cn("stat-value", trend ? trendColor[trend] : "text-foreground")}>
        {value}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>
      )}
    </div>
  );
};
