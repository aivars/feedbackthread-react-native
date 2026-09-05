import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { FeedbackThreadClient } from '../src/core/client.js';
import { FeedbackThreadBoard } from '../src/ui/Board.js';
import { FeedbackThreadFeedbackForm } from '../src/ui/FeedbackForm.js';
import { FeedbackThreadMyRequests } from '../src/ui/MyRequests.js';

const project = { id: 'PRJ-test', name: 'Test' };
const item = { id: 'FDBK-test01', title: 'Dark mode', description: 'The complete description should appear in the detail screen.', status: 'Ready to release', votes: 4, voted: false, target: 'ios', updatedAt: 'today', shippedInVersion: null };
function client(transport?: typeof fetch) {
  let sequence = 0;
  return new FeedbackThreadClient({ projectKey: 'test-public-key', platform: 'ios', externalUserId: 'alice', storage: { async getItem() { return 'anonymous'; }, async setItem() {} }, generateId: () => `key-${++sequence}`, maxRetries: 0,
    fetch: transport ?? (async (url) => String(url).includes('/my/') ? Response.json({ project, updates: [], unreadCount: 0 }) : Response.json({ project, platform: 'ios', requests: [item] })) });
}

it('shows requests, future statuses and full details; maps ready to release into in progress', async () => {
  const c = client(async (url) => String(url).includes('/my/') ? Response.json({ project, updates: [], unreadCount: 0 }) : Response.json({ project, platform: 'ios', requests: [item, { ...item, id: 'FDBK-future', title: 'Future card', status: 'Exploring' }] }));
  await render(<FeedbackThreadBoard client={c} />);
  expect(await screen.findByText('Future card')).toBeTruthy();
  expect(screen.getByText('In progress')).toBeTruthy();
  await fireEvent.press(screen.getByText('In progress (1)'));
  expect(screen.queryByText('Future card')).toBeNull();
  await fireEvent.press(screen.getByText('Dark mode'));
  expect(screen.getByText(item.description)).toBeTruthy();
});

