import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

registerTenancy(mongoose);

describe('User model indexes', () => {
  it('has no TTL index: on an array path it would delete the whole account', async () => {
    const { default: User } = await import('../models/user.model.js');
    const ttl = User.schema.indexes().filter(([, options]) => options.expireAfterSeconds !== undefined);
    expect(ttl).toEqual([]);
  });
});
