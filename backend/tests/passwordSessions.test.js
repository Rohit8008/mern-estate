/**
 * Password changes end sessions, and employee invites can be re-sent.
 *
 *  - changePassword / reset / admin reset drop every stored refresh token;
 *    a self-change keeps the calling device on a fresh pair.
 *  - /refresh refuses a refresh JWT minted before passwordChangedAt, even if
 *    its hash is still stored.
 *  - POST /user/employee/:id/invite mints a new link; the old one stops working.
 */

import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import authRouter from '../routes/auth.route.js';
import userRouter from '../routes/user.route.js';
import { globalErrorHandler } from '../utils/error.js';
import { resolveTenant } from '../tenancy/resolveTenant.js';
import { config } from '../config/environment.js';
import { hashInviteToken } from '../tenancy/invites.js';

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const GOOD = 'Str0ng@Pass1';
const NEW = 'N3w!Passw0rd#';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', resolveTenant());
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use(globalErrorHandler);

const asTenant = (fn) => global.testUtils.asTestTenant(fn);
const tid = () => String(global.testUtils.tenantId);

let phoneSeq = 5550000;
async function makeUser(overrides = {}) {
  return global.testUtils.createTestUser(User, { password: GOOD, role: 'employee', phone: String(++phoneSeq), ...overrides });
}

function tokensFor(user, { iat } = {}) {
  const payload = { id: String(user._id), tid: tid(), ...(iat ? { iat } : {}) };
  return {
    access: jwt.sign(payload, config.jwt.secret, { expiresIn: '15m', issuer: config.jwt.issuer, audience: config.jwt.audience }),
    refresh: jwt.sign(payload, process.env.REFRESH_SECRET || config.jwt.refreshSecret, { expiresIn: '7d', issuer: config.jwt.issuer, audience: config.jwt.audience }),
  };
}

async function storeRefresh(user, ...tokens) {
  await asTenant(() =>
    User.updateOne({ _id: user._id }, { $set: { refreshTokens: tokens.map((t) => ({ token: hashToken(t) })) } })
  );
}

const stored = async (user) =>
  (await asTenant(() => User.findById(user._id).select('+refreshTokens').lean())).refreshTokens || [];

describe('self password change', () => {
  it('drops every other refresh token and keeps this device signed in on a new pair', async () => {
    const user = await makeUser({ email: 'self@agency.test', username: 'self' });
    const mine = tokensFor(user);
    const other = tokensFor(user);
    await storeRefresh(user, mine.refresh, other.refresh + 'x');

    const res = await request(app)
      .post('/api/user/password/change')
      .set('Cookie', [`access_token=${mine.access}`, `refresh_token=${mine.refresh}`])
      .send({ currentPassword: GOOD, newPassword: NEW });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toContain('refresh_token=');
    const newRefresh = /refresh_token=([^;]+)/.exec(cookies)[1];

    const list = await stored(user);
    expect(list).toHaveLength(1);
    expect(list[0].token).toBe(hashToken(newRefresh));
    expect(list[0].token).not.toBe(hashToken(mine.refresh));

    // The new refresh token is a real, current JWT for this user...
    const claims = jwt.verify(newRefresh, config.jwt.refreshSecret);
    expect(claims.id).toBe(String(user._id));
    expect(claims.iat).toBeGreaterThanOrEqual(Math.floor((await asTenant(() => User.findById(user._id).select('+passwordChangedAt').lean())).passwordChangedAt.getTime() / 1000));
    // ...the old one does not work any more.
    const old = await request(app).post('/api/auth/refresh').set('Cookie', [`refresh_token=${mine.refresh}`]).send();
    expect(old.status).toBe(401);
  });
});

