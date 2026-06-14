/**
 * Migration: Convert listing.userRef from String to ObjectId
 *
 * Run once after deploying the updated Listing model:
 *   node --experimental-vm-modules backend/scripts/migrateUserRef.js
 *
 * Safe to re-run — already-migrated documents (userRef already ObjectId) are skipped.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const col = db.collection('listings');

  // Only touch documents where userRef is stored as a plain string
  const cursor = col.find({ userRef: { $type: 'string' } });
  let converted = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    try {
      const oid = new mongoose.Types.ObjectId(doc.userRef);
      await col.updateOne({ _id: doc._id }, { $set: { userRef: oid } });
      converted++;
    } catch {
      console.warn(`  Skipping ${doc._id}: userRef "${doc.userRef}" is not a valid ObjectId`);
      skipped++;
    }
  }

  console.log(`Migration complete — converted: ${converted}, skipped: ${skipped}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
