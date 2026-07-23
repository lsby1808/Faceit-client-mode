import {
  aggregatePlayerMatches,
  buildPlayerEncounters,
  calculateFormBattery,
  calculateCurrentMatchStreak,
  calculateTeamPerformanceSummary,
  calculateTeamWinChances,
  classifyPlayerRole,
  eligibleMatches,
  getEloTier,
  getEloTierPresentation,
  loadingState,
  readyState,
  type EloScopeTier,
  type FormBattery,
  type CurrentMatchStreak,
  type MatchContext,
  type MatchTeam,
  type Player,
  type PlayerEncounterKind,
  type PlayerEncounterSummary,
  type PlayerEncountersResult,
  type PlayerMapStats,
  type PlayerMatch,
  type PlayerRole,
  type PlayerRoleAnalysis,
  type StatsWindow,
  type TeamPerformanceSummary,
} from "@eloscope/core";
import { MatchMapWinRateChartRenderer } from "./map-winrate-chart";
import { buildRecentPlayerMapStats } from "./recent-map-stats";

export { INLINE_MAP_WINRATE_ATTRIBUTE } from "./map-winrate-chart";

const NAMED_ROSTER_SELECTOR = '[name="roster1"], [name="roster2"]';
const ROSTER_SELECTOR = '[class*="Roster__Group"]';
const NICKNAME_SELECTOR = '[class*="Nickname__Name"]';
const PLAYER_PROFILE_LINK_SELECTOR = 'a[href*="/players/"]';
const NICKNAME_CONTAINER_SELECTOR = '[class*="Nickname__Container"]';
const NICKNAME_SLOT_SELECTOR = '[class*="styles__NicknameContainer"]';
const PLAYER_CARD_SELECTOR = '[class*="ListContentPlayer__Background"]';
const PLAYER_HOLDER_SELECTOR = '[class*="styles__Holder"]';
const PLAYER_LEVEL_SELECTOR = '[class*="SkillIcon__StyledSvg"]';
const PLAYER_END_SLOT_SELECTOR = '[class*="styles__EndSlotContainer"]';
const AVATAR_HOLDER_SELECTOR = '[class*="Avatar__AvatarHolder"]';
const AVATAR_IMAGE_SELECTOR =
  'img[class*="Avatar__Image"][aria-label="avatar"], i[class*="Avatar__AvatarIcon"][aria-label="avatar"]';
const MATCH_HEADER_WRAPPER_SELECTOR = '[class*="styles__HeaderWrapper-sc-"]';
const MATCH_HEADER_FACTION_SELECTOR = '[class*="styles__Faction-sc-"]';
const MATCH_HEADER_FACTION_NAME_SELECTOR = '[class*="styles__StyledFactionName-sc-"]';

export const INLINE_PLAYER_ATTRIBUTE = "data-eloscope-inline-player";
export const INLINE_TEAM_ATTRIBUTE = "data-eloscope-inline-team";
export const INLINE_BATTERY_ATTRIBUTE = "data-eloscope-inline-battery";
export const INLINE_TIER_ATTRIBUTE = "data-eloscope-inline-tier";
export const INLINE_ROLE_ATTRIBUTE = "data-eloscope-inline-role";
export const INLINE_ENCOUNTER_ATTRIBUTE = "data-eloscope-inline-encounter";
export const INLINE_STREAK_ATTRIBUTE = "data-eloscope-inline-streak";
export const INLINE_TEAM_SUMMARY_ATTRIBUTE = "data-eloscope-inline-team-summary";

const WIN_RATE_WINDOW: StatsWindow = 20;

const PLAYER_STYLES = `
  :host {
    color-scheme: dark;
    display: block !important;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    flex: 0 0 100%;
    grid-column: 1 / -1;
    container-type: inline-size;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .card {
    position: relative;
    width: 100%;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, .12);
    border-top: 0;
    border-radius: 0 0 5px 5px;
    background: rgba(8, 10, 12, .97);
    color: #f4f5f6;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    outline: none;
  }
  .overall {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
    padding: 7px 8px;
    transition: opacity 140ms ease, transform 140ms ease;
  }
  .stat { min-width: 0; padding: 0 5px; text-align: center; border-left: 1px solid rgba(255, 255, 255, .1); }
  .stat:first-child { border-left: 0; }
  .stat b { display: block; overflow: hidden; color: #e8eaed; font-size: 11px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
  .stat b[data-tone="bad"] { color: #ff4655; }
  .stat b[data-tone="good"] { color: #21d07a; }
  .stat small { display: block; margin-top: 2px; color: #858b94; font-size: 9px; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; }
  .roles {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: stretch;
    padding: 4px 7px 5px;
    background: rgba(8, 10, 12, .99);
    opacity: 0;
    pointer-events: none;
    transform: translateY(4px);
    transition: opacity 140ms ease, transform 140ms ease, visibility 0s linear 140ms;
    visibility: hidden;
  }
  .role-score {
    position: relative;
    display: grid;
    min-width: 0;
    grid-template-rows: auto 1fr 3px;
    align-items: center;
    padding: 0 5px;
    border-left: 1px solid rgba(255, 255, 255, .08);
    text-align: center;
  }
  .role-score:first-child { border-left: 0; }
  .role-score small {
    overflow: hidden;
    color: #8b929c;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: .035em;
    line-height: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .role-score b {
    align-self: center;
    overflow: hidden;
    color: var(--es-role-color);
    font-size: 18px;
    font-weight: 950;
    line-height: 20px;
    text-overflow: ellipsis;
    text-shadow: 0 0 8px color-mix(in srgb, var(--es-role-color) 30%, transparent);
    white-space: nowrap;
  }
  .role-score i {
    display: block;
    width: var(--es-role-score, 0%);
    height: 3px;
    margin-inline: auto;
    border-radius: 999px;
    background: var(--es-role-color);
    box-shadow: 0 0 6px color-mix(in srgb, var(--es-role-color) 38%, transparent);
  }
  .role-score[data-available="false"] { opacity: .58; }
  .role-score[data-available="false"] i { visibility: hidden; }
  .role-score[data-primary="true"] small { color: var(--es-role-color); }
  .card[data-has-role-scores="true"]:hover .overall,
  .card[data-has-role-scores="true"]:focus-visible .overall {
    opacity: 0;
    transform: translateY(-4px);
  }
  .card[data-has-role-scores="true"]:hover .roles,
  .card[data-has-role-scores="true"]:focus-visible .roles {
    opacity: 1;
    transform: translateY(0);
    transition-delay: 0s;
    visibility: visible;
  }
  .card[data-has-role-scores="true"]:focus-visible {
    outline: 2px solid rgba(255, 255, 255, .72);
    outline-offset: -2px;
  }
  @container (max-width: 500px) {
    .stat { padding-inline: 2px; }
    .roles { padding-inline: 3px; }
    .role-score { padding-inline: 2px; }
    .role-score b { font-size: 15px; }
    .role-score small { font-size: 6px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .overall, .roles { transition: none; }
  }
`;