it('keeps a usable board when the independent update badge fails', async () => {
  const onError = jest.fn();
  await render(<FeedbackThreadBoard client={client(async (url) => {
    if (String(url).includes('/my/')) throw Error('network');
    return Response.json({ project, platform: 'ios', requests: [item] });
  })} onError={onError} />);
  expect(await screen.findByText('Dark mode')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(onError).toHaveBeenCalledTimes(1);
});

it('preserves the submission ID across a manual retry and prevents double taps', async () => {
  const attempts: RequestInit[] = [];
  const c = client(async (_url, init) => {
    attempts.push(init!);
    if (attempts.length === 1) throw Error('network');
    return Response.json({ project, feedback: { id: item.id, title: 'Test', status: 'Submitted' } });
  });
  await render(<FeedbackThreadFeedbackForm client={c} />);
  await fireEvent.changeText(screen.getByTestId('feedback-title'), 'A feature');
  await fireEvent.changeText(screen.getByTestId('feedback-description'), 'Useful details');
  await fireEvent.press(screen.getByTestId('feedback-submit'));
  expect(await screen.findByText('Could not connect. Check your connection and try again.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('feedback-submit'));
  expect(await screen.findByText('Thank you for your feedback')).toBeTruthy();
  expect(attempts).toHaveLength(2);
  expect(new Headers(attempts[0]!.headers).get('Idempotency-Key')).toBe(new Headers(attempts[1]!.headers).get('Idempotency-Key'));
});

it('discards private data immediately on account changes, including late responses', async () => {
  let finish: ((value: Response) => void) | undefined;
  const a = client(async () => new Promise<Response>((resolve) => { finish = resolve; }));
  const b = client(async (url) => String(url).endsWith('/my/requests')
    ? Response.json({ project, requests: [{ id: 'FDBK-bob01', title: 'Bob private', status: 'Submitted', createdAt: 'today', voteCount: 1, shippedInVersion: null }] })
    : Response.json({ project, updates: [], unreadCount: 0 }));
  const view = await render(<FeedbackThreadMyRequests client={a} />);
  await view.rerender(<FeedbackThreadMyRequests client={b} />);
  expect(await screen.findByText('Bob private')).toBeTruthy();
  await act(async () => finish?.(Response.json({ project, requests: [{ id: 'FDBK-alice', title: 'Alice private', status: 'Submitted', createdAt: 'today', voteCount: 1, shippedInVersion: null }] })));
  expect(screen.queryByText('Alice private')).toBeNull();
});

it('only acknowledges shipped updates when the reporter explicitly marks them read', async () => {
  let acknowledged = false;
  const c = client(async (url, init) => {
    if (String(url).endsWith('/ack')) { expect(JSON.parse(String(init?.body))).toEqual({ feedbackIds: [item.id] }); acknowledged = true; return Response.json({ unreadCount: 0 }); }
    if (String(url).endsWith('/my/requests')) return Response.json({ project, requests: [] });
    return Response.json({ project, updates: acknowledged ? [] : [{ id: item.id, title: item.title, shippedVersion: '1.0', publishedAt: 'today' }], unreadCount: acknowledged ? 0 : 1 });
  });
  const count = jest.fn();
  await render(<FeedbackThreadMyRequests client={c} onUnreadCountChange={count} />);
  expect(await screen.findByText('New shipped updates · 1')).toBeTruthy();
  expect(acknowledged).toBe(false);
  await fireEvent.press(screen.getByText('Mark updates as read'));
  await waitFor(() => expect(count).toHaveBeenLastCalledWith(0));
});

it('rapid vote taps make only one pending mutation', async () => {
  let votes = 0; let finish: ((response: Response) => void) | undefined;
  const c = client(async (url) => {
    if (String(url).includes('/vote')) { votes++; return new Promise<Response>((resolve) => { finish = resolve; }); }
    if (String(url).includes('/my/')) return Response.json({ project, updates: [], unreadCount: 0 });
    return Response.json({ project, platform: 'ios', requests: [item] });
  });
  await render(<FeedbackThreadBoard client={c} />);
  const button = await screen.findByText('Vote · 4');
  await fireEvent.press(button); await fireEvent.press(button);
  expect(votes).toBe(1);
  await act(async () => finish?.(Response.json({ feedbackId: item.id, voted: true, votes: 5 })));
  expect(await screen.findByText('Remove vote · 5')).toBeTruthy();
});

it('Android Back navigates inner routes and cannot discard an in-flight form', async () => {
  const handlers = new Set<Parameters<typeof BackHandler.addEventListener>[1]>();
  const listener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, callback) => {
    handlers.add(callback);
    return { remove: () => { handlers.delete(callback); } };
  });
  let finish: ((response: Response) => void) | undefined;
  const c = client(async (url) => {
    if (String(url).endsWith('/feedback')) return new Promise<Response>((resolve) => { finish = resolve; });
    if (String(url).includes('/my/')) return Response.json({ project, updates: [], unreadCount: 0 });
    return Response.json({ project, platform: 'ios', requests: [item] });
  });
  const back = async () => act(async () => { expect([...handlers].at(-1)?.({ type: 'hardwareBackPress', timeStamp: Date.now() })).toBe(true); });
  try {
    await render(<FeedbackThreadBoard client={c} />);
    await fireEvent.press(await screen.findByText('Dark mode'));
    await back();
    expect(screen.getByText('Suggest a feature')).toBeTruthy();
    await fireEvent.press(screen.getByText('Suggest a feature'));
    await fireEvent.changeText(screen.getByTestId('feedback-title'), 'Android Back');
    await fireEvent.changeText(screen.getByTestId('feedback-description'), 'Keep pending form');
    await fireEvent.press(screen.getByTestId('feedback-submit'));
    await back();
    expect(screen.getByTestId('feedback-title').props.value).toBe('Android Back');
    await act(async () => finish?.(Response.json({ project, feedback: { id: item.id, title: 'Android Back', status: 'Submitted' } })));
    expect(await screen.findByText('Thank you for your feedback')).toBeTruthy();
    await back();
    expect(screen.getByText('All requests')).toBeTruthy();
  } finally { listener.mockRestore(); }
});
