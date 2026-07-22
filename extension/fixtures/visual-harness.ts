import { createDefaultSettings } from "../src/settings";
import { EloScopeOverlay } from "../src/ui";
import type { MatchContext, PlayerMatch } from "@eloscope/core";

const settings = createDefaultSettings();
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
  { id: "player-3", nickname: "charlie", country: "UA", elo: 2024, officialLevel: 10, game: "cs2" },
  { id: "player-4", nickname: "delta", country: "SE", elo: 2350, officialLevel: 10, game: "cs2" }
];
const match: MatchContext = {
  id: "11111111-2222-3333-4444-555555555555",
  game: "cs2",
  status: "voting",
  teams: [
    { id: "faction1", name: "TEAM ALPHA", players: players.slice(0, 2), averageElo: 2316, minElo: 2180, maxElo: 2451, eloKnown: 2, eloTotal: 2 },
    { id: "faction2", name: "TEAM DELTA", players: players.slice(2), averageElo: 2187, minElo: 2024, maxElo: 2350, eloKnown: 2, eloTotal: 2 }
  ],
  mapPool: ["mirage", "nuke", "ancient"],
  selectedMap: "mirage"
};

const now = Date.now();
const rows = new Map<string, PlayerMatch[]>();
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
}
overlay.showMatch(match, rows);
