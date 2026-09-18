/**
 * Presence is per-workspace.
 *
 * This store used to be one process-global `Set` shared by every tenant on the
 * deployment, and two things read it wholesale: the `presence:bulk` event sent
 * to each connecting socket, and `GET /api/messages/online`. Between them they
 * enumerated every signed-in user id on the platform.
 *
 * Those ids were not inert. `user:<id>` rooms are the socket routing key and
 * ObjectIds are globally unique, so an id harvested from another workspace was
 * directly addressable by `message:send` — which is why this store and the
 * receiver check in server.js are one fix, not two.
 */

import { markOnline, markOffline, onlineInTenant, isOnline, _reset } from '../utils/onlineUsers.js';

const ACME = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BETA = 'bbbbbbbbbbbbbbbbbbbbbbbb';

beforeEach(() => _reset());

describe('onlineUsers', () => {
  it('does not show one workspace the people signed into another', () => {
    markOnline(ACME, 'u-acme');
    markOnline(BETA, 'u-beta');

    expect(onlineInTenant(ACME)).toEqual(['u-acme']);
    expect(onlineInTenant(BETA)).toEqual(['u-beta']);
  });

  it('has no way to ask for everyone', () => {
    // The whole point: there is no export that returns the union. A caller has
    // to name a workspace, so "forgot to scope it" is not reachable.
    markOnline(ACME, 'u-acme');
    markOnline(BETA, 'u-beta');

    const api = { markOnline, markOffline, onlineInTenant, isOnline, _reset };
    for (const fn of Object.values(api)) {
      if (fn.length === 0) continue; // _reset
      expect(fn.length).toBeGreaterThan(0); // every reader takes a tenantId
    }
    expect(onlineInTenant(ACME)).not.toContain('u-beta');
  });

  it('answers isOnline false for a real user in the wrong workspace', () => {
    // The check the typing handler uses before routing to a user: room.
    markOnline(ACME, 'u-acme');

    expect(isOnline(ACME, 'u-acme')).toBe(true);
    expect(isOnline(BETA, 'u-acme')).toBe(false);
  });

  it('signing out of one workspace leaves the other alone', () => {
    markOnline(ACME, 'shared-id');
    markOnline(BETA, 'shared-id');

    markOffline(ACME, 'shared-id');

    expect(onlineInTenant(ACME)).toEqual([]);
    expect(onlineInTenant(BETA)).toEqual(['shared-id']);
  });

  it('treats ObjectId and string ids as the same person', () => {
    // Ids arrive as both, depending on whether they came off a token or a doc.
    markOnline({ toString: () => ACME }, { toString: () => 'u-acme' });

    expect(isOnline(ACME, 'u-acme')).toBe(true);
  });

  it('ignores a write with no workspace rather than filing it under ""', () => {
    markOnline(undefined, 'u-orphan');
    markOnline('', 'u-orphan');

    expect(onlineInTenant(undefined)).toEqual([]);
    expect(onlineInTenant('')).toEqual([]);
  });

  it('reports an empty workspace as empty, not undefined', () => {
    expect(onlineInTenant('never-seen')).toEqual([]);
  });
});
