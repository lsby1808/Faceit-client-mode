# EloScope

EloScope is an independent Windows client that opens the real FACEIT website in
the system WebView2 runtime and adds opt-in, locally rendered CS2 statistics.

The project is not affiliated with, endorsed by, or sponsored by FACEIT. FACEIT
and its logos are trademarks of their respective owners. EloScope does not ship
FACEIT assets, interact with FACEIT Anti-Cheat, or read game/process memory.

Match rooms can show inline player metrics, inferred roles, form batteries,
extended Elo tiers and a compact team win-rate comparison for every map in the
current pool. Missing or restricted statistics are displayed as unavailable,
never as a fabricated zero.

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

## Releases and updates

Windows x64 releases are published at
<https://github.com/lsby1808/Faceit-client-mode/releases>. Installed release
builds check the signed Tauri updater manifest once every 24 hours and from the
manual **Check for updates** menu item.

The updater signing key, compatibility signing key and their local password
files are intentionally ignored by Git. Back them up in an access-controlled
offline location before publishing the first release. See `docs/RELEASE.md` for
the release gates and versioning checklist.
