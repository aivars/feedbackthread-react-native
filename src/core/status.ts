import type { RequestStage } from './types.js';

export function requestStage(status: string): RequestStage {
  switch (status.trim().toLowerCase()) {
    case 'in review': case 'under review': return 'review';
    case 'planned': return 'planned';
    case 'in progress': case 'ready to release': return 'progress';
    case 'released': case 'completed': return 'completed';
    default: return 'other';
  }
}
