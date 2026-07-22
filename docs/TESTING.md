# Test strategy

## Automated checks

`pnpm check` performs TypeScript checks, core and DOM-contract tests, builds the
extension, audits source for accidental session/native leakage, validates MV3
permissions and size, and runs Rustfmt, strict Clippy and Rust policy tests.
Release CI runs the same gate on Windows x64 with the Evergreen WebView2 runtime
available.

## Fixture matrix

- logged out page;
- player summary and match history;
- active room before veto;
- captain/non-captain veto turn;
- server-ready room;
- finished room;
- intentionally drifted selectors and duplicate candidate actions.

Contract tests must prove that selector drift or ambiguity results in **zero
clicks**. Quick positions must send at most once per `matchId + map + message`.

## Manual beta smoke test

Use a dedicated test account and keep every automation disabled initially.
Verify login persistence, profile/history overlays, an active and finished room,
chat, veto, popup authentication, downloads, external links and `steam://` opt-in.
Then enable one automation at a time and capture no session data in recordings.

## Performance budget

- installer under 20 MiB excluding WebView2;
- extension under 300 KiB gzip;
- enhancement cache and incremental memory under 50 MiB;
- idle CPU under 1%;
- overlay visible within 1.5 seconds after its data becomes available.

CPU, memory and first-overlay timing are measured in a release build on Windows
10 and 11. A budget failure blocks beta promotion.
