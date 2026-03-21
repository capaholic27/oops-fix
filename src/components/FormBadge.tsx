import { cn } from "@/lib/utils";

type FormBadgeProps = {
  result: "W" | "D" | "L";
};

export const FormBadge = ({ result }: FormBadgeProps) => {
  const styles = {
    W: "bg-stat-positive/15 text-stat-positive border-stat-positive/25",
    D: "bg-stat-warn/15 text-stat-warn border-stat-warn/25",
    L: "bg-stat-negative/15 text-stat-negative border-stat-negative/25",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-semibold font-mono border",
        styles[result]
      )}
    >
      {result}
    </span>
  );
};