const BATTERY_STYLES = `
  :host {
    color-scheme: dark;
    display: inline-flex !important;
    flex: 0 0 auto;
    align-items: center;
    align-self: center;
    margin-left: 6px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .battery {
    display: inline-flex;
    align-items: flex-end;
    gap: 1px;
    width: 27px;
    height: 13px;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 2px 3px;
    outline: none;
  }
  .battery::after {
    content: "";
    align-self: center;
    width: 2px;
    height: 5px;
    margin-right: -6px;
    border-radius: 0 2px 2px 0;
    background: currentColor;
  }
  .battery i { width: 3px; height: 7px; border-radius: 1px; background: rgba(255, 255, 255, .13); }
  .battery i[data-on="true"] { background: currentColor; }
  .battery:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

const TIER_STYLES = `
  :host {
    color-scheme: dark;
    display: inline-flex !important;
    flex: 0 0 var(--es-tier-size, 30px);
    width: var(--es-tier-size, 30px);
    height: var(--es-tier-size, 30px);
    align-items: center;
    justify-content: center;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .tier {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    border: 2px solid var(--es-tier-color);
    border-radius: 50%;
    background: var(--es-tier-background);
    color: var(--es-tier-color);
    box-shadow: inset 0 0 0 2px var(--es-tier-glow), 0 0 8px var(--es-tier-glow);
    font-size: 11px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    outline: none;
  }
  .tier:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

const ROLE_STYLES = `
  :host {
    color-scheme: dark;
    position: absolute !important;
    inset: 0 !important;
    z-index: 0;
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .role {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-rows: minmax(0, 1fr) auto;
    place-items: center;
    gap: 0;
    padding: 3px 2px 2px;
    background: #080a0d;
    background: radial-gradient(circle at 50% 38%, color-mix(in srgb, currentColor 15%, #11151a), #080a0d 72%);
    color: var(--es-role-color);
  }
  svg {
    display: block;
    width: min(64%, 25px);
    height: min(64%, 25px);
    overflow: visible;
  }
  .label {
    max-width: 100%;
    overflow: hidden;
    color: var(--es-role-color);
    font-size: clamp(6px, 18%, 8px);
    font-weight: 900;
    letter-spacing: .04em;
    line-height: 1;
    text-overflow: clip;
    text-transform: uppercase;
    white-space: nowrap;
  }
`;

const ENCOUNTER_STYLES = `
  :host {
    color-scheme: dark;
    display: inline-flex !important;
    flex: 0 0 auto;
    align-items: center;
    align-self: center;
    min-width: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .encounters {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: #858a92;
    font-variant-numeric: tabular-nums;
  }
  .trigger {
    display: grid;
    min-width: 16px;
    grid-template-rows: 8px 13px;
    place-items: center;
    padding: 0 1px;
    border-radius: 3px;
    color: #858a92;
    line-height: 1;
    outline: none;
    cursor: help;
  }
  .trigger:hover,
  .trigger:focus-visible {
    background: rgba(255, 255, 255, .08);
    color: #d9dde2;
  }
  .trigger:focus-visible {
    outline: 2px solid rgba(255, 255, 255, .78);
    outline-offset: 1px;
  }
  .count {
    align-self: end;
    color: currentColor;
    font-size: 8px;
    font-weight: 800;
    line-height: 8px;
  }
  svg {
    display: block;
    width: 13px;
    height: 13px;
    overflow: visible;
  }
  .tooltip {
    position: fixed;
    inset: auto;
    z-index: 2147483000;
    display: none;
    width: min(360px, calc(100vw - 16px));
    margin: 0;
    padding: 15px 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, .16);
    border-radius: 6px;
    background: #0c0e10;
    box-shadow: 0 14px 38px rgba(0, 0, 0, .58);
    color: #eef0f2;
    font-size: 12px;
    line-height: 1.35;
    pointer-events: none;
  }
  .tooltip[data-open="true"] { display: block; }
  .tooltip:popover-open { display: block; }
  .tooltip strong {
    display: block;
    font-size: 15px;
    line-height: 19px;
  }
  .scope {
    display: block;
    margin-top: 2px;
    color: #949aa3;
    font-size: 12px;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 17px;
  }
  .metric-label {
    display: block;
    color: #949aa3;
    font-size: 11px;
    white-space: nowrap;
  }
  .metric-value {
    display: block;
    margin-top: 3px;
    color: #f4f5f6;
    font-size: 15px;
    font-weight: 800;
    white-space: nowrap;
  }
  h4 {
    margin: 17px 0 7px;
    color: #eef0f2;
    font-size: 12px;
  }
  .recent {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .recent li {
    display: grid;
    grid-template-columns: minmax(74px, 1fr) minmax(54px, .8fr) auto;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }
  .recent time,
  .recent .map {
    overflow: hidden;
    color: #d9dce0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .recent .result {
    font-weight: 800;
    white-space: nowrap;
  }
  .recent .result[data-result="win"] { color: #24d17e; }
  .recent .result[data-result="loss"] { color: #ff4655; }
  @media (prefers-reduced-motion: reduce) {
    .trigger { transition: none; }
  }
`;

const STREAK_STYLES = `
  :host {
    color-scheme: dark;
    display: inline-flex !important;
    flex: 0 0 auto;
    align-items: center;
    align-self: center;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .streak {
    position: relative;
    display: inline-flex;
    width: auto;
    min-width: 22px;
    height: 20px;
    align-items: flex-end;
    gap: 2px;
    padding: 5px 1px 3px;
    border-radius: 3px;
    color: #21d07a;
    line-height: 1;
    outline: none;
  }
  .streak[data-result="loss"] { color: #ff5968; }
  .streak:focus-visible {
    background: rgba(255, 255, 255, .08);
    outline: 2px solid rgba(255, 255, 255, .78);
    outline-offset: 1px;
  }
  .bars {
    display: inline-flex;
    height: 11px;
    align-items: flex-end;
    gap: 1px;
  }
  .bar {
    display: block;
    width: 2px;
    border-radius: 1px 1px 0 0;
    background: currentColor;
  }
  .streak[data-result="win"] .bar:nth-child(1),
  .streak[data-result="loss"] .bar:nth-child(3) { height: 4px; opacity: .62; }
  .bar:nth-child(2) { height: 7px; opacity: .8; }
  .streak[data-result="win"] .bar:nth-child(3),
  .streak[data-result="loss"] .bar:nth-child(1) { height: 11px; }
  .count {
    position: relative;
    top: -5px;
    min-width: 8px;
    color: currentColor;
    font-size: 9px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    line-height: 10px;
    text-align: left;
  }
`;

const TEAM_STYLES = `
  :host {
    color-scheme: dark;
    position: absolute !important;
    bottom: 9px !important;
    z-index: 2;
    display: inline-flex !important;
    box-sizing: border-box;
    max-width: calc(50% - 24px);
    align-items: center;
    pointer-events: none !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  :host([data-eloscope-team-side="left"]) { left: 16px !important; }
  :host([data-eloscope-team-side="right"]) { right: 16px !important; }
  *, *::before, *::after { box-sizing: border-box; }
  .metric {
    display: inline-flex;
    align-items: center;
    color: #f3f4f6;
    font-size: 14px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    letter-spacing: .025em;
    line-height: 20px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, .9);
    white-space: nowrap;
  }
`;

const TEAM_SUMMARY_STYLES = `
  :host {
    color-scheme: dark;
    display: block !important;
    box-sizing: border-box;
    width: 100% !important;
    min-width: 0;
    flex: 0 0 100%;
    grid-column: 1 / -1;
    margin: 0 0 8px;
    container-type: inline-size;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .summary {
    display: grid;
    min-height: 55px;
    grid-template-columns: 43px repeat(4, minmax(0, 1fr));
    align-items: stretch;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, .13);
    border-top: 2px solid #ff6b21;
    border-radius: 6px;
    background: rgba(10, 12, 15, .98);
    color: #f2f4f7;
    font-variant-numeric: tabular-nums;
  }
  .form,
  .metric {
    position: relative;
    display: grid;
    min-width: 0;
    place-content: center;
    justify-items: center;
    padding: 6px 4px 5px;
    border-left: 1px solid rgba(255, 255, 255, .075);
    text-align: center;
  }
  .form { border-left: 0; }
  .metric {
    border: 0;
    border-left: 1px solid rgba(255, 255, 255, .075);
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .metric small {
    display: block;
    max-width: 100%;
    overflow: hidden;
    color: #858c96;
    font-size: 7px;
    font-weight: 850;
    letter-spacing: .055em;
    line-height: 10px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .metric b {
    display: block;
    max-width: 100%;
    overflow: hidden;
    margin-top: 1px;
    color: #ff8b49;
    font-size: 18px;
    font-weight: 950;
    line-height: 21px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chance {
    cursor: help;
    outline: none;
  }
  .chance:hover,
  .chance:focus-visible { background: rgba(255, 255, 255, .055); }
  .chance:focus-visible {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .72);
  }
  .battery {
    display: inline-flex;
    width: 24px;
    height: 13px;
    align-items: flex-end;
    gap: 1px;
    padding: 2px 3px;
    border: 1px solid currentColor;
    border-radius: 3px;
    color: var(--es-form-color);
  }
  .battery::after {
    content: "";
    align-self: center;
    width: 2px;
    height: 5px;
    margin-right: -6px;
    border-radius: 0 2px 2px 0;
    background: currentColor;
  }
  .battery i {
    width: 3px;
    height: 7px;
    border-radius: 1px;
    background: rgba(255, 255, 255, .13);
  }
  .battery i[data-on="true"] { background: currentColor; }
  .tooltip {
    position: fixed;
    inset: auto;
    z-index: 2147483000;
    display: none;
    width: min(310px, calc(100vw - 16px));
    margin: 0;
    padding: 13px 14px;
    border: 1px solid rgba(255, 255, 255, .16);
    border-radius: 6px;
    background: #0c0e10;
    box-shadow: 0 14px 38px rgba(0, 0, 0, .58);
    color: #eef0f2;
    font-size: 11px;
    line-height: 1.4;
    pointer-events: none;
  }
  .tooltip[data-open="true"] { display: block; }
  .tooltip:popover-open { display: block; }
  .tooltip strong {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
  }
  .tooltip p { margin: 5px 0 0; }
  .coverage { color: #9ba2ab; }
  .disclaimer { color: #ff9a62; }
  @container (max-width: 330px) {
    .summary { grid-template-columns: 37px repeat(4, minmax(0, 1fr)); }
    .form, .metric { padding-inline: 2px; }
    .metric small { font-size: 7px; letter-spacing: 0; }
    .metric b { font-size: 15px; }
    .battery { transform: scale(.88); }
  }
`;

export type InlineMatchSettings = Readonly<{
  statsWindow: StatsWindow;
  mapWinRateWindow: StatsWindow;
  showExtendedTier: boolean;
  showPlayerRoles: boolean;
  showPlayerStreak: boolean;
  showTeamSummary: boolean;
  showMapWinRates: boolean;
}>;

export type InlineMatchViewerContext = Readonly<{
  id?: string;
  matches?: readonly PlayerMatch[];
  histories?: ReadonlyMap<string, readonly PlayerMatch[]>;
}>;

export type InlineMatchFailure =
  | "invalid-match-roster"
  | "roster-contract"
  | "team-roster-ambiguous"
  | "nickname-ambiguous"
  | "player-card-contract"
  | "player-holder-contract";

export type InlineMatchRenderResult =
  | Readonly<{ status: "rendered"; players: number; teams: number; updated: number }>
  | Readonly<{ status: "incompatible"; reason: InlineMatchFailure }>;

type PlayerAnchor = Readonly<{
  player: Player;
  card: HTMLElement;
  holder: HTMLElement;
  mountAfter: HTMLElement;
  nicknameContainer?: HTMLElement;
  nicknameSlot?: HTMLElement;
  endSlot?: HTMLElement;
  nativeLevel?: SVGSVGElement;
  avatarHolder?: HTMLElement;
  nativeAvatar?: HTMLElement;
}>;

type TeamAnchor = Readonly<{
  team: MatchTeam;
  roster: HTMLElement;
  players: readonly PlayerAnchor[];
  summaryAnchor?: TeamSummaryAnchor;
}>;

type TeamHeaderSide = "left" | "right";

type TeamHeaderAnchor = Readonly<{
  team: MatchTeam;
  container: HTMLElement;
  side: TeamHeaderSide;
}>;

type TeamSummaryAnchor = Readonly<{
  container: HTMLElement;
  before: HTMLElement;
}>;

type Mount = {
  host: HTMLElement;
  signature: string;
};

type TierMount = Mount & {
  nativeLevel: SVGSVGElement;
  tierSize: number;
  previousDisplay: string;
  previousDisplayPriority: string;
  previousAriaHidden: string | null;
};

type RoleMount = Mount & {
  avatarHolder: HTMLElement;
  nativeAvatar: HTMLElement;
  previousDisplay: string;
  previousDisplayPriority: string;
  previousAriaHidden: string | null;
  previousTitle: string | null;
};

function normalizedNickname(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function isRendered(element: Element): boolean {
  if (!element.isConnected) return false;
  const view = element.ownerDocument.defaultView;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if ((current instanceof HTMLElement && current.hidden) || current.getAttribute("aria-hidden") === "true") return false;
    const style = view?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
  }
  return true;
}

function isSafeAvatarOverlayHolder(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  if (!style || !style.position || style.position === "static") return false;
  const rect = element.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : Number.parseFloat(style.width);
  const height = rect.height > 0 ? rect.height : Number.parseFloat(style.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 24 || height < 24 || width > 96 || height > 96) {
    return false;
  }
  const ratio = width / height;
  return ratio >= 0.75 && ratio <= 1.25;
}

function format(value: number | undefined, digits = 1): string {
  return value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function percent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function signed(value: number | undefined, digits: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const formatted = value.toFixed(digits);
  if (Number(formatted) === 0) return (0).toFixed(digits);
  return `${value > 0 ? "+" : ""}${formatted}`;
}

function matchWord(count: number): string {
  const modulo100 = Math.abs(count) % 100;
  const modulo10 = modulo100 % 10;
  if (modulo100 >= 11 && modulo100 <= 14) return "матчей";
  if (modulo10 === 1) return "матч";
  if (modulo10 >= 2 && modulo10 <= 4) return "матча";
  return "матчей";
}

function sampleMetrics(metrics: FormBattery["recent"]): string {
  if (!metrics) return "ADR — · K/R — · K/D — · WR —";
  return [
    `ADR ${format(metrics.adr, 1)}`,
    `K/R ${format(metrics.kr, 2)}`,
    `K/D ${format(metrics.kd, 2)}`,
    `WR ${percent(metrics.winRate * 100)}`,
  ].join(" · ");
}

function nextMatchesLabel(count: number): string {
  if (count % 100 < 11 || count % 100 > 14) {
    if (count % 10 === 1) return `${count} следующий матч`;
  }
  return `${count} следующих ${matchWord(count)}`;
}

function canonicalMap(value: string | undefined): string | undefined {
  return value?.trim().replace(/^de_/iu, "").toLocaleLowerCase("en-US");
}

function nativeLevelSize(element: SVGSVGElement): number {
  const clamp = (value: number): number => Math.min(40, Math.max(24, Math.round(value)));
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return clamp(Math.min(rect.width, rect.height));

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const computedWidth = Number.parseFloat(style?.width ?? "");
  const computedHeight = Number.parseFloat(style?.height ?? "");
  if (computedWidth > 0 && computedHeight > 0) return clamp(Math.min(computedWidth, computedHeight));

  const viewBox = element.getAttribute("viewBox")?.trim().split(/[ ,]+/u).map(Number);
  if (viewBox?.length === 4 && (viewBox[2] ?? 0) > 0 && (viewBox[3] ?? 0) > 0) {
    return clamp(Math.min(viewBox[2] as number, viewBox[3] as number));
  }
  return 30;
}

function lifetimeMatchCount(rows: readonly PlayerMapStats[] | undefined): number | undefined {
  if (!rows) return undefined;
  const matchesByMap = new Map<string, number>();
  for (const row of rows) {
    const map = canonicalMap(row.map);
    if (!map || !Number.isFinite(row.matches) || row.matches < 0) continue;
    matchesByMap.set(map, Math.max(matchesByMap.get(map) ?? 0, Math.round(row.matches)));
  }
  return [...matchesByMap.values()].reduce((sum, matches) => sum + matches, 0);
}

function batteryTitle(battery: FormBattery): string {
  const recentHeading =
    `Свежие (взвешенно) — ${battery.recentCount} ${matchWord(battery.recentCount)} за 7 дней`;
  const baselineHeading = `База — ${nextMatchesLabel(battery.baselineCount)} за 90 дней`;
  if (battery.status === "unknown") {
    return [
      `Форма неизвестна · уверенность ${Math.round(battery.confidence * 100)}%`,
      recentHeading,
      baselineHeading,
      "Для расчёта нужно минимум 2 свежих матча",
    ].join("\n");
  }

  const delta = battery.delta;
  const lines = [
    `Форма ${battery.score}/100 · уверенность ${Math.round(battery.confidence * 100)}%`,
    recentHeading,
    sampleMetrics(battery.recent),
    baselineHeading,
    sampleMetrics(battery.baseline),
  ];
  if (delta) {
    lines.push(
      "Изменение (свежие − база)",
      [
        `ADR ${signed(delta.adr, 1)}`,
        `K/R ${signed(delta.kr, 2)}`,
        `K/D ${signed(delta.kd, 2)}`,
        `WR ${signed(delta.winRate * 100, 1)} п.п.`,
      ].join(" · "),
    );
  } else {
    lines.push("Изменение (свежие − база): недостаточно данных");
  }
  return lines.join("\n");
}

type MetricTone = "bad" | "good";

function thresholdTone(value: number | undefined, threshold: number): MetricTone | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value < threshold ? "bad" : "good";
}

function appendMetric(parent: ParentNode, value: string, label: string, tone?: MetricTone): HTMLElement {
  const stat = document.createElement("span");
  stat.className = "stat";
  const strong = document.createElement("b");
  strong.textContent = value;
  if (tone) strong.dataset.tone = tone;
  const small = document.createElement("small");
  small.textContent = label;
  stat.append(strong, small);
  parent.append(stat);
  return stat;
}

function renderBattery(shadow: ShadowRoot, matches: readonly PlayerMatch[]): void {
  const battery = calculateFormBattery(matches);
  const title = batteryTitle(battery);
  const style = document.createElement("style");
  style.textContent = BATTERY_STYLES;
  const node = document.createElement("span");
  node.className = "battery";
  node.dataset.esFormBattery = "";
  node.style.color = battery.color;
  node.title = title;
  node.tabIndex = 0;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", title);
  const active = battery.score === null ? 0 : Math.ceil(battery.score / 20);
  for (let index = 0; index < 5; index += 1) {
    const bar = document.createElement("i");
    bar.dataset.on = String(index < active);
    node.append(bar);
  }
  shadow.replaceChildren(style, node);
}

function renderStreak(shadow: ShadowRoot, streak: Extract<CurrentMatchStreak, { status: "known" }>): void {
  const ownerDocument = shadow.ownerDocument;
  const displayedCount = `${streak.count}${streak.isLowerBound ? "+" : ""}`;
  const streakSize = streak.isLowerBound
    ? `не менее ${streak.count} матчей`
    : `${streak.count} ${matchWord(streak.count)}`;
  const title = streak.result === "win"
    ? `Текущая серия побед: ${streakSize}`
    : `Текущая серия поражений: ${streakSize}`;
  const style = ownerDocument.createElement("style");
  style.textContent = STREAK_STYLES;
  const node = ownerDocument.createElement("span");
  node.className = "streak";
  node.dataset.esMatchStreak = streak.result;
  node.dataset.result = streak.result;
  node.title = title;
  node.tabIndex = 0;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", title);
  const bars = ownerDocument.createElement("span");
  bars.className = "bars";
  bars.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) {
    const bar = ownerDocument.createElement("i");
    bar.className = "bar";
    bars.append(bar);
  }
  const count = ownerDocument.createElement("span");
  count.className = "count";
  count.textContent = displayedCount;
  node.append(bars, count);
  shadow.replaceChildren(style, node);
}

