export type FeedbackThreadPlatform = 'ios' | 'android';
export type FeedbackKind = 'Requests' | 'Bugs';
export type RequestStage = 'review' | 'planned' | 'progress' | 'completed' | 'other';

export interface FeedbackRequest {
  id: string;
  title: string;
  description: string;
  kind?: FeedbackKind;
  votes: number;
  voted: boolean;
  target: string;
  status: string;
  updatedAt: string;
  shippedInVersion: string | null;
}

export interface MyRequest {
  conversationAvailable?: boolean;
  id: string;
  title: string;
  status: string;
  createdAt: string;
  voteCount: number;
  shippedInVersion: string | null;
}

export interface ShippedUpdate {
  id: string;
  title: string;
  shippedVersion: string;
  publishedAt: string;
}

export interface ProjectSummary { id: string; name: string }
export interface RequestList { project: ProjectSummary; platform: FeedbackThreadPlatform; requests: FeedbackRequest[] }
export interface MyRequestList { project: ProjectSummary; requests: MyRequest[] }
export interface UpdateList { project: ProjectSummary; updates: ShippedUpdate[]; unreadCount: number }
export interface VoteResult { feedbackId: string; votes: number; voted: boolean }
export interface Submission {
  kind: FeedbackKind;
  title: string;
  text: string;
  customerTier?: string;
  appVersion?: string;
}
export interface SubmissionResult {
  feedback: { id: string; title: string; status: string };
  project: ProjectSummary;
  duplicate?: boolean;
}

/** Persist only the anonymous identifier. This interface never stores private tokens. */
export interface IdentityStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface FeedbackThreadClientOptions {
  projectKey: string;
  platform: FeedbackThreadPlatform;
  storage: IdentityStorage;
  /** Supply a cryptographically random UUID generator (Expo's adapter supplies one). */
  generateId: () => string;
  externalUserId?: string | null;
  appVersion?: string;
  customerTier?: string;
  baseUrl?: string;
  /** Explicit opt-in for a local test server. HTTPS is required by default. */
  allowInsecureHttp?: boolean;
  requestTimeoutMs?: number;
  /** Additional attempts for transient failures; 0–2, default 1. */
  maxRetries?: number;
  /** Fetch injection supports deterministic tests and host-managed networking. */
  fetch?: typeof globalThis.fetch;
}

export interface CallOptions { signal?: AbortSignal }
export interface SubmitOptions extends CallOptions {
  /** Reuse this when retrying the same submission after an ambiguous failure. */
  idempotencyKey?: string;
}

/** Project policy; does not indicate SDK UI support, push setup, or device permission. */
export interface ConversationSettings {
  privateRepliesEnabled: boolean;
  notificationsEnabled: boolean;
  publicCommentsEnabled: boolean;
}
