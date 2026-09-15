# Beta testing and release gates

Version: 0.1.0-beta.3. Intended as an opt-in tester release, not stable production certification.

## Automated checks

`npm ci && npm run check` checks TypeScript, client contract/failure tests,
React Native component tests and emitted declarations. `npm pack` produces the
actual installable artifact; the example consumes that artifact, not linked source.

With the private backend checkout and its dependencies available, run
`npm run test:worker -- /path/to/Loopline`. This temporarily adds one uniquely
named test file to its isolated Worker/D1 suite and removes that file afterward.
It exercises both platforms, moderation visibility, idempotency, account
isolation, vote/unvote and shipped-update acknowledgement. The Workerd adapter
maps fetch's `redirect: error` to `manual` (neither follows a redirect); this
checks API semantics, not real mobile radio/TLS behavior.

After changing SDK code or packaged documentation, repack and refresh the
example's file-dependency integrity before installing from its lockfile:

```sh
npm pack
cd example
npm install --package-lock-only --ignore-scripts ../feedbackthread-react-native-0.1.0-beta.3.tgz
npm ci
npx tsc --noEmit
npx expo install --check
npx expo export --platform ios --platform android
```

Do not place real user IDs, private feedback, credentials or production exports
in fixtures or screenshots. Real API tests must use a dedicated test project or
the local FeedbackThread Worker fixture.

## Native tester checklist

Record Expo/React Native versions, iOS/Android version, device and whether using
Expo Go or a development build. Use a dedicated test project for live submission.

- Board loads; filters and detail match status; empty state is understandable.
- Vote, remove vote and rapid taps update counts without duplicates.
- Submit a feature and a bug; blank fields reject; long text and keyboard work.
- Feedback appears in My requests, initially waiting for moderation.
- Closing and reopening preserves anonymous identity. Signed-in A → B → sign-out
  never flashes or retains another user's private requests.
- A shipped update appears; opening the inbox alone does not mark it read.
  Explicit acknowledgement updates the badge.
- Simulated offline errors allow recovery without losing form input. Also test
  real airplane mode and the tester's VPN with a dedicated backend.
- Android hardware Back returns to board; during send it does not discard the
  pending idempotency key. Host modal/gesture dismissal is tested separately.
- Check dark mode, large text, VoiceOver/TalkBack and a small phone viewport.
- Restart/reinstall behavior and the lack of an offline queue are understood.

## Release gates

- All automated checks and actual packaged example bundles pass.
- Native smoke testing on iOS and Android recorded below.
- Backend contract matches the real Worker, not only mocks.
- Maintainer approves repository/package publication. Never include credentials.
- Tester validates their own Expo version and real project before promoting to
  stable. Add older Expo matrix entries only after testing those versions.
- Mark the FeedbackThread card Released only once a public package is available.

## Verification record — 2026-09-05

- Node 24.18, Expo 57.0.20, React Native 0.86.3, React 19.2.3, TypeScript 6.0.3.
- Typecheck/build passed; 16 client tests and 7 component tests passed.
- Built core passed the actual local FeedbackThread Worker/D1 contract check for
  iOS and Android: create, duplicate create, visibility after moderation, platform
  isolation, own requests, account isolation, vote/unvote, release version,
  shipped updates and acknowledgement. Backend checkout: `75d52ef`.
- The example installed from the beta tarball. Example typecheck, Expo dependency
  compatibility and production Hermes bundle exports passed for both platforms.
- Android: Pixel 9 emulator / Android 16 / Expo Go 57. Board, vote/unvote, blank
  form validation, feature submission, simulated offline/manual retry with intact
  input, own requests, explicit shipped-update acknowledgement, account isolation,
  anonymous history after sign-out and hardware Back verified interactively.
- iOS: iPhone 17 Pro simulator / iOS 26.5 / Expo Go 57.0.9. Board, status filter
  and opening the bug form verified interactively. Full text-entry/submission
  smoke test remains unverified: the available automation's text-entry operation
  unexpectedly reloads Expo Go. This is not classified as an SDK defect or pass;
  the physical tester must exercise the complete iOS form flow.
- Local tooling issues: RocketSim could not recover its Xcode 27 connection;
  XcodeBuildMCP provided working snapshots/taps. Expo's localhost listener initially
  bound only IPv6 while its manifest advertised IPv4; the README records the
  Node IPv4-first workaround. Neither establishes a production networking bug.
- `npm audit --omit=dev` found no SDK production dependency advisories. Full
  development audit reported 10 moderate findings in Expo's config/prebuild tree,
  rooted in uuid's buffer-bounds advisory (GHSA-w5hq-g745-h8pq). The SDK generates
  IDs with expo-crypto, not that uuid package. Do not apply the suggested forced
  downgrade to Expo 46; track upstream tooling patches before wider release.
- Not verified at this checkpoint: tester's Expo version, physical-device/live-project integration,
  real VPN/radio failures, full screen-reader/large-text matrix, standalone native
  builds or earlier Expo versions. Publication had not occurred at this checkpoint.

## Public beta — 2026-09-06

The maintainer approved publishing this opt-in beta on GitHub with the gaps above
explicitly documented. The [0.1.0-beta.1 prerelease](https://github.com/aivars/feedbackthread-react-native/releases/tag/0.1.0-beta.1)
contains the built `.tgz` package; it is not an npm-registry or stable release.

Next gate: the external tester completes physical-device/live-project testing,
especially iOS text entry and submission, and reports their exact Expo version.
Keep the product task In progress while this validation and the dashboard/site
documentation rollout remain outstanding. Do not equate beta availability with
production certification or mark a reporter notified merely because a release exists.

## Compatibility update — 2026-09-11

Beta.2 adds typed project conversation-policy discovery; existing screens and
identity behavior are unchanged. It does not add secure conversation sessions,
conversation/comment UI or push delivery. Full conversation UI currently ships
in the Swift SDK.

Verified for beta.2: 18 client tests, 7 component tests, TypeScript declarations,
the private local Worker contract (including settings, both platforms and the
existing feedback/voting/update loop), and the tarball consumer's TypeScript,
Expo dependency check and iOS/Android Hermes exports. Development/example Expo
was updated to 57.0.21 after its checker recommended that patch. Existing beta
native-device limitations above remain; no new native-device test is claimed.

## Conversation beta — 2026-09-15

Beta.3 adds secure sessions, reply/comment UI, foreground live updates and native
APNs/FCM adapters. Release checks: 26 client tests, 9 UI tests, typecheck, package
build, installed-example typecheck, Expo compatibility and iOS/Android Hermes
exports passed with Expo 57.0.22 and expo-crypto 57.0.3. Native conversation flows
and physical-device push delivery remain unverified; complete host integration
checks before rollout. This release remains an opt-in GitHub prerelease.