function renderTier(shadow: ShadowRoot, player: Player, level: EloScopeTier): void {
  const presentation = getEloTierPresentation(level);
  const style = document.createElement("style");
  style.textContent = TIER_STYLES;
  const tier = document.createElement("span");
  tier.className = "tier";
  tier.dataset.esTier = String(level);
  tier.style.setProperty("--es-tier-color", presentation.foreground);
  tier.style.setProperty("--es-tier-background", presentation.background);
  tier.style.setProperty("--es-tier-glow", presentation.glow);
  tier.textContent = String(level);
  tier.title = `Шкала EloScope 1–20 · официальный FACEIT level ${player.officialLevel ?? "—"}`;
  tier.tabIndex = 0;
  tier.setAttribute("role", "img");
  tier.setAttribute(
    "aria-label",
    `EloScope level ${level}, официальный FACEIT level ${player.officialLevel ?? "неизвестен"}`,
  );
  shadow.replaceChildren(style, tier);
}

const ROLE_PRESENTATION: Record<PlayerRole, Readonly<{ label: string; color: string }>> = {
  sniper: { label: "SNIPER", color: "#d84cff" },
  entry: { label: "ENTRY", color: "#ff7a1a" },
  support: { label: "SUPPORT", color: "#24c9f4" },
  anchor: { label: "ANCHOR", color: "#21db79" },
  rifler: { label: "RIFLER", color: "#3d9cff" },
};

const ROLE_SCORE_ORDER = ["sniper", "entry", "rifler", "support", "anchor"] as const satisfies readonly PlayerRole[];
type KnownPlayerRoleAnalysis = Extract<PlayerRoleAnalysis, Readonly<{ status: "known" }>>;

function roleScorePercent(score: number | null): number | undefined {
  if (score === null || !Number.isFinite(score)) return undefined;
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

function renderRoleScores(ownerDocument: Document, analysis: KnownPlayerRoleAnalysis): HTMLElement {
  const panel = ownerDocument.createElement("div");
  panel.className = "roles";
  panel.dataset.esStat = "roles";
  panel.setAttribute(
    "aria-label",
    `Оценки ролей по последним ${analysis.sampleSize} завершённым матчам CS2 5v5`,
  );

  for (const role of ROLE_SCORE_ORDER) {
    const presentation = ROLE_PRESENTATION[role];
    const score = analysis.scores[role];
    const scorePercent = roleScorePercent(score);
    const value = scorePercent === undefined ? "—" : String(scorePercent);
    const tile = ownerDocument.createElement("span");
    tile.className = "role-score";
    tile.dataset.esRoleScore = role;
    tile.dataset.available = String(scorePercent !== undefined);
    tile.dataset.primary = String(role === analysis.role);
    tile.style.setProperty("--es-role-color", presentation.color);
    tile.style.setProperty("--es-role-score", `${scorePercent ?? 0}%`);
    tile.title = scorePercent === undefined
      ? `${presentation.label}: недостаточно подтверждённых данных`
      : `${presentation.label}: ${value}/100 · расчёт по последним ${analysis.sampleSize} матчам`;

    const label = ownerDocument.createElement("small");
    label.textContent = presentation.label;
    const number = ownerDocument.createElement("b");
    number.textContent = value;
    const bar = ownerDocument.createElement("i");
    bar.setAttribute("aria-hidden", "true");
    tile.append(label, number, bar);
    panel.append(tile);
  }
  return panel;
}

function roleTitle(role: PlayerRole, confidence: number): string {
  const percent = Math.round(confidence <= 1 ? confidence * 100 : confidence);
  return `Предполагаемая роль: ${ROLE_PRESENTATION[role].label} · последние 20 матчей · уверенность ${percent}%`;
}

function svgNode<K extends keyof SVGElementTagNameMap>(
  ownerDocument: Document,
  tag: K,
  attributes: Readonly<Record<string, string | number>>,
): SVGElementTagNameMap[K] {
  const node = ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function encounterIcon(ownerDocument: Document, kind: PlayerEncounterKind): SVGSVGElement {
  const svg = svgNode(ownerDocument, "svg", {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.65,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  });
  if (kind === "teammate") {
    svg.append(
      svgNode(ownerDocument, "path", { d: "m2.5 8 3-3 2.4 2.1 2.2-1.3a2.6 2.6 0 0 1 3.1.3L17.5 10" }),
      svgNode(ownerDocument, "path", { d: "m4 9.5 4.8 4.8a1.5 1.5 0 0 0 2.1 0l4.8-4.8" }),
      svgNode(ownerDocument, "path", { d: "m7.1 12.5 1.2-1.2m.8 3 1.2-1.2m1.1.5 1.1-1.1" }),
      svgNode(ownerDocument, "path", { d: "M2 7.2 4.6 4.6 7 7 4.4 9.6Zm16 0-2.6-2.6L13 7l2.6 2.6Z" }),
    );
  } else {
    svg.append(
      svgNode(ownerDocument, "path", { d: "m3 3 6.2 6.2M5 2.5 2.5 5l2 1.9 2.4-2.4" }),
      svgNode(ownerDocument, "path", { d: "m17 3-6.2 6.2M15 2.5 17.5 5l-2 1.9-2.4-2.4" }),
      svgNode(ownerDocument, "path", { d: "m8.1 10.3-4.8 4.8m8.6-4.8 4.8 4.8" }),
      svgNode(ownerDocument, "path", { d: "m2.7 14.5 2.8 2.8m11.8-2.8-2.8 2.8" }),
    );
  }
  return svg;
}

function encounterTitle(kind: PlayerEncounterKind): string {
  return kind === "teammate" ? "Союзник" : "Соперник";
}

function relativeEncounterDate(finishedAt: number): string {
  if (!Number.isFinite(finishedAt)) return "Дата неизвестна";
  const elapsed = Date.now() - finishedAt;
  const days = Math.max(0, Math.floor(elapsed / 86_400_000));
  if (days === 0) return "Сегодня";
  if (days === 1) return "1 день назад";
  if (days < 5) return `${days} дня назад`;
  if (days < 31) return `${days} дней назад`;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(finishedAt));
}

function encounterMapLabel(map: string | undefined): string {
  const normalized = canonicalMap(map);
  return normalized ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}` : "Карта —";
}

function positionEncounterTooltip(trigger: HTMLElement, tooltip: HTMLElement): void {
  const view = trigger.ownerDocument.defaultView;
  const viewportWidth = Math.max(320, view?.innerWidth ?? 1_280);
  const viewportHeight = Math.max(320, view?.innerHeight ?? 720);
  const width = Math.min(360, viewportWidth - 16);
  const triggerRect = trigger.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const measuredHeight = tooltipRect.height > 0 ? tooltipRect.height : 250;
  const centered = triggerRect.left + triggerRect.width / 2 - width / 2;
  const left = Math.min(viewportWidth - width - 8, Math.max(8, centered));
  const below = triggerRect.bottom + 8;
  const top = below + measuredHeight <= viewportHeight - 8
    ? below
    : Math.max(8, triggerRect.top - measuredHeight - 8);
  tooltip.style.width = `${Math.round(width)}px`;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function renderEncounterTooltip(
  ownerDocument: Document,
  target: Player,
  summary: PlayerEncounterSummary,
  window: number,
): HTMLElement {
  const tooltip = ownerDocument.createElement("section");
  tooltip.className = "tooltip";
  tooltip.dataset.esEncounterTooltip = summary.kind;
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("popover", "manual");

  const heading = ownerDocument.createElement("strong");
  heading.textContent = encounterTitle(summary.kind);
  const scope = ownerDocument.createElement("span");
  scope.className = "scope";
  scope.textContent =
    `С ${target.nickname} · Найдено в доступной истории (до ${window} матчей каждого)`;
  tooltip.append(heading, scope);

  const metrics = ownerDocument.createElement("div");
  metrics.className = "metrics";
  for (const [label, value] of [
    ["Матчи", String(summary.matches)],
    ["Победы — поражения", `${summary.wins} – ${summary.losses}`],
    ["Процент побед", `${summary.winRate.toFixed(1)}%`],
  ] as const) {
    const metric = ownerDocument.createElement("span");
    const metricLabel = ownerDocument.createElement("small");
    metricLabel.className = "metric-label";
    metricLabel.textContent = label;
    const metricValue = ownerDocument.createElement("b");
    metricValue.className = "metric-value";
    metricValue.textContent = value;
    metric.append(metricLabel, metricValue);
    metrics.append(metric);
  }
  tooltip.append(metrics);

  if (summary.recent.length) {
    const recentTitle = ownerDocument.createElement("h4");
    recentTitle.textContent = "Последние матчи";
    const recent = ownerDocument.createElement("ul");
    recent.className = "recent";
    for (const match of summary.recent) {
      const row = ownerDocument.createElement("li");
      const date = ownerDocument.createElement("time");
      date.dateTime = new Date(match.finishedAt).toISOString();
      date.textContent = relativeEncounterDate(match.finishedAt);
      const map = ownerDocument.createElement("span");
      map.className = "map";
      map.textContent = encounterMapLabel(match.map);
      const result = ownerDocument.createElement("span");
      result.className = "result";
      result.dataset.result = match.result;
      result.textContent = match.result === "win" ? "Победа" : "Поражение";
      row.append(date, map, result);
      recent.append(row);
    }
    tooltip.append(recentTitle, recent);
  }
  return tooltip;
}

function renderEncounters(
  shadow: ShadowRoot,
  target: Player,
  relations: readonly PlayerEncounterSummary[],
  window: number,
): void {
  const ownerDocument = shadow.ownerDocument;
  const style = ownerDocument.createElement("style");
  style.textContent = ENCOUNTER_STYLES;
  const root = ownerDocument.createElement("span");
  root.className = "encounters";

  const closeTooltip = (tooltip: HTMLElement): void => {
    try {
      if (typeof tooltip.hidePopover === "function") tooltip.hidePopover();
    } catch {
      // A detached or already closed popover only needs its fallback state reset.
    }
    delete tooltip.dataset.open;
  };

  for (const summary of relations) {
    if (summary.matches <= 0) continue;
    const trigger = ownerDocument.createElement("span");
    trigger.className = "trigger";
    trigger.dataset.esEncounter = summary.kind;
    trigger.tabIndex = 0;
    trigger.setAttribute("role", "img");
    const accessibleLabel =
      `${encounterTitle(summary.kind)} ${target.nickname}: ${summary.matches} ${matchWord(summary.matches)}, `
      + `${summary.wins} побед, ${summary.losses} поражений, ${summary.winRate.toFixed(1)}% побед `
      + `найдено в доступной истории, до ${window} матчей каждого игрока`;
    trigger.setAttribute("aria-label", accessibleLabel);

    const count = ownerDocument.createElement("span");
    count.className = "count";
    count.textContent = String(summary.matches);
    trigger.append(count, encounterIcon(ownerDocument, summary.kind));

    const tooltip = renderEncounterTooltip(ownerDocument, target, summary, window);
    const tooltipId = `eloscope-encounter-${summary.kind}-${target.id.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
    tooltip.id = tooltipId;
    trigger.setAttribute("aria-describedby", tooltipId);

    let hovered = false;
    let focused = false;
    let dismissed = false;
    const syncTooltip = (): void => {
      if (dismissed || (!hovered && !focused)) {
        closeTooltip(tooltip);
        return;
      }
      root.querySelectorAll<HTMLElement>(".tooltip").forEach((candidate) => {
        if (candidate !== tooltip) closeTooltip(candidate);
      });
      tooltip.dataset.open = "true";
      try {
        if (typeof tooltip.showPopover === "function") tooltip.showPopover();
      } catch {
        // The data-open fallback remains visible when Popover API is unavailable.
      }
      positionEncounterTooltip(trigger, tooltip);
    };
    trigger.addEventListener("mouseenter", () => {
      hovered = true;
      dismissed = false;
      syncTooltip();
    });
    trigger.addEventListener("mouseleave", () => {
      hovered = false;
      if (!focused) dismissed = false;
      syncTooltip();
    });
    trigger.addEventListener("focus", () => {
      focused = true;
      dismissed = false;
      syncTooltip();
    });
    trigger.addEventListener("blur", () => {
      focused = false;
      if (!hovered) dismissed = false;
      syncTooltip();
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      dismissed = true;
      closeTooltip(tooltip);
    });
    tooltip.addEventListener("toggle", () => {
      if (!tooltip.matches(":popover-open")) delete tooltip.dataset.open;
    });

    root.append(trigger, tooltip);
  }
  shadow.replaceChildren(style, root);
}

