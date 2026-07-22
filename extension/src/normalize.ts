import type {
  MatchContext,
  MatchPlayerStats,
  MatchStats,
  Player,
  PlayerMapStats,
  PlayerMatch,
  VetoAction,
  VetoState,
  Viewer
} from "@eloscope/core";
import type { AnyBridgeRequest } from "./protocol";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const object = record(value);
  return object ? Object.values(object) : [];
}

function text(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function number(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function bool(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === 1 || value === "1") return true;
    if (value === "false" || value === 0 || value === "0") return false;
  }
  return undefined;
}

function prop(object: RecordValue | undefined, ...keys: string[]): unknown {
  if (!object) return undefined;
  for (const key of keys) {
    if (object[key] !== undefined) return object[key];
  }
  return undefined;
}

function payload(value: unknown): unknown {
  const object = record(value);
  return prop(object, "payload", "data") ?? value;
}

function statsRecord(value: unknown): RecordValue | undefined {
  const object = record(value);
  return record(prop(object, "stats", "player_stats", "playerStats")) ?? object;
}

function numericStat(object: RecordValue | undefined, ...keys: string[]): number | undefined {
  return number(...keys.map((key) => object?.[key]));
}

function normalizePlayer(value: unknown): (Player & { premadeId?: string }) | null {
  const object = record(value);
  if (!object) return null;
  const games = record(prop(object, "games"));
  const cs2 = record(prop(games, "cs2"));
  const id = text(prop(object, "id", "player_id", "playerId", "guid"));
  const nickname = text(prop(object, "nickname", "name", "nick"));
  if (!id || !nickname) return null;

  const result: Player & { premadeId?: string } = {
    id,
    nickname,
    game: "cs2"
  };
  const country = text(prop(object, "country", "country_code", "countryCode"));
  const avatarUrl = text(prop(object, "avatar", "avatar_url", "avatarUrl"));
  const elo = number(prop(object, "elo", "faceit_elo", "faceitElo"), prop(cs2, "faceit_elo", "elo"));
  const level = number(prop(object, "skill_level", "skillLevel", "level"), prop(cs2, "skill_level", "level"));
  const premadeId = text(prop(object, "party_id", "partyId", "premade_id", "premadeId"));
  if (country) result.country = country.toUpperCase();
  if (avatarUrl) result.avatarUrl = avatarUrl;
  if (elo !== undefined) result.elo = Math.round(elo);
  if (level !== undefined) result.officialLevel = Math.round(level);
  if (premadeId) result.premadeId = premadeId;
  return result;
}

export function normalizeViewer(value: unknown): Viewer | null {
  const player = normalizePlayer(payload(value));
  if (!player) return null;
  return { id: player.id, nickname: player.nickname, ...(player.country ? { country: player.country } : {}) };
}

export function normalizePlayerResponse(value: unknown): Player | null {
  return normalizePlayer(payload(value));
}

function normalizeResult(value: unknown, stats: RecordValue | undefined): "win" | "loss" | undefined {
  const direct = text(prop(record(value), "result", "match_result"), prop(stats, "Result", "result"))?.toLowerCase();
  if (direct === "win" || direct === "w" || direct === "1" || direct === "true") return "win";
  if (direct === "loss" || direct === "lose" || direct === "l" || direct === "0" || direct === "false") {
    return "loss";
  }
  return undefined;
}

