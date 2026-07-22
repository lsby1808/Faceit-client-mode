export type FaceitRoute =
  | { kind: "logged-out" }
  | { kind: "matchmaking" }
  | { kind: "profile"; nickname: string }
  | { kind: "history"; nickname: string }
  | { kind: "match"; matchId: string }
  | { kind: "other" };

const LOCALE = "(?:[a-z]{2}(?:-[A-Z]{2})?/)?";
const PROFILE = new RegExp(`^/${LOCALE}players/([^/]+)(?:/cs2(?:/stats)?)?/?$`, "u");
const HISTORY = new RegExp(`^/${LOCALE}players/([^/]+)/cs2/history/?$`, "u");
const MATCH = new RegExp(
  `^/${LOCALE}(?:cs2/)?room/([a-f0-9-]{20,64})(?:/scoreboard(?:/(?:summary|utility|duels|match-insights))?)?/?$`,
  "iu"
);
const MATCHMAKING = new RegExp(`^/${LOCALE}matchmaking/?$`, "u");

export function parseFaceitRoute(pathname: string): FaceitRoute {
  if (/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(?:login|signup|register)\/?$/u.test(pathname)) {
    return { kind: "logged-out" };
  }
  if (MATCHMAKING.test(pathname)) return { kind: "matchmaking" };
  const history = HISTORY.exec(pathname);
  if (history?.[1]) return { kind: "history", nickname: decodeURIComponent(history[1]) };
  const profile = PROFILE.exec(pathname);
  if (profile?.[1]) return { kind: "profile", nickname: decodeURIComponent(profile[1]) };
  const match = MATCH.exec(pathname);
  if (match?.[1]) return { kind: "match", matchId: match[1] };
  return { kind: "other" };
}
