/**
 * Demo seed script — creates realistic sample data for client demos.
 * Safe to re-run: upserts by unique key, never duplicates.
 *
 * Usage (from /backend):
 *   node scripts/seedDemo.js
 */

import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

import User from '../models/user.model.js';
import Listing from '../models/listing.model.js';
import Owner from '../models/owner.model.js';
import Client from '../models/client.model.js';
import Task from '../models/task.model.js';
import BuyerRequirement from '../models/buyerRequirement.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ytreal';

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function upsert(Model, key, val, data) {
  return Model.findOneAndUpdate(
    { [key]: val, isDeleted: { $ne: true } },
    { $setOnInsert: data },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  // ── ADMIN USER ──────────────────────────────────────────────────────────
  const admin = await User.findOne({ role: 'admin', isDeleted: { $ne: true } }).sort({ createdAt: 1 });
  if (!admin) {
    console.error('No admin user found. Run: npm run make-admin -- --email x@x.com --password Pass@123 first.');
    process.exit(1);
  }
  console.log(`✓ Admin: ${admin.email}`);

  // ── EMPLOYEE USER ────────────────────────────────────────────────────────
  let employee = await User.findOne({ email: 'rahul.verma@demo.salescode.ai', isDeleted: { $ne: true } });
  if (!employee) {
    const hashed = await bcryptjs.hash('Agent@Demo123', 12);
    employee = await User.create({
      username: 'rahulverma_demo',
      firstName: 'Rahul',
      lastName: 'Verma',
      email: 'rahul.verma@demo.salescode.ai',
      password: hashed,
      role: 'employee',
      status: 'active',
    });
    console.log('✓ Created employee: rahul.verma@demo.salescode.ai / Agent@Demo123');
  }

  const adminId = admin._id;
  const empId = employee._id;

  // ── OWNERS ───────────────────────────────────────────────────────────────
  const ownersData = [
    { name: 'Rajesh Kumar',  phone: '9811234501', email: 'rajesh.kumar.demo@gmail.com',  companyName: 'Kumar Properties',  city: 'Mumbai',      state: 'Maharashtra', notes: 'Prefers WhatsApp. Multiple flats in Worli.' },
    { name: 'Priya Sharma',  phone: '9811234502', email: 'priya.sharma.demo@gmail.com',  companyName: '',                  city: 'Mumbai',      state: 'Maharashtra', notes: 'Inherited property. Wants quick sale.' },
    { name: 'Suresh Patel',  phone: '9811234503', email: 'suresh.patel.demo@gmail.com',  companyName: 'Patel Realty',      city: 'Pune',        state: 'Maharashtra', notes: 'Developer. Has portfolio of 5 units.' },
    { name: 'Anjali Mehta',  phone: '9811234504', email: 'anjali.mehta.demo@gmail.com',  companyName: 'Mehta Estates',     city: 'Mumbai',      state: 'Maharashtra', notes: 'Premium segment owner. Sea-facing only.' },
    { name: 'Vikram Singh',  phone: '9811234505', email: 'vikram.singh.demo@gmail.com',  companyName: '',                  city: 'Thane',       state: 'Maharashtra', notes: 'Investment properties for rental yield.' },
    { name: 'Sonia Reddy',   phone: '9811234506', email: 'sonia.reddy.demo@gmail.com',   companyName: 'Reddy Properties',  city: 'Mumbai',      state: 'Maharashtra', notes: 'Manages NRI-owned flats in Bandra.' },
    { name: 'Arun Agarwal',  phone: '9811234507', email: 'arun.agarwal.demo@gmail.com',  companyName: 'Agarwal Group',     city: 'Navi Mumbai', state: 'Maharashtra', notes: 'Commercial space specialist. Serious about timelines.' },
    { name: 'Deepa Nair',    phone: '9811234508', email: 'deepa.nair.demo@gmail.com',    companyName: '',                  city: 'Pune',        state: 'Maharashtra', notes: 'Land and plot owner in Pune region.' },
  ];

  const owners = [];
  for (const od of ownersData) {
    owners.push(await upsert(Owner, 'phone', od.phone, od));
  }
  console.log(`✓ Owners: ${owners.length}`);

  // ── LISTINGS ─────────────────────────────────────────────────────────────
  const IMG = {
    apt:  ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800', 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800', 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800'],
    villa:['https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800', 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800'],
    house:['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800', 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800'],
    comm: ['https://images.unsplash.com/photo-1497366216548-37526070297c?w=800', 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800'],
    land: ['https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800', 'https://images.unsplash.com/photo-1455587734955-081b22074882?w=800'],
  };

  const listingsData = [
    // ── Residential For Sale (8)
    {
      name: 'Sea View 3BHK Apartment, Worli',
      address: 'Worli Sea Face, Worli, Mumbai, Maharashtra 400018',
      city: 'Mumbai', locality: 'Worli', state: 'Maharashtra', pincode: '400018',
      description: 'Stunning sea-facing 3BHK on 12th floor of a premium high-rise. Fully furnished with modular kitchen and branded fittings. Swimming pool, gym, and 24/7 security.',
      category: 'residential-for-sale', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'sale', bedrooms: 3, bathrooms: 2, areaSqFt: 1450,
      regularPrice: 18500000, furnished: true, parking: true, offer: false,
      status: 'available', imageUrls: IMG.apt,
      location: { lat: 19.0177, lng: 72.8178 },
      ownerIds: [owners[0]._id], userRef: adminId,
      attributes: { propertyType: 'Apartment/Flat', bhkType: '3 BHK', floor: '12th Floor', totalFloors: '24', facing: 'Sea Facing', ageOfProperty: 'Ready to Move' },
    },
    {
      name: 'Premium 2BHK in Bandra West',
      address: 'Hill Road, Bandra West, Mumbai, Maharashtra 400050',
      city: 'Mumbai', locality: 'Bandra West', state: 'Maharashtra', pincode: '400050',
      description: 'Spacious 2BHK in the heart of Bandra West. Walking distance to Bandra station. Society with garden and kids play area.',
      category: 'residential-for-sale', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'sale', bedrooms: 2, bathrooms: 2, areaSqFt: 1100,
      regularPrice: 14500000, discountPrice: 14000000, furnished: false, parking: true, offer: true,
      status: 'available', imageUrls: IMG.apt,
      location: { lat: 19.0596, lng: 72.8295 },
      ownerIds: [owners[1]._id], userRef: adminId,
      attributes: { propertyType: 'Apartment/Flat', bhkType: '2 BHK', floor: '5th Floor', totalFloors: '10', facing: 'East Facing', ageOfProperty: '2-5 Years' },
    },
    {
      name: 'Luxury 4BHK Villa, Juhu',
      address: 'JVPD Scheme, Juhu, Mumbai, Maharashtra 400049',
      city: 'Mumbai', locality: 'Juhu', state: 'Maharashtra', pincode: '400049',
      description: 'Grand 4BHK independent villa with private garden and terrace. Walking distance to Juhu beach. Fully renovated with Italian marble flooring.',
      category: 'residential-for-sale', propertyCategory: 'residential', propertyType: 'Villa',
      type: 'sale', bedrooms: 4, bathrooms: 3, areaSqFt: 2800,
      regularPrice: 32000000, furnished: true, parking: true, offer: false,
      status: 'under_negotiation', imageUrls: IMG.villa,
      location: { lat: 19.1089, lng: 72.8263 },
      ownerIds: [owners[3]._id], userRef: adminId,
      attributes: { propertyType: 'Villa', bhkType: '4 BHK', facing: 'West Facing', ageOfProperty: 'Ready to Move', gardenArea: 'Yes' },
    },
    {
      name: 'Affordable 1BHK in Andheri East',
      address: 'Marol, Andheri East, Mumbai, Maharashtra 400059',
      city: 'Mumbai', locality: 'Andheri East', state: 'Maharashtra', pincode: '400059',
      description: 'Well-maintained 1BHK perfect for first-time buyers or investment. Close to Marol metro and SEEPZ. Good rental yield area.',
      category: 'residential-for-sale', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'sale', bedrooms: 1, bathrooms: 1, areaSqFt: 520,
      regularPrice: 6500000, furnished: false, parking: false, offer: false,
      status: 'available', imageUrls: IMG.apt,
      location: { lat: 19.1197, lng: 72.8468 },
      ownerIds: [owners[2]._id], userRef: adminId,
      attributes: { propertyType: 'Apartment/Flat', bhkType: '1 BHK', floor: '2nd Floor', totalFloors: '7', ageOfProperty: '5-10 Years' },
    },
    {
      name: 'Luxury Penthouse, Worli Skyline',
      address: 'Worli Naka, Worli, Mumbai, Maharashtra 400018',
      city: 'Mumbai', locality: 'Worli', state: 'Maharashtra', pincode: '400018',
      description: 'Ultra-luxury 5BHK penthouse spanning the entire top floor. 360-degree city and sea views. Private rooftop terrace, home theatre, and staff quarters.',
      category: 'residential-for-sale', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'sale', bedrooms: 5, bathrooms: 4, areaSqFt: 4200,
      regularPrice: 55000000, furnished: true, parking: true, offer: false,
      status: 'available', imageUrls: IMG.villa,
      location: { lat: 19.0183, lng: 72.8181 },
      ownerIds: [owners[3]._id], userRef: adminId,
      attributes: { propertyType: 'Penthouse', bhkType: '5 BHK', floor: 'Top Floor', totalFloors: '35', facing: 'Sea Facing', ageOfProperty: 'Ready to Move' },
    },
    {
      name: 'Modern 2BHK Builder Floor, Hiranandani Powai',
      address: 'Hiranandani Gardens, Powai, Mumbai, Maharashtra 400076',
      city: 'Mumbai', locality: 'Powai', state: 'Maharashtra', pincode: '400076',
      description: 'Well-appointed 2BHK in the iconic Hiranandani township. Gated community with lush greens. Recently sold — benchmark price for locality.',
      category: 'residential-for-sale', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'sale', bedrooms: 2, bathrooms: 2, areaSqFt: 1050,
      regularPrice: 9200000, furnished: false, parking: true, offer: false,
      status: 'sold', imageUrls: IMG.apt,
      location: { lat: 19.1164, lng: 72.9060 },
      ownerIds: [owners[1]._id], userRef: adminId,
      attributes: { propertyType: 'Builder Floor', bhkType: '2 BHK', floor: '1st Floor', totalFloors: '4', ageOfProperty: 'Ready to Move' },
    },
    {
      name: '3BHK Corner Apartment, Thane West',
      address: 'Pokhran Road No.2, Thane West, Thane, Maharashtra 400601',
      city: 'Thane', locality: 'Thane West', state: 'Maharashtra', pincode: '400601',
      description: 'Bright corner apartment on 8th floor with dual balconies. Under-construction society by a reputed builder. OC expected Q3.',
      category: 'residential-for-sale', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'sale', bedrooms: 3, bathrooms: 2, areaSqFt: 1250,
      regularPrice: 7800000, discountPrice: 7500000, furnished: false, parking: true, offer: true,
      status: 'available', imageUrls: IMG.apt,
      location: { lat: 19.2183, lng: 72.9781 },
      ownerIds: [owners[4]._id], userRef: adminId,
      attributes: { propertyType: 'Apartment/Flat', bhkType: '3 BHK', floor: '8th Floor', totalFloors: '15', facing: 'East Facing', ageOfProperty: 'Under Construction' },
    },
    {
      name: '4BHK Family Villa with Garden, Koregaon Park Pune',
      address: 'Koregaon Park, Pune, Maharashtra 411001',
      city: 'Pune', locality: 'Koregaon Park', state: 'Maharashtra', pincode: '411001',
      description: 'Serene independent villa in the most coveted address in Pune. Landscaped garden, modular kitchen, and premium interiors. Close to top schools and hospitals.',
      category: 'residential-for-sale', propertyCategory: 'residential', propertyType: 'Villa',
      type: 'sale', bedrooms: 4, bathrooms: 3, areaSqFt: 3200,
      regularPrice: 11000000, furnished: true, parking: true, offer: false,
      status: 'under_negotiation', imageUrls: IMG.house,
      location: { lat: 18.5363, lng: 73.8905 },
      ownerIds: [owners[7]._id], userRef: adminId,
      attributes: { propertyType: 'Villa', bhkType: '4 BHK', facing: 'North Facing', gardenArea: 'Yes', ageOfProperty: '2-5 Years' },
    },
    // ── Residential For Rent (5)
    {
      name: 'Fully Furnished 2BHK for Rent, Bandra West',
      address: 'Turner Road, Bandra West, Mumbai, Maharashtra 400050',
      city: 'Mumbai', locality: 'Bandra West', state: 'Maharashtra', pincode: '400050',
      description: 'Move-in ready 2BHK with premium furniture, AC in all rooms, modular kitchen with appliances. Ideal for expats and corporates.',
      category: 'residential-for-rent', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'rent', bedrooms: 2, bathrooms: 2, areaSqFt: 1050,
      regularPrice: 55000, furnished: true, parking: true, offer: false,
      status: 'available', imageUrls: IMG.apt,
      location: { lat: 19.0608, lng: 72.8290 },
      ownerIds: [owners[5]._id], userRef: adminId,
      attributes: { propertyType: 'Apartment/Flat', bhkType: '2 BHK', furnishedStatus: 'Fully Furnished', availableFrom: 'Immediately' },
    },
    {
      name: 'Cozy Studio Apartment for Rent, Versova Andheri',
      address: 'Versova, Andheri West, Mumbai, Maharashtra 400061',
      city: 'Mumbai', locality: 'Andheri West', state: 'Maharashtra', pincode: '400061',
      description: 'Compact studio with loft bedroom, fully furnished. Walking distance to Versova metro. Perfect for working professionals.',
      category: 'residential-for-rent', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'rent', bedrooms: 1, bathrooms: 1, areaSqFt: 380,
      regularPrice: 25000, furnished: true, parking: false, offer: false,
      status: 'available', imageUrls: IMG.apt,
      location: { lat: 19.1341, lng: 72.8165 },
      ownerIds: [owners[0]._id], userRef: adminId,
      attributes: { propertyType: 'Studio Apartment', bhkType: '1 RK', furnishedStatus: 'Fully Furnished', availableFrom: 'Immediately' },
    },
    {
      name: '3BHK Semi-Furnished in Hiranandani Powai',
      address: 'Lake Homes Road, Powai, Mumbai, Maharashtra 400076',
      city: 'Mumbai', locality: 'Powai', state: 'Maharashtra', pincode: '400076',
      description: 'Spacious 3BHK with lake view from balcony. Wardrobe in all bedrooms. Society has pool, gym, and clubhouse.',
      category: 'residential-for-rent', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'rent', bedrooms: 3, bathrooms: 2, areaSqFt: 1400,
      regularPrice: 75000, furnished: false, parking: true, offer: false,
      status: 'available', imageUrls: IMG.apt,
      location: { lat: 19.1172, lng: 72.9062 },
      ownerIds: [owners[2]._id], userRef: adminId,
      attributes: { propertyType: 'Apartment/Flat', bhkType: '3 BHK', furnishedStatus: 'Semi Furnished', availableFrom: '1 Month' },
    },
    {
      name: '1BHK near Thane Metro Station',
      address: 'Kopri Colony, Thane East, Thane, Maharashtra 400603',
      city: 'Thane', locality: 'Thane East', state: 'Maharashtra', pincode: '400603',
      description: 'Value-for-money 1BHK, 3 min walk to metro. Freshly painted, new bathroom fittings. Token amount confirms.',
      category: 'residential-for-rent', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'rent', bedrooms: 1, bathrooms: 1, areaSqFt: 480,
      regularPrice: 18000, furnished: false, parking: false, offer: false,
      status: 'under_negotiation', imageUrls: IMG.apt,
      location: { lat: 19.2145, lng: 72.9812 },
      ownerIds: [owners[4]._id], userRef: adminId,
      attributes: { propertyType: 'Apartment/Flat', bhkType: '1 BHK', furnishedStatus: 'Unfurnished', availableFrom: 'Immediately' },
    },
    {
      name: 'Corporate 4BHK in Premium Juhu Society',
      address: 'Juhu Versova Link Road, Juhu, Mumbai, Maharashtra 400049',
      city: 'Mumbai', locality: 'Juhu', state: 'Maharashtra', pincode: '400049',
      description: 'Ideal for C-suite executives or corporate leases. Smart home automation, dedicated parking for 2 cars, concierge services.',
      category: 'residential-for-rent', propertyCategory: 'residential', propertyType: 'Apartment',
      type: 'rent', bedrooms: 4, bathrooms: 3, areaSqFt: 2400,
      regularPrice: 150000, furnished: true, parking: true, offer: false,
      status: 'available', imageUrls: IMG.villa,
      location: { lat: 19.1090, lng: 72.8263 },
      ownerIds: [owners[3]._id], userRef: adminId,
      attributes: { propertyType: 'Apartment/Flat', bhkType: '4 BHK', furnishedStatus: 'Fully Furnished', availableFrom: 'Immediately' },
    },
    // ── Commercial (4)
    {
      name: 'Prime Retail Shop, Linking Road Bandra',
      address: 'Linking Road, Bandra West, Mumbai, Maharashtra 400050',
      city: 'Mumbai', locality: 'Bandra West', state: 'Maharashtra', pincode: '400050',
      description: 'High-footfall retail space on one of Mumbai\'s most premium shopping streets. Ground floor, 20-ft frontage, ideal for fashion, F&B, or lifestyle brands.',
      category: 'commercial-for-sale', propertyCategory: 'commercial', propertyType: 'Shop',
      type: 'sale', bedrooms: 0, bathrooms: 1, areaSqFt: 650,
      regularPrice: 28000000, furnished: false, parking: true, offer: false,
      status: 'available', imageUrls: IMG.comm,
      location: { lat: 19.0622, lng: 72.8296 },
      ownerIds: [owners[6]._id], userRef: adminId,
      commercialType: 'shop',
      attributes: { propertyType: 'Retail Shop', floor: 'Ground Floor', frontage: '20 Feet', powerLoad: '10 KW' },
    },
    {
      name: 'Grade-A Office Space 800 sqft, BKC Mumbai',
      address: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051',
      city: 'Mumbai', locality: 'BKC', state: 'Maharashtra', pincode: '400051',
      description: 'Fully fitted Grade-A office in the heart of BKC. 4 cabins + open area. Central AC, server room, 24/7 power backup. Ready for immediate occupation.',
      category: 'commercial-for-sale', propertyCategory: 'commercial', propertyType: 'Office',
      type: 'sale', bedrooms: 0, bathrooms: 2, areaSqFt: 800,
      regularPrice: 45000000, furnished: true, parking: true, offer: false,
      status: 'under_negotiation', imageUrls: IMG.comm,
      location: { lat: 19.0692, lng: 72.8642 },
      ownerIds: [owners[6]._id], userRef: adminId,
      commercialType: 'office',
      attributes: { propertyType: 'Office Space', floor: '7th Floor', totalFloors: '12', cabins: '4 Cabins', powerLoad: '20 KW' },
    },
    {
      name: 'Restaurant Space with Licence, Andheri West',
      address: 'S.V. Road, Andheri West, Mumbai, Maharashtra 400058',
      city: 'Mumbai', locality: 'Andheri West', state: 'Maharashtra', pincode: '400058',
      description: 'Fully operational restaurant space with fire NOC and health licence. Kitchen infrastructure included. Prime SV Road frontage.',
      category: 'commercial-for-sale', propertyCategory: 'commercial', propertyType: 'Shop',
      type: 'sale', bedrooms: 0, bathrooms: 2, areaSqFt: 1200,
      regularPrice: 12000000, furnished: false, parking: true, offer: false,
      status: 'sold', imageUrls: IMG.comm,
      location: { lat: 19.1210, lng: 72.8380 },
      ownerIds: [owners[5]._id], userRef: adminId,
      commercialType: 'shop',
      attributes: { propertyType: 'Restaurant/Cafe', floor: 'Ground Floor', frontage: '30 Feet', licenseIncluded: 'Yes' },
    },
    {
      name: 'Showroom Space, Ghodbunder Road Thane',
      address: 'Ghodbunder Road, Thane West, Thane, Maharashtra 400615',
      city: 'Thane', locality: 'Ghodbunder Road', state: 'Maharashtra', pincode: '400615',
      description: 'Ground-floor showroom space on high-traffic Ghodbunder Road corridor. 25-ft frontage, ample parking in front. Perfect for automobile, electronics, or furniture brands.',
      category: 'commercial-for-sale', propertyCategory: 'commercial', propertyType: 'Shop',
      type: 'sale', bedrooms: 0, bathrooms: 1, areaSqFt: 900,
      regularPrice: 8500000, furnished: false, parking: true, offer: false,
      status: 'available', imageUrls: IMG.comm,
      location: { lat: 19.2612, lng: 72.9765 },
      ownerIds: [owners[4]._id], userRef: adminId,
      commercialType: 'showroom',
      attributes: { propertyType: 'Showroom', floor: 'Ground Floor', frontage: '25 Feet', powerLoad: '15 KW' },
    },
    // ── Land & Plots (3)
    {
      name: 'Residential Plot 1200 sqft, Kharghar Navi Mumbai',
      address: 'Sector 10, Kharghar, Navi Mumbai, Maharashtra 410210',
      city: 'Navi Mumbai', locality: 'Kharghar', state: 'Maharashtra', pincode: '410210',
      description: 'NA-approved residential plot in CIDCO sector. 30-ft road facing. Near Kharghar station. Clear title with no encumbrances.',
      category: 'land-and-plots', propertyCategory: 'land', propertyType: 'Plot',
      type: 'sale', bedrooms: 0, bathrooms: 0, areaSqFt: 1200,
      regularPrice: 6200000, furnished: false, parking: false, offer: false,
      status: 'available', imageUrls: IMG.land,
      location: { lat: 19.0473, lng: 73.0707 },
      ownerIds: [owners[7]._id], userRef: adminId,
      plotType: 'residential',
      areaName: 'Kharghar Sector 10', plotSize: '1200 sqft', sqYard: '133',
      attributes: { plotType: 'Residential', approvalStatus: 'NA-Approved', facing: 'East Facing', roadWidth: '30 Feet' },
    },
    {
      name: 'Commercial Plot 5000 sqft, Viman Nagar Pune',
      address: 'Viman Nagar, Pune, Maharashtra 411014',
      city: 'Pune', locality: 'Viman Nagar', state: 'Maharashtra', pincode: '411014',
      description: 'Prime commercial plot near Pune Airport. 60-ft road frontage. Ideal for hotel, hospital, or IT park development. All utilities available.',
      category: 'land-and-plots', propertyCategory: 'land', propertyType: 'Plot',
      type: 'sale', bedrooms: 0, bathrooms: 0, areaSqFt: 5000,
      regularPrice: 18000000, furnished: false, parking: false, offer: false,
      status: 'available', imageUrls: IMG.land,
      location: { lat: 18.5714, lng: 73.9135 },
      ownerIds: [owners[2]._id], userRef: adminId,
      plotType: 'commercial',
      areaName: 'Viman Nagar', plotSize: '5000 sqft', sqYard: '556',
      attributes: { plotType: 'Commercial', approvalStatus: 'NA-Approved', facing: 'West Facing', roadWidth: '60 Feet' },
    },
    {
      name: 'Agricultural Land 2 Acres, Mulshi Pune',
      address: 'Pirangut Village, Mulshi Taluka, Pune, Maharashtra 412115',
      city: 'Pune', locality: 'Pirangut', state: 'Maharashtra', pincode: '412115',
      description: 'Fertile agricultural land with existing borewell and water connection. Scenic valley views. Suitable for farm villa, resort, or organic farming project.',
      category: 'land-and-plots', propertyCategory: 'land', propertyType: 'Plot',
      type: 'sale', bedrooms: 0, bathrooms: 0, areaSqFt: 87120,
      regularPrice: 4500000, furnished: false, parking: false, offer: false,
      status: 'available', imageUrls: IMG.land,
      location: { lat: 18.5204, lng: 73.5671 },
      ownerIds: [owners[7]._id], userRef: adminId,
      plotType: 'agricultural',
      areaName: 'Pirangut Mulshi', plotSize: '2 Acres',
      attributes: { plotType: 'Agricultural', waterSource: 'Borewell + Well', cropType: 'Sugarcane', access: 'Kutcha Road' },
    },
  ];

  const listings = [];
  for (const ld of listingsData) {
    listings.push(await upsert(Listing, 'name', ld.name, ld));
  }
  console.log(`✓ Listings: ${listings.length}`);

  // Index reference (for easy cross-referencing below)
  // 0  Sea View 3BHK Worli        | 8  2BHK Rent Bandra
  // 1  2BHK Bandra West           | 9  Studio Rent Andheri
  // 2  4BHK Villa Juhu            | 10 3BHK Rent Powai
  // 3  1BHK Andheri East          | 11 1BHK Rent Thane
  // 4  Penthouse Worli            | 12 4BHK Corporate Juhu
  // 5  2BHK Powai (sold)          | 13 Shop Linking Road
  // 6  3BHK Thane West            | 14 Office BKC
  // 7  Villa Koregaon Park        | 15 Restaurant Andheri (sold)
  //                               | 16 Showroom Thane
  //                               | 17 Plot Kharghar
  //                               | 18 Plot Pune Airport
  //                               | 19 Farm Land Mulshi

  // ── CLIENTS ─────────────────────────────────────────────────────────────
  const clientsData = [
    {
      name: 'Amit Kapoor', email: 'amit.kapoor.demo@email.com', phone: '9922334401',
      organization: 'TechCorp India', status: 'lead', priority: 'high', source: 'Website',
      budget: { min: 12000000, max: 18000000, currency: 'INR' },
      preferredLocations: ['Bandra West', 'Juhu'], propertyType: 'residential',
      requirements: 'Looking for 3BHK near Bandra. Prefer furnished or near-ready. Home loan pre-approved for ₹1.5Cr.',
      assignedTo: adminId, createdBy: adminId,
      tags: ['home loan', 'first-time buyer'], score: 72,
      nextFollowUp: daysFromNow(1),
    },
    {
      name: 'Sunita Joshi', email: 'sunita.joshi.demo@email.com', phone: '9922334402',
      organization: '', status: 'contacted', priority: 'medium', source: 'Referral',
      budget: { min: 8000000, max: 11000000, currency: 'INR' },
      preferredLocations: ['Powai', 'Andheri East'], propertyType: 'residential',
      requirements: '2BHK for family. Ground floor preferred. School nearby.',
      assignedTo: empId, createdBy: adminId,
      tags: ['referral', 'school zone'], score: 58,
      nextFollowUp: daysFromNow(2),
    },
    {
      name: 'Rohit Desai', email: 'rohit.desai.demo@email.com', phone: '9922334403',
      organization: 'Desai Enterprises', status: 'qualified', priority: 'urgent', source: 'Property Portal',
      budget: { min: 30000000, max: 55000000, currency: 'INR' },
      preferredLocations: ['BKC', 'Lower Parel', 'Worli'], propertyType: 'commercial',
      requirements: 'Office space min 600 sqft in BKC. Mandatory parking. Immediate registration.',
      assignedTo: adminId, createdBy: adminId,
      tags: ['commercial', 'high value', 'urgent'],
      interestedListings: [listings[14]._id], score: 85,
      nextFollowUp: daysFromNow(0),
    },
    {
      name: 'Neha Gupta', email: 'neha.gupta.demo@email.com', phone: '9922334404',
      organization: '', status: 'proposal', priority: 'high', source: 'Social Media',
      budget: { min: 14000000, max: 20000000, currency: 'INR' },
      preferredLocations: ['Bandra West', 'Worli', 'Juhu'], propertyType: 'residential',
      requirements: 'Sea view or garden view. 3BHK. Premium society with amenities.',
      assignedTo: adminId, createdBy: adminId,
      tags: ['premium', 'sea view'],
      interestedListings: [listings[0]._id, listings[4]._id], score: 78,
      nextFollowUp: daysFromNow(1),
    },
    {
      name: 'Kiran Malhotra', email: 'kiran.malhotra.demo@email.com', phone: '9922334405',
      organization: 'Malhotra & Sons', status: 'negotiation', priority: 'urgent', source: 'Cold Call',
      budget: { min: 7000000, max: 8500000, currency: 'INR' },
      preferredLocations: ['Thane West', 'Mulund'], propertyType: 'residential',
      requirements: '3BHK for investment. Ready to close this week. NRI buyer, POA available.',
      assignedTo: empId, createdBy: adminId,
      tags: ['investor', 'NRI', 'fast close'],
      interestedListings: [listings[6]._id], score: 90,
      nextFollowUp: daysFromNow(0),
    },
    {
      name: 'Pooja Sharma', email: 'pooja.sharma.demo@email.com', phone: '9922334406',
      organization: '', status: 'won', priority: 'medium', source: 'Referral',
      budget: { min: 2200000, max: 2800000, currency: 'INR' },
      preferredLocations: ['Andheri West', 'Versova'], propertyType: 'residential',
      requirements: 'Studio or 1BHK. Metro connectivity essential.',
      assignedTo: adminId, createdBy: adminId,
      tags: ['closed', 'studio'],
      interestedListings: [listings[9]._id], score: 95,
      convertedAt: daysFromNow(-5),
    },
    {
      name: 'Vinay Saxena', email: 'vinay.saxena.demo@email.com', phone: '9922334407',
      organization: 'Saxena Retail', status: 'won', priority: 'high', source: 'Walk-in',
      budget: { min: 25000000, max: 35000000, currency: 'INR' },
      preferredLocations: ['Bandra', 'Linking Road', 'Juhu'], propertyType: 'commercial',
      requirements: 'Retail shop for high-street fashion brand. Ground floor, min 500 sqft.',
      assignedTo: adminId, createdBy: adminId,
      tags: ['closed', 'commercial', 'retail'],
      interestedListings: [listings[13]._id], score: 98,
      convertedAt: daysFromNow(-10),
    },
    {
      name: 'Meera Kulkarni', email: 'meera.kulkarni.demo@email.com', phone: '9922334408',
      organization: '', status: 'lost', priority: 'low', source: 'Property Portal',
      budget: { min: 6000000, max: 7000000, currency: 'INR' },
      preferredLocations: ['Navi Mumbai', 'Kharghar'], propertyType: 'residential',
      requirements: '2BHK in Navi Mumbai. Very tight budget.',
      assignedTo: empId, createdBy: adminId,
      tags: [],
      score: 38, lostReason: 'Budget too low for current market. Opted to rent instead.',
      lostAt: daysFromNow(-15),
    },
    {
      name: 'Arjun Patel', email: 'arjun.patel.demo@email.com', phone: '9922334409',
      organization: 'Patel Constructions', status: 'lead', priority: 'high', source: 'Exhibition',
      budget: { min: 10000000, max: 20000000, currency: 'INR' },
      preferredLocations: ['Pune', 'Viman Nagar', 'Hinjewadi'], propertyType: 'commercial',
      requirements: 'Commercial plot for building a co-working hub. Min 3000 sqft.',
      assignedTo: adminId, createdBy: adminId,
      tags: ['developer', 'co-working', 'plot'], score: 65,
      interestedListings: [listings[18]._id],
      nextFollowUp: daysFromNow(4),
    },
    {
      name: 'Shruti Bhatia', email: 'shruti.bhatia.demo@email.com', phone: '9922334410',
      organization: '', status: 'contacted', priority: 'medium', source: 'Website',
      budget: { min: 6000000, max: 9000000, currency: 'INR' },
      preferredLocations: ['Thane', 'Mulund', 'Ghodbunder Road'], propertyType: 'residential',
      requirements: '2BHK for family. Schools and hospitals nearby. Budget is strict.',
      assignedTo: empId, createdBy: adminId,
      tags: ['family', 'school zone'], score: 55,
      nextFollowUp: daysFromNow(5),
    },
    {
      name: 'Deepak Chaudhary', email: 'deepak.chaudhary.demo@email.com', phone: '9922334411',
      organization: 'ChaudharyTech LLP', status: 'qualified', priority: 'high', source: 'LinkedIn',
      budget: { min: 60000, max: 85000, currency: 'INR' },
      preferredLocations: ['Powai', 'Hiranandani', 'Chandivali'], propertyType: 'residential',
      requirements: '3BHK rental in gated society near Powai. Need by next month.',
      assignedTo: adminId, createdBy: adminId,
      tags: ['IT professional', 'rental', 'urgent'],
      interestedListings: [listings[10]._id], score: 80,
      nextFollowUp: daysFromNow(2),
    },
    {
      name: 'Ananya Singh', email: 'ananya.singh.demo@email.com', phone: '9922334412',
      organization: '', status: 'proposal', priority: 'urgent', source: 'Referral',
      budget: { min: 25000000, max: 45000000, currency: 'INR' },
      preferredLocations: ['Juhu', 'Bandra West', 'Worli'], propertyType: 'residential',
      requirements: 'Looking for a 4–5 BHK villa or penthouse. Garden essential. Celebrity-grade privacy.',
      assignedTo: adminId, createdBy: adminId,
      tags: ['luxury', 'villa', 'HNI'],
      interestedListings: [listings[2]._id, listings[4]._id, listings[7]._id], score: 88,
      nextFollowUp: daysFromNow(1),
    },
  ];

  const clients = [];
  for (const cd of clientsData) {
    clients.push(await upsert(Client, 'email', cd.email, cd));
  }
  console.log(`✓ Clients: ${clients.length}`);

  // ── TASKS ────────────────────────────────────────────────────────────────
  const tasksData = [
    {
      title: 'Site visit — Sea View Worli (Neha Gupta)',
      description: 'Owner Anjali Mehta confirmed. Key handover at 11 AM. Bring brochure and token form.',
      status: 'todo', priority: 'urgent', dueAt: daysFromNow(0),
      assignedTo: adminId, createdBy: adminId,
      related: { kind: 'client', clientId: clients[3]._id },
    },
    {
      title: 'Collect KYC documents — Rohit Desai',
      description: 'PAN card, Aadhar, company registration, last 3-year ITR. Required before agreement.',
      status: 'in_progress', priority: 'high', dueAt: daysFromNow(1),
      assignedTo: adminId, createdBy: adminId,
      related: { kind: 'client', clientId: clients[2]._id },
    },
    {
      title: 'Counter-offer call — Kiran Malhotra',
      description: 'Owner\'s final: ₹75.5L. Present to Kiran, push for closure by EOD. NRI wire transfer ready.',
      status: 'todo', priority: 'urgent', dueAt: daysFromNow(0),
      assignedTo: empId, createdBy: adminId,
      related: { kind: 'client', clientId: clients[4]._id },
    },
    {
      title: 'Photo shoot — Juhu Villa (post renovation)',
      description: 'Owner completed interior work. Book photographer. Need 20+ exterior and interior shots.',
      status: 'todo', priority: 'medium', dueAt: daysFromNow(3),
      assignedTo: adminId, createdBy: adminId,
      related: { kind: 'listing', listingId: listings[2]._id },
    },
    {
      title: 'Send comparison proposal — Ananya Singh',
      description: 'Prepare PDF with Juhu Villa vs Penthouse Worli vs Pune Villa. Include EMI, stamp duty, ROI.',
      status: 'in_progress', priority: 'high', dueAt: daysFromNow(1),
      assignedTo: adminId, createdBy: adminId,
      related: { kind: 'client', clientId: clients[11]._id },
    },
    {
      title: 'Registration appointment booked — Pooja Sharma',
      description: 'Studio apartment sale closed. Sub-registrar appointment confirmed. Lawyer briefed.',
      status: 'done', priority: 'high', dueAt: daysFromNow(-3),
      assignedTo: adminId, createdBy: adminId,
      related: { kind: 'client', clientId: clients[5]._id },
    },
    {
      title: 'Call Arjun Patel — Viman Nagar plot options',
      description: 'Share 2 commercial plot options. Check budget flexibility. Ask about timeline for development start.',
      status: 'todo', priority: 'medium', dueAt: daysFromNow(4),
      assignedTo: empId, createdBy: adminId,
      related: { kind: 'client', clientId: clients[8]._id },
    },
    {
      title: 'Legal verification — BKC Office',
      description: 'Get title deed, OC, CC from owner. Review with company lawyer before sending to Rohit Desai.',
      status: 'in_progress', priority: 'high', dueAt: daysFromNow(2),
      assignedTo: adminId, createdBy: adminId,
      related: { kind: 'listing', listingId: listings[14]._id },
    },
    {
      title: 'Q3 Market Report — Mumbai Residential',
      description: 'Avg ₹/sqft for Bandra, Worli, Powai, Andheri. Source: last 15 registrations. For client presentations.',
      status: 'todo', priority: 'low', dueAt: daysFromNow(7),
      assignedTo: empId, createdBy: adminId,
    },
    {
      title: 'Balance payment follow-up — Vinay Saxena',
      description: '10% balance amount due. RTGS confirmation received. Generate final receipt.',
      status: 'done', priority: 'urgent', dueAt: daysFromNow(-5),
      assignedTo: adminId, createdBy: adminId,
      related: { kind: 'client', clientId: clients[6]._id },
    },
    {
      title: 'Re-engage Sunita Joshi — new Powai rental',
      description: 'New 3BHK at ₹75K in Hiranandani matches her budget and location. Share listing today.',
      status: 'todo', priority: 'medium', dueAt: daysFromNow(2),
      assignedTo: empId, createdBy: adminId,
      related: { kind: 'client', clientId: clients[1]._id },
    },
    {
      title: 'Price negotiation brief — Thane 3BHK',
      description: 'Buyer at ₹74.5L, seller at ₹75L. Propose broker-fee split to close the ₹50K gap. Get both parties on a call.',
      status: 'review', priority: 'urgent', dueAt: daysFromNow(0),
      assignedTo: adminId, createdBy: adminId,
      related: { kind: 'listing', listingId: listings[6]._id },
    },
  ];

  for (const td of tasksData) {
    await upsert(Task, 'title', td.title, td);
  }
  console.log(`✓ Tasks: ${tasksData.length}`);

  // ── BUYER REQUIREMENTS ───────────────────────────────────────────────────
  const buyersData = [
    {
      buyerName: 'Akash Trivedi', buyerEmail: 'akash.trivedi.demo@email.com', buyerPhone: '+919833344501',
      propertyType: 'sale', propertyTypeInterest: 'residential',
      preferredCity: 'Mumbai', preferredLocality: 'Bandra', preferredLocation: 'Bandra West, Khar',
      minPrice: 12000000, maxPrice: 16000000, minBedrooms: 2, minBathrooms: 2,
      status: 'active', priority: 'high', budget: '₹1.2Cr – ₹1.6Cr', timeline: 'Immediate',
      additionalRequirements: 'Society with gym and pool. Walking distance to Bandra station. No east-facing.',
      createdBy: adminId, assignedAgent: adminId, followUpDate: daysFromNow(2),
    },
    {
      buyerName: 'Reena Jain', buyerEmail: 'reena.jain.demo@email.com', buyerPhone: '+919833344502',
      propertyType: 'rent', propertyTypeInterest: 'residential',
      preferredCity: 'Mumbai', preferredLocality: 'Powai', preferredLocation: 'Powai, Chandivali',
      minPrice: 60000, maxPrice: 90000, minBedrooms: 3, minBathrooms: 2,
      status: 'active', priority: 'medium', budget: '₹60K – ₹90K/month', timeline: '1 Month',
      additionalRequirements: 'Near Hiranandani gardens. Pet friendly society. Parking for 2 cars.',
      createdBy: adminId, assignedAgent: empId, followUpDate: daysFromNow(3),
    },
    {
      buyerName: 'Vivek Tiwari', buyerEmail: 'vivek.tiwari.demo@email.com', buyerPhone: '+919833344503',
      propertyType: 'sale', propertyTypeInterest: 'commercial',
      preferredCity: 'Mumbai', preferredLocality: 'Andheri', preferredLocation: 'Andheri West, Goregaon',
      minPrice: 8000000, maxPrice: 15000000,
      status: 'active', priority: 'high', budget: '₹80L – ₹1.5Cr', timeline: '2-3 Months',
      additionalRequirements: 'Office space for IT company. Ground or first floor. Min 600 sqft.',
      createdBy: adminId, assignedAgent: adminId, followUpDate: daysFromNow(1),
    },
    {
      buyerName: 'Pallavi Shinde', buyerEmail: 'pallavi.shinde.demo@email.com', buyerPhone: '+919833344504',
      propertyType: 'sale', propertyTypeInterest: 'residential',
      preferredCity: 'Thane', preferredLocality: 'Thane West', preferredLocation: 'Thane West, Ghodbunder Road',
      minPrice: 6000000, maxPrice: 9000000, minBedrooms: 3, minBathrooms: 2,
      status: 'active', priority: 'medium', budget: '₹60L – ₹90L', timeline: '3-6 Months',
      additionalRequirements: 'School within 2km. Hospital nearby. Ready to move preferred.',
      createdBy: adminId, assignedAgent: empId, followUpDate: daysFromNow(5),
    },
    {
      buyerName: 'Mukesh Rao', buyerEmail: 'mukesh.rao.demo@email.com', buyerPhone: '+919833344505',
      propertyType: 'sale', propertyTypeInterest: 'land',
      preferredCity: 'Pune', preferredLocality: 'Viman Nagar', preferredLocation: 'Pune East, Airport area',
      minPrice: 10000000, maxPrice: 25000000,
      status: 'active', priority: 'urgent', budget: '₹1Cr – ₹2.5Cr', timeline: 'Immediate',
      additionalRequirements: 'Commercial plot. Min 3000 sqft. Road facing, preferably 40ft road or wider.',
      createdBy: adminId, assignedAgent: adminId, followUpDate: daysFromNow(0),
    },
    {
      buyerName: 'Kavita Prasad', buyerEmail: 'kavita.prasad.demo@email.com', buyerPhone: '+919833344506',
      propertyType: 'rent', propertyTypeInterest: 'residential',
      preferredCity: 'Mumbai', preferredLocality: 'Andheri West', preferredLocation: 'Andheri West, Versova',
      minPrice: 20000, maxPrice: 30000, minBedrooms: 1, minBathrooms: 1,
      status: 'matched', priority: 'low', budget: '₹20K – ₹30K/month', timeline: 'Immediate',
      additionalRequirements: 'Metro station within walking distance. Fully furnished preferred.',
      matchedProperties: [listings[9]._id],
      createdBy: adminId, assignedAgent: empId, followUpDate: daysFromNow(7),
    },
    {
      buyerName: 'Sameer Khan', buyerEmail: 'sameer.khan.demo@email.com', buyerPhone: '+919833344507',
      propertyType: 'sale', propertyTypeInterest: 'residential',
      preferredCity: 'Mumbai', preferredLocality: 'Juhu', preferredLocation: 'Juhu, JVPD Scheme, Bandra',
      minPrice: 25000000, maxPrice: 45000000, minBedrooms: 4, minBathrooms: 3,
      status: 'active', priority: 'urgent', budget: '₹2.5Cr – ₹4.5Cr', timeline: 'Immediate',
      additionalRequirements: 'Villa or penthouse. Sea proximity essential. Celebrity-grade privacy and security.',
      createdBy: adminId, assignedAgent: adminId, followUpDate: daysFromNow(1),
    },
    {
      buyerName: 'Divya Oberoi', buyerEmail: 'divya.oberoi.demo@email.com', buyerPhone: '+919833344508',
      propertyType: 'sale', propertyTypeInterest: 'residential',
      preferredCity: 'Navi Mumbai', preferredLocality: 'Kharghar', preferredLocation: 'Navi Mumbai, Kharghar, Panvel',
      minPrice: 4000000, maxPrice: 7000000, minBedrooms: 2, minBathrooms: 1,
      status: 'active', priority: 'medium', budget: '₹40L – ₹70L', timeline: '6 Months',
      additionalRequirements: '2-3BHK in good society. Plot also fine. Budget is firm. Green surroundings preferred.',
      createdBy: adminId, assignedAgent: empId, followUpDate: daysFromNow(6),
    },
  ];

  for (const bd of buyersData) {
    await upsert(BuyerRequirement, 'buyerEmail', bd.buyerEmail, bd);
  }
  console.log(`✓ Buyer requirements: ${buyersData.length}`);

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    Owner.countDocuments({ isDeleted: { $ne: true } }),
    Listing.countDocuments({ isDeleted: { $ne: true } }),
    Client.countDocuments({ isDeleted: { $ne: true } }),
    Task.countDocuments({ isDeleted: { $ne: true } }),
    BuyerRequirement.countDocuments({ isDeleted: { $ne: true } }),
  ]);

  console.log('\n── Database totals ─────────────────────────────');
  console.log(`   Owners:             ${counts[0]}`);
  console.log(`   Listings:           ${counts[1]}`);
  console.log(`   Clients / Leads:    ${counts[2]}`);
  console.log(`   Tasks:              ${counts[3]}`);
  console.log(`   Buyer Requirements: ${counts[4]}`);
  console.log('────────────────────────────────────────────────');
  console.log('\n✅ Demo data seeded successfully!');
  console.log('   Login: ' + admin.email);
  console.log('   Employee login: rahul.verma@demo.salescode.ai / Agent@Demo123\n');

  await mongoose.disconnect();
}

seed().catch((e) => { console.error(e); process.exit(1); });