function roleIcon(ownerDocument: Document, role: PlayerRole): SVGSVGElement {
  const svg = svgNode(ownerDocument, "svg", {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2.2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  });
  if (role === "sniper") {
    svg.append(
      svgNode(ownerDocument, "circle", { cx: 16, cy: 15, r: 7 }),
      svgNode(ownerDocument, "circle", { cx: 16, cy: 15, r: 1.6, fill: "currentColor", stroke: "none" }),
      svgNode(ownerDocument, "path", { d: "M16 3v6M16 21v7M4 15h6M22 15h6" }),
    );
  } else if (role === "entry") {
    svg.append(
      svgNode(ownerDocument, "path", { d: "M6 26 16 5l10 21M11 26l5-11 5 11" }),
      svgNode(ownerDocument, "path", { d: "M16 5v10" }),
    );
  } else if (role === "support") {
    svg.append(
      svgNode(ownerDocument, "circle", { cx: 16, cy: 15, r: 5 }),
      svgNode(ownerDocument, "circle", { cx: 7, cy: 22, r: 3 }),
      svgNode(ownerDocument, "circle", { cx: 25, cy: 22, r: 3 }),
      svgNode(ownerDocument, "path", { d: "M12 18 9 20M20 18l3 2M16 11V5M13 8h6" }),
    );
  } else if (role === "anchor") {
    svg.append(
      svgNode(ownerDocument, "path", { d: "M16 3 27 8v8c0 7-5 10-11 13C10 26 5 23 5 16V8Z" }),
      svgNode(ownerDocument, "path", { d: "M16 8v13M11 21h10" }),
    );
  } else {
    svg.append(
      svgNode(ownerDocument, "circle", { cx: 16, cy: 15, r: 6 }),
      svgNode(ownerDocument, "path", { d: "M16 3v6M16 21v7M4 15h6M22 15h6M8 7l4 4M24 7l-4 4" }),
    );
  }
  return svg;
}

function renderRole(shadow: ShadowRoot, role: PlayerRole, confidence: number): string {
  const presentation = ROLE_PRESENTATION[role];
  const title = roleTitle(role, confidence);
  const ownerDocument = shadow.ownerDocument;
  const style = ownerDocument.createElement("style");
  style.textContent = ROLE_STYLES;
  const tile = ownerDocument.createElement("span");
  tile.className = "role";
  tile.dataset.esRole = role;
  tile.style.setProperty("--es-role-color", presentation.color);
  tile.setAttribute("role", "img");
  tile.setAttribute("aria-label", title);
  const label = ownerDocument.createElement("span");
  label.className = "label";
  label.textContent = presentation.label;
  tile.append(roleIcon(ownerDocument, role), label);
  shadow.replaceChildren(style, tile);
  return title;
}

function matchRowsSignature(rows: readonly PlayerMatch[]): readonly unknown[] {
  return rows.map((row) => [
    row.id,
    row.finishedAt instanceof Date ? row.finishedAt.toISOString() : row.finishedAt,
    row.result,
    row.map,
    row.roundsPlayed,
    row.kills,
    row.assists,
    row.deaths,
    row.damage,
    row.headshots,
    row.fcr,
  ]);
}

function playerSignature(
  player: Player,
  rows: readonly PlayerMatch[],
  totalMatches: number | undefined,
  settings: InlineMatchSettings,
  roleAnalysis: PlayerRoleAnalysis | undefined,
): string {
  return JSON.stringify({
    id: player.id,
    nickname: player.nickname,
    statsWindow: settings.statsWindow,
    totalMatches,
    rows: matchRowsSignature(rows),
    roleAnalysis,
  });
}

function renderPlayer(
  shadow: ShadowRoot,
  player: Player,
  rows: readonly PlayerMatch[],
  totalMatches: number | undefined,
  settings: InlineMatchSettings,
  roleAnalysis: PlayerRoleAnalysis | undefined,
): void {
  const style = document.createElement("style");
  style.textContent = PLAYER_STYLES;
  const card = document.createElement("section");
  card.className = "card";
  const knownRoleAnalysis = roleAnalysis?.status === "known" ? roleAnalysis : undefined;
  card.dataset.hasRoleScores = String(knownRoleAnalysis !== undefined);
  card.setAttribute(
    "aria-label",
    knownRoleAnalysis
      ? `Расширенная статистика ${player.nickname}. Наведите указатель или установите фокус для оценок ролей`
      : `Расширенная статистика ${player.nickname}`,
  );
  if (knownRoleAnalysis) card.tabIndex = 0;

  const validRows = eligibleMatches(rows);
  const aggregate = validRows.length ? aggregatePlayerMatches(validRows, settings.statsWindow) : undefined;
  const winRateAggregate = validRows.length ? aggregatePlayerMatches(validRows, WIN_RATE_WINDOW) : undefined;

  const overall = document.createElement("div");
  overall.className = "overall";
  overall.dataset.esStat = "overall";
  appendMetric(overall, totalMatches === undefined ? "—" : String(totalMatches), "матчи");
  const wins = appendMetric(
    overall,
    winRateAggregate ? percent(winRateAggregate.winRate) : "—",
    "победы",
    thresholdTone(winRateAggregate?.winRate, 50),
  );
  wins.dataset.esMetric = "win-rate-20";
  wins.title = winRateAggregate
    ? `Процент побед за последние ${winRateAggregate.matches} завершённых матчей CS2 5v5`
    : "Нет завершённых матчей CS2 5v5";
  const averageKills = aggregate ? aggregate.kills / aggregate.matches : undefined;
  const averageKillsMetric = appendMetric(
    overall,
    format(averageKills, 1),
    "AVG KILLS",
    thresholdTone(averageKills, 15),
  );
  averageKillsMetric.dataset.esMetric = "avg-kills";
  const kdMetric = appendMetric(
    overall,
    aggregate ? format(aggregate.kd, 2) : "—",
    "K/D",
    thresholdTone(aggregate?.kd, 1),
  );
  kdMetric.dataset.esMetric = "kd";
  appendMetric(overall, aggregate ? format(aggregate.kr, 2) : "—", "K/R");
  appendMetric(overall, aggregate ? format(aggregate.adr, 0) : "—", "ADR");
  card.append(overall);
  if (knownRoleAnalysis) card.append(renderRoleScores(shadow.ownerDocument, knownRoleAnalysis));
  shadow.replaceChildren(style, card);
}

function teamHeaderMetric(
  team: MatchTeam,
  side: TeamHeaderSide,
): { average: number; known: number; text: string; signature: string } | undefined {
  const elos = team.players
    .map((player) => player.elo)
    .filter(isPositiveFiniteNumber);
  const declaredKnown = team.eloKnown;
  const known = typeof declaredKnown === "number"
    && Number.isInteger(declaredKnown)
    && declaredKnown > 0
    && declaredKnown <= team.players.length
    ? declaredKnown
    : elos.length;
  const declaredAverage = team.averageElo;
  const average = isPositiveFiniteNumber(declaredAverage)
    ? Math.round(declaredAverage)
    : elos.length
      ? Math.round(elos.reduce((sum, elo) => sum + elo, 0) / elos.length)
      : undefined;
  if (average === undefined || known === 0) return undefined;
  const text = `AVG ELO ${average}`;
  return {
    average,
    known,
    text,
    signature: JSON.stringify([team.id, average, known, side]),
  };
}

function teamForVisiblePlayers(team: MatchTeam, players: readonly Player[]): MatchTeam {
  const elos = players.map((player) => player.elo).filter(isPositiveFiniteNumber);
  return {
    id: team.id,
    ...(team.name ? { name: team.name } : {}),
    players: [...players],
    eloKnown: elos.length,
    eloTotal: players.length,
    ...(elos.length
      ? {
          averageElo: Math.round(elos.reduce((sum, elo) => sum + elo, 0) / elos.length),
          minElo: Math.min(...elos),
          maxElo: Math.max(...elos),
        }
      : {}),
  };
}

function renderTeam(
  shadow: ShadowRoot,
  team: MatchTeam,
  side: TeamHeaderSide,
  metric: NonNullable<ReturnType<typeof teamHeaderMetric>>,
): void {
  const style = document.createElement("style");
  style.textContent = TEAM_STYLES;
  const value = document.createElement("span");
  value.className = "metric";
  value.dataset.esTeamMetric = side;
  value.textContent = metric.text;
  value.setAttribute(
    "aria-label",
    `Средний ELO команды ${team.name ?? team.id}: ${metric.average}, игроков учтено ${metric.known}`,
  );
  shadow.replaceChildren(style, value);
}

function teamFormColor(score: number | undefined): string {
  if (score === undefined || !Number.isFinite(score)) return "#747b84";
  if (score < 20) return "#ff4655";
  if (score < 40) return "#ff7a00";
  if (score < 60) return "#f2c94c";
  if (score < 80) return "#21d07a";
  return "#35c9ef";
}

