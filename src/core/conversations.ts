import { FeedbackThreadClient } from './client.js';
import { FeedbackThreadError } from './errors.js';
import type { CallOptions, ConversationSettings } from './types.js';

export type ConversationAudience = 'private' | 'public';
export interface CustomerSession { customerId: string; externalUserId: string; token: string }
/** Back with platform secure storage (Keychain/Keystore), never AsyncStorage. */
export interface ConversationCredentialStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface ConversationMessage { id: string; seq: number; body: string; authorRole: string; mine: boolean; createdAt: string; deletedAt: string | null }
export interface ConversationRoute { feedbackId: string; audience: ConversationAudience }
export interface ConversationSummary extends ConversationRoute { id: string; title: string; preview: string; status: string; updatedAt: string; unreadCount: number }
export interface ConversationHistory { thread: { id: string; audience: ConversationAudience; status: string }; messages: ConversationMessage[]; unreadCount: number; following: boolean; otherReadSeq: number | null; hasMore: boolean; nextBefore: number | null }
export interface ConversationInbox { conversations: ConversationSummary[]; unreadCount: number }
export interface ConversationState { inbox: ConversationSummary[]; unreadCount: number; settings: ConversationSettings | null; revision: number; route: ConversationRoute | null; error: Error | null }
function path(route: ConversationRoute) {
  if (!/^FDBK-[A-Za-z0-9-]{4,67}$/.test(route.feedbackId) || !['public', 'private'].includes(route.audience)) throw new FeedbackThreadError('Invalid conversation.', 'validation');
  return `/chat/threads/${encodeURIComponent(route.feedbackId)}/${route.audience}`;
}
function validSession(value: unknown): value is CustomerSession {
  const v = value as Partial<CustomerSession> | null;
  return !!v && typeof v.customerId === 'string' && typeof v.externalUserId === 'string' && v.externalUserId.startsWith('ft-guest:') && typeof v.token === 'string' && /^[a-f0-9-]{72}$/.test(v.token);
}
/** One instance per local account. Account scope is storage isolation, not server login. */
export class FeedbackThreadConversations {
  private session?: CustomerSession;
  private revocationSession?: CustomerSession;
  private preparing?: Promise<CustomerSession>;
  private closed = false;
  private generation = 0;
  private refreshNumber = 0;
  private listeners = new Set<() => void>();
  private cleanupLive?: () => void;
  private readonly storageKey: string;
  readonly client: FeedbackThreadClient;
  private state: ConversationState = { inbox: [], unreadCount: 0, settings: null, revision: 0, route: null, error: null };
  constructor(private readonly baseClient: FeedbackThreadClient, private readonly storage: ConversationCredentialStore, accountScope = 'guest') {
    // Hex encoding is collision-free and compatible with Expo SecureStore keys.
    this.storageKey = 'ft.chat.v1.' + Array.from(`${baseClient.conversationNamespace}:${accountScope}`).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('');
    this.client = baseClient.withCustomerSession(() => this.prepare());
  }
  getSnapshot = (): ConversationState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<ConversationState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  async prepare(): Promise<CustomerSession> {
    if (this.closed) throw new FeedbackThreadError('This conversation session has signed out.', 'customer_session_required', 401);
    if (this.session) return this.session;
    if (this.preparing) return this.preparing;
    const generation = this.generation;
    const operation = (async () => {
      const stored = await this.storage.getItem(this.storageKey);
      let value: unknown;
      if (stored) { try { value = JSON.parse(stored); } catch { throw new FeedbackThreadError('Conversation credentials cannot be read.', 'identity_storage'); } }
      else value = this.revocationSession ?? await this.baseClient.conversationRequest<CustomerSession>('/chat/session', 'POST', {});
      if (!validSession(value)) throw new FeedbackThreadError('Invalid conversation session.', 'invalid_response');
      this.revocationSession = value; // Retain for logout even if secure storage or preparation fails.
      if (generation !== this.generation || this.closed) throw new FeedbackThreadError('Session changed.', 'cancelled');
      if (!stored) await this.storage.setItem(this.storageKey, JSON.stringify(value));
      if (generation !== this.generation || this.closed) { await this.storage.removeItem(this.storageKey); throw new FeedbackThreadError('Session changed.', 'cancelled'); }
      this.session = value; return value;
    })();
    this.preparing = operation;
    try { return await operation; } finally { if (this.preparing === operation) this.preparing = undefined; }
  }
  async refresh(options: CallOptions = {}) {
    const generation = this.generation; const number = ++this.refreshNumber;
    const [settings, inbox] = await Promise.all([this.client.conversationSettings(options), this.client.conversationRequest<ConversationInbox>('/chat/inbox', 'GET', undefined, options)]);
    if (this.closed || generation !== this.generation || number !== this.refreshNumber || options.signal?.aborted) return;
    if (!Array.isArray(inbox.conversations) || !Number.isSafeInteger(inbox.unreadCount)) throw new FeedbackThreadError('Invalid inbox.', 'invalid_response');
    this.update({ settings, inbox: inbox.conversations, unreadCount: inbox.unreadCount, revision: this.state.revision + 1, error: null,
      route: !settings.publicCommentsEnabled && this.state.route?.audience === 'public' ? null : this.state.route });
  }
  history(route: ConversationRoute, before?: number, options: CallOptions = {}): Promise<ConversationHistory> {
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new FeedbackThreadError('Invalid history cursor.', 'validation');
    return this.client.conversationRequest(path(route) + (before ? `?before=${before}` : ''), 'GET', undefined, options);
  }
  async send(route: ConversationRoute, body: string, clientId: string, options: CallOptions = {}) {
    if (!body.trim() || body.length > 4000 || !clientId || clientId.length > 100) throw new FeedbackThreadError('A message must contain 1–4000 characters.', 'validation');
    // The durable send is successful even if a later inbox refresh fails.
    return this.client.conversationRequest<{ id: string; state: string }>(path(route) + '/messages', 'POST', { body: body.trim(), clientId }, options);
  }
  markRead(route: ConversationRoute, seq: number, options: CallOptions = {}) { return this.client.conversationRequest(path(route) + '/read', 'POST', { seq }, options); }
  follow(route: ConversationRoute, following: boolean, options: CallOptions = {}) { return this.client.conversationRequest(path(route) + '/follow', 'PUT', { following }, options); }
  remove(route: ConversationRoute, messageId: string, options: CallOptions = {}) { return this.client.conversationRequest(path(route) + '/messages/' + encodeURIComponent(messageId), 'DELETE', {}, options); }
  registerDevice(token: string, provider: 'apns' | 'fcm') { return this.client.conversationRequest('/chat/device', 'PUT', { token, provider }); }
  unregisterDevice(token: string, provider: 'apns' | 'fcm') { return this.client.conversationRequest('/chat/device', 'DELETE', { token, provider }); }
  open(route: ConversationRoute | null) { if (this.closed) return; if (route) path(route); this.update({ route }); }
  /** Pass the notification data object. Never grants access; opening fetches authorized history. */
  handleNotification(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    let payload = (data as Record<string, unknown>).feedbackThread;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { return false; } }
    if (!payload || typeof payload !== 'object') return false;
    const route = payload as ConversationRoute;
    try { path(route); } catch { return false; }
    if (!this.closed && !(route.audience === 'public' && this.state.settings?.publicCommentsEnabled === false)) this.open(route);
    return true;
  }
  /** Mount once at app root while foregrounded. No background polling. */
  startLive(): () => void {
    this.cleanupLive?.();
    let stopped = false; let socket: WebSocket | undefined; let heartbeat: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined; let connectionTimeout: ReturnType<typeof setTimeout> | undefined; let lastSeen = Date.now(); let failures = 0;
    const controller = new AbortController();
    const connect = async () => {
      try {
        await this.refresh({ signal: controller.signal });
        const ticket = await this.client.conversationRequest<{ path: string }>('/chat/live-ticket', 'POST', {}, { signal: controller.signal });
        if (stopped || this.closed) return;
        if (!/^\/v1\/chat\/live\/[a-f0-9-]{72}$/.test(ticket.path)) throw new FeedbackThreadError('Invalid live ticket.', 'invalid_response');
        socket = new WebSocket(this.baseClient.conversationOrigin.replace(/^http/, 'ws') + ticket.path);
        connectionTimeout = setTimeout(() => socket?.close(), 15_000);
        socket.onopen = () => { if (connectionTimeout) clearTimeout(connectionTimeout); lastSeen = Date.now(); failures = 0; heartbeat = setInterval(() => { if (Date.now() - lastSeen > 60_000) socket?.close(); else if (socket?.readyState === 1) socket.send('ping'); }, 20_000); };
        socket.onmessage = event => { lastSeen = Date.now(); if (String(event.data).includes('"changed"')) void this.refresh({ signal: controller.signal }).catch(report); };
        socket.onerror = () => socket?.close();
        socket.onclose = reconnect;
      } catch (error) { report(error); reconnect(); }
    };
    const report = (error: unknown) => { if (!stopped && !this.closed) this.update({ error: error instanceof Error ? error : new Error('Conversation connection failed.') }); };
    const reconnect = () => { if (connectionTimeout) clearTimeout(connectionTimeout); if (retry) clearTimeout(retry); if (heartbeat) clearInterval(heartbeat); if (stopped || this.closed) return; retry = setTimeout(() => { void connect(); }, Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5))); };
    const stop = () => { stopped = true; controller.abort(); if (connectionTimeout) clearTimeout(connectionTimeout); if (heartbeat) clearInterval(heartbeat); if (retry) clearTimeout(retry); socket?.close(); };
    this.cleanupLive = stop; void connect(); return stop;
  }
  async logout() {
    this.closed = true; this.generation++; this.cleanupLive?.();
    this.update({ inbox: [], unreadCount: 0, settings: null, route: null, revision: this.state.revision + 1, error: null });
    const pending = this.preparing; if (pending) await pending.catch(() => {});
    const saved = this.revocationSession ?? this.session ?? JSON.parse(await this.storage.getItem(this.storageKey) ?? 'null') as CustomerSession | null;
    await this.storage.removeItem(this.storageKey);
    if (saved) {
      try { await this.baseClient.withCustomerSession(async () => saved).conversationRequest('/chat/session', 'DELETE', {}); }
      catch (error) { if (!(error instanceof FeedbackThreadError && error.status === 401)) throw error; }
    }
    this.session = undefined; this.revocationSession = undefined;
  }
}
