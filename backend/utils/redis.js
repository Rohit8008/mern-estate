import Redis from 'ioredis';
import { logger } from './logger.js';

/**
 * The shared store, when there is one.
 *
 * Two pieces of state in this app were per-process: the response cache and the
 * rate limiter. That is correct on one instance and wrong on the PM2 cluster
 * and multi-dyno deployments this ships with — caches diverge, so two users get
 * different answers to the same question, and a "1000 requests per 15 minutes"
 * limit becomes 1000 × the number of instances.
 *
 * Redis is optional on purpose. A single-instance deployment needs nothing, and
 * requiring infrastructure for a one-server install would be a worse default
 * than the bug. Set REDIS_URL and both become shared; leave it unset and both
 * stay in-process, which is stated plainly at boot rather than assumed.
 */

let client = null;
let attempted = false;

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

/**
 * The shared client, or null when none is configured.
 *
 * Deliberately never throws: Redis being unreachable must degrade the app to
 * per-process behaviour, not stop it serving.
 */
export function getRedis() {
  if (client || attempted) return client;
  attempted = true;

  if (!process.env.REDIS_URL) {
    logger.info(
      'No REDIS_URL set — cache and rate limits are per-process. Fine on one instance; set REDIS_URL if you run more than one.'
    );
    return null;
  }

  try {
    client = new Redis(process.env.REDIS_URL, {
      // A cache miss is survivable; a queue of retrying commands is not.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      connectTimeout: 5000,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    client.on('error', (err) => {
      // ioredis emits these continuously while down; log rather than crash.
      logger.error('Redis error', { message: err.message });
    });
    client.on('connect', () => logger.info('Redis connected — cache and rate limits are shared'));

    return client;
  } catch (err) {
    logger.error('Could not create the Redis client; continuing per-process', { message: err.message });
    client = null;
    return null;
  }
}

export async function closeRedis() {
  if (!client) return;
  try {
    await client.quit();
  } catch { /* shutting down anyway */ }
  client = null;
  attempted = false;
}