function teamSummaryValue(value: number | undefined, digits = 0, suffix = ""): string {
  return value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}${suffix}`;
}

function appendTeamSummaryMetric(
  ownerDocument: Document,
  parent: HTMLElement,
  label: string,
  value: string,
): HTMLElement {
  const metric = ownerDocument.createElement("span");
  metric.className = "metric";
  const caption = ownerDocument.createElement("small");
  caption.textContent = label;
  const number = ownerDocument.createElement("b");
  number.textContent = value;
  metric.append(caption, number);
  parent.append(metric);
  return metric;
}

type TeamChanceDetails = Readonly<{
  value: number;
  confidence: number;
  signals: readonly ("elo" | "history" | "form")[];
}>;

function renderTeamSummary(
  shadow: ShadowRoot,
  team: MatchTeam,
  summary: TeamPerformanceSummary,
  chance: TeamChanceDetails | undefined,
): void {
  const ownerDocument = shadow.ownerDocument;
  const style = ownerDocument.createElement("style");
  style.textContent = TEAM_SUMMARY_STYLES;
  const card = ownerDocument.createElement("section");
  card.className = "summary";
  card.dataset.esTeamSummary = team.id;
  card.setAttribute(
    "aria-label",
    [
      `Сводка команды ${team.name ?? team.id}`,
      `шанс ${teamSummaryValue(chance?.value, 0, "%")}`,
      `форма ${teamSummaryValue(summary.form)}`,
      `firepower ${teamSummaryValue(summary.firepower)}`,
      `средние убийства ${teamSummaryValue(summary.averageKills, 1)}`,
      `K/D ${teamSummaryValue(summary.kd, 2)}`,
    ].join(", "),
  );

  const form = ownerDocument.createElement("span");
  form.className = "form";
  const formLabel = summary.form === undefined
    ? `Общая форма команды неизвестна · покрытие ${summary.formPlayers}/${summary.playersTotal}`
    : `Общая форма команды ${Math.round(summary.form)}/100 · покрытие ${summary.formPlayers}/${summary.playersTotal}`;
  form.title = formLabel;
  form.setAttribute("role", "img");
  form.setAttribute("aria-label", formLabel);
  const battery = ownerDocument.createElement("span");
  battery.className = "battery";
  battery.dataset.esTeamForm = summary.form === undefined ? "unknown" : String(Math.round(summary.form));
  battery.style.setProperty("--es-form-color", teamFormColor(summary.form));
  const active = summary.form === undefined ? 0 : Math.ceil(Math.min(100, Math.max(0, summary.form)) / 20);
  for (let index = 0; index < 5; index += 1) {
    const bar = ownerDocument.createElement("i");
    bar.dataset.on = String(index < active);
    battery.append(bar);
  }
  form.append(battery);
  card.append(form);

  const chanceMetric = appendTeamSummaryMetric(
    ownerDocument,
    card,
    "ШАНСЫ",
    teamSummaryValue(chance?.value, 0, "%"),
  );
  chanceMetric.classList.add("chance");
  chanceMetric.dataset.esTeamChance = chance === undefined ? "unknown" : String(Math.round(chance.value));
  chanceMetric.tabIndex = 0;

  const tooltip = ownerDocument.createElement("section");
  tooltip.className = "tooltip";
  tooltip.id = `eloscope-team-chance-${team.id.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("popover", "manual");
  const heading = ownerDocument.createElement("strong");
  heading.textContent = "Шансы на победу";
  const explanation = ownerDocument.createElement("p");
  const signalLabels = chance?.signals.map((signal) => {
    if (signal === "elo") return "среднее ELO";
    if (signal === "history") return "последние результаты и FIREPOWER";
    return "текущую форму";
  }) ?? [];
  explanation.textContent = chance === undefined
    ? "Недостаточно достоверных данных для оценки обеих команд."
    : `Расчёт использует: ${signalLabels.join(", ")} обеих команд.`;
  const windowText = ownerDocument.createElement("p");
  windowText.textContent =
    `Статистика и FIREPOWER: до ${summary.window} последних завершённых матчей CS2 5v5 каждого игрока.`;
  const formWindow = ownerDocument.createElement("p");
  formWindow.textContent = "Форма: до 5 матчей за 7 дней относительно базы до 25 матчей за 90 дней.";
  const coverage = ownerDocument.createElement("p");
  coverage.className = "coverage";
  coverage.textContent =
    `Покрытие: статистика ${summary.statsPlayers}/${summary.playersTotal}, `
    + `форма ${summary.formPlayers}/${summary.playersTotal}, ELO ${summary.eloPlayers}/${summary.playersTotal}.`;
  const confidence = ownerDocument.createElement("p");
  confidence.className = "coverage";
  confidence.textContent = chance === undefined
    ? "Полнота оценки: недостаточно данных."
    : `Полнота оценки: ${Math.round(chance.confidence * 100)}%.`;
  const disclaimer = ownerDocument.createElement("p");
  disclaimer.className = "disclaimer";
  disclaimer.textContent = "Вероятностная оценка, а не гарантия результата.";
  tooltip.append(heading, explanation, windowText, formWindow, coverage, confidence, disclaimer);
  chanceMetric.setAttribute("aria-describedby", tooltip.id);
  chanceMetric.setAttribute(
    "aria-label",
    chance === undefined
      ? `Шанс команды ${team.name ?? team.id}: недостаточно данных`
      : `Оценка шанса команды ${team.name ?? team.id}: ${Math.round(chance.value)} процентов`,
  );

  const closeTooltip = (): void => {
    try {
      if (typeof tooltip.hidePopover === "function") tooltip.hidePopover();
    } catch {
      // Detached/already closed popovers only need their fallback state reset.
    }
    delete tooltip.dataset.open;
  };
  let hovered = false;
  let focused = false;
  const syncTooltip = (): void => {
    if (!hovered && !focused) {
      closeTooltip();
      return;
    }
    for (const host of ownerDocument.querySelectorAll<HTMLElement>(`[${INLINE_TEAM_SUMMARY_ATTRIBUTE}]`)) {
      if (host.shadowRoot === shadow) continue;
      const otherTooltip = host.shadowRoot?.querySelector<HTMLElement>(".tooltip");
      if (!otherTooltip) continue;
      try {
        if (typeof otherTooltip.hidePopover === "function") otherTooltip.hidePopover();
      } catch {
        // A detached/already closed sibling tooltip only needs fallback cleanup.
      }
      delete otherTooltip.dataset.open;
    }
    tooltip.dataset.open = "true";
    try {
      if (typeof tooltip.showPopover === "function") tooltip.showPopover();
    } catch {
      // data-open remains as the fallback when Popover API is unavailable.
    }
    positionEncounterTooltip(chanceMetric, tooltip);
  };
  chanceMetric.addEventListener("mouseenter", () => {
    hovered = true;
    syncTooltip();
  });
  chanceMetric.addEventListener("mouseleave", () => {
    hovered = false;
    syncTooltip();
  });
  chanceMetric.addEventListener("focus", () => {
    focused = true;
    syncTooltip();
  });
  chanceMetric.addEventListener("blur", () => {
    focused = false;
    syncTooltip();
  });
  chanceMetric.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    hovered = false;
    focused = false;
    closeTooltip();
  });
  tooltip.addEventListener("toggle", () => {
    if (!tooltip.matches(":popover-open")) delete tooltip.dataset.open;
  });

  appendTeamSummaryMetric(ownerDocument, card, "FIREPOWER", teamSummaryValue(summary.firepower));
  appendTeamSummaryMetric(ownerDocument, card, "AVG KILLS", teamSummaryValue(summary.averageKills, 1));
  appendTeamSummaryMetric(ownerDocument, card, "K/D", teamSummaryValue(summary.kd, 2));
  shadow.replaceChildren(style, card, tooltip);
}

function exactNicknameNodes(roster: HTMLElement, nickname: string): HTMLElement[] {
  const expected = normalizedNickname(nickname);
  const matches = new Set<HTMLElement>();
  for (const node of Array.from(roster.querySelectorAll<HTMLElement>(NICKNAME_SELECTOR)).filter(isRendered)) {
    if (normalizedNickname(node.textContent ?? "") === expected) matches.add(node);
  }
  for (const link of Array.from(roster.querySelectorAll<HTMLAnchorElement>(PLAYER_PROFILE_LINK_SELECTOR)).filter(isRendered)) {
    if (profileNickname(link) === expected) matches.add(link);
  }
  return [...matches];
}

type PlayerStructure = Readonly<{
  card: HTMLElement;
  holder: HTMLElement;
  mountAfter: HTMLElement;
}>;

function profileNickname(link: HTMLAnchorElement): string | undefined {
  const href = link.getAttribute("href");
  if (!href) return undefined;
  try {
    const url = new URL(href, link.ownerDocument.baseURI);
    const pageUrl = new URL(link.ownerDocument.baseURI);
    const isRootRelative = href.startsWith("/") && !href.startsWith("//") && url.origin === pageUrl.origin;
    const canonicalOrigin = url.origin === "https://www.faceit.com" || url.origin === "https://faceit.com";
    if (url.username || url.password || (!isRootRelative && !canonicalOrigin)) return undefined;
    const segments = url.pathname.split("/").filter(Boolean);
    const playersIndex = segments.findIndex((segment) => segment.toLocaleLowerCase("en-US") === "players");
    if (
      playersIndex < 0
      || playersIndex > 1
      || (playersIndex === 1 && !/^[a-z]{2}(?:-[a-z]{2})?$/iu.test(segments[0] ?? ""))
    ) return undefined;
    const encodedNickname = playersIndex >= 0 ? segments[playersIndex + 1] : undefined;
    if (!encodedNickname) return undefined;
    return normalizedNickname(decodeURIComponent(encodedNickname));
  } catch {
    return undefined;
  }
}

function directChildContaining(parent: HTMLElement, descendant: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = descendant;
  while (current?.parentElement && current.parentElement !== parent) current = current.parentElement;
  return current?.parentElement === parent ? current : undefined;
}

function playerStructure(roster: HTMLElement, identity: HTMLElement): PlayerStructure | undefined {
  const closestCard = identity.closest<HTMLElement>(PLAYER_CARD_SELECTOR);
  const nestedCards = closestCard
    ? []
    : Array.from(identity.querySelectorAll<HTMLElement>(PLAYER_CARD_SELECTOR)).filter(isRendered);
  let card = closestCard ?? (nestedCards.length === 1 ? nestedCards[0] : undefined);
  let holder = (card ?? identity).closest<HTMLElement>(PLAYER_HOLDER_SELECTOR);
  if (!holder && card) {
    let structuralHolder = card.parentElement;
    if (structuralHolder?.tagName === "A") structuralHolder = structuralHolder.parentElement;
    if (structuralHolder && structuralHolder !== roster && roster.contains(structuralHolder)) holder = structuralHolder;
  }
  if (!holder || holder === roster || !roster.contains(holder)) return undefined;
  if (!card) {
    const holderCards = Array.from(holder.querySelectorAll<HTMLElement>(PLAYER_CARD_SELECTOR)).filter(isRendered);
    if (holderCards.length === 1) card = holderCards[0];
  }
  if (!card) return undefined;
  const mountAfter = directChildContaining(holder, card);
  if (!mountAfter) return undefined;
  return { card, holder, mountAfter };
}

function uniquePlayerStructures(roster: HTMLElement, nickname: string): PlayerStructure[] {
  const structures: PlayerStructure[] = [];
  for (const identity of exactNicknameNodes(roster, nickname)) {
    const structure = playerStructure(roster, identity);
    if (structure && !structures.some((candidate) =>
      candidate.card === structure.card
      && candidate.holder === structure.holder
      && candidate.mountAfter === structure.mountAfter)) {
      structures.push(structure);
    }
  }
  return structures;
}

function rosterPlayerStructures(roster: HTMLElement): PlayerStructure[] {
  const identities = new Set<HTMLElement>([
    ...Array.from(roster.querySelectorAll<HTMLElement>(NICKNAME_SELECTOR)).filter(isRendered),
    ...Array.from(roster.querySelectorAll<HTMLAnchorElement>(PLAYER_PROFILE_LINK_SELECTOR)).filter(isRendered),
  ]);
  const structures: PlayerStructure[] = [];
  for (const identity of identities) {
    const structure = playerStructure(roster, identity);
    if (structure && !structures.some((candidate) =>
      candidate.card === structure.card
      && candidate.holder === structure.holder
      && candidate.mountAfter === structure.mountAfter)) {
      structures.push(structure);
    }
  }
  return structures;
}

function areIndependentPlayerHolders(holders: readonly HTMLElement[]): boolean {
  if (new Set(holders).size !== holders.length) return false;
  return holders.every((holder, index) =>
    holders.every((candidate, candidateIndex) =>
      index === candidateIndex || (!holder.contains(candidate) && !candidate.contains(holder))));
}

