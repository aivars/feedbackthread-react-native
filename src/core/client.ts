import { FeedbackThreadError, cancelled } from './errors.js';
import { resolveAnonymousIdentity, validateIdentity } from './identity.js';
import type { CallOptions, ConversationSettings, FeedbackThreadClientOptions, MyRequestList, RequestList, Submission, SubmissionResult, SubmitOptions, UpdateList, VoteResult } from './types.js';

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
let instanceSequence = 0;

function boundedText(value: string | undefined, name: string, max: number, required = false): string | undefined {
  if (value !== undefined && typeof value !== 'string') throw new FeedbackThreadError(`${name} must be text.`, 'validation');
  const text = value?.trim();
  if ((required && !text) || (text && text.length > max)) throw new FeedbackThreadError(`${name} must contain ${required ? '1' : '0'}–${max} characters.`, 'validation');
  return text || undefined;
}

function feedbackId(value: string): string {
  if (!/^FDBK-[A-Za-z0-9-]{4,67}$/.test(value)) throw new FeedbackThreadError('Invalid feedback ID.', 'validation');
  return encodeURIComponent(value);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const abort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function retryAfter(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(cancelled()); };
    if (signal.aborted) { reject(cancelled()); return; }
    signal.addEventListener('abort', abort, { once: true });
    operation.then((value) => { signal.removeEventListener('abort', abort); resolve(value); }, (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function isText(value: unknown): value is string { return typeof value === 'string'; }
function count(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 0; }
function optionalText(value: unknown): boolean { return value === null || value === undefined || isText(value); }
function project(value: unknown): boolean { return record(value) && isText(value.id) && isText(value.name); }

/** A client is scoped to one project, platform and user. Create forUser() on login/logout. */
export class FeedbackThreadClient {
  /** Used by the UI to discard old account state before rendering a new client. */
  readonly instanceId = ++instanceSequence;
  readonly platform: 'ios' | 'android';
  private readonly options: FeedbackThreadClientOptions;
  private readonly endpoint: string;
  private readonly baseUrl: string;
  private readonly transport: typeof globalThis.fetch;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly reads = new Map<string, Promise<unknown>>();

  constructor(options: FeedbackThreadClientOptions) {
    let url: URL;
    try { url = new URL(options.baseUrl ?? 'https://api.feedbackthread.com'); }
    catch { throw new FeedbackThreadError('baseUrl must be an absolute HTTPS URL.', 'configuration'); }
    if ((url.protocol !== 'https:' && !(options.allowInsecureHttp && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new FeedbackThreadError('baseUrl must be an HTTPS origin without credentials, a path, query, or fragment.', 'configuration');
    }
    const projectKey = boundedText(options.projectKey, 'projectKey', 200, true)!;
    if (options.platform !== 'ios' && options.platform !== 'android') throw new FeedbackThreadError('This SDK supports iOS and Android.', 'configuration');
    if (!options.storage?.getItem || !options.storage?.setItem || typeof options.generateId !== 'function') throw new FeedbackThreadError('Provide identity storage and a UUID generator, or use the Expo adapter.', 'configuration');
    this.timeout = options.requestTimeoutMs ?? 15_000;
    this.retries = options.maxRetries ?? 1;
    if (!Number.isFinite(this.timeout) || this.timeout < 1 || this.timeout > 120_000 || !Number.isInteger(this.retries) || this.retries < 0 || this.retries > 2) throw new FeedbackThreadError('Use a timeout between 1 and 120000 ms and maxRetries between 0 and 2.', 'configuration');
    const externalUserId = options.externalUserId == null ? null : validateIdentity(options.externalUserId);
    this.options = { ...options, projectKey, externalUserId };
    this.baseUrl = url.origin;
    this.endpoint = `${url.origin}/v1/projects/${encodeURIComponent(projectKey)}`;
    this.platform = options.platform;
    this.transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Preserve the anonymous identity across logout; never merge it into an account implicitly. */
  forUser(externalUserId: string | null, customerTier?: string): FeedbackThreadClient {
    return new FeedbackThreadClient({ ...this.options, externalUserId, customerTier });
  }

  async identity(): Promise<string> {
    if (this.options.externalUserId) return this.options.externalUserId;
    return resolveAnonymousIdentity(this.options.storage, `feedbackthread.identity.v1:${this.baseUrl}:${this.options.projectKey}`, this.options.generateId);
  }

  createSubmissionKey(): string {
    return validateIdentity(this.options.generateId());
  }

  requests(options: CallOptions = {}): Promise<RequestList> {
    return this.read(`/requests?platform=${this.platform}`, options, (v) => record(v) && project(v.project) && v.platform === this.platform && Array.isArray(v.requests) && v.requests.every((r) => record(r) && isText(r.id) && isText(r.title) && isText(r.description) && isText(r.status) && isText(r.target) && isText(r.updatedAt) && count(r.votes) && typeof r.voted === 'boolean' && optionalText(r.shippedInVersion)));
  }

  /** Discover project policy without starting a private conversation session. */
  conversationSettings(options: CallOptions = {}): Promise<ConversationSettings> {
    return this.read('/chat/settings', options, (v) => record(v) && typeof v.privateRepliesEnabled === 'boolean' && typeof v.notificationsEnabled === 'boolean' && typeof v.publicCommentsEnabled === 'boolean');
  }

  myRequests(options: CallOptions = {}): Promise<MyRequestList> {
    return this.read('/my/requests', options, (v) => record(v) && project(v.project) && Array.isArray(v.requests) && v.requests.every((r) => record(r) && isText(r.id) && isText(r.title) && isText(r.status) && isText(r.createdAt) && count(r.voteCount) && optionalText(r.shippedInVersion)));
  }

  myUpdates(options: CallOptions = {}): Promise<UpdateList> {
    return this.read('/my/updates', options, (v) => record(v) && project(v.project) && count(v.unreadCount) && Array.isArray(v.updates) && v.updates.every((r) => record(r) && isText(r.id) && isText(r.title) && isText(r.shippedVersion) && isText(r.publishedAt)));
  }

  async submit(submission: Submission, options: SubmitOptions = {}): Promise<SubmissionResult> {
    if (submission.kind !== 'Requests' && submission.kind !== 'Bugs') throw new FeedbackThreadError('Submit a feature request or a bug report.', 'validation');
    const payload = {
      kind: submission.kind,
      source: this.platform,
      title: boundedText(submission.title, 'Title', 160, true),
      text: boundedText(submission.text, 'Description', 8_000, true),
      appVersion: boundedText(submission.appVersion ?? this.options.appVersion, 'App version', 80),
      customerTier: boundedText(submission.customerTier ?? this.options.customerTier, 'Customer tier', 32),
      externalUserId: await this.identity(),
    };
    const key = options.idempotencyKey === undefined ? this.createSubmissionKey() : validateIdentity(options.idempotencyKey);
    const result = await this.request<SubmissionResult>('/feedback', 'POST', payload, options, { 'Idempotency-Key': key });
    if (!record(result) || !project(result.project) || !record(result.feedback) || !isText(result.feedback.id) || !isText(result.feedback.title) || !isText(result.feedback.status)) throw this.invalidResponse();
    return result;
  }

  async setVote(id: string, voted: boolean, options: CallOptions = {}): Promise<VoteResult> {
    if (typeof voted !== 'boolean') throw new FeedbackThreadError('voted must be a boolean.', 'validation');
    const tier = boundedText(this.options.customerTier, 'Customer tier', 32);
    const result = await this.request<VoteResult>(`/requests/${feedbackId(id)}/vote?platform=${this.platform}`, voted ? 'POST' : 'DELETE', voted ? { ...(tier ? { customerTier: tier } : {}) } : undefined, options);
    if (!record(result) || result.feedbackId !== id || !count(result.votes) || typeof result.voted !== 'boolean') throw this.invalidResponse();
    return result;
  }

  async acknowledgeUpdates(ids: readonly string[], options: CallOptions = {}): Promise<{ unreadCount: number }> {
    if (!ids.length || ids.length > 200) throw new FeedbackThreadError('Acknowledge between 1 and 200 updates at once.', 'validation');
    ids.forEach(feedbackId);
    const result = await this.request<{ unreadCount: number }>('/my/updates/ack', 'POST', { feedbackIds: [...new Set(ids)] }, options);
    if (!record(result) || !count(result.unreadCount)) throw this.invalidResponse();
    return result;
  }

  private invalidResponse(): FeedbackThreadError {
    return new FeedbackThreadError('FeedbackThread returned an unexpected response. Please try again.', 'invalid_response');
  }

  private read<T>(path: string, options: CallOptions, validate: (value: unknown) => boolean): Promise<T> {
    const load = async () => {
      const result = await this.request<T>(path, 'GET', undefined, options);
      if (!validate(result)) throw this.invalidResponse();
      return result;
    };
    // A caller owning cancellation also owns its fetch; aborting one screen
    // must not cancel an unrelated component's request.
    if (options.signal) return load();
    const existing = this.reads.get(path);
    if (existing) return existing as Promise<T>;
    const promise = load();
    this.reads.set(path, promise);
    void promise.finally(() => this.reads.delete(path)).catch(() => {});
    return promise;
  }

  private async request<T>(path: string, method: string, payload: unknown, options: CallOptions, extraHeaders: Record<string, string> = {}): Promise<T> {
    if (options.signal?.aborted) throw cancelled();
    const identity = await this.identity();
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    for (let attempt = 0; ; attempt += 1) {
      if (options.signal?.aborted) throw cancelled();
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeout);
      let error: FeedbackThreadError;
      try {
        const response = await abortable(this.transport(`${this.endpoint}${path}`, {
          method,
          headers: { Accept: 'application/json', 'X-FeedbackThread-User': identity, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
          body,
          signal: controller.signal,
          // Ask the host transport to reject redirects.
          redirect: 'error',
        }), controller.signal);
        if (!response.ok) {
          let data: unknown;
          try { data = await abortable(response.json(), controller.signal); } catch { /* preserve the HTTP error */ }
          if (controller.signal.aborted) throw cancelled();
          const apiError = record(data) && record(data.error) ? data.error : undefined;
          const retryable = TRANSIENT.has(response.status) && apiError?.code !== 'collection_limit_reached';
          throw new FeedbackThreadError(
            isText(apiError?.message) ? apiError.message : `FeedbackThread could not complete the request (${response.status}).`,
            isText(apiError?.code) ? apiError.code : 'http_error', response.status, retryable, retryAfter(response),
          );
        }
        try { return await abortable(response.json(), controller.signal) as T; }
        catch (cause) { if (controller.signal.aborted) throw cause; throw this.invalidResponse(); }
      } catch (cause) {
        if (options.signal?.aborted) throw cancelled();
        error = timedOut
          ? new FeedbackThreadError('FeedbackThread took too long to respond. Please try again.', 'timeout', undefined, true)
          : cause instanceof FeedbackThreadError ? cause
            : new FeedbackThreadError('Could not connect to FeedbackThread. Check your connection and try again.', 'network', undefined, true);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      }
      // Respect long Retry-After values by returning control instead of
      // retrying early or keeping a mobile screen waiting indefinitely.
      if (!error.retryable || attempt >= this.retries || (error.retryAfterMs ?? 0) > 5_000) throw error;
      await delay(error.retryAfterMs ?? 300 * 2 ** attempt, options.signal);
    }
  }
}
