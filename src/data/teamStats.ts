export type PlayerFoulProfile = {
  name: string;
  position: string;
  foulsCommitted: number;
  foulsDrawn: number;
  yellowCards: number;
  redCards: number;
  appearances: number;
};

export type TeamStats = {
  id: string;
  name: string;
  logo: string;
  league: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  avgCornersFor: number;
  avgCornersAgainst: number;
  avgYellowCards: number;
  avgRedCards: number;
  avgFoulsCommitted: number;
  avgFoulsDrawn: number;
  cleanSheets: number;
  bttsPercentage: number;
  over25Percentage: number;
  over15Percentage: number;
  winProbability: number;
  formLast5: ("W" | "D" | "L")[];
  players: PlayerFoulProfile[];
};

export const teams: TeamStats[] = [
  {
    id: "arsenal",
    name: "Arsenal",
    logo: "🔴",
    league: "Premier League",
    matchesPlayed: 28,
    wins: 19,
    draws: 5,
    losses: 4,
    goalsFor: 54,
    goalsAgainst: 22,
    avgCornersFor: 6.8,
    avgCornersAgainst: 3.9,
    avgYellowCards: 1.7,
    avgRedCards: 0.07,
    avgFoulsCommitted: 10.3,
    avgFoulsDrawn: 11.8,
    cleanSheets: 12,
    bttsPercentage: 53.6,
    over25Percentage: 64.3,
    over15Percentage: 85.7,
    winProbability: 67.8,
    formLast5: ["W", "W", "D", "W", "L"],
    players: [
      { name: "Declan Rice", position: "MF", foulsCommitted: 38, foulsDrawn: 42, yellowCards: 7, redCards: 1, appearances: 27 },
      { name: "William Saliba", position: "DF", foulsCommitted: 22, foulsDrawn: 8, yellowCards: 4, redCards: 0, appearances: 26 },
      { name: "Bukayo Saka", position: "FW", foulsCommitted: 12, foulsDrawn: 58, yellowCards: 2, redCards: 0, appearances: 25 },
      { name: "Martin Ødegaard", position: "MF", foulsCommitted: 18, foulsDrawn: 34, yellowCards: 3, redCards: 0, appearances: 22 },
      { name: "Gabriel Magalhães", position: "DF", foulsCommitted: 26, foulsDrawn: 14, yellowCards: 6, redCards: 0, appearances: 28 },
    ],
  },
  {
    id: "liverpool",
    name: "Liverpool",
    logo: "🔴",
    league: "Premier League",
    matchesPlayed: 28,
    wins: 21,
    draws: 4,
    losses: 3,
    goalsFor: 62,
    goalsAgainst: 21,
    avgCornersFor: 7.2,
    avgCornersAgainst: 3.4,
    avgYellowCards: 1.5,
    avgRedCards: 0.04,
    avgFoulsCommitted: 9.6,
    avgFoulsDrawn: 10.4,
    cleanSheets: 14,
    bttsPercentage: 50.0,
    over25Percentage: 71.4,
    over15Percentage: 89.3,
    winProbability: 75.0,
    formLast5: ["W", "W", "W", "D", "W"],
    players: [
      { name: "Mohamed Salah", position: "FW", foulsCommitted: 14, foulsDrawn: 46, yellowCards: 1, redCards: 0, appearances: 28 },
      { name: "Ryan Gravenberch", position: "MF", foulsCommitted: 32, foulsDrawn: 28, yellowCards: 5, redCards: 0, appearances: 28 },
      { name: "Virgil van Dijk", position: "DF", foulsCommitted: 18, foulsDrawn: 6, yellowCards: 4, redCards: 0, appearances: 27 },
      { name: "Luis Díaz", position: "FW", foulsCommitted: 16, foulsDrawn: 38, yellowCards: 3, redCards: 0, appearances: 26 },
      { name: "Alexis Mac Allister", position: "MF", foulsCommitted: 34, foulsDrawn: 22, yellowCards: 6, redCards: 0, appearances: 27 },
    ],
  },
  {
    id: "mancity",
    name: "Manchester City",
    logo: "🔵",
    league: "Premier League",
    matchesPlayed: 28,
    wins: 16,
    draws: 5,
    losses: 7,
    goalsFor: 52,
    goalsAgainst: 30,
    avgCornersFor: 7.5,
    avgCornersAgainst: 4.1,
    avgYellowCards: 1.9,
    avgRedCards: 0.07,
    avgFoulsCommitted: 11.2,
    avgFoulsDrawn: 9.8,
    cleanSheets: 9,
    bttsPercentage: 60.7,
    over25Percentage: 67.9,
    over15Percentage: 82.1,
    winProbability: 57.1,
    formLast5: ["L", "W", "D", "W", "W"],
    players: [
      { name: "Rodri", position: "MF", foulsCommitted: 42, foulsDrawn: 30, yellowCards: 8, redCards: 0, appearances: 14 },
      { name: "Erling Haaland", position: "FW", foulsCommitted: 18, foulsDrawn: 44, yellowCards: 2, redCards: 0, appearances: 28 },
      { name: "Bernardo Silva", position: "MF", foulsCommitted: 22, foulsDrawn: 36, yellowCards: 4, redCards: 0, appearances: 26 },
      { name: "Kyle Walker", position: "DF", foulsCommitted: 28, foulsDrawn: 10, yellowCards: 5, redCards: 1, appearances: 22 },
      { name: "Phil Foden", position: "MF", foulsCommitted: 10, foulsDrawn: 32, yellowCards: 2, redCards: 0, appearances: 24 },
    ],
  },
  {
    id: "realmadrid",
    name: "Real Madrid",
    logo: "⚪",
    league: "La Liga",
    matchesPlayed: 27,
    wins: 18,
    draws: 5,
    losses: 4,
    goalsFor: 56,
    goalsAgainst: 24,
    avgCornersFor: 5.9,
    avgCornersAgainst: 3.7,
    avgYellowCards: 2.3,
    avgRedCards: 0.11,
    avgFoulsCommitted: 12.8,
    avgFoulsDrawn: 13.2,
    cleanSheets: 10,
    bttsPercentage: 55.6,
    over25Percentage: 66.7,
    over15Percentage: 88.9,
    winProbability: 66.7,
    formLast5: ["W", "D", "W", "W", "L"],
    players: [
      { name: "Vinícius Júnior", position: "FW", foulsCommitted: 20, foulsDrawn: 64, yellowCards: 5, redCards: 1, appearances: 24 },
      { name: "Jude Bellingham", position: "MF", foulsCommitted: 24, foulsDrawn: 40, yellowCards: 4, redCards: 0, appearances: 25 },
      { name: "Aurélien Tchouaméni", position: "MF", foulsCommitted: 38, foulsDrawn: 16, yellowCards: 7, redCards: 0, appearances: 26 },
      { name: "Dani Carvajal", position: "DF", foulsCommitted: 30, foulsDrawn: 12, yellowCards: 8, redCards: 1, appearances: 18 },
      { name: "Federico Valverde", position: "MF", foulsCommitted: 28, foulsDrawn: 22, yellowCards: 6, redCards: 0, appearances: 27 },
    ],
  },
  {
    id: "barcelona",
    name: "Barcelona",
    logo: "🔵🔴",
    league: "La Liga",
    matchesPlayed: 27,
    wins: 20,
    draws: 4,
    losses: 3,
    goalsFor: 64,
    goalsAgainst: 22,
    avgCornersFor: 6.4,
    avgCornersAgainst: 3.2,
    avgYellowCards: 2.1,
    avgRedCards: 0.04,
    avgFoulsCommitted: 11.4,
    avgFoulsDrawn: 12.6,
    cleanSheets: 13,
    bttsPercentage: 48.1,
    over25Percentage: 74.1,
    over15Percentage: 92.6,
    winProbability: 74.1,
    formLast5: ["W", "W", "W", "L", "W"],
    players: [
      { name: "Lamine Yamal", position: "FW", foulsCommitted: 8, foulsDrawn: 52, yellowCards: 1, redCards: 0, appearances: 26 },
      { name: "Pedri", position: "MF", foulsCommitted: 16, foulsDrawn: 38, yellowCards: 3, redCards: 0, appearances: 24 },
      { name: "Gavi", position: "MF", foulsCommitted: 30, foulsDrawn: 28, yellowCards: 6, redCards: 0, appearances: 20 },
      { name: "Ronald Araújo", position: "DF", foulsCommitted: 24, foulsDrawn: 8, yellowCards: 5, redCards: 0, appearances: 16 },
      { name: "Raphinha", position: "FW", foulsCommitted: 14, foulsDrawn: 42, yellowCards: 3, redCards: 0, appearances: 27 },
    ],
  },
];
