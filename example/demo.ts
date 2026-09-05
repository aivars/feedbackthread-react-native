/** Deterministic in-memory demo. No request leaves the phone in demo mode. */
import type { FeedbackRequest, MyRequest } from 'feedbackthread-react-native/core';
import { Platform } from 'react-native';

const project = { id: 'PRJ-demo', name: 'Trail Notes' };
const cards: FeedbackRequest[] = [
  { id: 'FDBK-demo01', kind: 'Requests', title: 'Save trails for offline use', description: 'Keep the map and route available when there is no mobile signal. Saved trails should stay available after restarting the app.', votes: 28, voted: false, target: Platform.OS, status: 'Planned', updatedAt: '2026-09-05', shippedInVersion: null },
  { id: 'FDBK-demo02', kind: 'Requests', title: 'A quieter dark theme', description: 'A softer theme for checking the route before sunrise.', votes: 16, voted: false, target: Platform.OS, status: 'Released', updatedAt: '2026-09-05', shippedInVersion: '1.4.0' },
  { id: 'FDBK-demo03', kind: 'Bugs', title: 'Remember the map zoom', description: 'Returning from a trail detail should keep the zoom level I chose.', votes: 9, voted: false, target: Platform.OS, status: 'Ready to release', updatedAt: '2026-09-05', shippedInVersion: null },
];
const mine = new Map<string, MyRequest[]>();
const votes = new Map<string, Set<string>>();
const seen = new Set<string>();
const submissions = new Map<string, unknown>();
let sequence = 0;
export let simulateOffline = false;
export function setOffline(value: boolean) { simulateOffline = value; }

export const demoFetch: typeof fetch = async (input, init) => {
  await new Promise((resolve) => setTimeout(resolve, 180));
  if (simulateOffline) throw new TypeError('Simulated offline connection');
  const url = new URL(String(input));
  const user = new Headers(init?.headers).get('X-FeedbackThread-User') ?? 'anonymous';
  const userVotes = votes.get(user) ?? new Set<string>();
  votes.set(user, userVotes);
  const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname.endsWith('/my/updates/ack')) { seen.add(user); return respond({ unreadCount: 0 }); }
  if (url.pathname.endsWith('/my/updates')) return respond({ project, unreadCount: seen.has(user) ? 0 : 1, updates: seen.has(user) ? [] : [{ id: 'FDBK-demo02', title: 'A quieter dark theme', shippedVersion: '1.4.0', publishedAt: '2026-09-05T10:00:00Z' }] });
  if (url.pathname.endsWith('/my/requests')) return respond({ project, requests: [...(mine.get(user) ?? []), { id: 'FDBK-demo02', title: 'A quieter dark theme', status: 'Released', createdAt: '2026-09-04', voteCount: 16, shippedInVersion: '1.4.0' }] });
  if (url.pathname.endsWith('/requests')) return respond({ project, platform: Platform.OS, requests: cards.map((card) => ({ ...card, voted: userVotes.has(card.id) })) });
  if (url.pathname.endsWith('/vote')) {
    const id = url.pathname.split('/').at(-2);
    const card = cards.find((value) => value.id === id)!;
    const voted = init?.method === 'POST';
    if (voted !== userVotes.has(card.id)) card.votes += voted ? 1 : -1;
    if (voted) userVotes.add(card.id); else userVotes.delete(card.id);
    return respond({ feedbackId: card.id, votes: card.votes, voted });
  }
  if (url.pathname.endsWith('/feedback')) {
    const key = new Headers(init?.headers).get('Idempotency-Key')!;
    if (submissions.has(key)) return respond(submissions.get(key));
    const body = JSON.parse(String(init?.body));
    const feedback = { id: `FDBK-demonew${++sequence}`, title: body.title, status: 'Submitted' };
    const result = { project, feedback };
    mine.set(user, [{ ...feedback, createdAt: new Date().toISOString(), voteCount: 1, shippedInVersion: null }, ...(mine.get(user) ?? [])]);
    submissions.set(key, result);
    return respond(result, 201);
  }
  return respond({ error: { code: 'not_found', message: 'Unknown demo route' } }, 404);
};
