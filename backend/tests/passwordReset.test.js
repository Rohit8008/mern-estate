/**
 * Password reset — the enumeration fix, and the cap that has to come with it.
 *
 * This flow is reachable by anyone: no session, no workspace, no cost. It used
 * to answer 404 "User not found" for an address it did not recognise, which
 * made it a membership oracle — feed it addresses, learn which ones belong to
 * customers of this workspace. The fix is that every outcome looks the same,
 * and "the same" has to mean status, body, fields and roughly timing, not just
 * one of them.
 *
 * The attempt cap is here because a generic response alone would leave the
 * weaker hole open: a six-digit code with a ten-minute life is only safe if
 * guessing is bounded.
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { requestPasswordReset, resetPasswordWithOtp } from '../controllers/user.controller.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let tenantId;
const inWorkspace = (fn) => runWithTenant({ tenantId: String(tenantId) }, fn);

beforeEach(() => {
  tenantId = global.testUtils.tenantId;
});

/** Drive a controller and capture whatever it produced — body, status, or error. */
function call(handler, body = {}) {
  return inWorkspace(
    () =>
      new Promise((resolve) => {
        const req = { body, ip: '127.0.0.1', headers: {}, originalUrl: '/api/user/password' };
        const res = {
          __status: 200,
          status(code) { this.__status = code; return this; },
          json(payload) { resolve({ status: this.__status, body: payload }); return this; },
        };
        Promise.resolve(handler(req, res, (err) =>
          resolve({ status: err?.statusCode || 500, body: { message: err?.message } })
        )).catch((err) => resolve({ status: 500, body: { message: err.message } }));
      })
  );
}

async function makeUser(email = 'real@agency.test') {
  return inWorkspace(() =>
    User.create({ username: 'real', email, password: 'Str0ng@Pass1', role: 'employee' })
  );
}

/** Put a known code on the account, the way requestPasswordReset would. */
async function giveCode(user, code = '123456', { expired = false, attempts = 0 } = {}) {
  await inWorkspace(() =>
    User.findByIdAndUpdate(user._id, {
      $set: {
        passwordResetOtpHash: crypto.createHash('sha256').update(code).digest('hex'),
        passwordResetOtpExpires: new Date(Date.now() + (expired ? -1000 : 600000)),
        passwordResetOtpAttempts: attempts,
      },
    })
  );
}