describe('refresh checks passwordChangedAt', () => {
  it('rejects a refresh JWT issued before the password changed, though its hash is stored', async () => {
    const user = await makeUser({ email: 'stale@agency.test', username: 'stale' });
    const past = Math.floor(Date.now() / 1000) - 3600;
    const t = tokensFor(user, { iat: past });
    await storeRefresh(user, t.refresh);
    await asTenant(() => User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date() } }));

    const res = await request(app).post('/api/auth/refresh').set('Cookie', [`refresh_token=${t.refresh}`]).send();
    expect(res.status).toBe(401);
    expect(await stored(user)).toHaveLength(0);
  });

  it('still accepts a token issued after the change', async () => {
    const user = await makeUser({ email: 'fresh@agency.test', username: 'fresh' });
    await asTenant(() =>
      User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date(Date.now() - 3600 * 1000) } })
    );
    const t = tokensFor(user);
    await storeRefresh(user, t.refresh);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', [`refresh_token=${t.refresh}`]).send();
    expect(res.status).toBe(200);
  });
});

describe('OTP password reset', () => {
  it('clears every refresh token', async () => {
    const user = await makeUser({ email: 'otp@example.com', username: 'otp' });
    await storeRefresh(user, tokensFor(user).refresh);
    await asTenant(() =>
      User.updateOne(
        { _id: user._id },
        { $set: { passwordResetOtpHash: crypto.createHash('sha256').update('123456').digest('hex'), passwordResetOtpExpires: new Date(Date.now() + 600000) } }
      )
    );
    const res = await request(app).post('/api/user/password/reset').send({ email: 'otp@example.com', otp: '123456', newPassword: NEW });
    expect(res.body.message).toBe('Password updated');
    expect(await stored(user)).toHaveLength(0);
  });
});

describe('admin set-employee-password', () => {
  it('clears the employee refresh tokens', async () => {
    const admin = await makeUser({ email: 'adm@agency.test', username: 'adm', role: 'admin' });
    const emp = await makeUser({ email: 'emp@agency.test', username: 'emp' });
    await storeRefresh(emp, tokensFor(emp).refresh);

    const res = await request(app)
      .post(`/api/user/admin/set-employee-password/${emp._id}`)
      .set('Cookie', [`access_token=${tokensFor(admin).access}`])
      .send({ newPassword: NEW });
    expect(res.status).toBe(200);
    expect(await stored(emp)).toHaveLength(0);
  });
});

describe('resend employee invite', () => {
  async function invited() {
    const admin = await makeUser({ email: 'adm2@agency.test', username: 'adm2', role: 'admin' });
    const emp = await makeUser({ email: 'inv@agency.test', username: 'inv' });
    const oldToken = 'old-token-value';
    await asTenant(() =>
      User.updateOne(
        { _id: emp._id },
        { $set: { inviteTokenHash: hashInviteToken(oldToken), inviteExpiresAt: new Date(Date.now() + 86400000) } }
      )
    );
    return { admin, emp, oldToken };
  }
  const readInvite = (u) =>
    asTenant(() => User.findById(u._id).select('+inviteTokenHash +previousInviteTokenHashes').lean());

  it('mints a new link that replaces the old one', async () => {
    const { admin, emp, oldToken } = await invited();
    const res = await request(app)
      .post(`/api/user/employee/${emp._id}/invite`)
      .set('Cookie', [`access_token=${tokensFor(admin).access}`])
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.inviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]+/);
    const token = res.body.inviteUrl.split('/invite/')[1];
    const row = await readInvite(emp);
    expect(row.inviteTokenHash).toBe(hashInviteToken(token));
    expect(row.inviteTokenHash).not.toBe(hashInviteToken(oldToken));
    expect(row.previousInviteTokenHashes).toContain(hashInviteToken(oldToken));
  });

  it('is admin only', async () => {
    const { emp } = await invited();
    const other = await makeUser({ email: 'peer@agency.test', username: 'peer' });
    const res = await request(app)
      .post(`/api/user/employee/${emp._id}/invite`)
      .set('Cookie', [`access_token=${tokensFor(other).access}`])
      .send({});
    expect(res.status).toBe(403);
  });

  it('refuses someone who has already accepted', async () => {
    const admin = await makeUser({ email: 'adm3@agency.test', username: 'adm3', role: 'admin' });
    const emp = await makeUser({ email: 'done@agency.test', username: 'done' });
    const res = await request(app)
      .post(`/api/user/employee/${emp._id}/invite`)
      .set('Cookie', [`access_token=${tokensFor(admin).access}`])
      .send({});
    expect(res.status).toBe(409);
  });
});
