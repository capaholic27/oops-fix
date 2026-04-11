import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "fe_favorite_teams";

function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
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
      const next = prev.includes(team)
        ? prev.filter((t) => t !== team)
        : [...prev, team];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (team: string) => favorites.includes(team),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite };
}
