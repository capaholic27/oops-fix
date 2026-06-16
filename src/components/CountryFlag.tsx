import { cn } from "@/lib/utils";
import { getCountryInfo, flagUrl } from "@/lib/countries";

type Props = {
  countryName: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  xs: "w-4 h-3 text-[6px]",
  sm: "w-6 h-4 text-[8px]",
  md: "w-8 h-6 text-[10px]",
  lg: "w-12 h-9 text-xs",
};

/**
 * Renders a country flag using flagcdn (deterministic, instant). Falls back to
 * a country-code pill if the country isn't in our static map.
 */
export const CountryFlag = ({ countryName, size = "sm", className }: Props) => {
  const info = getCountryInfo(countryName);
  const sizeClass = sizes[size];

  if (info) {
    return (
      <img
        src={flagUrl(info.iso2, size === "lg" ? 160 : 80)}
        alt={countryName}
        className={cn("object-cover rounded-sm border border-border flex-shrink-0", sizeClass, className)}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex-shrink-0 rounded-sm flex items-center justify-center font-bold font-mono bg-muted text-muted-foreground border border-border",
        sizeClass,
        className
      )}
    >
      {countryName.slice(0, 3).toUpperCase()}
    </div>
  );
};
