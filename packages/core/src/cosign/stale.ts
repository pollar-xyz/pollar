import type { CosignRequest } from '../types';

/**
 * Whether a pending copy of a request is older than what this client already
 * saw of it: the request was seen settled, or seen proposed while this copy
 * has no activity yet. Responses to reads issued before a vote can arrive
 * after it, and showing such a copy would offer to propose the request again.
 */
export function isStaleCosignCopy(
  request: CosignRequest,
  seen: { settled: ReadonlySet<string>; proposed: ReadonlySet<string> },
): boolean {
  if (request.status !== 'PENDING') return false;
  return seen.settled.has(request.id) || (!request.activityId && seen.proposed.has(request.id));
}
