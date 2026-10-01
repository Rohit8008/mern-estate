/**
 * The request id, for code that only wants the id.
 *
 * There is ONE per-request store, in logContext.js (request id, user, job). This
 * file used to hold a second AsyncLocalStorage doing the same job; it now reads
 * the first so the two can never disagree about which request a line belongs to.
 */
import { getLogContext, requestContext } from './logContext.js';

/** Express middleware, mounted first in app.js. Same function as logContext's. */
export const requestId = requestContext;

/** The current request's id, or null outside a request (a job, a script). */
export function getRequestId() {
  return getLogContext()?.requestId || null;
}
