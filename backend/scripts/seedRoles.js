import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Role from '../models/role.model.js';
import User from '../models/user.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ytreal';

const roles = [
  {
    name: 'Super Admin',
    description: 'Full system access with all permissions',
    isSystem: true,
    permissions: {
      createUser: true, updateUser: true, deleteUser: true, viewUsers: true,
      createClient: true, updateClient: true, deleteClient: true, viewClients: true,
      createOwner: true, updateOwner: true, deleteOwner: true, viewOwners: true, toggleOwnerActive: true,
      createListing: true, updateListing: true, deleteListing: true, viewListings: true, publishListing: true,
      createCategory: true, updateCategory: true, deleteCategory: true, viewCategories: true,
      viewMessages: true, sendMessages: true, deleteMessages: true,
      createBuyerRequirement: true, updateBuyerRequirement: true, deleteBuyerRequirement: true, viewBuyerRequirements: true,
      uploadFiles: true, viewAnalytics: true, exportData: true,
      manageRoles: true, systemSettings: true, viewLogs: true,
    },
  },
  {
    name: 'Sales Manager',
    description: 'Manages clients, deals, and sales pipeline. Full access to CRM sales tools.',
    isSystem: false,
    permissions: {
      viewUsers: true,
      createClient: true, updateClient: true, deleteClient: true, viewClients: true,
      viewOwners: true,
      createListing: true, updateListing: true, viewListings: true, publishListing: true,
      viewCategories: true,
      viewMessages: true, sendMessages: true,
      createBuyerRequirement: true, updateBuyerRequirement: true, deleteBuyerRequirement: true, viewBuyerRequirements: true,
      uploadFiles: true, viewAnalytics: true, exportData: true,
    },
  },
  {
    name: 'Listing Manager',
    description: 'Creates and manages property listings and owners.',
    isSystem: true,
    permissions: {
      createOwner: true, updateOwner: true, viewOwners: true, toggleOwnerActive: true,
      createListing: true, updateListing: true, viewListings: true, publishListing: true,
      viewCategories: true,
      viewMessages: true, sendMessages: true,
      viewBuyerRequirements: true,
      uploadFiles: true,
    },
  },
  {
    name: 'Employee',
    description: 'Basic employee with limited read and create permissions.',
    isSystem: true,
    permissions: {
      viewClients: true,
      viewOwners: true,
      createListing: true, viewListings: true,
      viewCategories: true,
      viewMessages: true, sendMessages: true,
      viewBuyerRequirements: true,
      uploadFiles: true,
    },
  },
  {
    name: 'Viewer',
    description: 'Read-only access to listings, clients, and owners. Cannot create or modify anything.',
    isSystem: false,
    permissions: {
      viewClients: true,
      viewOwners: true,
      viewListings: true,
      viewCategories: true,
      viewMessages: true,
      viewBuyerRequirements: true,
    },
  },
];

async function seedRoles() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Find any admin user to set as createdBy
  const adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) {
    console.error('No admin user found. Run `npm run make-admin` first.');
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const roleData of roles) {
    const existing = await Role.findOne({ name: roleData.name });
    if (existing) {
      console.log(`  SKIP  ${roleData.name} (already exists)`);
      skipped++;
      continue;
    }
    await Role.create({ ...roleData, createdBy: adminUser._id });
    console.log(`  CREATE ${roleData.name}`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  process.exit(0);
}

seedRoles().catch((err) => {
  console.error(err);
  process.exit(1);
});
