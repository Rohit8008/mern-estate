/**
 * seedFresh.js — wipes all collections and inserts clean sample data.
 *
 * Usage (from /backend):
 *   node scripts/seedFresh.js
 *
 * The first admin user in the DB is kept and used as the owner.
 * A demo employee + seller are created fresh.
 */

import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

import User            from '../models/user.model.js';
import Listing         from '../models/listing.model.js';
import Owner           from '../models/owner.model.js';
import Client          from '../models/client.model.js';
import Task            from '../models/task.model.js';
import BuyerRequirement from '../models/buyerRequirement.model.js';
import Category        from '../models/category.model.js';
import PropertyType    from '../models/propertyType.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ytreal';

function days(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected');

  // ── Keep admin, wipe everything else ──────────────────────────────────────
  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  if (!admin) {
    console.error('No admin found. Run: npm run make-admin first.');
    process.exit(1);
  }
  console.log(`✓ Admin kept: ${admin.email}`);

  await Promise.all([
    Listing.deleteMany({}),
    Owner.deleteMany({}),
    Client.deleteMany({}),
    Task.deleteMany({}),
    BuyerRequirement.deleteMany({}),
    Category.deleteMany({}),
    PropertyType.deleteMany({}),
    User.deleteMany({ _id: { $ne: admin._id } }),
  ]);
  console.log('✓ Collections cleared');

  // ── Demo users ────────────────────────────────────────────────────────────
  const pw = (p) => bcryptjs.hash(p, 10);

  const [emp1, emp2, seller1] = await User.insertMany([
    {
      username: 'arjun_mehta', firstName: 'Arjun', lastName: 'Mehta',
      email: 'arjun.mehta@demo.salescode.ai', password: await pw('Agent@123'),
      role: 'employee', status: 'active',
    },
    {
      username: 'priya_kapoor', firstName: 'Priya', lastName: 'Kapoor',
      email: 'priya.kapoor@demo.salescode.ai', password: await pw('Agent@123'),
      role: 'employee', status: 'active',
    },
    {
      username: 'ravi_builder', firstName: 'Ravi', lastName: 'Sharma',
      email: 'ravi.seller@demo.com', password: await pw('Seller@123'),
      role: 'seller', status: 'active',
    },
  ]);
  console.log('✓ Users: arjun.mehta, priya.kapoor, ravi.seller (password Agent@123 / Seller@123)');

  const adminId = admin._id;
  const emp1Id  = emp1._id;
  const emp2Id  = emp2._id;

  // ── Property Types ────────────────────────────────────────────────────────
  const ptDefs = [
    {
      name: 'Apartment', slug: 'apartment', category: 'residential', order: 1, isActive: true,
      fields: [
        { key: 'bhk', label: 'BHK', type: 'select', required: true, order: 1, options: ['1 BHK','2 BHK','3 BHK','4 BHK','5+ BHK'] },
        { key: 'floor', label: 'Floor', type: 'number', required: false, order: 2, min: 0, max: 100 },
        { key: 'totalFloors', label: 'Total Floors', type: 'number', required: false, order: 3, min: 1, max: 100 },
        { key: 'ageOfProperty', label: 'Age (years)', type: 'number', required: false, order: 4, min: 0, max: 100 },
        { key: 'facing', label: 'Facing', type: 'select', required: false, order: 5, options: ['North','South','East','West','North-East','North-West','South-East','South-West'] },
      ],
    },
    {
      name: 'Villa', slug: 'villa', category: 'residential', order: 2, isActive: true,
      fields: [
        { key: 'bhk', label: 'BHK', type: 'select', required: true, order: 1, options: ['3 BHK','4 BHK','5 BHK','5+ BHK'] },
        { key: 'plotArea', label: 'Plot Area (sq yd)', type: 'number', required: false, order: 2, min: 100 },
        { key: 'gardenArea', label: 'Garden Area (sq ft)', type: 'number', required: false, order: 3 },
        { key: 'facing', label: 'Facing', type: 'select', required: false, order: 4, options: ['North','South','East','West','North-East','North-West'] },
      ],
    },
    {
      name: 'Independent House', slug: 'independent-house', category: 'residential', order: 3, isActive: true,
      fields: [
        { key: 'bhk', label: 'BHK', type: 'select', required: true, order: 1, options: ['2 BHK','3 BHK','4 BHK','5+ BHK'] },
        { key: 'floors', label: 'No. of Floors', type: 'number', required: false, order: 2, min: 1, max: 10 },
        { key: 'plotArea', label: 'Plot Area (sq yd)', type: 'number', required: false, order: 3 },
      ],
    },
    {
      name: 'Office Space', slug: 'office-space', category: 'commercial', order: 4, isActive: true,
      fields: [
        { key: 'cabins', label: 'Cabins', type: 'number', required: false, order: 1, min: 0 },
        { key: 'conferenceRooms', label: 'Conference Rooms', type: 'number', required: false, order: 2, min: 0 },
        { key: 'pantry', label: 'Pantry', type: 'boolean', required: false, order: 3 },
        { key: 'floorNo', label: 'Floor', type: 'number', required: false, order: 4, min: 0 },
      ],
    },
    {
      name: 'Shop / Showroom', slug: 'shop-showroom', category: 'commercial', order: 5, isActive: true,
      fields: [
        { key: 'frontage', label: 'Frontage (ft)', type: 'number', required: false, order: 1, min: 0 },
        { key: 'cornerProperty', label: 'Corner Property', type: 'boolean', required: false, order: 2 },
        { key: 'floorNo', label: 'Floor', type: 'select', required: false, order: 3, options: ['Ground','Mezzanine','1st','2nd','Basement'] },
      ],
    },
    {
      name: 'Plot / Land', slug: 'plot-land', category: 'land', order: 6, isActive: true,
      fields: [
        { key: 'plotType', label: 'Plot Type', type: 'select', required: true, order: 1, options: ['Residential Plot','Commercial Plot','Agricultural','Industrial','NA Plot'] },
        { key: 'roadWidth', label: 'Road Width (ft)', type: 'number', required: false, order: 2, min: 0 },
        { key: 'boundaryWall', label: 'Boundary Wall', type: 'boolean', required: false, order: 3 },
        { key: 'cornerPlot', label: 'Corner Plot', type: 'boolean', required: false, order: 4 },
      ],
    },
  ];
  const pts = await PropertyType.insertMany(ptDefs);
  const ptMap = Object.fromEntries(pts.map((p) => [p.slug, p._id]));
  console.log(`✓ Property Types: ${pts.length}`);

  // ── Categories ────────────────────────────────────────────────────────────
  const catDefs = [
    {
      name: 'Residential — Sale',
      slug: 'residential-sale',
      fields: [
        { key: 'possessionStatus', label: 'Possession Status', type: 'select', required: true, order: 1, options: ['Ready to Move','Under Construction','Pre-Launch'] },
        { key: 'constructionQuality', label: 'Construction Quality', type: 'select', required: false, order: 2, options: ['Premium','Standard','Budget'] },
        { key: 'amenities', label: 'Amenities', type: 'select', required: false, order: 3, multiple: true, options: ['Swimming Pool','Gym','Clubhouse','24/7 Security','Power Backup','Children Play Area','Tennis Court','Jogging Track'] },
        { key: 'loanApproved', label: 'Bank Loan Approved', type: 'boolean', required: false, order: 4 },
        { key: 'approvedBy', label: 'Approved By', type: 'select', required: false, order: 5, options: ['RERA','SBI','HDFC','ICICI','Axis','LIC HFL','PNB Housing'] },
        { key: 'carpetArea', label: 'Carpet Area (sq ft)', type: 'number', required: false, order: 6, min: 0, unit: 'sq ft' },
        { key: 'superBuiltUp', label: 'Super Built-up Area (sq ft)', type: 'number', required: false, order: 7, min: 0, unit: 'sq ft' },
        { key: 'maintenanceCharge', label: 'Maintenance (₹/month)', type: 'number', required: false, order: 8, min: 0 },
      ],
    },
    {
      name: 'Residential — Rent',
      slug: 'residential-rent',
      fields: [
        { key: 'availableFrom', label: 'Available From', type: 'date', required: true, order: 1 },
        { key: 'tenantPreference', label: 'Preferred Tenant', type: 'select', required: false, order: 2, options: ['Family','Bachelors','Any','Company Lease'] },
        { key: 'deposit', label: 'Security Deposit (₹)', type: 'number', required: false, order: 3, min: 0 },
        { key: 'furnishing', label: 'Furnishing', type: 'select', required: true, order: 4, options: ['Fully Furnished','Semi Furnished','Unfurnished'] },
        { key: 'amenities', label: 'Amenities', type: 'select', required: false, order: 5, multiple: true, options: ['AC','Geyser','Modular Kitchen','Wardrobes','Washing Machine','TV','WiFi','Gym','Swimming Pool'] },
        { key: 'carpetArea', label: 'Carpet Area (sq ft)', type: 'number', required: false, order: 6, min: 0, unit: 'sq ft' },
        { key: 'lockInPeriod', label: 'Lock-in Period (months)', type: 'number', required: false, order: 7, min: 0 },
      ],
    },
    {
      name: 'Commercial — Sale',
      slug: 'commercial-sale',
      fields: [
        { key: 'possessionStatus', label: 'Possession Status', type: 'select', required: true, order: 1, options: ['Ready to Move','Under Construction','Pre-Launch'] },
        { key: 'carpetArea', label: 'Carpet Area (sq ft)', type: 'number', required: false, order: 2, unit: 'sq ft' },
        { key: 'superBuiltUp', label: 'Super Built-up (sq ft)', type: 'number', required: false, order: 3, unit: 'sq ft' },
        { key: 'liftAccess', label: 'Lift Access', type: 'boolean', required: false, order: 4 },
        { key: 'powerBackup', label: 'Power Backup', type: 'boolean', required: false, order: 5 },
        { key: 'ownershipType', label: 'Ownership', type: 'select', required: false, order: 6, options: ['Freehold','Leasehold','Co-operative Society'] },
      ],
    },
    {
      name: 'Commercial — Rent',
      slug: 'commercial-rent',
      fields: [
        { key: 'availableFrom', label: 'Available From', type: 'date', required: true, order: 1 },
        { key: 'leaseDuration', label: 'Lease Duration (months)', type: 'number', required: false, order: 2, min: 1 },
        { key: 'deposit', label: 'Security Deposit (₹)', type: 'number', required: false, order: 3, min: 0 },
        { key: 'carpetArea', label: 'Carpet Area (sq ft)', type: 'number', required: false, order: 4, unit: 'sq ft' },
        { key: 'cam', label: 'CAM Charges (₹/month)', type: 'number', required: false, order: 5, min: 0 },
        { key: 'fitOutStatus', label: 'Fit-out Status', type: 'select', required: false, order: 6, options: ['Bare Shell','Warm Shell','Fully Fitted'] },
      ],
    },
    {
      name: 'Plots & Land',
      slug: 'plots-land',
      fields: [
        { key: 'plotArea', label: 'Plot Area (sq yd)', type: 'number', required: true, order: 1, unit: 'sq yd' },
        { key: 'plotAreaSqFt', label: 'Plot Area (sq ft)', type: 'number', required: false, order: 2, unit: 'sq ft' },
        { key: 'dimensions', label: 'Dimensions (W × D)', type: 'text', required: false, order: 3 },
        { key: 'zoningStatus', label: 'Zoning', type: 'select', required: false, order: 4, options: ['Residential','Commercial','Industrial','Agricultural','Mixed Use'] },
        { key: 'approvals', label: 'Approvals', type: 'select', required: false, order: 5, multiple: true, options: ['RERA','Municipality','Gram Panchayat','HMDA','DTCP','NA Conversion'] },
        { key: 'access', label: 'Road Access', type: 'select', required: false, order: 6, options: ['60 ft Road','40 ft Road','30 ft Road','24 ft Road','Less than 24 ft'] },
      ],
    },
  ];
  const cats = await Category.insertMany(catDefs);
  const catMap = Object.fromEntries(cats.map((c) => [c.slug, c._id]));
  console.log(`✓ Categories: ${cats.length}`);

  // ── Owners ────────────────────────────────────────────────────────────────
  const owners = await Owner.insertMany([
    { name: 'Rajesh Kumar',   phone: '9811100001', email: 'rajesh.kumar@demo.com',   city: 'Mumbai',      state: 'Maharashtra', notes: 'Multiple flats in Andheri. Prefers WhatsApp.' },
    { name: 'Sunita Sharma',  phone: '9811100002', email: 'sunita.sharma@demo.com',  city: 'Pune',        state: 'Maharashtra', notes: 'Inherited property, wants quick sale.' },
    { name: 'Anil Patel',     phone: '9811100003', email: 'anil.patel@demo.com',     city: 'Mumbai',      state: 'Maharashtra', companyName: 'Patel Builders', notes: 'Developer. Portfolio of 8 units.' },
    { name: 'Kavita Mehta',   phone: '9811100004', email: 'kavita.mehta@demo.com',   city: 'Thane',       state: 'Maharashtra', notes: 'NRI-owned flat. POA with brother.' },
    { name: 'Deepak Reddy',   phone: '9811100005', email: 'deepak.reddy@demo.com',   city: 'Hyderabad',   state: 'Telangana',   companyName: 'Reddy Properties', notes: 'Commercial space specialist.' },
    { name: 'Meena Agarwal',  phone: '9811100006', email: 'meena.agarwal@demo.com',  city: 'Navi Mumbai', state: 'Maharashtra', notes: 'Land plots in Panvel area.' },
    { name: 'Suresh Joshi',   phone: '9811100007', email: 'suresh.joshi@demo.com',   city: 'Mumbai',      state: 'Maharashtra', notes: 'Sea-facing flat owner, premium segment.' },
    { name: 'Rina Bose',      phone: '9811100008', email: 'rina.bose@demo.com',      city: 'Mumbai',      state: 'Maharashtra', notes: 'Old property, needs renovation estimate before listing.' },
  ]);
  const oIds = owners.map((o) => o._id);
  console.log(`✓ Owners: ${owners.length}`);

  // ── Listings ──────────────────────────────────────────────────────────────
  const APT_IMGS  = ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800','https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800','https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800'];
  const VILLA_IMGS = ['https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800','https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800'];
  const COMM_IMGS  = ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800','https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800'];
  const LAND_IMGS  = ['https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800','https://images.unsplash.com/photo-1544724107-6d5e5a7a80a5?w=800'];

  const listings = await Listing.insertMany([
    // ── Residential for Sale ──────────────────────────────────────────────
    {
      name: '3 BHK Premium Apartment in Bandra West',
      description: 'Spacious 3 BHK in a premium gated community with stunning sea views. Modular kitchen, vitrified flooring, large balconies. Walking distance to Carter Road.',
      address: 'Sea Breeze Towers, Bandra West, Mumbai - 400050',
      city: 'Mumbai', locality: 'Bandra West', state: 'Maharashtra', pincode: '400050',
      regularPrice: 32500000, discountPrice: 31000000, offer: true,
      type: 'sale', bedrooms: 3, bathrooms: 3, furnished: true, parking: true,
      status: 'available', propertyCategory: 'residential',
      propertyType: 'apartment',
      category: 'residential-sale',
      imageUrls: APT_IMGS,
      ownerIds: [oIds[6]],
      assignedAgent: emp1Id,
      userRef: adminId,
      areaSqFt: 1650,
      attributes: { possessionStatus: 'Ready to Move', constructionQuality: 'Premium', amenities: ['Swimming Pool','Gym','Clubhouse','24/7 Security'], loanApproved: true, approvedBy: 'HDFC', carpetArea: 1320, superBuiltUp: 1650, maintenanceCharge: 8500 },
      propertyTypeFields: { bhk: '3 BHK', floor: 14, totalFloors: 22, ageOfProperty: 3, facing: 'West' },
    },
    {
      name: '2 BHK Apartment in Powai',
      description: 'Well-maintained 2 BHK in Hiranandani Gardens with lake view. Semi-furnished with wardrobe and AC. Close to schools and IT parks.',
      address: 'Hiranandani Gardens, Powai, Mumbai - 400076',
      city: 'Mumbai', locality: 'Powai', state: 'Maharashtra', pincode: '400076',
      regularPrice: 14800000, offer: false, type: 'sale', bedrooms: 2, bathrooms: 2,
      furnished: true, parking: true, status: 'available', propertyCategory: 'residential',
      propertyType: 'apartment', category: 'residential-sale',
      imageUrls: APT_IMGS,
      ownerIds: [oIds[0]],
      assignedAgent: emp1Id, userRef: adminId, areaSqFt: 1050,
      attributes: { possessionStatus: 'Ready to Move', constructionQuality: 'Standard', amenities: ['Swimming Pool','Gym','Power Backup'], loanApproved: true, approvedBy: 'SBI', carpetArea: 840, superBuiltUp: 1050, maintenanceCharge: 4200 },
      propertyTypeFields: { bhk: '2 BHK', floor: 8, totalFloors: 18, ageOfProperty: 7, facing: 'East' },
    },
    {
      name: '4 BHK Luxury Villa in Lonavala',
      description: 'Stunning 4 BHK villa with private pool and garden. Panoramic valley views. Perfect weekend getaway or full-time residence. 2 car garage.',
      address: 'Green Valley Estates, Lonavala, Pune - 410401',
      city: 'Lonavala', locality: 'Frichley Hills', state: 'Maharashtra', pincode: '410401',
      regularPrice: 28000000, offer: false, type: 'sale', bedrooms: 4, bathrooms: 4,
      furnished: true, parking: true, status: 'available', propertyCategory: 'residential',
      propertyType: 'villa', category: 'residential-sale',
      imageUrls: VILLA_IMGS,
      ownerIds: [oIds[2]],
      assignedAgent: emp2Id, userRef: adminId, areaSqFt: 3200,
      attributes: { possessionStatus: 'Ready to Move', constructionQuality: 'Premium', amenities: ['Swimming Pool','Gym','Clubhouse','24/7 Security','Power Backup'], loanApproved: false, carpetArea: 2800, superBuiltUp: 3200, maintenanceCharge: 15000 },
      propertyTypeFields: { bhk: '4 BHK', plotArea: 450, gardenArea: 2400, facing: 'North-East' },
    },
    {
      name: '3 BHK Independent House in Kothrud',
      description: 'Well-built independent house with a puja room, 2 balconies, and terrace access. Ground floor with garden. Quiet residential area near Chandni Chowk.',
      address: 'Mangalwar Peth, Kothrud, Pune - 411038',
      city: 'Pune', locality: 'Kothrud', state: 'Maharashtra', pincode: '411038',
      regularPrice: 9500000, offer: false, type: 'sale', bedrooms: 3, bathrooms: 2,
      furnished: false, parking: true, status: 'under_negotiation', propertyCategory: 'residential',
      propertyType: 'independent-house', category: 'residential-sale',
      imageUrls: APT_IMGS,
      ownerIds: [oIds[1]],
      assignedAgent: emp1Id, userRef: adminId, areaSqFt: 1800,
      attributes: { possessionStatus: 'Ready to Move', constructionQuality: 'Standard', amenities: ['Power Backup'], loanApproved: true, approvedBy: 'SBI', carpetArea: 1600, superBuiltUp: 1800, maintenanceCharge: 1200 },
      propertyTypeFields: { bhk: '3 BHK', floors: 2, plotArea: 120 },
    },
    {
      name: '1 BHK Starter Apartment in Thane West',
      description: 'Compact yet well-designed 1 BHK perfect for first-time buyers. Modern amenities, close to Thane railway station. Good rental yield potential.',
      address: 'Majiwada, Thane West, Thane - 400601',
      city: 'Thane', locality: 'Majiwada', state: 'Maharashtra', pincode: '400601',
      regularPrice: 5800000, offer: false, type: 'sale', bedrooms: 1, bathrooms: 1,
      furnished: false, parking: false, status: 'available', propertyCategory: 'residential',
      propertyType: 'apartment', category: 'residential-sale',
      imageUrls: APT_IMGS,
      ownerIds: [oIds[3]],
      assignedAgent: emp2Id, userRef: adminId, areaSqFt: 480,
      attributes: { possessionStatus: 'Ready to Move', constructionQuality: 'Standard', amenities: ['24/7 Security','Power Backup'], loanApproved: true, approvedBy: 'ICICI', carpetArea: 390, superBuiltUp: 480, maintenanceCharge: 1800 },
      propertyTypeFields: { bhk: '1 BHK', floor: 3, totalFloors: 12, ageOfProperty: 5, facing: 'South' },
    },
    {
      name: '2 BHK Apartment — Sold',
      description: 'Recently sold 2 BHK. Kept for record. Buyer was referred by Priya Kapoor.',
      address: 'Chembur, Mumbai - 400071',
      city: 'Mumbai', locality: 'Chembur', state: 'Maharashtra', pincode: '400071',
      regularPrice: 11500000, offer: false, type: 'sale', bedrooms: 2, bathrooms: 2,
      furnished: true, parking: true, status: 'sold', propertyCategory: 'residential',
      propertyType: 'apartment', category: 'residential-sale',
      imageUrls: APT_IMGS,
      ownerIds: [oIds[0]],
      assignedAgent: emp2Id, userRef: adminId, areaSqFt: 980,
      attributes: { possessionStatus: 'Ready to Move', constructionQuality: 'Standard', carpetArea: 800, superBuiltUp: 980 },
      propertyTypeFields: { bhk: '2 BHK', floor: 6, totalFloors: 14, ageOfProperty: 9 },
    },

    // ── Residential for Rent ──────────────────────────────────────────────
    {
      name: '3 BHK Furnished Apartment for Rent — Andheri West',
      description: 'Premium furnished 3 BHK in a gated society. Air-conditioned rooms, modular kitchen, 2 covered parking. Corporate/family preferred.',
      address: 'Lokhandwala Complex, Andheri West, Mumbai - 400053',
      city: 'Mumbai', locality: 'Andheri West', state: 'Maharashtra', pincode: '400053',
      regularPrice: 85000, offer: false, type: 'rent', bedrooms: 3, bathrooms: 3,
      furnished: true, parking: true, status: 'available', propertyCategory: 'residential',
      propertyType: 'apartment', category: 'residential-rent',
      imageUrls: APT_IMGS,
      ownerIds: [oIds[0]],
      assignedAgent: emp1Id, userRef: adminId, areaSqFt: 1400,
      attributes: { tenantPreference: 'Family', deposit: 255000, furnishing: 'Fully Furnished', amenities: ['AC','Modular Kitchen','Wardrobes','Gym','Swimming Pool'], carpetArea: 1100, lockInPeriod: 11 },
      propertyTypeFields: { bhk: '3 BHK', floor: 10, totalFloors: 20, facing: 'North-East' },
    },
    {
      name: '2 BHK Semi-Furnished Flat — Viman Nagar, Pune',
      description: 'Bright, airy 2 BHK near airport and IT corridor. Semi-furnished with wardrobes and AC points. Society with pool and gym. Ideal for IT professionals.',
      address: 'Viman Nagar, Pune - 411014',
      city: 'Pune', locality: 'Viman Nagar', state: 'Maharashtra', pincode: '411014',
      regularPrice: 28000, offer: false, type: 'rent', bedrooms: 2, bathrooms: 2,
      furnished: true, parking: true, status: 'available', propertyCategory: 'residential',
      propertyType: 'apartment', category: 'residential-rent',
      imageUrls: APT_IMGS,
      ownerIds: [oIds[1]],
      assignedAgent: emp2Id, userRef: adminId, areaSqFt: 1050,
      attributes: { tenantPreference: 'Any', deposit: 84000, furnishing: 'Semi Furnished', amenities: ['Wardrobes','Gym','Swimming Pool'], carpetArea: 840, lockInPeriod: 6 },
      propertyTypeFields: { bhk: '2 BHK', floor: 4, totalFloors: 10, facing: 'East' },
    },

    // ── Commercial ────────────────────────────────────────────────────────
    {
      name: 'Office Space for Sale — BKC, Mumbai',
      description: 'Premium Grade-A office space in the heart of BKC. Fully fitted with false ceiling, raised flooring, 2 conference rooms. Ideal for financial firms.',
      address: 'Bandra-Kurla Complex, Bandra East, Mumbai - 400051',
      city: 'Mumbai', locality: 'BKC', state: 'Maharashtra', pincode: '400051',
      regularPrice: 58000000, offer: false, type: 'sale', bedrooms: 0, bathrooms: 4,
      furnished: true, parking: true, status: 'available', propertyCategory: 'commercial',
      propertyType: 'office-space', category: 'commercial-sale',
      imageUrls: COMM_IMGS,
      ownerIds: [oIds[4]],
      assignedAgent: emp1Id, userRef: adminId, areaSqFt: 3200,
      attributes: { possessionStatus: 'Ready to Move', carpetArea: 2700, superBuiltUp: 3200, liftAccess: true, powerBackup: true, ownershipType: 'Freehold' },
      propertyTypeFields: { cabins: 8, conferenceRooms: 2, pantry: true, floorNo: 12 },
    },
    {
      name: 'Retail Shop for Rent — Hinjewadi, Pune',
      description: 'Ground floor shop in a high-footfall IT park retail strip. Corner unit with 24 ft frontage. Suitable for F&B, pharmacy, or financial services.',
      address: 'Phase 1, Hinjewadi, Pune - 411057',
      city: 'Pune', locality: 'Hinjewadi', state: 'Maharashtra', pincode: '411057',
      regularPrice: 65000, offer: false, type: 'rent', bedrooms: 0, bathrooms: 1,
      furnished: false, parking: true, status: 'available', propertyCategory: 'commercial',
      propertyType: 'shop-showroom', category: 'commercial-rent',
      imageUrls: COMM_IMGS,
      ownerIds: [oIds[2]],
      assignedAgent: emp2Id, userRef: adminId, areaSqFt: 650,
      attributes: { availableFrom: new Date(), leaseDuration: 36, deposit: 195000, carpetArea: 600, cam: 8000, fitOutStatus: 'Warm Shell' },
      propertyTypeFields: { frontage: 24, cornerProperty: true, floorNo: 'Ground' },
    },

    // ── Plots & Land ──────────────────────────────────────────────────────
    {
      name: 'Residential Plot — Panvel, Navi Mumbai',
      description: '250 sq yd NA-approved residential plot on a 40 ft wide road. Ready for immediate construction. Close to Panvel railway station and Mumbai-Pune Expressway.',
      address: 'Sector 23, Kamothe, Panvel, Navi Mumbai - 410209',
      city: 'Navi Mumbai', locality: 'Kamothe', state: 'Maharashtra', pincode: '410209',
      regularPrice: 12500000, offer: false, type: 'sale', bedrooms: 0, bathrooms: 0,
      furnished: false, parking: false, status: 'available', propertyCategory: 'land',
      propertyType: 'plot-land', category: 'plots-land',
      imageUrls: LAND_IMGS,
      ownerIds: [oIds[5]],
      assignedAgent: emp1Id, userRef: adminId, areaSqFt: 2250,
      attributes: { plotArea: 250, plotAreaSqFt: 2250, dimensions: '30 × 75', zoningStatus: 'Residential', approvals: ['NA Conversion','RERA'], access: '40 ft Road' },
      propertyTypeFields: { plotType: 'Residential Plot', roadWidth: 40, boundaryWall: true, cornerPlot: false },
    },
    {
      name: 'Commercial Plot — Chakan Industrial Area',
      description: 'Industrial NA plot ideal for a manufacturing unit or warehouse. 400 sq yd with 60 ft road access. MIDC boundary. Power connection available.',
      address: 'MIDC Chakan, Pune - 410501',
      city: 'Pune', locality: 'Chakan', state: 'Maharashtra', pincode: '410501',
      regularPrice: 18000000, offer: false, type: 'sale', bedrooms: 0, bathrooms: 0,
      furnished: false, parking: false, status: 'available', propertyCategory: 'land',
      propertyType: 'plot-land', category: 'plots-land',
      imageUrls: LAND_IMGS,
      ownerIds: [oIds[5]],
      assignedAgent: emp2Id, userRef: adminId, areaSqFt: 3600,
      attributes: { plotArea: 400, plotAreaSqFt: 3600, dimensions: '40 × 90', zoningStatus: 'Industrial', approvals: ['Municipality'], access: '60 ft Road' },
      propertyTypeFields: { plotType: 'Industrial', roadWidth: 60, boundaryWall: false, cornerPlot: true },
    },
  ]);
  console.log(`✓ Listings: ${listings.length}`);

  // ── Clients / CRM Leads ───────────────────────────────────────────────────
  const clients = await Client.insertMany([
    { name: 'Nikhil Joshi',    phone: '9821000001', email: 'nikhil.joshi@gmail.com',    status: 'qualified',   source: 'website',   priority: 'high',   notes: 'Looking for 3 BHK in Bandra or Juhu. Budget ₹3–4 Cr. Pre-approved loan.', assignedTo: emp1Id, createdBy: adminId },
    { name: 'Pooja Desai',     phone: '9821000002', email: 'pooja.desai@gmail.com',      status: 'contacted',   source: 'referral',  priority: 'high',   notes: '2 BHK rent in Viman Nagar or Kalyani Nagar, budget ₹25–30k/month.', assignedTo: emp2Id, createdBy: adminId },
    { name: 'Amit Gupta',      phone: '9821000003', email: 'amit.gupta@outlook.com',     status: 'proposal',    source: 'referral',  priority: 'medium', notes: 'Office space in BKC or Lower Parel. 2000–3500 sq ft, purchase preferred.', assignedTo: emp1Id, createdBy: adminId },
    { name: 'Shreya Kulkarni', phone: '9821000004', email: 'shreya.kulkarni@gmail.com',  status: 'lead',        source: 'portal',    priority: 'medium', notes: 'Plot near Hinjewadi for investment. Budget ₹80L–1.2 Cr.', assignedTo: emp2Id, createdBy: adminId },
    { name: 'Ranjit Kaur',     phone: '9821000005', email: 'ranjit.kaur@gmail.com',      status: 'lead',        source: 'walk-in',   priority: 'low',    notes: '1 BHK in Thane West, budget up to ₹55L. First-time buyer.', assignedTo: emp1Id, createdBy: adminId },
    { name: 'Vikram Nair',     phone: '9821000006', email: 'vikram.nair@company.com',    status: 'won',         source: 'referral',  priority: 'high',   notes: 'Bought 2 BHK in Chembur. Closed successfully.', assignedTo: emp2Id, createdBy: adminId },
    { name: 'Sonal Thakur',    phone: '9821000007', email: 'sonal.thakur@gmail.com',     status: 'lost',        source: 'website',   priority: 'low',    notes: 'Was looking for 3 BHK. Went with another broker.', assignedTo: emp1Id, createdBy: adminId },
    { name: 'Farhan Sheikh',   phone: '9821000008', email: 'farhan.sheikh@gmail.com',    status: 'negotiation', source: 'portal',    priority: 'high',   notes: 'Villa in Lonavala or Khandala. Budget ₹2.5–3 Cr. Wants pool.', assignedTo: emp2Id, createdBy: adminId },
    { name: 'Manisha Roy',     phone: '9821000009', email: 'manisha.roy@gmail.com',      status: 'contacted',   source: 'referral',  priority: 'medium', notes: 'Retail shop near Hinjewadi IT park for lease.', assignedTo: emp1Id, createdBy: adminId },
    { name: 'Suresh Iyer',     phone: '9821000010', email: 'suresh.iyer@tech.com',       status: 'proposal',    source: 'corporate', priority: 'high',   notes: 'Company leasing 2 BHK units for employee housing. Needs 5 flats.', assignedTo: emp2Id, createdBy: adminId },
  ]);
  console.log(`✓ Clients: ${clients.length}`);

  const cIds = clients.map((c) => c._id);

  // ── Buyer Requirements ────────────────────────────────────────────────────
  await BuyerRequirement.insertMany([
    {
      buyerName: 'Nikhil Joshi', buyerPhone: '9821000001', buyerEmail: 'nikhil.joshi@gmail.com',
      preferredCity: 'Mumbai', preferredLocality: 'Bandra, Juhu, Khar',
      propertyType: 'sale', propertyTypeInterest: 'residential',
      minPrice: 30000000, maxPrice: 40000000,
      status: 'active', priority: 'high',
      additionalRequirements: '3 BHK, 2 bath, parking required. Pre-approved HDFC loan. Wants to close in 60 days.',
      notes: 'Very serious buyer. Decision maker.',
      assignedAgent: emp1Id, createdBy: adminId,
    },
    {
      buyerName: 'Farhan Sheikh', buyerPhone: '9821000008', buyerEmail: 'farhan.sheikh@gmail.com',
      preferredCity: 'Lonavala', preferredLocality: 'Frichley Hills, Kunegaon',
      propertyType: 'sale', propertyTypeInterest: 'residential',
      minPrice: 25000000, maxPrice: 30000000,
      status: 'active', priority: 'high',
      additionalRequirements: '4+ BHK villa. Must have private pool. Weekend use only.',
      notes: 'Wants to visit this weekend. Very particular about pool.',
      assignedAgent: emp2Id, createdBy: adminId,
    },
    {
      buyerName: 'Shreya Kulkarni', buyerPhone: '9821000004', buyerEmail: 'shreya.kulkarni@gmail.com',
      preferredCity: 'Pune', preferredLocality: 'Hinjewadi, Wakad, Balewadi',
      propertyType: 'sale', propertyTypeInterest: 'land',
      minPrice: 8000000, maxPrice: 12000000,
      status: 'active', priority: 'medium',
      additionalRequirements: 'NA plot for investment. RERA approval required.',
      notes: 'Will construct in 2-3 years. Investment purpose only.',
      assignedAgent: emp2Id, createdBy: adminId,
    },
    {
      buyerName: 'Suresh Iyer', buyerPhone: '9821000010', buyerEmail: 'suresh.iyer@tech.com',
      preferredCity: 'Pune', preferredLocality: 'Viman Nagar, Kalyani Nagar, Koregaon Park',
      propertyType: 'rent', propertyTypeInterest: 'residential',
      minPrice: 25000, maxPrice: 35000,
      status: 'active', priority: 'high',
      additionalRequirements: '2 BHK, furnished, parking. Need 5 units for employees.',
      notes: 'Corporate lease. Long-term lease preferred (3+ years).',
      assignedAgent: emp2Id, createdBy: adminId,
    },
  ]);
  console.log(`✓ Buyer Requirements: 4`);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const listingIds = listings.map((l) => l._id);
  const t = (status, priority, dueDays, assignee, kind, clientIdx, listingIdx) => ({
    status,
    priority,
    dueAt: days(dueDays),
    assignedTo: assignee,
    createdBy: adminId,
    related: {
      kind,
      clientId:  kind === 'client'  ? cIds[clientIdx]       : null,
      listingId: kind === 'listing' ? listingIds[listingIdx] : null,
    },
  });

  await Task.insertMany([
    { title: 'Site visit — Bandra 3 BHK with Nikhil Joshi', description: 'Confirm visit time. Parking needs to be arranged.',   ...t('in_progress','high',   1,  emp1Id, 'listing', null, 0) },
    { title: 'Follow up — Lonavala villa shortlist',         description: 'Send brochure and pricing sheet to Farhan.',          ...t('todo',       'high',   1,  emp2Id, 'listing', null, 2) },
    { title: 'Documentation — Kothrud house negotiation',    description: 'Draft offer letter and send to owner Sunita.',        ...t('in_progress','high',   2,  emp1Id, 'listing', null, 3) },
    { title: 'Follow up call — Pooja Desai',                 description: 'Check if she visited Viman Nagar flat on her own.',   ...t('todo',       'medium', 2,  emp2Id, 'client',  1,    null) },
    { title: 'Photography — BKC office space',               description: 'Arrange professional photographer for BKC listing.',  ...t('todo',       'medium', 3,  emp1Id, 'listing', null, 8) },
    { title: 'Legal check — Panvel plot documents',          description: 'Verify NA certificate and 7/12 extract.',             ...t('todo',       'medium', 4,  emp2Id, 'listing', null, 10) },
    { title: 'Corporate proposal — Suresh Iyer',             description: 'Prepare 5-unit rental proposal for TechCorp.',        ...t('in_progress','high',   3,  emp2Id, 'client',  9,    null) },
    { title: 'Price negotiation — Powai 2 BHK',              description: 'Owner agreed ₹14.2 Cr. Get final sign-off.',          ...t('in_progress','medium', 5,  emp1Id, 'listing', null, 1) },
    { title: 'Owner onboarding — Rina Bose',                 description: 'Visit property, take photos, sign listing mandate.',  ...t('todo',       'low',    7,  emp1Id, 'none',    null, null) },
    { title: 'Quarterly pipeline review',                    description: 'Review all active leads and update deal stages.',     ...t('todo',       'low',    10, adminId,'none',    null, null) },
    { title: 'Upload documents — Andheri rental',            description: 'Get agreement from owner and upload to system.',      ...t('done',       'medium', -2, emp1Id, 'listing', null, 6) },
    { title: 'Registry appointment — Chembur flat',          description: 'Registry done. File final documents.',                ...t('done',       'high',   -5, emp2Id, 'client',  5,    null) },
  ]);
  console.log(`✓ Tasks: 12`);

  await mongoose.disconnect();
  console.log('\n✅ Fresh seed complete!\n');
  console.log('  Admin:    (existing account)');
  console.log('  Employee: arjun.mehta@demo.salescode.ai  / Agent@123');
  console.log('  Employee: priya.kapoor@demo.salescode.ai / Agent@123');
  console.log('  Seller:   ravi.seller@demo.com           / Seller@123');
}

main().catch((e) => { console.error(e); process.exit(1); });
