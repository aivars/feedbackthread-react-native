export const englishStrings = {
  board: 'Feedback', boardTab: 'All requests', myRequests: 'My requests',
  subtitle: 'Help shape what comes next.', all: 'All', review: 'In review', planned: 'Planned',
  progress: 'In progress', completed: 'Completed', submitted: 'Waiting for review', rejected: 'Not planned',
  suggest: 'Suggest a feature', reportBug: 'Report a bug', back: 'Back', close: 'Close',
  vote: 'Vote', removeVote: 'Remove vote', votes: 'votes',
  loading: 'Loading feedback…', retry: 'Try again', refresh: 'Refresh',
  empty: 'No requests here yet.', emptyMine: 'Your requests will appear here after you submit feedback.',
  title: 'Title', description: 'Description', titlePlaceholder: 'What would you like to see?',
  bugTitlePlaceholder: 'What went wrong?', descriptionPlaceholder: 'Tell us a little more…',
  send: 'Send feedback', sending: 'Sending…', thanks: 'Thank you for your feedback',
  submittedMessage: 'Your feedback has been submitted and is waiting for review.', done: 'Done',
  required: 'Please add a title and description.', newUpdates: 'New shipped updates',
  markRead: 'Mark updates as read', markingRead: 'Marking as read…', shipped: 'Shipped in',
  networkError: 'Could not connect. Check your connection and try again.',
  timeoutError: 'The request took too long. Please try again.',
  rateLimitError: 'Please wait a moment before trying again.',
  serviceError: 'Feedback is temporarily unavailable. Please try again.',
  identityError: 'Could not load your feedback identity. Please try again.',
  unknownError: 'Something went wrong. Please try again.',
};
export type FeedbackThreadStrings = typeof englishStrings;

/** Override any string for localization or your app's tone. */
export function stringsFor(overrides?: Partial<FeedbackThreadStrings>): FeedbackThreadStrings {
  return { ...englishStrings, ...overrides };
}
