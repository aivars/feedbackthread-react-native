# FeedbackThread for React Native and Expo

Bring feedback, feature voting and shipped updates into an iOS or Android app.
The first beta targets **Expo SDK 57 / React Native 0.86 / React 19.2**. It uses
no custom native module or config plugin; the Expo adapter uses libraries
available in Expo Go. Earlier versions permitted by peer ranges are not yet
certified. Expo web is not supported in this beta.

## Install the local beta

The package is not published to npm yet. Obtain the beta tarball from the
maintainer, then run these commands in your Expo app:

```sh
npm install ./feedbackthread-react-native-0.1.0-beta.1.tgz
npx expo install @react-native-async-storage/async-storage expo-crypto
```

Use only the **public SDK project key** from FeedbackThread. Never put a
developer/MCP token, App Store key or server secret into an app or an
`EXPO_PUBLIC_*` variable.

## Show the feedback board

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
and release gates. Attachments, screenshots, comments, push notifications,
identity merging and browser support are not included in this first beta.