function normalizePlayerMatch(value: unknown, playerId: string): PlayerMatch | null {
  const object = record(value);
  const stats = statsRecord(prop(object, "player_stats", "playerStats", "stats"));
  if (!object || !stats) return null;

  const id = text(prop(object, "match_id", "matchId", "id"));
  const result = normalizeResult(object, stats);
  const finishedAt = prop(object, "finished_at", "finishedAt", "ended_at", "date");
  const kills = numericStat(stats, "Kills", "kills");
  const assists = numericStat(stats, "Assists", "assists");
  const deaths = numericStat(stats, "Deaths", "deaths");
  const damage = numericStat(stats, "Damage", "damage", "Total Damage", "total_damage");
  const rounds = numericStat(stats, "Rounds", "rounds", "Rounds Played", "rounds_played");
  if (!id || !result || finishedAt === undefined || [kills, assists, deaths, damage, rounds].some((item) => item === undefined)) {
    return null;
  }

  const statusRaw = text(prop(object, "status", "state"))?.toLowerCase();
  const modeRaw = text(prop(object, "mode", "match_type", "competition_type"))?.toLowerCase();
  const resultValue: PlayerMatch = {
    id,
    playerId,
    game: text(prop(object, "game", "game_id"))?.toLowerCase() ?? "cs2",
    mode: modeRaw === "5v5" || modeRaw === "matchmaking" ? "5v5" : modeRaw ?? "unknown",
    status: statusRaw === "finished" || statusRaw === "completed" ? "finished" : statusRaw ?? "unknown",
    finishedAt: finishedAt as string | number,
    result,
    roundsPlayed: rounds as number,
    kills: kills as number,
    assists: assists as number,
    deaths: deaths as number,
    damage: damage as number
  };

  const map = text(prop(object, "map", "map_name"), prop(stats, "Map", "map"));
  const teamId = text(prop(object, "team_id", "teamId", "faction"));
  const headshots = numericStat(stats, "Headshots", "headshots");
  const firstKills = numericStat(stats, "First Kills", "first_kills", "firstKills");
  const survivedRounds = numericStat(stats, "Survived Rounds", "survived_rounds", "survivedRounds");
  const eloBefore = number(prop(object, "elo_before", "eloBefore"));
  const eloAfter = number(prop(object, "elo_after", "eloAfter", "elo"));
  const teamAverageElo = number(prop(object, "team_average_elo", "teamAverageElo"));
  const opponentAverageElo = number(prop(object, "opponent_average_elo", "opponentAverageElo"));
  const fcr = number(prop(stats, "FCR", "fcr"));
  if (map) resultValue.map = map;
  if (teamId) resultValue.teamId = teamId;
  if (headshots !== undefined) resultValue.headshots = headshots;
  if (firstKills !== undefined) resultValue.firstKills = firstKills;
  if (survivedRounds !== undefined) resultValue.survivedRounds = survivedRounds;
  if (eloBefore !== undefined) resultValue.eloBefore = eloBefore;
  if (eloAfter !== undefined) resultValue.eloAfter = eloAfter;
  if (teamAverageElo !== undefined) resultValue.teamAverageElo = teamAverageElo;
  if (opponentAverageElo !== undefined) resultValue.opponentAverageElo = opponentAverageElo;
  if (fcr !== undefined) resultValue.fcr = fcr;
  return resultValue;
}

export function normalizeRecentMatches(value: unknown, playerId: string): PlayerMatch[] | null {
  const root = payload(value);
  const object = record(root);
  const declared = prop(object, "items", "matches", "results");
  if (!Array.isArray(root) && declared === undefined) return null;
  const items = array(declared ?? root);
  return items.map((item) => normalizePlayerMatch(item, playerId)).filter((item): item is PlayerMatch => item !== null);
}

export function normalizeMapStats(value: unknown): PlayerMapStats[] | null {
  const root = record(payload(value));
  if (!root) return null;
  const declared = prop(root, "segments", "maps", "items");
  if (declared === undefined) return null;
  const segments = array(declared);
  const result: PlayerMapStats[] = [];
  for (const segment of segments) {
    const object = record(segment);
    const stats = statsRecord(segment);
    const map = text(prop(object, "label", "map", "name"), prop(stats, "Map", "map"));
    const matches = numericStat(stats, "Matches", "matches");
    const wins = numericStat(stats, "Wins", "wins");
    const kills = numericStat(stats, "Kills", "kills");
    const assists = numericStat(stats, "Assists", "assists");
    const deaths = numericStat(stats, "Deaths", "deaths");
    const roundsPlayed = numericStat(stats, "Rounds", "rounds", "Rounds Played", "rounds_played");
    const damage = numericStat(stats, "Damage", "damage", "Total Damage", "total_damage");
    if (!map || [matches, wins, kills, assists, deaths, roundsPlayed, damage].some((item) => item === undefined)) continue;
    const row: PlayerMapStats = {
      map,
      matches: matches as number,
      wins: wins as number,
      kills: kills as number,
      assists: assists as number,
      deaths: deaths as number,
      roundsPlayed: roundsPlayed as number,
      damage: damage as number
    };
    const headshots = numericStat(stats, "Headshots", "headshots");
    const firstKills = numericStat(stats, "First Kills", "first_kills", "firstKills");
    if (headshots !== undefined) row.headshots = headshots;
    if (firstKills !== undefined) row.firstKills = firstKills;
    result.push(row);
  }
  return result;
}

