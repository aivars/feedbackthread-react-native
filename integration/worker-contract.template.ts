import { env, exports } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { FeedbackThreadClient } from "__SDK_CORE_IMPORT__";

it('packaged Expo core speaks the actual Worker contract for both platforms', async () => {
  const values = new Map<string, string>();
  const makeClient = (platform: 'ios' | 'android') => new FeedbackThreadClient({
    projectKey: 'loopline_focuslock_dev_2026', // documented local migration fixture
    platform, baseUrl: 'https://loopline.test', externalUserId: `expo-contract-${platform}`,
    storage: { async getItem(key: string) { return values.get(key) ?? null; }, async setItem(key: string, value: string) { values.set(key, value); } },
    generateId: () => crypto.randomUUID(), maxRetries: 0,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      // Workerd's Request supports manual/follow, not browser redirect:error.
      // manual does not follow any redirect; the SDK will reject the 3xx status.
      return exports.default.fetch(new Request(input, { ...init, redirect: 'manual' }));
    },
  });
  for (const platform of ['ios', 'android'] as const) {
    const client = makeClient(platform);
    const key = client.createSubmissionKey();
    const payload = { kind: 'Requests' as const, title: `Expo ${platform} feature`, text: 'Local contract test only.' };
    const result = await client.submit(payload, { idempotencyKey: key });
    const duplicate = await client.submit(payload, { idempotencyKey: key });
    expect(duplicate.feedback.id).toBe(result.feedback.id);
    expect(duplicate.duplicate).toBe(true);
    const id = result.feedback.id;
    expect((await client.myRequests()).requests.some((item: { id: string }) => item.id === id)).toBe(true);
    expect((await client.forUser('different-expo-user').myRequests()).requests.some((item: { id: string }) => item.id === id)).toBe(false);
    const targets = await env.DB.prepare('SELECT target, status FROM feedback_targets WHERE feedback_id = ?').bind(id).all();
    expect(targets.results).toEqual([{ target: platform, status: 'Submitted' }]);
    expect((await client.requests()).requests.some((item: { id: string }) => item.id === id)).toBe(false);

    // Moderate only local fixture data; no developer session or production API.
    await env.DB.prepare("UPDATE feedback SET is_public = 1, status = 'Planned' WHERE id = ?").bind(id).run();
    await env.DB.prepare("UPDATE feedback_targets SET status = 'Planned' WHERE feedback_id = ?").bind(id).run();
    const publicCard = (await client.requests()).requests.find((item: { id: string }) => item.id === id);
    expect(publicCard?.target).toBe(platform);
    const voter = client.forUser(`expo-contract-voter-${platform}`);
    const voted = await voter.setVote(id, true);
    expect(voted.voted).toBe(true);
    expect((await voter.setVote(id, true)).votes).toBe(voted.votes);
    expect((await voter.setVote(id, false)).votes).toBe(voted.votes - 1);
    const otherPlatform = makeClient(platform === 'ios' ? 'android' : 'ios');
    expect((await otherPlatform.requests()).requests.some((item: { id: string }) => item.id === id)).toBe(false);

    const release = `REL-expo-contract-${platform}`;
    await env.DB.prepare("INSERT INTO releases (id, project_id, version, platforms, status, published_at) VALUES (?, 'PRJ-focuslock', ?, ?, 'published', '2026-09-05T12:00:00Z')")
      .bind(release, `expo-test-${platform}`, JSON.stringify([platform])).run();
    await env.DB.prepare("UPDATE feedback SET status = 'Released', release_id = ? WHERE id = ?").bind(release, id).run();
    await env.DB.prepare("UPDATE feedback_targets SET status = 'Released' WHERE feedback_id = ?").bind(id).run();
    expect((await client.myRequests()).requests.find((item: { id: string }) => item.id === id)?.shippedInVersion).toBe(`expo-test-${platform}`);
    const updates = await client.myUpdates();
    expect(updates.updates.some((item: { id: string }) => item.id === id)).toBe(true);
    expect((await client.acknowledgeUpdates([id])).unreadCount).toBe(0);
    expect((await client.myUpdates()).unreadCount).toBe(0);
  }
});
