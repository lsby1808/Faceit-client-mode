import type { Player, PlayerMatch } from "@eloscope/core";

export const SNAPSHOT_KEY = "eloscope:elo-snapshots:v1";
const MAX_PLAYER_SNAPSHOTS = 2_000;
const MAX_MATCH_SNAPSHOTS = 2_000;
const PLAYER_DEDUP_MS = 5 * 60_000;

export type PlayerEloSnapshot = {
  playerId: string;
  elo: number;
  capturedAt: number;
};

export type MatchEloSnapshot = {
  playerId: string;
  matchId: string;
  capturedAt: number;
  eloBefore?: number;
  eloAfter?: number;
};

type SnapshotStore = {
  version: 1;
  players: PlayerEloSnapshot[];
  matches: MatchEloSnapshot[];
};

const emptyStore = (): SnapshotStore => ({ version: 1, players: [], matches: [] });

function finiteElo(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000;
}

function parseStore(value: unknown): SnapshotStore {
  if (typeof value !== "object" || value === null) return emptyStore();
  const input = value as Partial<SnapshotStore>;
  const players = Array.isArray(input.players)
    ? input.players.filter((row): row is PlayerEloSnapshot =>
        typeof row?.playerId === "string" && finiteElo(row.elo) && Number.isFinite(row.capturedAt))
    : [];
  const matches = Array.isArray(input.matches)
    ? input.matches.filter((row): row is MatchEloSnapshot =>
        typeof row?.playerId === "string" &&
        typeof row?.matchId === "string" &&
        Number.isFinite(row.capturedAt) &&
        (row.eloBefore === undefined || finiteElo(row.eloBefore)) &&
        (row.eloAfter === undefined || finiteElo(row.eloAfter)))
    : [];
  return {
    version: 1,
    players: players.slice(-MAX_PLAYER_SNAPSHOTS),
    matches: matches.slice(-MAX_MATCH_SNAPSHOTS),
  };
}

/** Stores only public ELO values; credentials and response payloads never enter storage. */
export class EloSnapshotStore {
  #queue: Promise<void> = Promise.resolve();

  async recordPlayer(player: Player, capturedAt = Date.now()): Promise<void> {
    if (!finiteElo(player.elo) || !Number.isFinite(capturedAt)) return;
    const elo = player.elo;
    await this.#mutate((store) => {
      const last = [...store.players].reverse().find((row) => row.playerId === player.id);
      if (last && last.elo === elo && Math.abs(capturedAt - last.capturedAt) < PLAYER_DEDUP_MS) return;
      store.players.push({ playerId: player.id, elo, capturedAt });
      store.players = store.players.slice(-MAX_PLAYER_SNAPSHOTS);
    });
  }

  async rememberMatchElos(playerId: string, matches: readonly PlayerMatch[], capturedAt = Date.now()): Promise<void> {
    const reliable = matches.filter((match) => finiteElo(match.eloBefore) || finiteElo(match.eloAfter));
    if (!reliable.length || !Number.isFinite(capturedAt)) return;
    await this.#mutate((store) => {
      for (const match of reliable) {
        const next: MatchEloSnapshot = { playerId, matchId: match.id, capturedAt };
        if (finiteElo(match.eloBefore)) next.eloBefore = match.eloBefore;
        if (finiteElo(match.eloAfter)) next.eloAfter = match.eloAfter;
        const existing = store.matches.findIndex((row) => row.playerId === playerId && row.matchId === match.id);
        if (existing >= 0) store.matches.splice(existing, 1);
        store.matches.push(next);
      }
      store.matches = store.matches.slice(-MAX_MATCH_SNAPSHOTS);
    });
  }

  async hydrateMatchElos(playerId: string, matches: readonly PlayerMatch[]): Promise<PlayerMatch[]> {
    await this.#queue;
    const store = await this.#read();
    const byMatch = new Map(
      store.matches
        .filter((row) => row.playerId === playerId)
        .map((row) => [row.matchId, row] as const),
    );
    return matches.map((match) => {
      const snapshot = byMatch.get(match.id);
      if (!snapshot) return match;
      return {
        ...match,
        ...(match.eloBefore === undefined && snapshot.eloBefore !== undefined
          ? { eloBefore: snapshot.eloBefore }
          : {}),
        ...(match.eloAfter === undefined && snapshot.eloAfter !== undefined
          ? { eloAfter: snapshot.eloAfter }
          : {}),
      };
    });
  }

  async #read(): Promise<SnapshotStore> {
    try {
      const stored = await chrome.storage.local.get(SNAPSHOT_KEY);
      return parseStore(stored[SNAPSHOT_KEY]);
    } catch {
      return emptyStore();
    }
  }

  async #mutate(update: (store: SnapshotStore) => void): Promise<void> {
    const operation = this.#queue.then(async () => {
      const store = await this.#read();
      update(store);
      await chrome.storage.local.set({ [SNAPSHOT_KEY]: store });
    });
    this.#queue = operation.catch(() => undefined);
    await operation.catch(() => undefined);
  }
}
