/**
 * Whether this process has begun shutting down.
 *
 * Set first thing in index.js's shutdown, so /api/health/ready starts
 * answering 503 while in-flight requests drain — the load balancer stops
 * sending new traffic to an instance that is about to go away, instead of
 * finding out from a reset connection.
 */
let shuttingDown = false;

export function markShuttingDown() {
  shuttingDown = true;
}

export function isShuttingDown() {
  return shuttingDown;
}
