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
- The local operational logger accepts only allowlisted structured event fields.
  It never records raw DOM or page text, input values, URLs, nicknames, match
  identifiers, tokens, cookies, Authorization values, chat messages, Steam data
  or connection strings.
- The operational log is capped at 2,000 events, 1 MiB and 7 days; it is never
  uploaded automatically and can only be copied, saved or cleared by an explicit
  local user action.
- Native diagnostic export remains a separate, explicit and redacted operation;
  it does not silently bundle the operational log.
- Extension permissions remain exactly `storage`, `clipboardWrite`, and the two
  FACEIT HTTPS host patterns checked by `scripts/verify-release.mjs`.
- `steam://connect` is rejected by default and is only handed to Windows after a
  trusted visible action or explicit opt-in.
- FACEIT Anti-Cheat can be launched only from the main FACEIT WebView, only for
  the exact payload-free `faceitac://launch` URI, and only after a native user
  confirmation. The original page-supplied URI is never forwarded to Windows.
- Auto actions are disabled by default and fail closed when DOM contracts drift.
- Update packages require a valid Tauri updater signature. This is separate from
  Windows Authenticode signing.

## Threat review before release

Run `pnpm check`, inspect the effective Tauri capability files, review generated
MV3 permissions, test selector drift fixtures, scan a copied operational log and
an exported native diagnostic, and verify a tampered updater artifact is
rejected. Stable releases additionally require Windows code signing and a
retained copy of written FACEIT permission.

## Reporting

Do not publish session data or an exploitable proof in a public issue. Include the
EloScope version, Windows version, route class and redacted reproduction steps.
Review a copied operational log before attaching it and clear it after sharing if
you do not want to retain the local history.
