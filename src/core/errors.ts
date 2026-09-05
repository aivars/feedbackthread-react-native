export type FeedbackThreadErrorCode = 'configuration' | 'identity_storage' | 'network' | 'timeout' | 'cancelled' | 'invalid_response' | 'validation' | string;

export class FeedbackThreadError extends Error {
  constructor(
    message: string,
    public readonly code: FeedbackThreadErrorCode,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'FeedbackThreadError';
  }
}

export function cancelled(): FeedbackThreadError {
  return new FeedbackThreadError('The request was cancelled.', 'cancelled');
}
