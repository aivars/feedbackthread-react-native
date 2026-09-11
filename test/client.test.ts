import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackThreadClient, FeedbackThreadError, requestStage } from '../src/core/index.js';
import type { FeedbackThreadClientOptions, IdentityStorage } from '../src/core/types.js';

function storage(): IdentityStorage {
  const values = new Map<string, string>();
  return { async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); } };
}
const project = { id: 'PRJ-test', name: 'Test' };
const item = { id: 'FDBK-test01', title: 'Dark mode', description: 'At night', votes: 2, voted: false, target: 'ios', status: 'Planned', updatedAt: '2026-09-05', shippedInVersion: null };
const list = { project, platform: 'ios', requests: [item] };
const submitted = { project, feedback: { id: 'FDBK-test02', title: 'Feedback', status: 'Submitted' } };
const submission = { kind: 'Requests' as const, title: 'Feedback', text: 'Some useful detail' };
function client(overrides: Partial<FeedbackThreadClientOptions> = {}) {
  let sequence = 0;
  return new FeedbackThreadClient({ projectKey: 'test-public-key', platform: 'ios', storage: storage(), generateId: () => `random-uuid-${++sequence}`, fetch: async () => Response.json(list), maxRetries: 0, ...overrides });
}

test('configuration requires a safe origin and bounds retry settings', () => {
  for (const baseUrl of ['http://example.com', 'file:///private', 'https://user:pass@example.com', 'https://example.com/mcp', 'https://example.com/?token=bad']) {
    assert.throws(() => client({ baseUrl }), FeedbackThreadError);
  }
  assert.doesNotThrow(() => client({ baseUrl: 'http://127.0.0.1:8787', allowInsecureHttp: true }));
  assert.throws(() => client({ maxRetries: 3 }));
  assert.throws(() => client({ requestTimeoutMs: 0 }));
  assert.throws(() => client({ externalUserId: 'bad\r\nheader' }));
  assert.throws(() => client({ externalUserId: '测试' }), { code: 'configuration' });
});

test('anonymous identity survives client recreation and simultaneous reads', async () => {
  const shared = storage();
  let generated = 0;
  const options = { storage: shared, generateId: () => `identity-${++generated}` };
  const a = client(options); const b = client(options);
  assert.deepEqual(await Promise.all([a.identity(), a.identity(), b.identity()]), ['identity-1', 'identity-1', 'identity-1']);
  assert.equal(await client(options).identity(), 'identity-1');
  assert.equal(generated, 1);
  assert.equal(await client({ ...options, projectKey: 'other' }).identity(), 'identity-2');
});

test('account changes cannot mutate in-flight identity and logout restores anonymous identity', async () => {
  const a = client();
  const anonymous = await a.identity();
  const signedIn = a.forUser('account-a', 'paying');
  assert.equal(await signedIn.identity(), 'account-a');
  assert.equal(await a.identity(), anonymous);
  assert.equal(await signedIn.forUser(null).identity(), anonymous);
  assert.equal(await signedIn.forUser('account-b').identity(), 'account-b');
});

test('storage failures never silently create a new anonymous user', async () => {
  let fetched = false;
  const c = client({ storage: { async getItem() { return null; }, async setItem() { throw Error('disk full'); } }, fetch: async () => { fetched = true; return Response.json(list); } });
  await assert.rejects(c.requests(), { code: 'identity_storage' });
  assert.equal(fetched, false);
});

test('reads use the real platform and public identity header without auth credentials', async () => {
  const c = client({ platform: 'android', externalUserId: 'account-a', fetch: async (url, init) => {
    assert.equal(String(url), 'https://api.feedbackthread.com/v1/projects/test-public-key/requests?platform=android');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('X-FeedbackThread-User'), 'account-a');
    assert.equal(headers.has('Authorization'), false);
    return Response.json({ ...list, platform: 'android' });
  } });
  assert.equal((await c.requests()).requests.length, 1);
});

test('simultaneous uncancelled reads share a request but completed data is not stale-cached', async () => {
  let calls = 0;
  const c = client({ fetch: async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 5)); return Response.json(list); } });
  await Promise.all([c.requests(), c.requests()]); assert.equal(calls, 1);
  await c.requests(); assert.equal(calls, 2);
});

test('submission preserves its idempotency key and body through a transient retry', async () => {
  const attempts: RequestInit[] = [];
  const c = client({ maxRetries: 1, externalUserId: 'alice', customerTier: 'paying', fetch: async (_url, init) => {
    attempts.push(init!);
    if (attempts.length === 1) return Response.json({ error: { code: 'temporary', message: 'Try again' } }, { status: 503, headers: { 'Retry-After': '0' } });
    return Response.json(submitted, { status: 201 });
  } });
  await c.submit(submission, { idempotencyKey: 'stable-id' });
  assert.equal(attempts.length, 2);
  assert.equal(new Headers(attempts[0]!.headers).get('Idempotency-Key'), 'stable-id');
  assert.equal(new Headers(attempts[1]!.headers).get('Idempotency-Key'), 'stable-id');
  assert.equal(attempts[0]!.body, attempts[1]!.body);
  assert.deepEqual(JSON.parse(String(attempts[0]!.body)), { ...submission, source: 'ios', customerTier: 'paying', externalUserId: 'alice' });
});

test('validation failures are rejected before networking and never retried', async () => {
  let calls = 0;
  const c = client({ maxRetries: 2, fetch: async () => { calls++; return Response.json({ error: { code: 'validation_error', message: 'Invalid' } }, { status: 400 }); } });
  await assert.rejects(c.submit({ ...submission, title: '' }), { code: 'validation' });
  assert.equal(calls, 0);
  await assert.rejects(c.submit(submission), { code: 'validation_error', status: 400 });
  assert.equal(calls, 1);
});

