import { createDefaultSettings } from "../src/settings";
import { EloScopeOverlay } from "../src/ui";
import type { MatchContext, PlayerMapStats, PlayerMatch } from "@eloscope/core";

const settings = createDefaultSettings();
settings.showExtendedTier = true;
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
for (const [playerIndex, player] of players.entries()) {
  rows.set(player.id, Array.from({ length: 12 }, (_, index) => ({
    id: `${player.id}-${index}`,
    playerId: player.id,
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: now - index * 12 * 60 * 60 * 1_000,
    result: (index + playerIndex) % 3 ? "win" : "loss",
    map: index % 2 ? "nuke" : "mirage",
    roundsPlayed: 22,
    kills: 17 + playerIndex + (index % 4),
    assists: 5,
    deaths: 14 + (index % 3),
    damage: 1_760 + playerIndex * 80,
    headshots: 8
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