function teamValues(value: unknown): unknown[] {
  const object = record(value);
  return array(prop(object, "teams", "factions") ?? value);
}

export function normalizeMatch(value: unknown): MatchContext | null {
  const root = record(payload(value));
  if (!root) return null;
  const id = text(prop(root, "id", "match_id", "matchId"));
  if (!id) return null;

  const rawTeams = prop(root, "teams") ?? [prop(root, "faction1"), prop(root, "faction2")].filter(Boolean);
  const teams = teamValues(rawTeams)
    .map((rawTeam, index) => {
      const team = record(rawTeam);
      if (!team) return null;
      const players = array(prop(team, "players", "roster", "members"))
        .map(normalizePlayer)
        .filter((player): player is Player & { premadeId?: string } => player !== null);
      const idValue = text(prop(team, "id", "team_id", "teamId")) ?? `team-${index + 1}`;
      const elos = players.map((player) => player.elo).filter((elo): elo is number => elo !== undefined);
      return {
        id: idValue,
        ...(text(prop(team, "name", "team_name")) ? { name: text(prop(team, "name", "team_name")) } : {}),
        players,
        eloKnown: elos.length,
        eloTotal: players.length,
        ...(elos.length
          ? {
              averageElo: Math.round(elos.reduce((sum, elo) => sum + elo, 0) / elos.length),
              minElo: Math.min(...elos),
              maxElo: Math.max(...elos)
            }
          : {})
      };
    })
    .filter((team): team is NonNullable<typeof team> => team !== null);
  if (teams.length < 2 || teams.some((team) => team.players.length === 0)) return null;

  const voting = record(prop(root, "voting", "vote"));
  const mapVoting = record(prop(voting, "map", "maps"));
  const mapEntities = array(prop(mapVoting, "entities", "available", "pool"));
  const mapPool = mapEntities
    .map((entry) => text(prop(record(entry), "name", "id", "value"), entry))
    .filter((entry): entry is string => Boolean(entry));
  const picked = array(prop(mapVoting, "pick", "picked", "selected"))[0];
  const selectedMap = text(prop(root, "map", "selected_map", "selectedMap"), prop(record(picked), "name", "value"), picked);
  const status = text(prop(root, "status", "state"))?.toLowerCase();
  const game = text(prop(root, "game", "game_id"))?.toLowerCase();
  if (!status || (game !== undefined && game !== "cs2")) return null;

  const result: MatchContext = {
    id,
    game: game ?? "cs2",
    status,
    teams,
    mapPool: mapPool.length ? mapPool : selectedMap ? [selectedMap] : []
  };
  if (selectedMap) result.selectedMap = selectedMap;
  const serverLocation = text(prop(root, "server_location", "serverLocation", "region"));
  const serverConnect = text(prop(root, "connect", "server_connect", "serverConnect"));
  const viewerIsCaptain = bool(prop(root, "viewer_is_captain", "viewerIsCaptain"));
  if (serverLocation) result.serverLocation = serverLocation;
  if (serverConnect) result.serverConnect = serverConnect;
  if (viewerIsCaptain !== undefined) result.viewerIsCaptain = viewerIsCaptain;
  return result;
}

