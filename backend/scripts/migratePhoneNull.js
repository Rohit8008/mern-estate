import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI is not set in backend/.env');
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
const col = mongoose.connection.collection('users');

// 1. Drop every phone index (sparse or not) so we can replace with partialFilterExpression
for (const name of ['phone_1', 'phone_unique_string']) {
  try {
    await col.dropIndex(name);
    console.log(`Dropped index: ${name}`);
  } catch {
    console.log(`Index ${name} not present — skipping`);
  }
}

// 2. Null out any remaining empty-string phones
const result = await col.updateMany({ phone: '' }, { $set: { phone: null } });
console.log(`Fixed ${result.modifiedCount} user(s) — phone: '' → null`);

// 3. Create the correct index: unique, only on actual string values (null is never indexed)
await col.createIndex(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: 'string' } },
    name: 'phone_unique_string',
  }
);
console.log('Created phone_unique_string index (partialFilterExpression, unique)');

await mongoose.disconnect();
console.log('Done — phone index is now production-safe.');
