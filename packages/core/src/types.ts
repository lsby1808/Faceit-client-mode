export const STATS_WINDOWS = [5, 10, 20, 30, 50, 100] as const;

export type StatsWindow = (typeof STATS_WINDOWS)[number];
export type MapId = string;

export type DataError = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
}>;

/** Explicit remote-data state. Missing or restricted data is never represented by a fake zero. */
export type DataState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; data: T; fetchedAt: number; stale?: boolean }>
  | Readonly<{ status: "error"; error: DataError; previous?: T }>
  | Readonly<{ status: "restricted"; reason?: string }>;

export interface Viewer {
  id: string;
  nickname: string;
  country?: string;
}

export interface Player {
  id: string;
  nickname: string;
  country?: string;
  avatarUrl?: string;
  elo?: number;
  officialLevel?: number;
  game: string;
}

export type MatchResult = "win" | "loss";

/**
 * Normalized per-player row used by all calculations. Adapters may preserve
 * unknown upstream values in game/mode/status; the eligibility predicate is
 * deliberately strict and rejects them.
 */
export interface PlayerMatch {
  id: string;
  playerId: string;
  teamId?: string;
  game: string;
  mode: string;
  status: string;
  finishedAt: string | number | Date;
  result: MatchResult;
  map?: MapId;
  roundsPlayed: number;
  kills: number;
  assists: number;
  deaths: number;
  damage: number;
  headshots?: number;
  firstKills?: number;
  survivedRounds?: number;
  eloBefore?: number;
  eloAfter?: number;
  teamAverageElo?: number;
  opponentAverageElo?: number;
  /** Team-normalized contribution percentage when the source match exposes all ten players. */
  fcr?: number;
}

export interface PlayerMapStats {
  map: MapId;
  matches: number;
  wins: number;
  kills: number;
  assists: number;
  deaths: number;
  roundsPlayed: number;
  damage: number;
  headshots?: number;
  firstKills?: number;
}

export interface MatchTeam {
  id: string;
  name?: string;
  players: Player[];
  /** FACEIT's pre-match team win probability, normalized to the inclusive 0-1 range. */
  winProbability?: number;
  averageElo?: number;
  minElo?: number;
  maxElo?: number;
  eloKnown?: number;
  eloTotal?: number;
}

export interface MatchContext {
  id: string;
  game: string;
  status: "pending" | "voting" | "ready" | "ongoing" | "finished" | "cancelled" | string;
  teams: MatchTeam[];
  mapPool: MapId[];
  selectedMap?: MapId;
  serverLocation?: string;
  serverConnect?: string;
  viewerIsCaptain?: boolean;
  /** Whether this match is configured to change FACEIT Elo. */
  calculateElo?: boolean;
  /** True only when FACEIT marks the room with its exact `premium` tag. */
  premiumMatch?: boolean;
}

export interface MatchPlayerStats {
  playerId: string;
  teamId: string;
  kills: number;
  assists: number;
  deaths: number;
  damage: number;
  roundsPlayed: number;
  headshots?: number;
  firstKills?: number;
  survivedRounds?: number;
}

export interface MatchStats {
  matchId: string;
  map?: MapId;
  roundsPlayed: number;
  players: MatchPlayerStats[];
}

export interface VetoAction {
  id: string;
  kind: "ban" | "pick" | "server-ban" | "server-pick";
  value: string;
  teamId: string;
  createdAt?: string;
}

export interface VetoState {
  matchId: string;
  active: boolean;
  viewerTurn: boolean;
  viewerIsCaptain: boolean;
  availableMaps: MapId[];
  availableServers: string[];
  history: VetoAction[];
}

export interface FaceitReadAdapter {
  getViewer(): Promise<DataState<Viewer>>;
  getPlayer(nickname: string): Promise<DataState<Player>>;
  getRecentMatches(playerId: string, limit: StatsWindow): Promise<DataState<PlayerMatch[]>>;
  getPlayerMapStats(playerId: string): Promise<DataState<PlayerMapStats[]>>;
  getMatch(matchId: string): Promise<DataState<MatchContext>>;
  getMatchStats(matchId: string): Promise<DataState<MatchStats>>;
  getVetoState(matchId: string): Promise<DataState<VetoState>>;
}

export type PositionMessageMode = "confirm" | "auto" | "prefill";

export type AutomationSettings = {
  partyAccept: boolean;
  readyUp: boolean;
  mapVeto: { enabled: boolean; banOrder: MapId[]; pickOrder: MapId[] };
  serverVeto: { enabled: boolean; order: string[] };
  autoConnect: boolean;
  copyServerData: boolean;
  positions: Record<
    MapId,
    {
      enabled: boolean;
      message: string;
      mode: PositionMessageMode;
    }
  >;
};

export const loadingState = <T>(): DataState<T> => ({ status: "loading" });

export const readyState = <T>(data: T, fetchedAt = Date.now()): DataState<T> => ({
  status: "ready",
  data,
  fetchedAt,
});

export const errorState = <T>(code: string, message: string, retryable = false): DataState<T> => ({
  status: "error",
  error: { code, message, retryable },
});

export const restrictedState = <T>(reason?: string): DataState<T> =>
  reason === undefined ? { status: "restricted" } : { status: "restricted", reason };
