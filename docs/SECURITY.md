# Security model

## Non-goals

EloScope is not an anti-cheat component and never hooks, injects into, monitors or
modifies CS2 or FACEIT Anti-Cheat. It does not expose a generic native command
bridge to remote content and does not provide arbitrary URL fetching.

## Required invariants

- Remote origins have no Tauri capabilities or commands.
- The page bridge accepts a closed operation enum and GET only.
- Request arguments and response shapes are validated before use.
- Session material never crosses `postMessage`, extension storage, diagnostics,
  logs or crash reports.
- Extension permissions remain exactly `storage`, `clipboardWrite`, and the two
  FACEIT HTTPS host patterns checked by `scripts/verify-release.mjs`.
- `steam://connect` is rejected by default and is only handed to Windows after a
  trusted visible action or explicit opt-in.
- Auto actions are disabled by default and fail closed when DOM contracts drift.
- Update packages require a valid Tauri updater signature. This is separate from
  Windows Authenticode signing.

## Threat review before release

Run `pnpm check`, inspect the effective Tauri capability files, review generated
MV3 permissions, test selector drift fixtures, scan an exported diagnostic, and
verify a tampered updater artifact is rejected. Stable releases additionally
require Windows code signing and a retained copy of written FACEIT permission.

## Reporting

Do not publish session data or an exploitable proof in a public issue. Include the
EloScope version, Windows version, route class and redacted reproduction steps.
