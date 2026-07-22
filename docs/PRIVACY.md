# Privacy Policy

Effective date: 22 July 2026

EloScope is an independent desktop enhancement for FACEIT. Version 1 has no
analytics, advertising telemetry or remote crash reporting.

## Data processed locally

EloScope displays FACEIT account, player and match information already available
to the signed-in user. Preferences, cached statistics, historical ELO snapshots
and quick-position deduplication keys are stored only in the local application
profile. FACEIT login cookies remain managed by the system WebView2 profile.

EloScope does not store session tokens, passwords, cookie values or Authorization
headers. It does not access FACEIT Anti-Cheat, CS2 memory, other processes, game
files, microphones or contacts.

## Network requests

The embedded page communicates with FACEIT as it normally would. The enhancer
may issue allowlisted read-only requests to FACEIT using the current session. It
does not send user data to an EloScope server. Update checks contact the GitHub
release endpoint configured in the application.

## Diagnostics

Diagnostics are exported only after an explicit local action. The export removes
cookies, authorization-like values, chat text and query strings. The user decides
whether and how to share the resulting file.

## Deletion

Uninstalling EloScope and removing its application-data folder deletes local
preferences, cache and snapshots. FACEIT account data must be managed through
FACEIT itself.

Questions and security reports should use the repository's private security
reporting channel before a public issue is opened.
