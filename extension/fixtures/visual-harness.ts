import { createDefaultSettings } from "../src/settings";
import { EloScopeOverlay } from "../src/ui";
import type { MatchContext, PlayerMapStats, PlayerMatch } from "@eloscope/core";

const settings = createDefaultSettings();
settings.showExtendedTier = true;
settings.showPlayerRoles = true;
settings.automations.positions = {
  mirage: { enabled: true, message: "I play A connector", mode: "confirm" },
  nuke: { enabled: false, message: "I can play ramp", mode: "prefill" },
  ancient: { enabled: false, message: "", mode: "confirm" }
};

const overlay = new EloScopeOverlay(settings, {
  onSettingsChange: () => undefined,
  onStatsWindow: () => undefined,
  onPositionSend: async () => "prepared",
  onHistoryDetail: async () => ({
    status: "error",
    error: { code: "fixture", message: "No detail in visual fixture", retryable: false }
  })
});
overlay.setCompatibility("applied");

const players = [
  { id: "player-1", nickname: "alpha", country: "PL", elo: 2451, officialLevel: 10, game: "cs2", premadeId: "party-a" },
  { id: "player-2", nickname: "bravo", country: "DE", elo: 2180, officialLevel: 10, game: "cs2", premadeId: "party-a" },
  { id: "player-3", nickname: "charlie_the_longest", country: "UA", elo: 2024, officialLevel: 10, game: "cs2" },
  { id: "player-4", nickname: "delta", country: "SE", elo: 2350, officialLevel: 10, game: "cs2" },
  { id: "player-5", nickname: "echo", country: "FI", elo: 2288, officialLevel: 10, game: "cs2" },
  { id: "player-6", nickname: "foxtrot", country: "FR", elo: 2511, officialLevel: 10, game: "cs2", premadeId: "party-b" },
  { id: "player-7", nickname: "golf", country: "GB", elo: 2402, officialLevel: 10, game: "cs2", premadeId: "party-b" },
  { id: "player-8", nickname: "hotel", country: "NL", elo: 2210, officialLevel: 10, game: "cs2" },
  { id: "player-9", nickname: "india", country: "NO", elo: 2090, officialLevel: 10, game: "cs2" },
  { id: "player-10", nickname: "juliet", country: "DK", elo: 1984, officialLevel: 9, game: "cs2" }
];
const match: MatchContext = {
  id: "11111111-2222-3333-4444-555555555555",
  game: "cs2",
  status: "voting",
  teams: [
    { id: "faction1", name: "TEAM ALPHA", players: players.slice(0, 5), eloKnown: 5, eloTotal: 5 },
    { id: "faction2", name: "TEAM FOXTROT", players: players.slice(5), eloKnown: 5, eloTotal: 5 }
  ],
  mapPool: ["mirage", "nuke", "ancient"],
  selectedMap: "mirage"
};

const now = Date.now();
const rows = new Map<string, PlayerMatch[]>();
const mapStats = new Map<string, PlayerMapStats[]>();
const roleProfiles: ReadonlyArray<Pick<
  PlayerMatch,
  "roundsPlayed" | "kills" | "assists" | "deaths" | "damage" | "headshots" | "firstKills" | "survivedRounds"
>> = [
  { roundsPlayed: 20, kills: 17, assists: 2, deaths: 9, damage: 1_800, headshots: 3, firstKills: 2, survivedRounds: 11 },
  { roundsPlayed: 20, kills: 18, assists: 3, deaths: 16, damage: 1_900, headshots: 10, firstKills: 3, survivedRounds: 4 },
  { roundsPlayed: 20, kills: 12, assists: 6, deaths: 13, damage: 1_500, headshots: 6, firstKills: 0, survivedRounds: 7 },
  { roundsPlayed: 20, kills: 14, assists: 3, deaths: 8, damage: 1_600, headshots: 7, firstKills: 0, survivedRounds: 12 },
  { roundsPlayed: 20, kills: 16, assists: 3, deaths: 12, damage: 1_750, headshots: 11, firstKills: 1, survivedRounds: 8 },
];
for (const [playerIndex, player] of players.entries()) {
  const roleProfile = roleProfiles[playerIndex % roleProfiles.length] as (typeof roleProfiles)[number];
  rows.set(player.id, Array.from({ length: 20 }, (_, index) => ({
    id: `${player.id}-${index}`,
    playerId: player.id,
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: now - index * 12 * 60 * 60 * 1_000,
    result: (index + playerIndex) % 3 ? "win" : "loss",
    map: index % 2 ? "nuke" : "mirage",
    ...roleProfile,
  })));
  mapStats.set(player.id, [
    {
      map: "mirage",
      matches: 240 + playerIndex * 11,
      wins: 130 + playerIndex * 4,
      kills: 4_500 + playerIndex * 120,
      assists: 1_100,
      deaths: 3_900,
      roundsPlayed: 5_600,
      damage: 475_000,
    },
    {
      map: "nuke",
      matches: 176,
      wins: 92,
      kills: 3_200,
      assists: 760,
      deaths: 2_900,
      roundsPlayed: 4_100,
      damage: 345_000,
    },
  ]);
}
overlay.showMatch(match, rows, mapStats);