export function normalizeMatchStats(value: unknown, matchId: string): MatchStats | null {
  const root = record(payload(value));
  if (!root) return null;
  const rounds = array(prop(root, "rounds"));
  const lastRound = record(rounds.at(-1));
  const roundStats = statsRecord(prop(lastRound, "round_stats", "roundStats"));
  const roundsPlayed = number(prop(root, "rounds_played", "roundsPlayed"), prop(roundStats, "Rounds", "rounds"));
  if (roundsPlayed === undefined) return null;

  const teams = array(prop(lastRound, "teams") ?? prop(root, "teams"));
  const players: MatchPlayerStats[] = [];
  teams.forEach((rawTeam, index) => {
    const team = record(rawTeam);
    const teamId = text(prop(team, "team_id", "teamId", "id")) ?? `team-${index + 1}`;
    for (const rawPlayer of array(prop(team, "players"))) {
      const player = record(rawPlayer);
      const stats = statsRecord(rawPlayer);
      const playerId = text(prop(player, "player_id", "playerId", "id"));
      const kills = numericStat(stats, "Kills", "kills");
      const assists = numericStat(stats, "Assists", "assists");
      const deaths = numericStat(stats, "Deaths", "deaths");
      const damage = numericStat(stats, "Damage", "damage");
      if (!playerId || [kills, assists, deaths, damage].some((item) => item === undefined)) continue;
      const row: MatchPlayerStats = {
        playerId,
        teamId,
        kills: kills as number,
        assists: assists as number,
        deaths: deaths as number,
        damage: damage as number,
        roundsPlayed
      };
      const headshots = numericStat(stats, "Headshots", "headshots");
      const firstKills = numericStat(stats, "First Kills", "first_kills");
      const survivedRounds = numericStat(stats, "Survived Rounds", "survived_rounds");
      if (headshots !== undefined) row.headshots = headshots;
      if (firstKills !== undefined) row.firstKills = firstKills;
      if (survivedRounds !== undefined) row.survivedRounds = survivedRounds;
      players.push(row);
    }
  });

  if (roundsPlayed <= 0 || players.length === 0) return null;

  return {
    matchId,
    ...(text(prop(root, "map"), prop(roundStats, "Map")) ? { map: text(prop(root, "map"), prop(roundStats, "Map")) } : {}),
    roundsPlayed,
    players
  };
}

export function normalizeVeto(value: unknown, matchId: string): VetoState | null {
  const rawRoot = payload(value);
  const root = record(rawRoot);
  const declared = prop(root, "items", "history", "actions");
  if (!Array.isArray(rawRoot) && !root) return null;
  if (!Array.isArray(rawRoot) && declared === undefined && prop(root, "active", "is_active", "isActive") === undefined) return null;
  const items = array(declared ?? rawRoot);
  const history: VetoAction[] = [];
  for (const item of items) {
    const object = record(item);
    const kind = text(prop(object, "kind", "type", "action"))?.toLowerCase();
    if (!kind || !["ban", "pick", "server-ban", "server-pick"].includes(kind)) continue;
    const id = text(prop(object, "id"));
    const itemValue = text(prop(object, "value", "map", "location", "entity"));
    const teamId = text(prop(object, "team_id", "teamId", "team"));
    if (!id || !itemValue || !teamId) continue;
    history.push({ id, kind: kind as VetoAction["kind"], value: itemValue, teamId });
  }

  return {
    matchId,
    active: bool(prop(root, "active", "is_active", "isActive")) ?? false,
    viewerTurn: bool(prop(root, "viewer_turn", "viewerTurn", "is_your_turn")) ?? false,
    viewerIsCaptain: bool(prop(root, "viewer_is_captain", "viewerIsCaptain")) ?? false,
    availableMaps: array(prop(root, "available_maps", "availableMaps"))
      .map((item) => text(prop(record(item), "name", "value"), item))
      .filter((item): item is string => Boolean(item)),
    availableServers: array(prop(root, "available_servers", "availableServers", "available_locations"))
      .map((item) => text(prop(record(item), "name", "value"), item))
      .filter((item): item is string => Boolean(item)),
    history
  };
}

export function normalizeBridgeData(request: AnyBridgeRequest, value: unknown): unknown {
  switch (request.operation) {
    case "viewer":
      return normalizeViewer(value);
    case "player":
      return normalizePlayerResponse(value);
    case "recentMatches":
      return normalizeRecentMatches(value, request.args.playerId);
    case "playerMapStats":
      return normalizeMapStats(value);
    case "match":
      return normalizeMatch(value);
    case "matchStats":
      return normalizeMatchStats(value, request.args.matchId);
    case "vetoState":
      return normalizeVeto(value, request.args.matchId);
  }
}
