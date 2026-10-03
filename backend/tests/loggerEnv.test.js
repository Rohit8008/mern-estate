/**
 * The logger is imported by config/environment.js BEFORE dotenv.config() runs, so
 * OpenObserve settings that live in .env are not in process.env yet when the module
 * loads. It must read them when it ships, not when it is imported — otherwise
 * shipping is silently off in exactly the setup the docs describe.
 */

import { jest } from '@jest/globals';
import { logger, flushLogs } from '../utils/logger.js';

describe('logger reads OpenObserve settings at use, not at import', () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;

  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  it('ships once credentials appear after the module was loaded', async () => {
    delete process.env.OPENOBSERVE_USERNAME;
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock;

    // Credentials arrive late, as they do when dotenv runs after the import.
    process.env.OPENOBSERVE_URL = 'http://127.0.0.1:5080';
    process.env.OPENOBSERVE_ORG = 'default';
    process.env.OPENOBSERVE_USERNAME = 'u@example.com';
    process.env.OPENOBSERVE_PASSWORD = 'pw';

    logger.info('late env probe');
    await flushLogs();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:5080/api/default/backend_logs/_json');
    expect(opts.headers.Authorization).toBe('Basic ' + Buffer.from('u@example.com:pw').toString('base64'));
    expect(JSON.parse(opts.body)[0].message).toBe('late env probe');
  });

  it('does nothing when no username is configured', async () => {
    delete process.env.OPENOBSERVE_USERNAME;
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    logger.info('no creds');
    await flushLogs();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
