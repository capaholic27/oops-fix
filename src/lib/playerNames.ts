/* Generates plausible squad member names with shirt numbers for fallback display.
 * Deterministic per (teamName, position) so the same player keeps the same name
 * across leaderboard categories and the squad radar. */

const FIRST_NAMES = [
  "James", "Liam", "Noah", "Ethan", "Lucas", "Mason", "Logan", "Oliver",
  "Marco", "Andrea", "Diego", "Mateo", "Hugo", "Léo", "Felix", "Jonas",
  "Henrik", "Stefan", "Tomáš", "Pavel", "Aleks", "Yuri", "Sergio", "Iván",
  "Pierre", "Antoine", "Mathieu", "Nicolás", "Rafael", "Bruno", "Tiago", "João",
];

const LAST_NAMES = [
  "Walker", "Bennett", "Morgan", "Harper", "Carter", "Reed", "Hayes", "Cole",
  "Rossi", "Conti", "Bianchi", "Russo", "Esposito", "Greco",
  "García", "Martín", "López", "Hernández", "Ruiz", "Vargas",
  "Müller", "Schmidt", "Werner", "Weber", "Fischer", "Becker",
  "Dubois", "Laurent", "Moreau", "Lefèvre", "Petit", "Lambert",
  "Silva", "Costa", "Almeida", "Pereira", "Rocha", "Mendes",
  "Novak", "Horvat", "Kovač", "Petrov", "Ivanov", "Sokolov",
];

const SQUAD_NUMBERS = [9, 10, 7, 11, 8, 6, 4, 5, 2, 3, 20, 22, 14, 17, 19, 1];

/** djb2 hash → seed */
function seed(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: T[], s: number): T {
  return arr[s % arr.length];
}

export type SyntheticPlayer = {
  name: string;        // "J. Walker"
  fullName: string;    // "James Walker"
  number: number;
  initials: string;
};

/** Get a deterministic fake player for a given team + slot index (0..15). */
export function getSyntheticPlayer(teamName: string, slot: number): SyntheticPlayer {
  const s1 = seed(`${teamName}|first|${slot}`);
  const s2 = seed(`${teamName}|last|${slot}`);
  const first = pick(FIRST_NAMES, s1);
  const last = pick(LAST_NAMES, s2);
  const number = SQUAD_NUMBERS[slot % SQUAD_NUMBERS.length];
  const name = `${first[0]}. ${last}`;
  const initials = `${first[0]}${last[0]}`.toUpperCase();
  return { name, fullName: `${first} ${last}`, number, initials };
}

/** Generate N synthetic players for a team. */
export function getSyntheticSquad(teamName: string, count: number): SyntheticPlayer[] {
  // Ensure unique last names within the squad
  const seen = new Set<string>();
  const out: SyntheticPlayer[] = [];
  let slot = 0;
  while (out.length < count && slot < count * 4) {
    const p = getSyntheticPlayer(teamName, slot);
    if (!seen.has(p.fullName)) {
      seen.add(p.fullName);
      out.push(p);
    }
    slot++;
  }
  return out;
}

/** Extract initials from a real player name like "B. Saka" or "M. Ødegaard" */
export function getInitials(name: string): string {
  const parts = name.split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic HSL color from a name for avatar background variety */
export function nameColor(name: string): string {
  const h = seed(name) % 360;
  return `hsl(${h}, 55%, 45%)`;
}
