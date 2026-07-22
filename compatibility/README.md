# Compatibility kill switch

The production compatibility manifest is published from the repository's raw
`main` branch and signed with a dedicated Ed25519 key. The URL is direct because
the client rejects redirects. It may only disable a feature; it cannot enable a
local setting that the user disabled.

`manifest.example.json` is deliberately fail-closed for automations. Sign the
exact UTF-8 bytes with `pnpm compat:sign -- input.json output.json`; supply the
private key path through `ELOSCOPE_COMPAT_PRIVATE_KEY_FILE`. Private signing keys
and FACEIT permission evidence must never be committed.

Production uses `manifest.production.json` and publishes the signed envelope as
`manifest.signed.json`. Rotate or extend its expiry before 2027-07-22; an expired
manifest deliberately disables every mutating automation until a new valid
signature is available.

`config.json` contains only public material and is the source of truth for the
extension build and release verification. Environment variables may override it
in CI, but `verify:release` rejects a mismatch with the committed configuration.

The last valid signed manifest is retained locally until it expires, so a
temporary outage cannot silently re-enable a killed feature. Once a configured
manifest has no valid current or cached signature, overlays remain read-only and
all automations are disabled.
