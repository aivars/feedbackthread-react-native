# Contributing

This is the public development home of the FeedbackThread React Native / Expo
SDK. Focused bug fixes, tests and documentation pull requests are welcome.
The private FeedbackThread service is not required for normal SDK development.

## Local checks

Use Node 22.13+ (CI uses Node 24), then run:

```sh
npm ci
npm run check
npm pack
cd example
npm install --package-lock-only --ignore-scripts ../feedbackthread-react-native-0.1.0-beta.2.tgz
npm ci
npx tsc --noEmit
npx expo install --check
npx expo export --platform ios --platform android
npx expo start
```

The example deliberately installs the tarball, not a source alias. Refresh its
lockfile whenever packaged code or docs change so you test what users install.
Without environment configuration it uses clearly labeled in-memory sample data
and makes no API calls. Use a dedicated test project for real submissions.

The optional `npm run test:worker -- /path/to/Loopline` contract test is for
maintainers with the backend checkout. Public CI runs the self-contained client,
component and packaged-example checks without private credentials.

## Pull requests

- Branch from `main`; keep each change focused and describe the user-visible result.
- Add tests for behavioral changes and record changes under `Unreleased` in the changelog.
- Preserve raw API workflow statuses. Grouping for display must not rewrite them.
- Keep `/core` independent of React Native and Expo.
- Preserve account isolation, bounded retries and submission idempotency.
- Never commit `.env` files, tokens, real user IDs, private feedback or device logs
  containing those values. The public SDK project key is not a developer token.
- For UI changes, record iOS and Android smoke results and any untested paths.
  A passing bundle export does not replace running the native flow.

## Beta reports

Open a GitHub issue with the SDK, Expo and React Native versions; device and OS;
Expo Go versus a development build; expected/actual behavior; and minimal
reproduction steps. For networking problems, include whether Wi-Fi, cellular or
VPN was involved, the sanitized error code/status, and whether Retry helped.
Do not post credentials or private feedback. See [BETA-TESTING.md](docs/BETA-TESTING.md).

## Releases

The maintainer publishes releases. Run all checks above and the private Worker
contract test, review the package contents and secret scan, then commit and wait
for GitHub CI to pass. Tag the exact checked commit, pack it, and attach the
`.tgz` plus SHA-256 checksum to a **GitHub prerelease**. Verify an unauthenticated
download and fresh install from the documented URL. Do not replace an existing
release asset; publish a new beta version for corrections.

GitHub publication does not authorize an npm-registry publication or promotion
to stable. Physical tester validation remains a separate gate. Maintainers must
update the version in package metadata, example dependency, CI tarball path,
README, changelog and dashboard/site quickstarts together.

Contributions are licensed under [MIT](LICENSE).
