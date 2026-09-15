# FeedbackThread for React Native and Expo

[![SDK checks](https://github.com/aivars/feedbackthread-react-native/actions/workflows/ci.yml/badge.svg)](https://github.com/aivars/feedbackthread-react-native/actions/workflows/ci.yml)
[![GitHub beta](https://img.shields.io/badge/GitHub-0.1.0--beta.3-orange)](https://github.com/aivars/feedbackthread-react-native/releases/tag/0.1.0-beta.3)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Bring feedback, feature voting and shipped updates into an iOS or Android app.

## Features

- Drop-in board with status filters, request details, voting and bug/feature forms.
- My requests, shipped-version badges and explicit unread-update acknowledgement.
- Persistent anonymous identity or isolated signed-in user scopes.
- System light/dark themes, color overrides and customizable English strings.
- A headless TypeScript client and an Expo Go-compatible adapter.

## Requirements and beta status

The first beta targets **Expo SDK 57 / React Native 0.86 / React 19.2**. It uses
no custom native module or config plugin; the Expo adapter uses libraries
available in Expo Go. Earlier versions permitted by peer ranges are not yet
certified. Use Node 22.13+ for development. Expo web is not supported in this beta.

This is an **opt-in public beta, not a stable release**. Automated checks and
production bundles pass on both platforms. Android emulator flows have been
exercised; the complete iOS submission flow and physical-device/live-project
integration still need tester validation. See the [verification record](docs/BETA-TESTING.md).

## Installation

Install the built package from the [GitHub prerelease](https://github.com/aivars/feedbackthread-react-native/releases/tag/0.1.0-beta.3),
then let Expo choose compatible versions of the adapter's dependencies:

```sh
npm install https://github.com/aivars/feedbackthread-react-native/releases/download/0.1.0-beta.3/feedbackthread-react-native-0.1.0-beta.3.tgz
npx expo install @react-native-async-storage/async-storage expo-crypto
```

This version is distributed on GitHub, **not the npm registry**. Use the named
`.tgz` release asset, not GitHub's source-code archive or a Git dependency: those
do not include the compiled package. Commit your app's lockfile to pin the beta.

Use only the **public SDK project key** from FeedbackThread. Never put a
developer/MCP token, App Store key or server secret into an app or an
`EXPO_PUBLIC_*` variable.

## Quickstart: show the feedback board

```tsx
import { useMemo } from 'react';
import { FeedbackThreadBoard } from 'feedbackthread-react-native';
import { createExpoFeedbackThreadClient } from 'feedbackthread-react-native/expo';

export function FeedbackScreen({ userId }: { userId: string | null }) {
  const client = useMemo(() => createExpoFeedbackThreadClient({
    projectKey: 'YOUR_PUBLIC_SDK_PROJECT_KEY',
    externalUserId: userId,
    appVersion: '1.0.0',
  }), [userId]);

  return <FeedbackThreadBoard client={client} />;
}
```

Mount inside your app's safe-area and navigation container. The board fills its
parent. Pass `onClose` when presenting a modal, including the host `Modal`'s
`onRequestClose` handler on Android. The board handles its own Android Back
navigation; host route/gesture dismissal remains the host's responsibility.
Do not construct a fresh client on every render: a new client deliberately
clears the previous user's on-screen data and restarts screen loads.

## Paying-customer signal

Pass `customerTier: isPro ? 'paying' : 'free'` in the adapter options to attach
your entitlement signal to submissions and votes. It helps prioritize feedback;
it is not authentication and never gates SDK features. Omit it when unknown.
If the tier changes, include it in your `useMemo` dependencies alongside the user
ID. `appVersion` is also optional and must be supplied by your app in this SDK;
the SDK does not read it from Expo configuration automatically.

## Standalone surfaces and customization

The board includes status filters, detail, vote/unvote, feature/bug forms and
My requests. Standalone components are also exported:

```tsx
<FeedbackThreadFeedbackForm client={client} kind="Bugs" onClose={close} />
<FeedbackThreadMyRequests client={client} onUnreadCountChange={setBadge} />
```

Import those components from `feedbackthread-react-native`. All surfaces accept
`theme`, `strings`, `onClose` and optional `onError`. Theme follows system light/
dark mode by default. Override only the colors or English labels you need:

```tsx
<FeedbackThreadBoard
  client={client}
  theme={{ accent: '#075e54', accentText: '#ffffff' }}
  strings={{ board: 'Your ideas', suggest: 'Share an idea' }}
/>
```

## Identity and privacy

- Without `externalUserId`, a cryptographically random ID is persisted in
  AsyncStorage per project/backend. Reinstalling or clearing storage can lose
  access to that anonymous history. Storage failures surface an error rather
  than silently inventing a different identity.
- Signed-in apps should supply a stable, opaque user ID, **not an email address**.
  `client.forUser('opaque-id')` returns an isolated client; `client.forUser(null)`
  returns to the persisted anonymous identity. Memoize these clients too.
- Signing in does not merge the anonymous user's existing cards into the account.
- Public SDK identity is an identifier, not authentication: use unguessable IDs
  and do not submit confidential or sensitive personal information. The API's
  current public-key model is not a replacement for authenticated private storage.
- The SDK sends feedback content, platform, chosen identity, optional app version
  and customer tier to your FeedbackThread project. It collects no device ID,
  contact list, advertising ID or analytics events. A submission may appear on
  your public board after developer moderation; explain this in your app.
- iOS and Android feed/vote/submission calls use the current platform. Personal
  requests and shipped updates follow the server's user-scoped API, which is not
  a separate per-platform inbox. Acknowledgement happens only when the user
  explicitly selects “Mark updates as read.”

## Headless API and bare React Native

The `/core` entry has no React Native or Expo imports. Supply storage and a
secure UUID generator yourself outside Expo:

```ts
import { FeedbackThreadClient } from 'feedbackthread-react-native/core';

const client = new FeedbackThreadClient({
  projectKey: 'YOUR_PUBLIC_SDK_PROJECT_KEY',
  platform: 'android', // use your host platform
  storage: yourPersistentStorage,
  generateId: yourSecureRandomUUID,
});

const board = await client.requests();
await client.setVote(board.requests[0].id, true);
const submissionKey = client.createSubmissionKey();
await client.submit(
  { kind: 'Bugs', title: 'Map freezes', text: 'Steps to reproduce…' },
  { idempotencyKey: submissionKey },
);
const mine = await client.myRequests();
const updates = await client.myUpdates();
// Call only after showing the updates to the user:
await client.acknowledgeUpdates(updates.updates.map(update => update.id));
```

Skip the last call for an empty list; each acknowledgement supports at most 200
IDs. Every API method accepts an `AbortSignal` in its final options argument.

## Networking and failure behavior

There is **no startup/background polling**, offline queue or automatic
notification permission prompt. Screens load when mounted and on user refresh.
A mounted board also loads its update badge independently; a badge failure
does not hide a usable board. Equivalent simultaneous reads without caller
signals share an in-flight request.

Default per-attempt timeout is 15 seconds, with one additional attempt for
transient failures. Configure `requestTimeoutMs` and `maxRetries` (0–2).
Retries respect short `Retry-After` responses; longer backoffs are returned to
the caller. Validation/authentication and collection-limit errors are not
automatically retried. There is no internet/VPN detection heuristic: genuine
request outcomes decide what the UI shows.

The built-in form reuses the same idempotency key for automatic and manual
retries while its payload is unchanged. A headless caller must retain and reuse
its key after an ambiguous failure. Closing/remounting a form or restarting the
app loses its pending key; avoid dismissing during submission (the built-in Back
button is disabled) and do not promise exactly-once delivery across app restarts.
Host callbacks should not throw.

`FeedbackThreadError` exposes `code`, HTTP `status` and `retryAfterMs`.
Avoid logging entire client options, IDs or feedback bodies. HTTPS is required;
`allowInsecureHttp` exists solely for an explicitly chosen local test backend.

## Try the example

From this repository, with Node 22.13+:

```sh
npm ci
npm run check
npm pack
cd example
npm install --package-lock-only --ignore-scripts ../feedbackthread-react-native-0.1.0-beta.3.tgz
npm ci
npx expo start
```

Without environment configuration the example displays labeled, in-memory
sample data. Submissions and votes never leave the device; restarting resets
the sample data. It includes account switching and simulated offline controls.
Copy `.env.example` to `.env` and provide a **test project's** public key to
exercise the real API. Demo controls are not part of the exported SDK UI.

On macOS, if `expo start --localhost` listens on `::1` while its manifest points
to `127.0.0.1`, start it with
`NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --localhost`.
This fixes local simulator/Metro connectivity; it is unrelated to production
FeedbackThread API errors.

See [the beta checklist](docs/BETA-TESTING.md) for test coverage, limitations
and release gates. Attachments, screenshots, identity merging and browser support are not included.
Comments and native push adapters are available through the conversation integration below.

## How this fits your dashboard

Create a project at [FeedbackThread](https://app.feedbackthread.com/) and copy
its public key from **SDK setup**. New feedback goes to private triage first;
publishing a card makes it eligible for the moderated platform board. The SDK
does not edit workflow status or publish releases. Publishing a release in the
dashboard supplies the shipped-version badges and updates for the caller's cards.

| Dashboard status | Public board label |
| --- | --- |
| Submitted / Open | Not on the public board; visible to its submitter in My requests |
| In review | In review |
| Planned | Planned |
| In progress / Ready to release | In progress |
| Released | Completed, with the supplied shipped version |
| Rejected | Not on the public board |

Public visibility and platform targeting still apply. The SDK groups display
labels without rewriting the server's status strings.

## Contributing and reporting bugs

This public repository is the SDK's development home, not a mirror. See
[CONTRIBUTING.md](CONTRIBUTING.md) for local checks and pull requests. Report beta
issues [on GitHub](https://github.com/aivars/feedbackthread-react-native/issues)
with a minimal reproduction, platform and Expo versions, and sanitized logs.
The [tester checklist](docs/BETA-TESTING.md) covers the remaining release gates.

Native alternatives: [Swift SDK](https://github.com/aivars/feedbackthread-swift)
and [Kotlin SDK](https://github.com/aivars/feedbackthread-android).

## License

[MIT](LICENSE) © Aivars Meijers.

## Conversation service compatibility (beta.2)

Existing integrations require no changes. `await client.conversationSettings()`
returns typed project policy: `privateRepliesEnabled`, `notificationsEnabled`,
and `publicCommentsEnabled`. Replies and notifications are enabled by the service;
public comments default off and follow dashboard settings. No automatic requests
are added to existing screens. Older servers without the endpoint return a 404
`FeedbackThreadError`; missing or malformed flags produce `invalid_response`.

Project policy does not grant device notification permission. Do not use
`externalUserId` as a private conversation credential.

## Replies and public comments (beta.3)

Beta.3 adds secure conversations to React Native and Expo. These APIs require the
FeedbackThread server update released on 2026-09-15. Physical-device conversation
flows and native push delivery still require host-app verification.

```tsx
import * as SecureStore from 'expo-secure-store';
import { createExpoFeedbackThreadClient, createExpoFeedbackThreadConversations } from 'feedbackthread-react-native/expo';
import { FeedbackThreadConversationProvider, FeedbackThreadBoard } from 'feedbackthread-react-native';

// Retain once per local host account, outside render (or in your app model).
const client = createExpoFeedbackThreadClient({ projectKey: 'YOUR_PUBLIC_PROJECT_KEY' });
const conversations = createExpoFeedbackThreadConversations(client, SecureStore, 'local-account-id');

export function App() {
  return <FeedbackThreadConversationProvider conversations={conversations}>
    <FeedbackThreadBoard client={client} />
  </FeedbackThreadConversationProvider>;
}
```

Install SecureStore with `npx expo install expo-secure-store`. Private credentials
never use AsyncStorage. For bare React Native, instantiate
`FeedbackThreadConversations(client, credentialStore, accountScope)` with a
Keychain/Keystore-backed `getItem`/`setItem`/`removeItem` adapter.

The provider supplies the secure client to Board, My Requests and Feedback Form,
manages foreground connections and unread banners, and presents conversations.
Comments appear on board details when enabled; private Replies appear only on
requests owned by this secure session. Keep the provider mounted above navigation.
Existing requests remain visible without silently claiming their private threads.

For custom UI, use `getSnapshot`/`subscribe` for inbox and unread state, `history`
with `nextBefore` for pagination, `send` with a stable retry `clientId`, `markRead`,
`follow`, `remove`, and `open`. `FeedbackThreadConversationView` is also exported.
Mark messages read only after showing them. Strings and themes remain overridable.

### Notifications in native builds

The host owns permission prompts, notification channels and notification handling.
Configure APNs for iOS and FCM for Android in the project's App discussions settings.
With Expo Notifications, pass `await Notifications.getDevicePushTokenAsync()` to
`registerExpoFeedbackThreadDevice(conversations, token)`. Use native device tokens,
not an Expo push-service token. Forward notification-tap
`response.notification.request.content.data` to `conversations.handleNotification`;
also handle the initial notification response when starting from a terminated app.
Re-register when the device token changes. Bare React Native can use
`registerDevice(token, 'apns' | 'fcm')` directly.

Use a physical device and a native development/release build to verify delivery.
Expo Go is not a substitute for this release check. Notifications contain a generic
alert; private text is fetched after authorization. In-app replies still work when
notification permission is denied.

### Account switching

`accountScope` isolates local guest credentials; it does not verify your login or
merge users across devices. Await `logout()` and create a manager for the next
account. The old manager closes permanently and discards late private responses.
If remote revocation fails, retain the old manager to retry logout; do not keep
using its client. Local credentials are cleared on logout.

Public comments default off. Disabling them hides retained discussion. Private
replies remain enabled. Images, identity merging and browser support are deferred.