describe('requesting a code tells you nothing about who has an account', () => {
  it('answers a real and an unknown address identically', async () => {
    await makeUser('real@agency.test');

    const known = await call(requestPasswordReset, { email: 'real@agency.test' });
    const unknown = await call(requestPasswordReset, { email: 'ghost@agency.test' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    // Same fields, not merely the same message — an extra key is a tell too.
    expect(Object.keys(known.body).sort()).toEqual(Object.keys(unknown.body).sort());
  });

  it('never says "user not found"', async () => {
    const res = await call(requestPasswordReset, { email: 'ghost@agency.test' });
    expect(res.body.message).not.toMatch(/not found/i);
    expect(res.body.message).toMatch(/if that address has an account/i);
  });

  it('does not mint a code for an address with no account', async () => {
    await call(requestPasswordReset, { email: 'ghost@agency.test' });
    const ghost = await inWorkspace(() => User.findOne({ email: 'ghost@agency.test' }));
    expect(ghost).toBeNull();
  });

  it('still issues a real code to a real account', async () => {
    const user = await makeUser();
    await call(requestPasswordReset, { email: user.email });
    const after = await inWorkspace(() =>
      User.findById(user._id).select('+passwordResetOtpHash +passwordResetOtpExpires')
    );
    expect(after.passwordResetOtpHash).toBeTruthy();
    expect(after.passwordResetOtpExpires.getTime()).toBeGreaterThan(Date.now());
  });

  it('resets the attempt counter, so a new code is a clean slate', async () => {
    const user = await makeUser();
    await giveCode(user, '111111', { attempts: 4 });
    await call(requestPasswordReset, { email: user.email });
    const after = await inWorkspace(() =>
      User.findById(user._id).select('+passwordResetOtpAttempts')
    );
    expect(after.passwordResetOtpAttempts).toBe(0);
  });
});

describe('completing a reset tells you nothing either', () => {
  it('gives the same answer for an unknown address as for a wrong code', async () => {
    const user = await makeUser();
    await giveCode(user, '123456');

    const wrongCode = await call(resetPasswordWithOtp, {
      email: user.email, otp: '999999', newPassword: 'N3w@Password',
    });
    const unknownUser = await call(resetPasswordWithOtp, {
      email: 'ghost@agency.test', otp: '999999', newPassword: 'N3w@Password',
    });

    expect(wrongCode.status).toBe(unknownUser.status);
    expect(wrongCode.body.message).toBe(unknownUser.body.message);
    expect(wrongCode.body.message).not.toMatch(/not found/i);
  });

  it('gives that same answer for an expired code', async () => {
    const user = await makeUser();
    await giveCode(user, '123456', { expired: true });
    const res = await call(resetPasswordWithOtp, {
      email: user.email, otp: '123456', newPassword: 'N3w@Password',
    });
    expect(res.body.message).toMatch(/not valid or has expired/i);
  });

  it('accepts the right code', async () => {
    const user = await makeUser();
    await giveCode(user, '123456');
    const res = await call(resetPasswordWithOtp, {
      email: user.email, otp: '123456', newPassword: 'N3w@Password',
    });
    expect(res.status).toBe(200);

    const after = await inWorkspace(() =>
      User.findById(user._id).select('+password +passwordResetOtpHash +passwordResetOtpAttempts')
    );
    // Consumed, so the code cannot be replayed.
    expect(after.passwordResetOtpHash).toBeNull();
    expect(after.passwordResetOtpAttempts).toBe(0);
    expect(await after.comparePassword?.('N3w@Password') ?? true).toBeTruthy();
  });

  it('holds a reset to the same password policy as everywhere else', async () => {
    // Otherwise "forgot password" is the way around the rules.
    const user = await makeUser();
    await giveCode(user, '123456');
    const res = await call(resetPasswordWithOtp, {
      email: user.email, otp: '123456', newPassword: 'weak',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/uppercase/i);
  });
});

describe('guessing is bounded', () => {
  it('counts wrong guesses', async () => {
    const user = await makeUser();
    await giveCode(user, '123456');

    for (let i = 1; i <= 3; i += 1) {
      await call(resetPasswordWithOtp, {
        email: user.email, otp: '000000', newPassword: 'N3w@Password',
      });
      const after = await inWorkspace(() =>
        User.findById(user._id).select('+passwordResetOtpAttempts')
      );
      expect(after.passwordResetOtpAttempts).toBe(i);
    }
  });

  it('burns the code at the cap, so the right one no longer works', async () => {
    const user = await makeUser();
    await giveCode(user, '123456');

    for (let i = 0; i < 5; i += 1) {
      await call(resetPasswordWithOtp, {
        email: user.email, otp: '000000', newPassword: 'N3w@Password',
      });
    }

    const burned = await inWorkspace(() =>
      User.findById(user._id).select('+passwordResetOtpHash')
    );
    expect(burned.passwordResetOtpHash).toBeNull();

    // Even the correct code is dead — the remedy is to request a new one.
    const res = await call(resetPasswordWithOtp, {
      email: user.email, otp: '123456', newPassword: 'N3w@Password',
    });
    expect(res.status).toBe(400);
  });

  it('does not lock the account itself — a new code still works', async () => {
    // Burning the code rather than the account means this cannot be used to
    // lock somebody out of their own workspace.
    const user = await makeUser();
    await giveCode(user, '123456', { attempts: 5 });

    await call(requestPasswordReset, { email: user.email });
    await giveCode(user, '654321');

    const res = await call(resetPasswordWithOtp, {
      email: user.email, otp: '654321', newPassword: 'N3w@Password',
    });
    expect(res.status).toBe(200);
  });
});
