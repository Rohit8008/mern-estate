import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Per-request log context: the request id, and who is asking once auth knows.
 *
 * Separate from the tenant context on purpose. The tenant store is replaced
 * wholesale by `runWithTenant` / `runWithoutTenantScope`, and a log line must
 * keep its request id across that boundary — the id is what lets one search
 * in OpenObserve pull the access line, the error and the audit entry for a
 * single request together.
 */
const storage = new AsyncLocalStorage();

// Accept a caller's id only when it looks like one; anything else is replaced,
// so a client cannot write arbitrary text into every log line.
const INCOMING_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export function getLogContext() {
  return storage.getStore();
}

/** Run fn with its own log context (a job, a socket event, a script). */
export function runWithLogContext(fields, fn) {
  return storage.run({ requestId: randomUUID(), ...fields }, fn);
}

/**
 * Express middleware, mounted first. Honours an upstream X-Request-Id (a load
 * balancer, the mobile app) and echoes it on the response so a user's error
 * report can be traced to the exact log lines.
 */
export function requestContext(req, res, next) {
  const incoming = req.get('X-Request-Id');
  const requestId = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId }, next);
}
