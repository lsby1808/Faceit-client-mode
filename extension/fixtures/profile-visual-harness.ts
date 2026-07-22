import { createDefaultSettings } from "../src/settings";
import { EloScopeOverlay } from "../src/ui";

const settings = createDefaultSettings();
settings.showExtendedTier = true;
settings.statsWindow = 30;

const overlay = new EloScopeOverlay(settings, {
  onSettingsChange: () => undefined,
  onStatsWindow: () => undefined,
  onPositionSend: async () => "prepared",
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
}

overlay.showProfileTier(player, statsMode);
