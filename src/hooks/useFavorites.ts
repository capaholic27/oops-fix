import { useState, useCallback, useEffect } from "react";
import { canonicalTeamKey, uniqueTeamNames } from "@/lib/teamNormalize";

const STORAGE_KEY = "fe_favorite_teams";

function loadFavorites(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return uniqueTeamNames(Array.isArray(saved) ? saved.filter((name): name is string => typeof name === "string") : []);
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);

  useEffect(() => {
    const handler = () => setFavorites(loadFavorites());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggleFavorite = useCallback((team: string) => {
    setFavorites((prev) => {
      const key = canonicalTeamKey(team);
      const next = prev.some(t => canonicalTeamKey(t) === key)
        ? prev.filter((t) => canonicalTeamKey(t) !== key)
        : uniqueTeamNames([...prev, team]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (team: string) => favorites.some(t => canonicalTeamKey(t) === canonicalTeamKey(team)),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite };
}
