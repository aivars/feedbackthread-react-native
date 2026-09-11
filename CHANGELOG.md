# Changelog

## 0.1.0-beta.2 — 2026-09-11

- Add typed `conversationSettings()` discovery for project reply, notification and public-comment policy.
- Preserve existing feedback, voting, shipped updates and board UI. No runtime dependency or minimum platform changes.
- Update the development/example Expo patch to 57.0.21 so Expo compatibility checks pass.
- Compatibility update only: secure customer sessions, conversation/comment UI and native push delivery are not included. The package remains an opt-in GitHub beta.


## 0.1.0-beta.1 — 2026-09-06

- Initial React Native SDK and Expo adapter for iOS and Android.
- Feature/bug submission, public request board, voting, personal requests and shipped updates.
- Persistent anonymous identity and isolated signed-in user scopes.
- Bounded networking with timeouts, cancellation, retries and submission idempotency.
- Theme/string overrides and a credential-free Expo demo.

Public GitHub prerelease with an installable package asset. Not published to the
npm registry. This is an opt-in tester beta, not a stable release; see
[the verification record and known gaps](docs/BETA-TESTING.md).
