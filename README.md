# EloScope

EloScope is an independent Windows client that opens the real FACEIT website in
the system WebView2 runtime and adds opt-in, locally rendered CS2 statistics.

The project is not affiliated with, endorsed by, or sponsored by FACEIT. FACEIT
and its logos are trademarks of their respective owners. EloScope does not ship
FACEIT assets or read game/process memory. After an explicit native confirmation,
the shell may hand Windows only FACEIT's exact `faceitac://launch` URI; it never
inspects, injects into, monitors or modifies FACEIT Anti-Cheat.

Match rooms can show inline player metrics, inferred roles, form batteries,
extended Elo tiers, current win/loss streaks of at least two matches and a
compact team win-rate comparison for every map in the current pool. Streak
indicators are independently switchable in settings; a run that fills the
entire bounded 100-match sample is labeled `100+`. Missing or restricted
statistics are displayed as unavailable, never as a fabricated zero. The
player-card win rate always uses the latest 20 completed CS2 5v5 matches; AVG
KILLS, K/D, K/R and ADR use the selected statistics window. When the signed-in
viewer and another room player have
verifiable shared match ids, compact teammate/opponent indicators summarize
the overlap found in each player's available history, capped at 100 eligible
matches per player. This bounded sample is labeled explicitly and is never
presented as lifetime history.

Player profile summaries include a native-flow banner calculated from the 20
newest unique completed CS2 5v5 matches. Its Overview, Combat, Maps and Role
views expose only fields available in the verified FACEIT response; unsupported
MVP, clutch, utility, flash and multi-kill values are not fabricated.

## Workspace

- `packages/core` — shared types, statistics, 20-match role inference, form battery, settings, and cache.
- `extension` — Manifest V3 bridge and Shadow DOM enhancements.
- `src-tauri` — Tauri 2 Windows shell and WebView2 policy.

## Local development

Prerequisites: Node.js 20+, pnpm, Rust stable, Windows 10/11, and the Evergreen
WebView2 runtime.

```powershell
pnpm install
pnpm check
pnpm dev
```

All automations are disabled by default. Run real-site automation only with a
test account and explicit permission from FACEIT.

## Local diagnostics

EloScope keeps a bounded, redacted local log of interface clicks, actions and
outcomes to help diagnose failures. It contains no raw DOM or text, input values,
URLs, nicknames, match identifiers, tokens, cookies, chat content, Steam data or
connection strings, and is never uploaded automatically. Open EloScope settings
to copy, save or clear it. The native **Export redacted diagnostics** menu command
creates a separate report and does not silently attach this operational log. See
`docs/PRIVACY.md` for retention limits and the complete data policy.

## Releases and updates

Windows x64 releases are published at
<https://github.com/lsby1808/Faceit-client-mode/releases>. Installed release
builds check the signed Tauri updater manifest once every 24 hours and from the
manual **Check for updates** menu item.

The updater signing key, compatibility signing key and their local password
files are intentionally ignored by Git. Back them up in an access-controlled
offline location before publishing the first release. See `docs/RELEASE.md` for
the release gates and versioning checklist.
