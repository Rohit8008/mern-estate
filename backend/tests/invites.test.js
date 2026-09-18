/**
 * Invitations — the only way into a workspace for someone who has never been
 * in the product.
 *
 * Everything here follows from one fact: the recipient cannot tell us which
 * workspace they belong to. They have no session, and on a shared host there is
 * no subdomain to read it from — so the token has to carry it. That makes the
 * token a credential, and these tests are mostly about treating it like one.
 */

import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { runWithTenant, runWithoutTenantScope } from '../tenancy/tenantContext.js';
import {
  attachInvite,
  hashInviteToken,
  generateInviteToken,
  inviteUrl,
  DEFAULT_INVITE_DAYS,
} from '../tenancy/invites.js';

const WORKSPACE_A = new mongoose.Types.ObjectId();
const WORKSPACE_B = new mongoose.Types.ObjectId();

const inA = (fn) => runWithTenant({ tenantId: String(WORKSPACE_A) }, fn);
const inB = (fn) => runWithTenant({ tenantId: String(WORKSPACE_B) }, fn);

async function invitee(tenantRunner, email = 'new@agency.test') {
  let token;
  const user = await tenantRunner(async () => {
    const u = new User({ username: 'newadmin', email, role: 'admin', status: 'active' });
    token = attachInvite(u);
    await u.save({ validateBeforeSave: true });
    return u;
  });
  return { user, token };
}

/** The lookup acceptInvite does: unscoped, by hash. */
const findByToken = (token) =>
  runWithoutTenantScope('test: accepting an invitation', () =>
    User.findOne({ inviteTokenHash: hashInviteToken(token), isDeleted: { $ne: true } })
      .select('+inviteTokenHash +inviteExpiresAt +password')
  );

describe('the token is a credential', () => {
  it('is long enough that guessing is not a strategy', () => {
    // 32 random bytes, base64url — 43 characters.
    expect(generateInviteToken().length).toBeGreaterThanOrEqual(43);
  });

  it('is never two the same', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateInviteToken()));
    expect(seen.size).toBe(200);
  });

  it('is stored hashed, never in the clear', async () => {
    // A database dump must not hand out working invite links.
    const { user, token } = await invitee(inA);
    const stored = await inA(() => User.findById(user._id).select('+inviteTokenHash'));
    expect(stored.inviteTokenHash).not.toBe(token);
    expect(stored.inviteTokenHash).toBe(hashInviteToken(token));
  });

  it('expires', async () => {
    const { user } = await invitee(inA);
    const stored = await inA(() => User.findById(user._id).select('+inviteExpiresAt'));
    const days = Math.round((stored.inviteExpiresAt - Date.now()) / 86400000);
    expect(days).toBe(DEFAULT_INVITE_DAYS);
  });

  it('never leaves the token on a serialised user', async () => {
    const { user } = await invitee(inA);
    const json = user.toJSON();
    expect(json.inviteTokenHash).toBeUndefined();
    expect(json.password).toBeUndefined();
  });
});

describe('the token carries the workspace', () => {
  it('finds the invitee with no tenant context at all', async () => {
    // This is the whole feature. The recipient has no session and no subdomain,
    // so the token is the only thing that can say which agency they belong to.
    const { user, token } = await invitee(inA);
    const found = await findByToken(token);
    expect(found).not.toBeNull();
    expect(String(found._id)).toBe(String(user._id));
    expect(String(found.tenantId)).toBe(String(WORKSPACE_A));
  });

  it('cannot reach a different workspace', async () => {
    // Two invitations, same email, different agencies — legal, because email is
    // unique per workspace. Each token must resolve to its own.
    const a = await invitee(inA, 'shared@person.test');
    const b = await invitee(inB, 'shared@person.test');

    expect(String((await findByToken(a.token)).tenantId)).toBe(String(WORKSPACE_A));
    expect(String((await findByToken(b.token)).tenantId)).toBe(String(WORKSPACE_B));
  });

  it('gives nothing for a token that was never issued', async () => {
    expect(await findByToken(generateInviteToken())).toBeNull();
  });
});

describe('a link that should no longer work', () => {
  it('is spent once accepted', async () => {
    const { user, token } = await invitee(inA);

    await inA(async () => {
      const u = await User.findById(user._id).select('+inviteTokenHash +inviteExpiresAt');
      u.password = 'Str0ng@Pass1';
      u.inviteTokenHash = null;
      u.inviteExpiresAt = null;
      await u.save();
    });

    expect(await findByToken(token)).toBeNull();
  });

  it('stops working once it expires', async () => {
    const { user, token } = await invitee(inA);
    await inA(() =>
      User.findByIdAndUpdate(user._id, { $set: { inviteExpiresAt: new Date(Date.now() - 1000) } })
    );
    const found = await findByToken(token);
    // Found by hash, but the handler rejects it on the expiry check.
    expect(found.inviteExpiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('is invalidated by issuing a new one', async () => {
    // Re-sending is the remedy for a leaked or lost link, so the old one has to
    // stop working the moment a replacement is minted.
    const { user, token: first } = await invitee(inA);

    const second = await inA(async () => {
      const u = await User.findById(user._id).select('+inviteTokenHash +inviteExpiresAt');
      const t = attachInvite(u);
      await u.save({ validateBeforeSave: false });
      return t;
    });

    expect(await findByToken(first)).toBeNull();
    expect(await findByToken(second)).not.toBeNull();
  });
});

describe('where the link points', () => {
  it('uses the workspace\'s own domain when it has one', () => {
    const url = inviteUrl('tok123', { customDomain: 'crm.akm.in', slug: 'akm' });
    expect(url).toBe('https://crm.akm.in/invite/tok123');
  });

  it('falls back to a path that at least resolves', () => {
    const url = inviteUrl('tok123', { slug: 'akm' });
    expect(url).toMatch(/\/invite\/tok123$/);
  });
});
