# Privacy Policy

Effective date: 23 July 2026

EloScope is an independent desktop enhancement for FACEIT. Version 1 has no
analytics, advertising telemetry or remote crash reporting. Diagnostic data is
never uploaded automatically.

## Data processed locally

EloScope displays FACEIT account, player and match information already available
to the signed-in user. Preferences, cached statistics, historical ELO snapshots
and quick-position deduplication keys are stored only in the local application
profile. FACEIT login cookies remain managed by the system WebView2 profile.

EloScope does not store session tokens, passwords, cookie values or Authorization
headers. After local confirmation it can ask Windows to launch the installed
FACEIT Anti-Cheat protocol handler, but it never reads or controls that process.
It does not access CS2 memory, game files, microphones or contacts.

## Network requests

The embedded page communicates with FACEIT as it normally would. The enhancer
may issue allowlisted read-only requests to FACEIT using the current session. It
does not send user data to an EloScope server. Update checks contact the GitHub
release endpoint configured in the application.

## Local operational log

EloScope keeps an always-on, locally stored operational log so that interface
problems can be reproduced. It records redacted event names and outcomes for
clicks and EloScope actions, but never raw page DOM or text, input values, URLs,
FACEIT nicknames or match identifiers, session tokens, cookies, Authorization
values, chat messages, Steam data or connection strings.

The log is bounded to the newest 2,000 events, no more than 1 MiB and no more
than 7 days. Older entries are removed locally. Nothing is uploaded by EloScope:
the user must explicitly copy or save the redacted log from the settings window
and decide whether and how to share it. The user can also clear the log there at
any time.

## Native diagnostics

The application's native **Export redacted diagnostics** command is separate
from the operational log. It creates a small local report only after an explicit
action and does not automatically include or attach the operational log. Before
export, native diagnostics keep only a bounded in-memory sequence of native event
categories and relative timings; raw arguments and error strings are not
retained. The native report excludes URLs, page content, account identifiers,
cookies, session tokens and Authorization values. The user decides whether and
how to share the resulting file.

## Deletion

Clearing the operational log deletes its retained events. Uninstalling EloScope
and removing its application-data folder deletes local preferences, logs, cache
and snapshots. FACEIT account data must be managed through FACEIT itself.

Questions and security reports should use the repository's private security
reporting channel before a public issue is opened.
