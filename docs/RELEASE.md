# Release policy

## Beta

GitHub Actions builds Windows x64 NSIS artifacts and a Tauri updater manifest.
Updater artifacts are cryptographically signed with the Tauri updater key. The
beta keeps a SemVer prerelease version but is published as GitHub's non-draft,
non-prerelease `latest` release because the static updater endpoint is
`releases/latest/download/latest.json`. Release notes must retain the SmartScreen
warning until Authenticode is configured.

The repository must remain public for anonymous updater downloads. Required
Actions secrets are `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; the committed compatibility URL/public key
are also mirrored as `ELOSCOPE_COMPAT_URL` and `ELOSCOPE_COMPAT_PUBLIC_KEY`.
`GITHUB_TOKEN` is provided automatically. The first updater-enabled installer is
a manual bootstrap install; only builds containing the production public key can
receive later OTA releases.

## Stable gate

Stable publication is blocked until all of the following are true:

- the installer and executables are Authenticode-signed using Azure Artifact
  Signing or an OV/EV code-signing certificate;
- the updater rollback and tamper tests pass;
- the independent name `EloScope` has been checked for release territories;
- written FACEIT permission covering public distribution, session reads,
  overlays and UI automation is retained outside the repository;
- Privacy Policy, disclaimer and Third-Party Notices ship with the installer.

## Key handling

Updater, compatibility-manifest and Authenticode keys are different keys. Private
keys exist only in the release secret store and an access-controlled offline
backup. A public updater key may be embedded in the app; private keys and
permission evidence may not be committed. Losing the updater private key makes
it impossible to update existing installations under the current trust root.

## Rollback

The application checks for updates at most once every 24 hours and on an explicit
manual action. It rejects malformed, unsigned and incorrectly signed packages.
Rollback is performed by publishing a higher-version signed build containing the
last known-good code; clients never accept a lower version automatically.
