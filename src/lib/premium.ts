/* Pro/Free tier helpers — shared across Stats and Pro pages.
 *
 * Free users can access the top 9 domestic leagues only.
 * Pro users (when "fe_premium_unlocked" flag is true) get every league + team. */

export const PREMIUM_UNLOCKED_KEY = "fe_premium_unlocked";

export const TOP_LEAGUES = [
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "Eredivisie",
  "Primeira Liga",
  "Championship",
  "Major League Soccer",
] as const;

export const TOP_LEAGUES_SET = new Set<string>(TOP_LEAGUES);

export function isPremiumUnlocked(): boolean {
  try {
    return localStorage.getItem(PREMIUM_UNLOCKED_KEY) === "true";
  } catch {
    return false;
  }
}

export function isLeagueAllowedForFree(leagueName: string): boolean {
  return TOP_LEAGUES_SET.has(leagueName);
}

/** Subscribe to changes of the premium flag (storage events + custom event). */
export function subscribePremium(cb: (unlocked: boolean) => void): () => void {
  const handler = () => cb(isPremiumUnlocked());
  window.addEventListener("storage", handler);
  window.addEventListener("fe-premium-changed", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("fe-premium-changed", handler);
  };
}

/** Call after toggling the flag so other components react instantly. */
export function emitPremiumChanged() {
  window.dispatchEvent(new Event("fe-premium-changed"));
}
