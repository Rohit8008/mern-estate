import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcryptjs from 'bcryptjs';
import User from '../models/user.model.js';
import Role from '../models/role.model.js';
import Listing from '../models/listing.model.js';
import Client from '../models/client.model.js';
import Task from '../models/task.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ytreal';

async function ensureRoles(adminUserId) {
  const defaults = Role.getDefaultRoles();
  for (const r of defaults) {
    const existing = await Role.findOne({ name: r.name });
    if (!existing) {
      await Role.create({ ...r, createdBy: adminUserId });
      console.log(`[seed] Created role: ${r.name}`);
    }
  }
}

async function upsertUser({ email, username, role = 'employee', password = 'User@12345', assignedRole = null }) {
  let u = await User.findOne({ email });
  if (!u) {
    const hashed = bcryptjs.hashSync(password, 10);
    u = await User.create({ email, username, password: hashed, role, assignedRole });
    console.log(`[seed] Created ${role} user: ${email}`);
  }
  return u;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('[seed] Connected:', MONGO_URI);
  try {
    // Admin
    const admin = await upsertUser({ email: 'admin@example.com', username: 'admin', role: 'admin', password: 'Admin@12345' });

    // Roles
    await ensureRoles(admin._id);

    // Employees
    const employees = [];
    for (let i = 1; i <= 5; i++) {
      const e = await upsertUser({ email: `agent${i}@example.com`, username: `agent${i}`, role: 'employee', password: 'Agent@12345' });
      employees.push(e);
    }

    // Some sample listings (if none exist) to relate to clients
    const listingsCount = await Listing.estimatedDocumentCount();
    if (listingsCount === 0) {
      for (let i = 1; i <= 3; i++) {
        await Listing.create({
          name: `Sample Property ${i}`,
          description: `Demo property number ${i}`,
          address: `123${i} Market Street`,
          regularPrice: 100000 + i * 5000,
          discountPrice: 95000 + i * 4000,
          bathrooms: 2,
          bedrooms: 3,
          furnished: false,
          parking: true,
          type: 'sale',
          offer: !!(i % 2),
          imageUrls: [],
          category: '',
          attributes: {},
          location: { lat: 0, lng: 0 },
          ownerIds: [],
          userRef: String(admin._id),
          areaName: '',
          plotSize: '',
          sqYard: 0,
          sqYardRate: 0,
          totalValue: 0,
          propertyNo: '',
          remarks: '',
          otherAttachment: '',
        });
      }
      console.log('[seed] Created sample listings');
    }

    const allListings = await Listing.find().limit(5).lean();

    // Clients per employee
    for (const e of employees) {
      for (let i = 1; i <= 4; i++) {
        const c = await Client.create({
          name: `Client ${e.username}-${i}`,
          email: `client_${e.username}_${i}@example.com`,
          phone: `999000${i}${String(e._id).slice(-2)}`,
          status: i % 2 ? 'contacted' : 'lead',
          notes: 'Seed client record',
          tags: ['seed'],
          source: 'seed',
          interestedListings: allListings[i % allListings.length] ? [allListings[i % allListings.length]._id] : [],
          assignedTo: e._id,
          organization: '',
          lastContactAt: null,
          createdBy: admin._id,
        });
        await Task.create({
          title: `Follow up with ${c.name}`,
          description: 'Initial call and requirements gathering',
          dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          status: 'todo',
          priority: 'medium',
          assignedTo: e._id,
          createdBy: admin._id,
          related: { kind: 'client', clientId: c._id },
          reminders: [{ at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) }],
        });
      }
    }

    console.log('[seed] Seeding complete');
  } catch (e) {
    console.error('[seed] Error:', e.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
