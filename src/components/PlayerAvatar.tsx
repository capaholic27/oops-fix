import { useMemo, useState } from "react";
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

/** Build a chain of CDN URLs to try in order. Fotmob occasionally serves a
 *  player image at one path but not another, so we try several before giving
 *  up and showing initials. */
function buildPhotoChain(primary?: string | null): string[] {
  if (!primary) return [];
  const chain = [primary];
  // Extract id from .../playerimages/{id}.png
  const m = primary.match(/playerimages\/(\d+)/);
  if (m) {
    const id = m[1];
    chain.push(
      `https://images.fotmob.com/image_resources/playerimages/${id}.png?t=1`,
      `https://www.fotmob.com/_next/image?url=https%3A%2F%2Fimages.fotmob.com%2Fimage_resources%2Fplayerimages%2F${id}.png&w=128&q=75`,
    );
  }
  return chain;
}

/** Circular avatar — shows real player photo when available, falls back to colored initials. */
export const PlayerAvatar = ({ name, number, photoUrl, size = "sm", className }: Props) => {
  const chain = useMemo(() => buildPhotoChain(photoUrl), [photoUrl]);
  const [chainIdx, setChainIdx] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  const initials = getInitials(name);
  const bg = nameColor(name);
  const showPhoto = chain.length > 0 && !allFailed && chainIdx < chain.length;

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
            src={chain[chainIdx]}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => {
              if (chainIdx + 1 < chain.length) setChainIdx(chainIdx + 1);
              else setAllFailed(true);
            }}
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