function discoverTeamSummaryAnchor(
  roster: HTMLElement,
  holders: readonly HTMLElement[],
): TeamSummaryAnchor | undefined {
  if (holders.length !== 5 || !areIndependentPlayerHolders(holders)) return undefined;
  let container: HTMLElement | null = holders[0]?.parentElement ?? null;
  while (container && container !== roster && !holders.every((holder) => container?.contains(holder))) {
    container = container.parentElement;
  }
  if (
    !container
    || (container !== roster && !roster.contains(container))
    || container === roster.ownerDocument.body
    || container === roster.ownerDocument.documentElement
  ) return undefined;

  const playerBranches = Array.from(container.children)
    .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
    .filter((candidate) => holders.some((holder) => candidate === holder || candidate.contains(holder)));
  if (!playerBranches.length) return undefined;
  if (holders.some((holder) =>
    playerBranches.filter((branch) => branch === holder || branch.contains(holder)).length !== 1)) {
    return undefined;
  }
  return { container, before: playerBranches[0] as HTMLElement };
}

/**
 * Mounts compact stats only after the complete live FACEIT roster contract has
 * been validated. Any ambiguity removes existing mounts instead of guessing a
 * player/card association.
 */
export class InlineMatchRenderer {
  readonly #document: Document;
  readonly #playerMounts = new Map<string, Mount>();
  readonly #teamMounts = new Map<string, Mount>();
  readonly #teamSummaryMounts = new Map<string, Mount>();
  readonly #batteryMounts = new Map<string, Mount>();
  readonly #tierMounts = new Map<string, TierMount>();
  readonly #roleMounts = new Map<string, RoleMount>();
  readonly #encounterMounts = new Map<string, Mount>();
  readonly #streakMounts = new Map<string, Mount>();
  readonly #mapWinRateChart: MatchMapWinRateChartRenderer;

  constructor(ownerDocument: Document = document) {
    this.#document = ownerDocument;
    this.#mapWinRateChart = new MatchMapWinRateChartRenderer(ownerDocument);
  }

