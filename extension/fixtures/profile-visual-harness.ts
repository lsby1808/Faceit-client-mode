import type { PlayerMatch } from "@eloscope/core";
import { createDefaultSettings } from "../src/settings";
import { EloScopeOverlay } from "../src/ui";

const settings = createDefaultSettings();
settings.showExtendedTier = true;
settings.statsWindow = 30;

const overlay = new EloScopeOverlay(settings, {
  onSettingsChange: () => undefined,
  onStatsWindow: () => undefined,
  onPositionSend: async () => "prepared",
  onHistoryDetail: async () => ({
    status: "error",
    error: { code: "fixture", message: "Fixture detail is unavailable", retryable: false },
  }),
});

const now = Date.now();
const maps = ["dust2", "anubis", "ancient", "mirage", "inferno", "nuke"];
const matches: PlayerMatch[] = Array.from({ length: 30 }, (_, index) => {
  const kills = 12 + (index * 7) % 15;
  const deaths = 10 + (index * 5) % 12;
  const roundsPlayed = 22 + index % 4;
  return {
    id: `fixture-match-${index + 1}`,
    playerId: "fixture-player",
    teamId: "fixture-team",
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: now - index * 3_600_000,
    result: index % 3 === 0 ? "loss" : "win",
    map: maps[index % maps.length],
    roundsPlayed,
    kills,
    assists: 3 + index % 6,
    deaths,
    damage: roundsPlayed * (68 + index % 35),
    headshots: Math.round(kills * .52),
    eloBefore: 2_380 + index,
    eloAfter: 2_380 + index + (index % 3 === 0 ? -25 : 25),
    teamAverageElo: 2_420 + index,
    opponentAverageElo: 2_390 + index,
  };
});

const player = { id: "fixture-player", nickname: "Horrssee", country: "UA", game: "cs2", elo: 2_407, officialLevel: 10 };
const historyMode = new URLSearchParams(location.search).get("view") === "history";
const statsMode = new URLSearchParams(location.search).get("view") === "stats";
const main = document.querySelector<HTMLElement>('[class*="styles__MainSection-sc-"]');

if (historyMode && main) {
  main.replaceChildren();
  const nativeHistory = document.createElement("section");
  nativeHistory.className = "native-history";
  nativeHistory.innerHTML = `
    <div class="native-section-title">История матчей FACEIT</div>
    <table class="styles__MatchTable-sc-cf17d301-4"><tbody>
      <tr><td>22 июля</td><td>13 : 9</td><td>Mirage</td></tr>
      <tr><td>22 июля</td><td>8 : 13</td><td>Dust 2</td></tr>
    </tbody></table>
    <button type="button">Показать больше матчей</button>`;
  main.append(nativeHistory);
  overlay.showHistory(player, matches);
} else {
  if (statsMode) {
    const nativeCard = document.querySelector<HTMLElement>('[class*="styles__CardStack-sc-"]');
    const levelIcons = Array.from({ length: 10 }, (_, index) => {
      const level = index + 1;
      return `<svg class="SkillIcon__StyledSvg-sc-fixture-${level}" viewBox="0 0 24 24"><title>Skill level ${level}</title><circle cx="12" cy="12" r="9" fill="#0b1115" stroke="currentColor"/><text x="12" y="15" text-anchor="middle" fill="currentColor" font-size="7">${level}</text></svg>`;
    }).join("");
    if (nativeCard) nativeCard.innerHTML = `
      <div class="native-copy">Прогресс уровня</div>
      <section class="styles__Container-sc-progress-fixture-1">
        <div class="styles__TopSection-sc-progress-fixture-1">
          <div class="styles__CurrentElo-sc-fixture-1"><svg class="SkillIcon__StyledSvg-sc-current-fixture-1"><title>Skill level 10</title></svg><strong>2 407</strong><span>ELO</span></div>
          <div class="styles__NextLevel-sc-fixture-1"><strong>1 143</strong><span>ELO до Challenger</span></div>
        </div>
        <div class="styles__SkillLevelsSection-sc-fixture-1">${levelIcons}<svg><title>Challenger rank</title></svg></div>
      </section>`;
  }
  overlay.showProfile(player, matches, maps.map((map, index) => ({
    map,
    matches: 80 - index * 7,
    wins: 45 - index * 4,
    kills: 1_500 - index * 95,
    assists: 420 - index * 20,
    deaths: 1_250 - index * 60,
    roundsPlayed: 1_900 - index * 100,
    damage: 155_000 - index * 7_500,
  })));
  if (statsMode) overlay.showProfileTier(player, true);
}
