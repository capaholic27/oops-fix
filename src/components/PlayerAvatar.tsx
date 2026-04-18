import { useState } from "react";
import { cn } from "@/lib/utils";
import { getInitials, nameColor } from "@/lib/playerNames";

type Props = {
  name: string;
  number?: number | null;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  xs: "w-5 h-5 text-[8px]",
  sm: "w-7 h-7 text-[10px]",
  md: "w-9 h-9 text-[11px]",
  lg: "w-12 h-12 text-[13px]",
};

/** Circular avatar — shows real player photo when available, falls back to colored initials.
 *  Optional shirt-number badge in the bottom-right. */
export const PlayerAvatar = ({ name, number, photoUrl, size = "sm", className }: Props) => {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = getInitials(name);
  const bg = nameColor(name);
  const showPhoto = photoUrl && !imgFailed;

  return (
    <div className={cn("relative flex-shrink-0", className)}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold text-white shadow-sm ring-1 ring-border overflow-hidden",
          SIZES[size]
        )}
        style={showPhoto ? undefined : { background: bg }}
        aria-label={name}
      >
        {showPhoto ? (
          <img
            src={photoUrl!}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          initials
        )}
      </div>
      {typeof number === "number" && (
        <span className="absolute -bottom-0.5 -right-0.5 bg-background text-foreground text-[8px] font-mono font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center ring-1 ring-border leading-none">
          {number}
        </span>
      )}
    </div>
  );
};
