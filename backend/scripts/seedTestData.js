/**
 * Seed test data for dashboard testing.
 *
 * Usage:
 *   node scripts/seedTestData.js          # seed data
 *   node scripts/seedTestData.js --clean   # remove seeded data, then seed fresh
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import Listing from '../models/listing.model.js';
import BuyerRequirement from '../models/buyerRequirement.model.js';
import User from '../models/user.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const SEED_TAG = '__seed_test__';

// --------------- helpers ---------------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const monthsAgo = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(rand(1, 28));
  return d;
};

// --------------- data pools ---------------
const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Pune', 'Chennai', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Kolkata'];
const CITY_COORDS = {
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Delhi: { lat: 28.7041, lng: 77.1025 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Lucknow: { lat: 26.8467, lng: 80.9462 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
};
const LOCALITIES = ['Sector 1', 'Sector 5', 'MG Road', 'Whitefield', 'Banjara Hills', 'Andheri West', 'Koramangala', 'HSR Layout', 'Indiranagar', 'Salt Lake'];
const STATUSES = ['available', 'available', 'available', 'sold', 'sold', 'under_negotiation'];
const CATEGORIES = ['residential', 'commercial', 'land'];
const BUYER_STATUSES = ['active', 'active', 'active', 'matched', 'closed', 'inactive'];
const PRIORITIES = ['low', 'medium', 'medium', 'high'];
const NAMES = ['Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Gupta', 'Vikram Singh', 'Neha Joshi', 'Arjun Reddy', 'Kavita Nair', 'Suresh Rao', 'Deepa Menon', 'Rajesh Verma', 'Anita Das', 'Manish Tiwari', 'Pooja Iyer', 'Sanjay Mishra'];
const PHONES = ['9876543210', '9123456789', '8765432109', '7654321098', '9988776655', '8877665544', '7766554433', '9090909090', '8080808080', '7070707070'];

const LISTING_NAMES = [
  '3 BHK Luxury Flat in Prime Location',
  'Spacious 2 BHK Apartment with Garden View',
  'Modern Office Space in Business District',
  'Premium Commercial Shop on Main Road',
  'Residential Plot near Highway',
  '4 BHK Villa with Private Pool',
  'Cozy 1 BHK Studio Apartment',
  'Industrial Warehouse with Loading Dock',
  'Penthouse with Panoramic City View',
  '2 BHK Flat in Gated Community',
  'Corner Shop in Busy Market Area',
  'Agricultural Land with Water Source',
  'Duplex House with Terrace Garden',
  'Furnished Office in Tech Park',
  'Builder Floor in Residential Colony',
  'Commercial Plot near Metro Station',
  'Luxury Apartment with Club Amenities',
  'Semi-Furnished 3 BHK for Rent',
  'Ground Floor Showroom for Lease',
  'Farm House with 2 Acre Land',
  'Budget-Friendly 1 BHK in Suburb',
  'High-Rise Apartment with Sea View',
  'Retail Space in Shopping Complex',
  'Ready-to-Move 2 BHK Apartment',
  'Independent House with Car Parking',
];

async function run() {
  const clean = process.argv.includes('--clean');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Get an admin user to attach data to
  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.error('No admin user found. Please create one first.');
    process.exit(1);
  }
  console.log(`Using admin: ${admin.username} (${admin._id})`);

  // Clean previous seed data if requested
  if (clean) {
    const delListings = await Listing.deleteMany({ remarks: SEED_TAG });
    const delBuyers = await BuyerRequirement.deleteMany({ notes: SEED_TAG });
    console.log(`Cleaned: ${delListings.deletedCount} listings, ${delBuyers.deletedCount} buyer requirements`);
  }

  // ---- Seed Listings ----
  const listings = [];
  for (let i = 0; i < 25; i++) {
    const city = pick(CITIES);
    const status = pick(STATUSES);
    const category = pick(CATEGORIES);
    const type = pick(['sale', 'sale', 'sale', 'rent']);
    const price = category === 'land'
      ? rand(500000, 5000000)
      : category === 'commercial'
        ? rand(1000000, 10000000)
        : rand(800000, 8000000);

    listings.push({
      name: LISTING_NAMES[i] || `Test Property ${i + 1}`,
      description: `This is a test listing in ${city}. Great location with excellent connectivity.`,
      address: `${rand(1, 500)}, ${pick(LOCALITIES)}, ${city}`,
      regularPrice: price,
      discountPrice: Math.round(price * 0.9),
      bathrooms: rand(1, 4),
      bedrooms: rand(1, 5),
      furnished: Math.random() > 0.5,
      parking: Math.random() > 0.3,
      type,
      offer: Math.random() > 0.6,
      imageUrls: ['https://placehold.co/800x600/e2e8f0/475569?text=Property'],
      city,
      locality: pick(LOCALITIES),
      areaSqFt: rand(500, 5000),
      status,
      propertyCategory: category,
      propertyType: category === 'residential' ? pick(['apartment', 'villa', 'house']) : '',
      commercialType: category === 'commercial' ? pick(['office', 'shop', 'showroom']) : '',
      plotType: category === 'land' ? pick(['residential', 'commercial', 'agricultural']) : '',
      location: {
        lat: CITY_COORDS[city].lat + (Math.random() - 0.5) * 0.1,
        lng: CITY_COORDS[city].lng + (Math.random() - 0.5) * 0.1,
      },
      userRef: String(admin._id),
      assignedAgent: null,
      remarks: SEED_TAG,
      isDeleted: false,
      createdAt: monthsAgo(rand(0, 11)),
    });
  }

  const insertedListings = await Listing.insertMany(listings);
  console.log(`Seeded ${insertedListings.length} listings`);

  // ---- Seed Buyer Requirements ----
  const buyers = [];
  for (let i = 0; i < 15; i++) {
    const city = pick(CITIES);
    buyers.push({
      buyerName: NAMES[i],
      buyerEmail: `${NAMES[i].split(' ')[0].toLowerCase()}${rand(1, 99)}@example.com`,
      buyerPhone: pick(PHONES),
      preferredLocation: `${pick(LOCALITIES)}, ${city}`,
      preferredCity: city,
      preferredLocality: pick(LOCALITIES),
      propertyType: pick(['sale', 'sale', 'rent']),
      propertyTypeInterest: pick(['residential', 'commercial', 'land', 'any']),
      minPrice: rand(500000, 2000000),
      maxPrice: rand(3000000, 10000000),
      minBedrooms: rand(1, 3),
      minBathrooms: rand(1, 2),
      preferredArea: `${rand(800, 3000)} sq.ft`,
      additionalRequirements: pick([
        'Needs parking for 2 cars',
        'Prefer south-facing',
        'Near school and hospital',
        'Gated community preferred',
        'Ready to move in',
        'Good ventilation required',
        'Close to metro station',
        '',
      ]),
      status: pick(BUYER_STATUSES),
      priority: pick(PRIORITIES),
      budget: `${rand(20, 90)} Lakhs - ${rand(1, 5)} Crore`,
      timeline: pick(['Immediate', 'Within 1 month', 'Within 3 months', '6 months', 'Flexible']),
      notes: SEED_TAG,
      createdBy: admin._id,
      assignedAgent: null,
      followUpDate: Math.random() > 0.5 ? new Date(Date.now() + rand(-5, 10) * 86400000) : null,
      createdAt: monthsAgo(rand(0, 5)),
    });
  }

  const insertedBuyers = await BuyerRequirement.insertMany(buyers);
  console.log(`Seeded ${insertedBuyers.length} buyer requirements`);

  // ---- Summary ----
  const listingsByStatus = {};
  insertedListings.forEach((l) => { listingsByStatus[l.status] = (listingsByStatus[l.status] || 0) + 1; });
  const buyersByStatus = {};
  insertedBuyers.forEach((b) => { buyersByStatus[b.status] = (buyersByStatus[b.status] || 0) + 1; });

  console.log('\n--- Seed Summary ---');
  console.log('Listings by status:', listingsByStatus);
  console.log('Buyers by status:', buyersByStatus);
  console.log('\nTo clean up later, run: node scripts/seedTestData.js --clean');

  await mongoose.disconnect();
  console.log('Done!');
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
