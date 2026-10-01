import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * One id per request, available anywhere the request's work runs.
 *
 * Nothing tied a log line to the request that produced it, so a 500 a
 * customer reported could not be found among everyone else's traffic. Every
 * response now carries `X-Request-Id`, every error body repeats it, and the
 * logger stamps it on every line written while the request is in flight —
 * which is what makes "what happened to my request" answerable.
 *
 * A separate AsyncLocalStorage from the tenant context on purpose: the request
 * id exists before the tenant is resolved (and for routes that have none),
 * and the two must not be able to overwrite each other.
 */

const storage = new AsyncLocalStorage();

/** An id a proxy or the browser already chose is kept, if it looks like one. */
const ACCEPTABLE_INBOUND = /^[A-Za-z0-9_-]{8,64}$/;

export function requestId(req, res, next) {
  const inbound = req.get('X-Request-Id');
  const id = inbound && ACCEPTABLE_INBOUND.test(inbound) ? inbound : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  storage.run({ requestId: id }, next);
}

/** The current request's id, or null outside a request (a job, a script). */
export function getRequestId() {
  return storage.getStore()?.requestId || null;
}
