/**
 * Environment the suite needs before any module loads.
 *
 * config/environment.js exits the process if these are missing, and several test
 * files import code that imports it at the top — before tests/setup.js's
 * beforeAll can run. They used to come from a developer's .env, which CI does not
 * have, so CI failed with "process.exit called with 1". All throwaway values:
 * `||=` leaves anything already set (a real .env, a CI secret) alone, and
 * setup.js points MONGO_URI at the in-memory server once it is up.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-jwt-secret-key-for-testing';
process.env.REFRESH_SECRET ||= 'test-refresh-secret-key-for-testing';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/mern-estate-test-placeholder';
process.env.MESSAGE_ENCRYPTION_KEY ||= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
