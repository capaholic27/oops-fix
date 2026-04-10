import { cn } from "@/lib/utils";

type FormBadgeProps = {
  result: "W" | "D" | "L";
};

export const FormBadge = ({ result }: FormBadgeProps) => {
  const styles = {
    W: "bg-stat-positive/15 text-stat-positive",
    D: "bg-stat-warn/15 text-stat-warn",
    L: "bg-stat-negative/15 text-stat-negative",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold font-mono",
        styles[result]
      )}
    >
      {result}
    </span>
  );
};