  render(
    match: MatchContext,
    playerMatches: ReadonlyMap<string, PlayerMatch[]>,
    playerMapStats: ReadonlyMap<string, PlayerMapStats[]>,
    settings: InlineMatchSettings,
    viewerTeamId?: string,
    viewer?: InlineMatchViewerContext,
  ): InlineMatchRenderResult {
    const recentMapStats = settings.showMapWinRates
      ? buildRecentPlayerMapStats(playerMatches, settings.mapWinRateWindow)
      : undefined;
    const discovery = this.#discover(match);
    if (discovery.status === "incompatible") {
      if (recentMapStats) {
        this.#mapWinRateChart.render(
          match,
          recentMapStats,
          viewerTeamId,
          settings.mapWinRateWindow,
        );
      } else {
        this.#mapWinRateChart.cleanup();
      }
      this.#cleanupRosterEnhancements();
      return discovery;
    }
    const visibleMatch: MatchContext = {
      ...match,
      teams: discovery.teams.map(({ team }) => team),
    };
    const chartUpdated = recentMapStats
      ? this.#mapWinRateChart.render(
        visibleMatch,
        recentMapStats,
        viewerTeamId,
        settings.mapWinRateWindow,
      ).updated
      : this.#mapWinRateChart.cleanup();

    const expectedPlayerIds = new Set(discovery.teams.flatMap((team) => team.players.map(({ player }) => player.id)));
    const expectedTeamIds = new Set(discovery.teams.map(({ team }) => team.id));
    const teamSummaryEntries: Array<Readonly<{
      anchor: TeamAnchor;
      summaryAnchor: TeamSummaryAnchor;
      summary: TeamPerformanceSummary;
      chance?: TeamChanceDetails;
    }>> = [];
    if (
      settings.showTeamSummary
      && discovery.teams.length === 2
      && discovery.teams.every(({ summaryAnchor }) => summaryAnchor !== undefined)
    ) {
      const histories = new Map<string, readonly PlayerMatch[]>();
      for (const { team } of discovery.teams) {
        for (const player of team.players) {
          const rows = viewer?.histories?.get(player.id) ?? playerMatches.get(player.id);
          if (rows) histories.set(player.id, rows);
        }
      }
      const firstAnchor = discovery.teams[0] as TeamAnchor;
      const secondAnchor = discovery.teams[1] as TeamAnchor;
      const firstSummary = calculateTeamPerformanceSummary(
        firstAnchor.team,
        histories,
        settings.statsWindow,
        { currentMatchId: match.id },
      );
      const secondSummary = calculateTeamPerformanceSummary(
        secondAnchor.team,
        histories,
        settings.statsWindow,
        { currentMatchId: match.id },
      );
      const chances = calculateTeamWinChances(firstSummary, secondSummary);
      const chanceByTeam = new Map<string, TeamChanceDetails>();
      if (chances.status === "known") {
        chanceByTeam.set(chances.first.teamId, {
          value: chances.first.chance,
          confidence: chances.confidence,
          signals: chances.signals,
        });
        chanceByTeam.set(chances.second.teamId, {
          value: chances.second.chance,
          confidence: chances.confidence,
          signals: chances.signals,
        });
      }
      for (const [anchor, summary] of [
        [firstAnchor, firstSummary],
        [secondAnchor, secondSummary],
      ] as const) {
        if (!anchor.summaryAnchor) continue;
        const chance = chanceByTeam.get(anchor.team.id);
        teamSummaryEntries.push({
          anchor,
          summaryAnchor: anchor.summaryAnchor,
          summary,
          ...(chance === undefined ? {} : { chance }),
        });
      }
    }
    const headerMetrics = this.#discoverHeaderTeams(discovery.teams.map(({ team }) => team)).flatMap((anchor) => {
      const metric = teamHeaderMetric(anchor.team, anchor.side);
      return metric ? [{ anchor, metric }] : [];
    });
    const expectedHeaderTeamIds = new Set(headerMetrics.map(({ anchor }) => anchor.team.id));
    const expectedSummaryTeamIds = new Set(teamSummaryEntries.map(({ anchor }) => anchor.team.id));
    this.#removeStale(this.#playerMounts, expectedPlayerIds);
    this.#removeStale(this.#teamMounts, expectedHeaderTeamIds);
    this.#removeStale(this.#teamSummaryMounts, expectedSummaryTeamIds);
    this.#removeStale(this.#batteryMounts, expectedPlayerIds);
    this.#removeStale(this.#encounterMounts, expectedPlayerIds);
    this.#removeStale(this.#streakMounts, expectedPlayerIds);
    this.#removeStaleTiers(expectedPlayerIds);
    this.#removeStaleRoles(expectedPlayerIds);
    this.#removeOrphans(expectedPlayerIds, expectedHeaderTeamIds, expectedSummaryTeamIds);

    let updated = chartUpdated;
    for (const { anchor, summaryAnchor, summary, chance } of teamSummaryEntries) {
      const signature = JSON.stringify([anchor.team.name, summary, chance ?? null]);
      let mount = this.#teamSummaryMounts.get(anchor.team.id);
      if (
        !mount
        || !mount.host.isConnected
        || mount.host.parentElement !== summaryAnchor.container
      ) {
        mount?.host.remove();
        const host = this.#document.createElement("section");
        host.setAttribute(INLINE_TEAM_SUMMARY_ATTRIBUTE, anchor.team.id);
        const shadow = host.attachShadow({ mode: "open" });
        mount = { host, signature: "" };
        this.#teamSummaryMounts.set(anchor.team.id, mount);
        renderTeamSummary(shadow, anchor.team, summary, chance);
        mount.signature = signature;
        summaryAnchor.container.insertBefore(host, summaryAnchor.before);
        updated += 1;
      } else if (mount.signature !== signature) {
        renderTeamSummary(mount.host.shadowRoot as ShadowRoot, anchor.team, summary, chance);
        mount.signature = signature;
        updated += 1;
      }
      if (mount.host.nextElementSibling !== summaryAnchor.before) {
        summaryAnchor.container.insertBefore(mount.host, summaryAnchor.before);
      }
    }

    for (const { anchor, metric } of headerMetrics) {
      let teamMount = this.#teamMounts.get(anchor.team.id);
      const sideChanged = teamMount?.host.getAttribute("data-eloscope-team-side") !== anchor.side;
      if (!teamMount || !teamMount.host.isConnected || teamMount.host.parentElement !== anchor.container) {
        teamMount?.host.remove();
        const host = this.#document.createElement("div");
        host.setAttribute(INLINE_TEAM_ATTRIBUTE, anchor.team.id);
        host.setAttribute("data-eloscope-team-side", anchor.side);
        const shadow = host.attachShadow({ mode: "open" });
        teamMount = { host, signature: "" };
        this.#teamMounts.set(anchor.team.id, teamMount);
        renderTeam(shadow, anchor.team, anchor.side, metric);
        teamMount.signature = metric.signature;
        anchor.container.append(host);
        updated += 1;
      } else if (teamMount.signature !== metric.signature || sideChanged) {
        teamMount.host.setAttribute("data-eloscope-team-side", anchor.side);
        renderTeam(teamMount.host.shadowRoot as ShadowRoot, anchor.team, anchor.side, metric);
        teamMount.signature = metric.signature;
        updated += 1;
      }
    }

    for (const teamAnchor of discovery.teams) {
      for (const anchor of teamAnchor.players) {
        const sourceRows = playerMatches.get(anchor.player.id);
        const rows = eligibleMatches(sourceRows ?? []);
        const historyRows = viewer?.histories?.get(anchor.player.id) ?? sourceRows;
        const totalMatches = lifetimeMatchCount(playerMapStats.get(anchor.player.id));
        const roleAnalysis = settings.showPlayerRoles ? classifyPlayerRole(rows) : undefined;
        const signature = playerSignature(anchor.player, rows, totalMatches, settings, roleAnalysis);
        let mount = this.#playerMounts.get(anchor.player.id);
        if (!mount || !mount.host.isConnected || mount.host.parentElement !== anchor.holder) {
          mount?.host.remove();
          const host = this.#document.createElement("div");
          host.setAttribute(INLINE_PLAYER_ATTRIBUTE, anchor.player.id);
          const shadow = host.attachShadow({ mode: "open" });
          mount = { host, signature: "" };
          this.#playerMounts.set(anchor.player.id, mount);
          renderPlayer(shadow, anchor.player, rows, totalMatches, settings, roleAnalysis);
          mount.signature = signature;
          updated += 1;
        } else if (mount.signature !== signature) {
          renderPlayer(
            mount.host.shadowRoot as ShadowRoot,
            anchor.player,
            rows,
            totalMatches,
            settings,
            roleAnalysis,
          );
          mount.signature = signature;
          updated += 1;
        }
        if (anchor.mountAfter.nextElementSibling !== mount.host) {
          anchor.mountAfter.insertAdjacentElement("afterend", mount.host);
        }
        updated += this.#syncBattery(anchor, rows);
        updated += this.#syncTier(anchor, settings);
        updated += this.#syncRole(anchor, roleAnalysis);
        const encounters = viewer?.id
          ? buildPlayerEncounters(
            viewer.id,
            anchor.player.id,
            viewer.matches ? readyState(viewer.matches) : loadingState(),
            historyRows ? readyState(historyRows) : loadingState(),
          )
          : undefined;
        updated += this.#syncEncounters(anchor, encounters);
        const streak = settings.showPlayerStreak
          ? calculateCurrentMatchStreak(historyRows ?? [], { sampleLimit: 100 })
          : undefined;
        updated += this.#syncStreak(anchor, streak);
      }
    }

    return {
      status: "rendered",
      players: expectedPlayerIds.size,
      teams: expectedTeamIds.size,
      updated,
    };
  }

  cleanup(): void {
    this.#cleanupRosterEnhancements();
    this.#mapWinRateChart.cleanup();
  }

  #cleanupRosterEnhancements(): void {
    for (const mount of this.#playerMounts.values()) mount.host.remove();
    for (const mount of this.#teamMounts.values()) mount.host.remove();
    for (const mount of this.#teamSummaryMounts.values()) mount.host.remove();
    for (const mount of this.#batteryMounts.values()) mount.host.remove();
    for (const mount of this.#encounterMounts.values()) mount.host.remove();
    for (const mount of this.#streakMounts.values()) mount.host.remove();
    for (const mount of this.#tierMounts.values()) this.#removeTierMount(mount);
    for (const mount of this.#roleMounts.values()) this.#removeRoleMount(mount);
    this.#playerMounts.clear();
    this.#teamMounts.clear();
    this.#teamSummaryMounts.clear();
    this.#batteryMounts.clear();
    this.#encounterMounts.clear();
    this.#streakMounts.clear();
    this.#tierMounts.clear();
    this.#roleMounts.clear();
    this.#document.querySelectorAll(
      `[${INLINE_PLAYER_ATTRIBUTE}], [${INLINE_TEAM_ATTRIBUTE}], [${INLINE_TEAM_SUMMARY_ATTRIBUTE}], [${INLINE_BATTERY_ATTRIBUTE}], [${INLINE_TIER_ATTRIBUTE}], [${INLINE_ROLE_ATTRIBUTE}], [${INLINE_ENCOUNTER_ATTRIBUTE}], [${INLINE_STREAK_ATTRIBUTE}]`,
    )
      .forEach((host) => host.remove());
  }

  destroy(): void {
    this.cleanup();
  }

  #syncBattery(anchor: PlayerAnchor, rows: readonly PlayerMatch[]): number {
    const id = anchor.player.id;
    if (!anchor.nicknameContainer || !anchor.nicknameSlot) {
      const existing = this.#batteryMounts.get(id);
      if (!existing) return 0;
      existing.host.remove();
      this.#batteryMounts.delete(id);
      return 1;
    }

    const signature = JSON.stringify(matchRowsSignature(rows));
    let mount = this.#batteryMounts.get(id);
    let updated = 0;
    if (!mount || !mount.host.isConnected || mount.host.parentElement !== anchor.nicknameSlot) {
      mount?.host.remove();
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_BATTERY_ATTRIBUTE, id);
      const shadow = host.attachShadow({ mode: "open" });
      mount = { host, signature: "" };
      this.#batteryMounts.set(id, mount);
      renderBattery(shadow, rows);
      mount.signature = signature;
      updated = 1;
    } else if (mount.signature !== signature) {
      renderBattery(mount.host.shadowRoot as ShadowRoot, rows);
      mount.signature = signature;
      updated = 1;
    }
    if (anchor.nicknameContainer.nextElementSibling !== mount.host) {
      anchor.nicknameContainer.insertAdjacentElement("afterend", mount.host);
    }
    return updated;
  }

  #syncEncounters(anchor: PlayerAnchor, result: PlayerEncountersResult | undefined): number {
    const id = anchor.player.id;
    if (
      result?.status !== "ready"
      || result.relations.length === 0
      || !anchor.endSlot
    ) {
      const existing = this.#encounterMounts.get(id);
      if (!existing) return 0;
      existing.host.remove();
      this.#encounterMounts.delete(id);
      return 1;
    }

    const signature = JSON.stringify(result);
    let mount = this.#encounterMounts.get(id);
    let updated = 0;
    if (!mount || !mount.host.isConnected || mount.host.parentElement !== anchor.endSlot) {
      mount?.host.remove();
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_ENCOUNTER_ATTRIBUTE, id);
      const shadow = host.attachShadow({ mode: "open" });
      mount = { host, signature: "" };
      this.#encounterMounts.set(id, mount);
      renderEncounters(shadow, anchor.player, result.relations, result.window);
      mount.signature = signature;
      updated = 1;
    } else if (mount.signature !== signature) {
      renderEncounters(
        mount.host.shadowRoot as ShadowRoot,
        anchor.player,
        result.relations,
        result.window,
      );
      mount.signature = signature;
      updated = 1;
    }
    if (anchor.endSlot.firstElementChild !== mount.host) {
      anchor.endSlot.insertBefore(mount.host, anchor.endSlot.firstElementChild);
    }
    return updated;
  }

  #syncStreak(anchor: PlayerAnchor, result: CurrentMatchStreak | undefined): number {
    const id = anchor.player.id;
    if (result?.status !== "known" || result.count < 2 || !anchor.endSlot) {
      const existing = this.#streakMounts.get(id);
      if (!existing) return 0;
      existing.host.remove();
      this.#streakMounts.delete(id);
      return 1;
    }

    const signature = JSON.stringify(result);
    let mount = this.#streakMounts.get(id);
    let updated = 0;
    if (!mount || !mount.host.isConnected || mount.host.parentElement !== anchor.endSlot) {
      mount?.host.remove();
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_STREAK_ATTRIBUTE, id);
      const shadow = host.attachShadow({ mode: "open" });
      mount = { host, signature: "" };
      this.#streakMounts.set(id, mount);
      renderStreak(shadow, result);
      mount.signature = signature;
      updated = 1;
    } else if (mount.signature !== signature) {
      renderStreak(mount.host.shadowRoot as ShadowRoot, result);
      mount.signature = signature;
      updated = 1;
    }

    const encounterHost = this.#encounterMounts.get(id)?.host;
    const insertBefore = encounterHost?.parentElement === anchor.endSlot
      ? encounterHost.nextSibling
      : anchor.endSlot.firstChild;
    if (insertBefore !== mount.host) anchor.endSlot.insertBefore(mount.host, insertBefore);
    return updated;
  }

  #syncTier(anchor: PlayerAnchor, settings: InlineMatchSettings): number {
    const id = anchor.player.id;
    const level = settings.showExtendedTier && anchor.player.elo !== undefined
      ? getEloTier(anchor.player.elo, true)
      : undefined;
    if (level === undefined || level <= 10 || !anchor.nativeLevel || !anchor.nativeLevel.parentElement) {
      const existing = this.#tierMounts.get(id);
      if (!existing) return 0;
      this.#removeTierMount(existing);
      this.#tierMounts.delete(id);
      return 1;
    }

    const signature = JSON.stringify([level, anchor.player.officialLevel]);
    let mount = this.#tierMounts.get(id);
    let updated = 0;
    if (
      !mount
      || !mount.host.isConnected
      || mount.host.parentElement !== anchor.nativeLevel.parentElement
      || mount.nativeLevel !== anchor.nativeLevel
    ) {
      if (mount) this.#removeTierMount(mount);
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_TIER_ATTRIBUTE, id);
      const shadow = host.attachShadow({ mode: "open" });
      mount = {
        host,
        signature: "",
        nativeLevel: anchor.nativeLevel,
        tierSize: nativeLevelSize(anchor.nativeLevel),
        previousDisplay: anchor.nativeLevel.style.getPropertyValue("display"),
        previousDisplayPriority: anchor.nativeLevel.style.getPropertyPriority("display"),
        previousAriaHidden: anchor.nativeLevel.getAttribute("aria-hidden"),
      };
      this.#tierMounts.set(id, mount);
      renderTier(shadow, anchor.player, level);
      mount.signature = signature;
      updated = 1;
    } else if (mount.signature !== signature) {
      renderTier(mount.host.shadowRoot as ShadowRoot, anchor.player, level);
      mount.signature = signature;
      updated = 1;
    }
    mount.host.style.setProperty("--es-tier-size", `${mount.tierSize}px`);
    if (mount.nativeLevel.style.getPropertyValue("display") !== "none"
      || mount.nativeLevel.style.getPropertyPriority("display") !== "important") {
      mount.nativeLevel.style.setProperty("display", "none", "important");
    }
    if (mount.nativeLevel.getAttribute("aria-hidden") !== "true") {
      mount.nativeLevel.setAttribute("aria-hidden", "true");
    }
    if (mount.nativeLevel.previousElementSibling !== mount.host) {
      mount.nativeLevel.parentElement?.insertBefore(mount.host, mount.nativeLevel);
    }
    return updated;
  }

  #removeTierMount(mount: TierMount): void {
    if (mount.previousDisplay) {
      mount.nativeLevel.style.setProperty("display", mount.previousDisplay, mount.previousDisplayPriority);
    } else {
      mount.nativeLevel.style.removeProperty("display");
    }
    if (mount.previousAriaHidden === null) mount.nativeLevel.removeAttribute("aria-hidden");
    else mount.nativeLevel.setAttribute("aria-hidden", mount.previousAriaHidden);
    mount.host.remove();
  }

  #syncRole(anchor: PlayerAnchor, analysis: PlayerRoleAnalysis | undefined): number {
    const id = anchor.player.id;
    if (
      analysis?.status !== "known"
      || !anchor.avatarHolder
      || !anchor.nativeAvatar
      || anchor.nativeAvatar.parentElement !== anchor.avatarHolder
    ) {
      const existing = this.#roleMounts.get(id);
      if (!existing) return 0;
      this.#removeRoleMount(existing);
      this.#roleMounts.delete(id);
      return 1;
    }

    const signature = JSON.stringify(analysis);
    let mount = this.#roleMounts.get(id);
    let updated = 0;
    if (
      !mount
      || !mount.host.isConnected
      || mount.host.parentElement !== anchor.avatarHolder
      || mount.avatarHolder !== anchor.avatarHolder
      || mount.nativeAvatar !== anchor.nativeAvatar
    ) {
      if (mount) this.#removeRoleMount(mount);
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_ROLE_ATTRIBUTE, id);
      const shadow = host.attachShadow({ mode: "open" });
      mount = {
        host,
        signature: "",
        avatarHolder: anchor.avatarHolder,
        nativeAvatar: anchor.nativeAvatar,
        previousDisplay: anchor.nativeAvatar.style.getPropertyValue("display"),
        previousDisplayPriority: anchor.nativeAvatar.style.getPropertyPriority("display"),
        previousAriaHidden: anchor.nativeAvatar.getAttribute("aria-hidden"),
        previousTitle: anchor.avatarHolder.getAttribute("title"),
      };
      this.#roleMounts.set(id, mount);
      renderRole(shadow, analysis.role, analysis.confidence);
      mount.signature = signature;
      updated = 1;
    } else if (mount.signature !== signature) {
      renderRole(mount.host.shadowRoot as ShadowRoot, analysis.role, analysis.confidence);
      mount.signature = signature;
      updated = 1;
    }

    const title = roleTitle(analysis.role, analysis.confidence);
    if (mount.avatarHolder.getAttribute("title") !== title) mount.avatarHolder.setAttribute("title", title);
    if (
      mount.nativeAvatar.style.getPropertyValue("display") !== "none"
      || mount.nativeAvatar.style.getPropertyPriority("display") !== "important"
    ) {
      mount.nativeAvatar.style.setProperty("display", "none", "important");
    }
    if (mount.nativeAvatar.getAttribute("aria-hidden") !== "true") {
      mount.nativeAvatar.setAttribute("aria-hidden", "true");
    }
    if (mount.avatarHolder.firstElementChild !== mount.host) {
      mount.avatarHolder.insertBefore(mount.host, mount.avatarHolder.firstElementChild);
    }
    return updated;
  }

  #removeRoleMount(mount: RoleMount): void {
    if (mount.previousDisplay) {
      mount.nativeAvatar.style.setProperty("display", mount.previousDisplay, mount.previousDisplayPriority);
    } else {
      mount.nativeAvatar.style.removeProperty("display");
    }
    if (mount.previousAriaHidden === null) mount.nativeAvatar.removeAttribute("aria-hidden");
    else mount.nativeAvatar.setAttribute("aria-hidden", mount.previousAriaHidden);
    if (mount.previousTitle === null) mount.avatarHolder.removeAttribute("title");
    else mount.avatarHolder.setAttribute("title", mount.previousTitle);
    mount.host.remove();
  }

  #nativeLevelMatchesPlayer(nativeLevel: SVGSVGElement, player: Player): boolean {
    const expectedLevel = player.officialLevel
      ?? (player.elo === undefined ? undefined : getEloTier(player.elo, false));
    if (expectedLevel === undefined) return false;
    const label = [
      nativeLevel.getAttribute("aria-label"),
      nativeLevel.getAttribute("title"),
      nativeLevel.querySelector("title")?.textContent,
    ].filter((value): value is string => Boolean(value)).join(" ");
    const parsed = /skill\s*level\s*(\d{1,2})/iu.exec(label)?.[1];
    return parsed !== undefined && Number(parsed) === expectedLevel;
  }

  #discover(match: MatchContext):
    | Readonly<{ status: "ready"; teams: readonly TeamAnchor[] }>
    | Readonly<{ status: "incompatible"; reason: InlineMatchFailure }> {
    const eligibleTeams = match.teams.filter((team) => team.players.length >= 5);
    if (
      eligibleTeams.length < 2
      || new Set(match.teams.map((team) => team.id)).size !== match.teams.length
      || new Set(match.teams.flatMap((team) => team.players.map((player) => player.id))).size
        !== match.teams.reduce((sum, team) => sum + team.players.length, 0)
    ) {
      return { status: "incompatible", reason: "invalid-match-roster" };
    }

    const namedRosters = Array.from(this.#document.querySelectorAll<HTMLElement>(NAMED_ROSTER_SELECTOR)).filter(isRendered);
    const namedRosterSet = new Set(namedRosters);
    const rawRosters = [...new Set([
      ...namedRosters,
      ...Array.from(this.#document.querySelectorAll<HTMLElement>(ROSTER_SELECTOR)).filter(isRendered),
    ])];
    const rosterStructures = new Map(rawRosters.map((roster) => [roster, rosterPlayerStructures(roster)] as const));
    const rosters: HTMLElement[] = [];
    for (const candidate of rawRosters) {
      const candidateHolders = new Set((rosterStructures.get(candidate) ?? []).map(({ holder }) => holder));
      const equivalentIndex = candidateHolders.size === 5
        ? rosters.findIndex((existing) => {
            const existingHolders = new Set((rosterStructures.get(existing) ?? []).map(({ holder }) => holder));
            return existingHolders.size === candidateHolders.size
              && [...candidateHolders].every((holder) => existingHolders.has(holder));
          })
        : -1;
      if (equivalentIndex < 0) {
        rosters.push(candidate);
      } else if (namedRosterSet.has(candidate) && !namedRosterSet.has(rosters[equivalentIndex] as HTMLElement)) {
        rosters[equivalentIndex] = candidate;
      }
    }
    if (rosters.length < 2) return { status: "incompatible", reason: "roster-contract" };

    type TeamRosterCandidate = Readonly<{
      team: MatchTeam;
      roster: HTMLElement;
      players: readonly Readonly<{ player: Player; structure: PlayerStructure }>[];
    }>;
    const candidates: TeamRosterCandidate[] = [];
    for (const team of eligibleTeams) {
      for (const roster of rosters) {
        const structuresForRoster = rosterStructures.get(roster) ?? [];
        if (structuresForRoster.length !== 5) continue;
        const players: Array<Readonly<{ player: Player; structure: PlayerStructure }>> = [];
        let ambiguous = false;
        for (const player of team.players) {
          const structures = uniquePlayerStructures(roster, player.nickname);
          if (structures.length > 1) {
            ambiguous = true;
            break;
          }
          if (structures[0]) players.push({ player, structure: structures[0] });
        }
        if (ambiguous || players.length !== 5) continue;
        const holderList = players.map(({ structure }) => structure.holder);
        const holders = new Set(holderList);
        if (
          holders.size !== 5
          || structuresForRoster.some(({ holder }) => !holders.has(holder))
          || !areIndependentPlayerHolders(holderList)
        ) continue;
        candidates.push({
          team: teamForVisiblePlayers(team, players.map(({ player }) => player)),
          roster,
          players,
        });
      }
    }

    const solutions: Array<readonly [TeamRosterCandidate, TeamRosterCandidate]> = [];
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        const first = candidates[left] as TeamRosterCandidate;
        const second = candidates[right] as TeamRosterCandidate;
        if (first.team.id !== second.team.id && first.roster !== second.roster) solutions.push([first, second]);
      }
    }
    if (solutions.length !== 1) return { status: "incompatible", reason: "team-roster-ambiguous" };

    const usedRosters = new Set<HTMLElement>();
    const usedCards = new Set<HTMLElement>();
    const usedHolders = new Set<HTMLElement>();
    const teams: TeamAnchor[] = [];

    for (const assignment of solutions[0] as readonly TeamRosterCandidate[]) {
      const { team, roster } = assignment;
      if (usedRosters.has(roster)) return { status: "incompatible", reason: "team-roster-ambiguous" };
      usedRosters.add(roster);
      const players: PlayerAnchor[] = [];
      for (const { player, structure } of assignment.players) {
        const { card, holder, mountAfter } = structure;
        if (!roster.contains(card) || usedCards.has(card)) {
          return { status: "incompatible", reason: "player-card-contract" };
        }
        if (!roster.contains(holder) || usedHolders.has(holder)) {
          return { status: "incompatible", reason: "player-holder-contract" };
        }
        usedCards.add(card);
        usedHolders.add(holder);
        const nicknameNodes = exactNicknameNodes(roster, player.nickname)
          .filter((node) => playerStructure(roster, node)?.holder === holder);
        const nicknameContainers = Array.from(card.querySelectorAll<HTMLElement>(NICKNAME_CONTAINER_SELECTOR))
          .filter(isRendered);
        const matchingNicknameContainers = nicknameContainers
          .filter((container) => nicknameNodes.some((nickname) => container.contains(nickname)));
        const nicknameContainer = matchingNicknameContainers.length === 1
          ? matchingNicknameContainers[0]
          : nicknameContainers.length === 1
            ? nicknameContainers[0]
            : undefined;
        const nicknameSlot = nicknameContainer?.parentElement
          && nicknameContainer.parentElement.matches(NICKNAME_SLOT_SELECTOR)
          && card.contains(nicknameContainer.parentElement)
          ? nicknameContainer.parentElement
          : undefined;
        const endSlots = Array.from(card.querySelectorAll<HTMLElement>(PLAYER_END_SLOT_SELECTOR))
          .filter(isRendered)
          .filter((candidate) => candidate.closest(PLAYER_CARD_SELECTOR) === card);
        const endSlot = endSlots.length === 1 ? endSlots[0] : undefined;
        const mountedNativeLevel = this.#tierMounts.get(player.id)?.nativeLevel;
        const nativeLevels = Array.from(card.querySelectorAll<SVGSVGElement>(PLAYER_LEVEL_SELECTOR))
          .filter((level) => level === mountedNativeLevel || isRendered(level));
        const nativeLevel = nativeLevels.length === 1 && this.#nativeLevelMatchesPlayer(nativeLevels[0] as SVGSVGElement, player)
          ? nativeLevels[0]
          : undefined;
        const mountedNativeAvatar = this.#roleMounts.get(player.id)?.nativeAvatar;
        const avatarPairs = Array.from(card.querySelectorAll<HTMLElement>(AVATAR_HOLDER_SELECTOR))
          .filter((avatarHolder) => isRendered(avatarHolder) && isSafeAvatarOverlayHolder(avatarHolder))
          .flatMap((avatarHolder) => {
            const nativeAvatars = Array.from(avatarHolder.children)
              .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
              .filter((candidate) => candidate.matches(AVATAR_IMAGE_SELECTOR))
              .filter((candidate) => candidate === mountedNativeAvatar || isRendered(candidate));
            return nativeAvatars.length === 1
              ? [{ avatarHolder, nativeAvatar: nativeAvatars[0] as HTMLElement }]
              : [];
          });
        const avatarPair = avatarPairs.length === 1 ? avatarPairs[0] : undefined;
        players.push({
          player,
          card,
          holder,
          mountAfter,
          ...(nicknameContainer ? { nicknameContainer } : {}),
          ...(nicknameSlot ? { nicknameSlot } : {}),
          ...(endSlot ? { endSlot } : {}),
          ...(nativeLevel ? { nativeLevel } : {}),
          ...(avatarPair ? avatarPair : {}),
        });
      }
      const summaryAnchor = discoverTeamSummaryAnchor(
        roster,
        players.map(({ holder }) => holder),
      );
      teams.push({
        team,
        roster,
        players,
        ...(summaryAnchor ? { summaryAnchor } : {}),
      });
    }

    return { status: "ready", teams };
  }

  #discoverHeaderTeams(teams: readonly MatchTeam[]): readonly TeamHeaderAnchor[] {
    const namedTeams = teams.flatMap((team) => {
      const name = team.name ? normalizedNickname(team.name) : "";
      return name ? [{ team, name }] : [];
    });
    if (namedTeams.length !== 2 || new Set(namedTeams.map(({ name }) => name)).size !== 2) return [];

    const candidates: TeamHeaderAnchor[][] = [];
    for (const wrapper of Array.from(this.#document.querySelectorAll<HTMLElement>(MATCH_HEADER_WRAPPER_SELECTOR))
      .filter(isRendered)) {
      const factions = Array.from(wrapper.querySelectorAll<HTMLElement>(MATCH_HEADER_FACTION_SELECTOR))
        .filter(isRendered);
      if (factions.length !== 2 || factions[0]?.parentElement !== factions[1]?.parentElement) continue;
      const factionContainer = factions[0]?.parentElement;
      const overlayContainer = factionContainer?.parentElement;
      if (!factionContainer || !overlayContainer || !wrapper.contains(overlayContainer)) continue;
      if (!this.#isSafeHeaderOverlayContainer(overlayContainer)) continue;

      const factionNames = factions.map((faction) => {
        const nodes = Array.from(faction.querySelectorAll<HTMLElement>(MATCH_HEADER_FACTION_NAME_SELECTOR))
          .filter(isRendered);
        return nodes.length === 1 ? normalizedNickname(nodes[0]?.textContent ?? "") : "";
      });
      if (factionNames.some((name) => !name) || new Set(factionNames).size !== 2) continue;
      const byName = new Map(namedTeams.map(({ team, name }) => [name, team] as const));
      if (factionNames.some((name) => !byName.has(name))) continue;

      candidates.push(factions.map((_, index): TeamHeaderAnchor => ({
        team: byName.get(factionNames[index] as string) as MatchTeam,
        container: overlayContainer,
        side: index === 0 ? "left" : "right",
      })));
    }

    return candidates.length === 1 ? candidates[0] as readonly TeamHeaderAnchor[] : [];
  }

  #isSafeHeaderOverlayContainer(container: HTMLElement): boolean {
    if (!isRendered(container)) return false;
    const style = this.#document.defaultView?.getComputedStyle(container);
    if (!style || style.position === "static") return false;
    const rect = container.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : Number.parseFloat(style.width);
    const height = rect.height > 0 ? rect.height : Number.parseFloat(style.height);
    return Number.isFinite(width)
      && Number.isFinite(height)
      && width >= 420
      && width <= 3_000
      && height >= 96
      && height <= 480;
  }

  #removeStale(mounts: Map<string, Mount>, expectedIds: ReadonlySet<string>): void {
    for (const [id, mount] of mounts) {
      if (expectedIds.has(id)) continue;
      mount.host.remove();
      mounts.delete(id);
    }
  }

  #removeStaleTiers(expectedIds: ReadonlySet<string>): void {
    for (const [id, mount] of this.#tierMounts) {
      if (expectedIds.has(id)) continue;
      this.#removeTierMount(mount);
      this.#tierMounts.delete(id);
    }
  }

  #removeStaleRoles(expectedIds: ReadonlySet<string>): void {
    for (const [id, mount] of this.#roleMounts) {
      if (expectedIds.has(id)) continue;
      this.#removeRoleMount(mount);
      this.#roleMounts.delete(id);
    }
  }

  #removeOrphans(
    expectedPlayerIds: ReadonlySet<string>,
    expectedTeamIds: ReadonlySet<string>,
    expectedSummaryTeamIds: ReadonlySet<string>,
  ): void {
    const playerHosts = new Set(Array.from(this.#playerMounts.values(), ({ host }) => host));
    const teamHosts = new Set(Array.from(this.#teamMounts.values(), ({ host }) => host));
    const teamSummaryHosts = new Set(Array.from(this.#teamSummaryMounts.values(), ({ host }) => host));
    const batteryHosts = new Set(Array.from(this.#batteryMounts.values(), ({ host }) => host));
    const encounterHosts = new Set(Array.from(this.#encounterMounts.values(), ({ host }) => host));
    const streakHosts = new Set(Array.from(this.#streakMounts.values(), ({ host }) => host));
    const tierHosts = new Set(Array.from(this.#tierMounts.values(), ({ host }) => host));
    const roleHosts = new Set(Array.from(this.#roleMounts.values(), ({ host }) => host));
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_PLAYER_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !playerHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_TEAM_ATTRIBUTE);
      if (!id || !expectedTeamIds.has(id) || !teamHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_TEAM_SUMMARY_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_TEAM_SUMMARY_ATTRIBUTE);
      if (!id || !expectedSummaryTeamIds.has(id) || !teamSummaryHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_BATTERY_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_BATTERY_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !batteryHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_ENCOUNTER_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_ENCOUNTER_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !encounterHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_STREAK_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_STREAK_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !streakHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_TIER_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_TIER_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !tierHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_ROLE_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_ROLE_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !roleHosts.has(host)) host.remove();
    });
  }
}