test('long Retry-After returns control without retrying ahead of the server', async () => {
  let calls = 0;
  const c = client({ maxRetries: 2, fetch: async () => { calls++; return Response.json({ error: { code: 'rate_limited', message: 'Wait' } }, { status: 429, headers: { 'Retry-After': '60' } }); } });
  await assert.rejects(c.requests(), { status: 429, retryAfterMs: 60_000 });
  assert.equal(calls, 1);
});

test('collection limits are not retried', async () => {
  let calls = 0;
  const c = client({ maxRetries: 2, fetch: async () => { calls++; return Response.json({ error: { code: 'collection_limit_reached', message: 'Full' } }, { status: 429 }); } });
  await assert.rejects(c.submit(submission), { retryable: false });
  assert.equal(calls, 1);
});

test('timeouts and cancellation stop the underlying fetch and have distinct errors', async () => {
  const waiting: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); });
  await assert.rejects(client({ requestTimeoutMs: 5, fetch: waiting }).requests(), { code: 'timeout' });
  const controller = new AbortController();
  const result = client({ fetch: waiting }).requests({ signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(result, { code: 'cancelled' });
  const already = new AbortController(); already.abort();
  await assert.rejects(client().requests({ signal: already.signal }), { code: 'cancelled' });
});

test('aborting one request does not cancel another caller', async () => {
  const c = client(); const controller = new AbortController(); controller.abort();
  const result = c.requests();
  await assert.rejects(c.requests({ signal: controller.signal }), { code: 'cancelled' });
  assert.equal((await result).requests.length, 1);
});

test('timeouts still settle when an injected transport or JSON reader ignores abort', async () => {
  const never = new Promise<Response>(() => {});
  await assert.rejects(client({ requestTimeoutMs: 5, fetch: async () => never }).requests(), { code: 'timeout' });
  const response = Response.json(list);
  response.json = async () => new Promise(() => {});
  await assert.rejects(client({ requestTimeoutMs: 5, fetch: async () => response }).requests(), { code: 'timeout' });
});

test('unexpected response schemas fail clearly while future statuses remain visible', async () => {
  for (const payload of [{ requests: [] }, { ...list, requests: [{ ...item, votes: -1 }] }, { ...list, platform: 'android' }]) {
    await assert.rejects(client({ fetch: async () => Response.json(payload) }).requests(), { code: 'invalid_response' });
  }
  const result = await client({ fetch: async () => Response.json({ ...list, requests: [{ ...item, status: 'Exploring' }] }) }).requests();
  assert.equal(result.requests[0]!.status, 'Exploring'); assert.equal(requestStage('Exploring'), 'other');
  assert.equal(requestStage('Ready to release'), 'progress'); assert.equal(requestStage('Released'), 'completed');
});

test('vote POST always includes JSON and undo sends DELETE', async () => {
  const attempts: RequestInit[] = [];
  const c = client({ fetch: async (_url, init) => { attempts.push(init!); return Response.json({ feedbackId: item.id, votes: init?.method === 'POST' ? 3 : 2, voted: init?.method === 'POST' }); } });
  await c.setVote(item.id, true); await c.setVote(item.id, false);
  assert.equal(attempts[0]!.body, '{}'); assert.equal(new Headers(attempts[0]!.headers).get('Content-Type'), 'application/json');
  assert.equal(attempts[1]!.method, 'DELETE'); assert.equal(attempts[1]!.body, undefined);
});

test('my requests/updates preserve private statuses and ack sends only supplied IDs', async () => {
  const c = client({ fetch: async (url, init) => {
    if (String(url).endsWith('/my/requests')) return Response.json({ project, requests: [{ id: item.id, title: item.title, status: 'Submitted', createdAt: '2026-09-05', voteCount: 1, shippedInVersion: null }] });
    if (String(url).endsWith('/my/updates')) return Response.json({ project, updates: [{ id: item.id, title: item.title, shippedVersion: '1.2.3', publishedAt: '2026-09-05' }], unreadCount: 1 });
    assert.deepEqual(JSON.parse(String(init?.body)), { feedbackIds: [item.id] });
    return Response.json({ unreadCount: 0 });
  } });
  assert.equal((await c.myRequests()).requests[0]!.status, 'Submitted');
  assert.equal((await c.myUpdates()).unreadCount, 1);
  assert.equal((await c.acknowledgeUpdates([item.id, item.id])).unreadCount, 0);
  await assert.rejects(c.acknowledgeUpdates([]), { code: 'validation' });
  await assert.rejects(c.acknowledgeUpdates(['bad/id']), { code: 'validation' });
});

test('conversation policy is typed and never treats external identity as a private credential', async () => {
  const policy = { privateRepliesEnabled: true, notificationsEnabled: true, publicCommentsEnabled: false };
  const c = client({ externalUserId: 'alice', fetch: async (url, init) => {
    assert.equal(String(url), 'https://api.feedbackthread.com/v1/projects/test-public-key/chat/settings');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).has('X-FeedbackThread-Customer'), false);
    return Response.json(policy);
  } });
  assert.deepEqual(await c.conversationSettings(), policy);
});

test('malformed or missing conversation policy never silently enables features', async () => {
  for (const response of [{}, { privateRepliesEnabled: true, notificationsEnabled: true }, { privateRepliesEnabled: true, notificationsEnabled: true, publicCommentsEnabled: 'false' }]) {
    await assert.rejects(client({ fetch: async () => Response.json(response) }).conversationSettings(), { code: 'invalid_response' });
  }
  await assert.rejects(client({ fetch: async () => Response.json({ error: { code: 'not_found', message: 'Not available' } }, { status: 404 }) }).conversationSettings(), { status: 404 });
});
