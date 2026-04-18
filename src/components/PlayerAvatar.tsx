import { cn } from "@/lib/utils";
import { getInitials, nameColor } from "@/lib/playerNames";

type Props = {
  name: string;
  number?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
};

const SIZES = {
  xs: "w-5 h-5 text-[8px]",
  sm: "w-7 h-7 text-[10px]",
  md: "w-9 h-9 text-[11px]",
};

/** Circular avatar showing initials, with optional shirt-number badge.
 *  Used as a stand-in for real player photos. */
export const PlayerAvatar = ({ name, number, size = "sm", className }: Props) => {
  const initials = getInitials(name);
  const bg = nameColor(name);
  return (
    <div className={cn("relative flex-shrink-0", className)}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold text-white shadow-sm ring-1 ring-border",
          SIZES[size]
        )}
        style={{ background: bg }}
        aria-label={name}
      >
        {initials}
      </div>
      {typeof number === "number" && (
        <span className="absolute -bottom-0.5 -right-0.5 bg-background text-foreground text-[8px] font-mono font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center ring-1 ring-border leading-none">
          {number}
        </span>
      )}
    </div>
  );
};
