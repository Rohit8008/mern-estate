import mongoose from 'mongoose';
import Category from '../models/category.model.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ytreal';

const categories = [
  // ============================================
  // RESIDENTIAL FOR SALE
  // ============================================
  {
    name: 'Residential for Sale',
    slug: 'residential-for-sale',
    fields: [
      // Property Type Selector (controls conditional fields)
      { key: 'propertyType', label: 'Property Type', type: 'select', required: true, group: 'basic', order: 1,
        options: ['Apartment/Flat', 'Independent House', 'Villa', 'Builder Floor', 'Penthouse', 'Studio Apartment', 'Farm House'] },

      // === APARTMENT SPECIFIC FIELDS ===
      { key: 'bhkType', label: 'BHK Type', type: 'select', required: true, group: 'basic', order: 2,
        options: ['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK', '5+ BHK'],
        showWhen: { field: 'propertyType', values: ['Apartment/Flat', 'Builder Floor', 'Penthouse', 'Studio Apartment'] } },
      { key: 'floor', label: 'Floor Number', type: 'select', required: true, group: 'basic', order: 3,
        options: ['Lower Basement', 'Upper Basement', 'Ground', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11-15', '16-20', '21-30', '30+'],
        showWhen: { field: 'propertyType', values: ['Apartment/Flat', 'Builder Floor', 'Penthouse', 'Studio Apartment'] } },
      { key: 'totalFloors', label: 'Total Floors in Building', type: 'number', required: true, group: 'basic', order: 4, min: 1, max: 100,
        showWhen: { field: 'propertyType', values: ['Apartment/Flat', 'Builder Floor', 'Penthouse', 'Studio Apartment'] } },
      { key: 'towerBlock', label: 'Tower/Block', type: 'text', required: false, group: 'basic', order: 5,
        showWhen: { field: 'propertyType', values: ['Apartment/Flat', 'Penthouse'] } },

      // === HOUSE/VILLA SPECIFIC FIELDS ===
      { key: 'bedrooms', label: 'Bedrooms', type: 'select', required: true, group: 'basic', order: 2,
        options: ['1', '2', '3', '4', '5', '6', '7', '8', '8+'],
        showWhen: { field: 'propertyType', values: ['Independent House', 'Villa', 'Farm House'] } },
      { key: 'floorsInBuilding', label: 'Floors in Property', type: 'select', required: true, group: 'basic', order: 3,
        options: ['1', '2', '3', '4', '4+'],
        showWhen: { field: 'propertyType', values: ['Independent House', 'Villa', 'Farm House'] } },
      { key: 'plotArea', label: 'Plot Area', type: 'number', required: true, group: 'area', order: 10, min: 50, unit: 'sq ft',
        showWhen: { field: 'propertyType', values: ['Independent House', 'Villa', 'Farm House'] } },

      // === COMMON FIELDS FOR ALL ===
      { key: 'builtUpArea', label: 'Built-up Area', type: 'number', required: true, group: 'area', order: 11, min: 100, unit: 'sq ft' },
      { key: 'carpetArea', label: 'Carpet Area', type: 'number', required: false, group: 'area', order: 12, min: 50, unit: 'sq ft' },
      { key: 'bathrooms', label: 'Bathrooms', type: 'select', required: true, group: 'basic', order: 6, options: ['1', '2', '3', '4', '5', '5+'] },
      { key: 'balconies', label: 'Balconies', type: 'select', required: false, group: 'basic', order: 7, options: ['0', '1', '2', '3', '3+'] },

      { key: 'furnishing', label: 'Furnishing Status', type: 'select', required: true, group: 'features', order: 20,
        options: ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] },
      { key: 'facing', label: 'Facing', type: 'select', required: false, group: 'features', order: 21,
        options: ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'] },
      { key: 'ageOfProperty', label: 'Age of Property', type: 'select', required: false, group: 'features', order: 22,
        options: ['Under Construction', 'Less than 1 year', '1-3 years', '3-5 years', '5-10 years', '10+ years'] },
      { key: 'possession', label: 'Possession Status', type: 'select', required: true, group: 'features', order: 23,
        options: ['Ready to Move', 'Within 3 months', 'Within 6 months', 'Within 1 year', '1-2 years', '2+ years'] },

      { key: 'parking', label: 'Parking', type: 'select', required: false, group: 'features', order: 24,
        options: ['None', '1 Covered', '2 Covered', '3+ Covered', '1 Open', '2 Open', 'Both Covered & Open'] },

      // === PRICING FIELDS ===
      { key: 'priceNegotiable', label: 'Price Negotiable', type: 'select', required: false, group: 'pricing', order: 30, options: ['Yes', 'No'] },
      { key: 'allInclusivePrice', label: 'All Inclusive Price', type: 'select', required: false, group: 'pricing', order: 31, options: ['Yes', 'No'],
        description: 'Price includes registration, maintenance, etc.' },
      { key: 'taxExcluded', label: 'Tax & Govt Charges Excluded', type: 'select', required: false, group: 'pricing', order: 32, options: ['Yes', 'No'] },
      { key: 'maintenanceCharges', label: 'Maintenance (per month)', type: 'number', required: false, group: 'pricing', order: 33, unit: '₹' },

      // === AMENITIES (Common) ===
      { key: 'amenities', label: 'Society Amenities', type: 'select', multiple: true, group: 'amenities', order: 40,
        options: ['Lift', 'Power Backup', '24x7 Security', 'CCTV', 'Gym', 'Swimming Pool', 'Club House', 'Children Play Area',
                  'Garden/Park', 'Indoor Games', 'Gas Pipeline', 'Intercom', 'Fire Safety', 'Visitor Parking', 'ATM',
                  'Grocery Shop', 'Temple', 'Jogging Track', 'Tennis Court', 'Badminton Court', 'Basketball Court'] },

      // === HOUSE SPECIFIC AMENITIES ===
      { key: 'houseFeatures', label: 'Property Features', type: 'select', multiple: true, group: 'amenities', order: 41,
        options: ['Servant Room', 'Study Room', 'Pooja Room', 'Store Room', 'Terrace', 'Garden', 'Water Storage',
                  'Rain Water Harvesting', 'Vastu Compliant', 'Corner Property', 'Bank Attached', 'Loan Available'],
        showWhen: { field: 'propertyType', values: ['Independent House', 'Villa', 'Farm House'] } },

      // === LEGAL/APPROVALS ===
      { key: 'ownership', label: 'Ownership Type', type: 'select', required: false, group: 'legal', order: 50,
        options: ['Freehold', 'Leasehold', 'Co-operative Society', 'Power of Attorney'] },
      { key: 'approvals', label: 'Approvals', type: 'select', multiple: true, group: 'legal', order: 51,
        options: ['RERA Registered', 'Occupancy Certificate', 'Completion Certificate', 'Bank Loan Approved'] },
    ],
  },

  // ============================================
  // RESIDENTIAL FOR RENT
  // ============================================
  {
    name: 'Residential for Rent',
    slug: 'residential-for-rent',
    fields: [
      { key: 'propertyType', label: 'Property Type', type: 'select', required: true, group: 'basic', order: 1,
        options: ['Apartment/Flat', 'Independent House', 'Villa', 'Builder Floor', 'Penthouse', 'Studio Apartment', 'Farm House'] },

      // === APARTMENT SPECIFIC ===
      { key: 'bhkType', label: 'BHK Type', type: 'select', required: true, group: 'basic', order: 2,
        options: ['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK', '5+ BHK'],
        showWhen: { field: 'propertyType', values: ['Apartment/Flat', 'Builder Floor', 'Penthouse', 'Studio Apartment'] } },
      { key: 'floor', label: 'Floor Number', type: 'select', required: true, group: 'basic', order: 3,
        options: ['Lower Basement', 'Upper Basement', 'Ground', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11-15', '16-20', '21-30', '30+'],
        showWhen: { field: 'propertyType', values: ['Apartment/Flat', 'Builder Floor', 'Penthouse', 'Studio Apartment'] } },

      // === HOUSE/VILLA SPECIFIC ===
      { key: 'bedrooms', label: 'Bedrooms', type: 'select', required: true, group: 'basic', order: 2,
        options: ['1', '2', '3', '4', '5', '6', '7', '8', '8+'],
        showWhen: { field: 'propertyType', values: ['Independent House', 'Villa', 'Farm House'] } },

      // === COMMON FIELDS ===
      { key: 'builtUpArea', label: 'Built-up Area', type: 'number', required: true, group: 'area', order: 10, min: 100, unit: 'sq ft' },
      { key: 'bathrooms', label: 'Bathrooms', type: 'select', required: true, group: 'basic', order: 5, options: ['1', '2', '3', '4', '5', '5+'] },
      { key: 'balconies', label: 'Balconies', type: 'select', required: false, group: 'basic', order: 6, options: ['0', '1', '2', '3', '3+'] },

      { key: 'furnishing', label: 'Furnishing Status', type: 'select', required: true, group: 'features', order: 20,
        options: ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] },
      { key: 'facing', label: 'Facing', type: 'select', required: false, group: 'features', order: 21,
        options: ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'] },
      { key: 'parking', label: 'Parking', type: 'select', required: false, group: 'features', order: 22,
        options: ['None', '1 Covered', '2 Covered', '1 Open', '2 Open', 'Both'] },

      // === RENTAL SPECIFIC FIELDS ===
      { key: 'preferredTenants', label: 'Preferred Tenants', type: 'select', required: true, group: 'rental', order: 30,
        options: ['Family', 'Bachelor Male', 'Bachelor Female', 'Company Lease', 'Any'] },
      { key: 'availableFrom', label: 'Available From', type: 'date', required: false, group: 'rental', order: 31 },
      { key: 'securityDeposit', label: 'Security Deposit', type: 'select', required: true, group: 'rental', order: 32,
        options: ['No Deposit', '1 Month', '2 Months', '3 Months', '6 Months', '10 Months', '12 Months'] },
      { key: 'rentNegotiable', label: 'Rent Negotiable', type: 'select', required: false, group: 'rental', order: 33, options: ['Yes', 'No'] },
      { key: 'maintenanceIncluded', label: 'Maintenance Included', type: 'select', required: false, group: 'rental', order: 34, options: ['Yes', 'No'] },
      { key: 'electricityBill', label: 'Electricity Bill', type: 'select', required: false, group: 'rental', order: 35, options: ['Included', 'Extra'] },
      { key: 'waterCharges', label: 'Water Charges', type: 'select', required: false, group: 'rental', order: 36, options: ['Included', 'Extra'] },
      { key: 'nonVegAllowed', label: 'Non-Veg Allowed', type: 'select', required: false, group: 'rental', order: 37, options: ['Yes', 'No'] },
      { key: 'petsAllowed', label: 'Pets Allowed', type: 'select', required: false, group: 'rental', order: 38, options: ['Yes', 'No'] },

      // === FURNISHING DETAILS (Only if furnished) ===
      { key: 'furnishingDetails', label: 'Furnishing Includes', type: 'select', multiple: true, group: 'furnishing', order: 40,
        options: ['AC', 'TV', 'Bed', 'Wardrobe', 'Sofa', 'Dining Table', 'Refrigerator', 'Washing Machine',
                  'Microwave', 'Gas Stove', 'Water Purifier', 'Geyser', 'Curtains', 'Modular Kitchen'],
        showWhen: { field: 'furnishing', values: ['Semi-Furnished', 'Fully Furnished'] } },

      { key: 'amenities', label: 'Society Amenities', type: 'select', multiple: true, group: 'amenities', order: 50,
        options: ['Lift', 'Power Backup', '24x7 Security', 'CCTV', 'Gym', 'Swimming Pool', 'Club House',
                  'Children Play Area', 'Garden/Park', 'Gas Pipeline', 'Intercom', 'Visitor Parking'] },
    ],
  },

  // ============================================
  // COMMERCIAL FOR SALE
  // ============================================
  {
    name: 'Commercial for Sale',
    slug: 'commercial-for-sale',
    fields: [
      { key: 'propertyType', label: 'Property Type', type: 'select', required: true, group: 'basic', order: 1,
        options: ['Office Space', 'Shop/Showroom', 'Commercial Land', 'Warehouse/Godown', 'Industrial Building',
                  'Industrial Shed', 'Co-working Space', 'Restaurant/Cafe', 'Hotel/Resort', 'Banquet Hall', 'Cold Storage'] },

      // === OFFICE SPACE SPECIFIC ===
      { key: 'officeType', label: 'Office Type', type: 'select', required: true, group: 'basic', order: 2,
        options: ['Ready to Move Office', 'Bare Shell', 'Co-working', 'Plug & Play'],
        showWhen: { field: 'propertyType', values: ['Office Space', 'Co-working Space'] } },
      { key: 'seatingCapacity', label: 'Seating Capacity', type: 'number', required: false, group: 'basic', order: 3, min: 1,
        showWhen: { field: 'propertyType', values: ['Office Space', 'Co-working Space'] } },
      { key: 'cabins', label: 'No. of Cabins', type: 'number', required: false, group: 'basic', order: 4, min: 0,
        showWhen: { field: 'propertyType', values: ['Office Space'] } },
      { key: 'meetingRooms', label: 'Meeting Rooms', type: 'number', required: false, group: 'basic', order: 5, min: 0,
        showWhen: { field: 'propertyType', values: ['Office Space', 'Co-working Space'] } },
      { key: 'pantry', label: 'Pantry/Cafeteria', type: 'select', required: false, group: 'basic', order: 6, options: ['Dry', 'Wet', 'None'],
        showWhen: { field: 'propertyType', values: ['Office Space', 'Co-working Space'] } },

      // === SHOP/SHOWROOM SPECIFIC ===
      { key: 'shopType', label: 'Shop Suitable For', type: 'select', required: false, group: 'basic', order: 2,
        options: ['Retail', 'Jewellery', 'Garments', 'Electronics', 'Furniture', 'Pharmacy', 'Grocery', 'Restaurant', 'Clinic', 'Bank', 'Any'],
        showWhen: { field: 'propertyType', values: ['Shop/Showroom'] } },
      { key: 'frontage', label: 'Frontage Width', type: 'number', required: false, group: 'basic', order: 3, unit: 'ft',
        showWhen: { field: 'propertyType', values: ['Shop/Showroom'] } },
      { key: 'ceilingHeight', label: 'Ceiling Height', type: 'number', required: false, group: 'basic', order: 4, unit: 'ft',
        showWhen: { field: 'propertyType', values: ['Shop/Showroom', 'Warehouse/Godown'] } },
      { key: 'mezzanine', label: 'Mezzanine Floor', type: 'select', required: false, group: 'basic', order: 5, options: ['Yes', 'No'],
        showWhen: { field: 'propertyType', values: ['Shop/Showroom'] } },
      { key: 'mainRoadFacing', label: 'Main Road Facing', type: 'select', required: false, group: 'basic', order: 6, options: ['Yes', 'No'],
        showWhen: { field: 'propertyType', values: ['Shop/Showroom'] } },

      // === WAREHOUSE/INDUSTRIAL SPECIFIC ===
      { key: 'warehouseType', label: 'Warehouse Type', type: 'select', required: false, group: 'basic', order: 2,
        options: ['Standard', 'Cold Storage', 'A Grade', 'B Grade', 'C Grade'],
        showWhen: { field: 'propertyType', values: ['Warehouse/Godown', 'Cold Storage'] } },
      { key: 'floorStrength', label: 'Floor Load Capacity', type: 'select', required: false, group: 'basic', order: 3,
        options: ['Up to 2 Ton/sqm', '2-5 Ton/sqm', '5-10 Ton/sqm', '10+ Ton/sqm'],
        showWhen: { field: 'propertyType', values: ['Warehouse/Godown', 'Industrial Building'] } },
      { key: 'loadingDocks', label: 'Loading Docks', type: 'number', required: false, group: 'basic', order: 4, min: 0,
        showWhen: { field: 'propertyType', values: ['Warehouse/Godown', 'Industrial Building'] } },
      { key: 'powerLoad', label: 'Power Load', type: 'select', required: false, group: 'basic', order: 5,
        options: ['Up to 50 KW', '50-100 KW', '100-250 KW', '250-500 KW', '500 KW+'],
        showWhen: { field: 'propertyType', values: ['Warehouse/Godown', 'Industrial Building', 'Industrial Shed'] } },

      // === HOTEL/RESTAURANT SPECIFIC ===
      { key: 'rooms', label: 'No. of Rooms', type: 'number', required: false, group: 'basic', order: 2, min: 1,
        showWhen: { field: 'propertyType', values: ['Hotel/Resort'] } },
      { key: 'starCategory', label: 'Star Category', type: 'select', required: false, group: 'basic', order: 3,
        options: ['Budget', '1 Star', '2 Star', '3 Star', '4 Star', '5 Star', '5 Star Deluxe'],
        showWhen: { field: 'propertyType', values: ['Hotel/Resort'] } },
      { key: 'restaurantSeating', label: 'Seating Capacity', type: 'number', required: false, group: 'basic', order: 2, min: 1,
        showWhen: { field: 'propertyType', values: ['Restaurant/Cafe', 'Banquet Hall'] } },
      { key: 'kitchenSetup', label: 'Kitchen Setup', type: 'select', required: false, group: 'basic', order: 3, options: ['Yes', 'No'],
        showWhen: { field: 'propertyType', values: ['Restaurant/Cafe'] } },

      // === COMMON FIELDS ===
      { key: 'builtUpArea', label: 'Built-up Area', type: 'number', required: true, group: 'area', order: 10, min: 50, unit: 'sq ft' },
      { key: 'carpetArea', label: 'Carpet Area', type: 'number', required: false, group: 'area', order: 11, min: 50, unit: 'sq ft' },
      { key: 'plotArea', label: 'Plot Area', type: 'number', required: false, group: 'area', order: 12, min: 50, unit: 'sq ft',
        showWhen: { field: 'propertyType', values: ['Commercial Land', 'Industrial Building', 'Industrial Shed', 'Warehouse/Godown', 'Hotel/Resort'] } },

      { key: 'floor', label: 'Floor', type: 'select', required: false, group: 'basic', order: 7,
        options: ['Lower Basement', 'Upper Basement', 'Ground', '1', '2', '3', '4', '5', '6-10', '10+'] },
      { key: 'furnishing', label: 'Furnishing', type: 'select', required: true, group: 'features', order: 20,
        options: ['Unfurnished', 'Semi-Furnished', 'Fully Furnished', 'Bare Shell', 'Warm Shell'] },
      { key: 'ageOfProperty', label: 'Age of Property', type: 'select', required: false, group: 'features', order: 21,
        options: ['Under Construction', 'Less than 1 year', '1-3 years', '3-5 years', '5-10 years', '10+ years'] },
      { key: 'possession', label: 'Possession Status', type: 'select', required: true, group: 'features', order: 22,
        options: ['Ready to Move', 'Within 3 months', 'Within 6 months', 'Within 1 year', '1+ year'] },

      { key: 'washrooms', label: 'Washrooms', type: 'select', required: false, group: 'features', order: 23,
        options: ['No Washroom', 'Shared', 'Private - 1', 'Private - 2', 'Private - 3+'] },
      { key: 'parking', label: 'Parking', type: 'select', required: false, group: 'features', order: 24,
        options: ['None', 'Public/Shared', 'Reserved - 1', 'Reserved - 2', 'Reserved - 3+'] },

      { key: 'currentlyOperational', label: 'Currently Operational', type: 'select', required: false, group: 'features', order: 25,
        options: ['Yes', 'No'] },
      { key: 'preLeased', label: 'Pre-Leased / Pre-Rented', type: 'select', required: false, group: 'features', order: 26,
        options: ['Yes', 'No'],
        description: 'Property with existing tenant' },
      { key: 'currentRent', label: 'Current Monthly Rent', type: 'number', required: false, group: 'features', order: 27, unit: '₹',
        showWhen: { field: 'preLeased', values: ['Yes'] } },

      { key: 'amenities', label: 'Building Amenities', type: 'select', multiple: true, group: 'amenities', order: 40,
        options: ['Lift', 'Power Backup', 'Security', 'Central AC', 'Fire Safety', 'Cafeteria', 'ATM',
                  'Conference Room', 'Reception', 'Visitor Parking', 'Maintenance Staff', 'Water Storage'] },

      { key: 'ownership', label: 'Ownership Type', type: 'select', required: false, group: 'legal', order: 50,
        options: ['Freehold', 'Leasehold', 'Co-operative Society', 'Power of Attorney'] },
    ],
  },

  // ============================================
  // COMMERCIAL FOR RENT/LEASE
  // ============================================
  {
    name: 'Commercial for Rent',
    slug: 'commercial-for-rent',
    fields: [
      { key: 'propertyType', label: 'Property Type', type: 'select', required: true, group: 'basic', order: 1,
        options: ['Office Space', 'Shop/Showroom', 'Warehouse/Godown', 'Industrial Building', 'Industrial Shed',
                  'Co-working Space', 'Restaurant/Cafe', 'Banquet Hall', 'Cold Storage'] },

      // === OFFICE SPACE SPECIFIC ===
      { key: 'officeType', label: 'Office Type', type: 'select', required: true, group: 'basic', order: 2,
        options: ['Ready to Move Office', 'Bare Shell', 'Co-working Desk', 'Private Cabin', 'Plug & Play'],
        showWhen: { field: 'propertyType', values: ['Office Space', 'Co-working Space'] } },
      { key: 'seatingCapacity', label: 'Seating Capacity', type: 'number', required: false, group: 'basic', order: 3, min: 1,
        showWhen: { field: 'propertyType', values: ['Office Space', 'Co-working Space'] } },
      { key: 'cabins', label: 'No. of Cabins', type: 'number', required: false, group: 'basic', order: 4, min: 0,
        showWhen: { field: 'propertyType', values: ['Office Space'] } },
      { key: 'meetingRooms', label: 'Meeting Rooms', type: 'number', required: false, group: 'basic', order: 5, min: 0,
        showWhen: { field: 'propertyType', values: ['Office Space', 'Co-working Space'] } },

      // === SHOP/SHOWROOM SPECIFIC ===
      { key: 'shopType', label: 'Shop Suitable For', type: 'select', required: false, group: 'basic', order: 2,
        options: ['Retail', 'Jewellery', 'Garments', 'Electronics', 'Furniture', 'Pharmacy', 'Grocery', 'Restaurant', 'Clinic', 'Bank', 'Any'],
        showWhen: { field: 'propertyType', values: ['Shop/Showroom'] } },
      { key: 'frontage', label: 'Frontage Width', type: 'number', required: false, group: 'basic', order: 3, unit: 'ft',
        showWhen: { field: 'propertyType', values: ['Shop/Showroom'] } },
      { key: 'mainRoadFacing', label: 'Main Road Facing', type: 'select', required: false, group: 'basic', order: 4, options: ['Yes', 'No'],
        showWhen: { field: 'propertyType', values: ['Shop/Showroom'] } },

      // === WAREHOUSE SPECIFIC ===
      { key: 'loadingDocks', label: 'Loading Docks', type: 'number', required: false, group: 'basic', order: 2, min: 0,
        showWhen: { field: 'propertyType', values: ['Warehouse/Godown', 'Industrial Building'] } },
      { key: 'powerLoad', label: 'Power Load', type: 'select', required: false, group: 'basic', order: 3,
        options: ['Up to 50 KW', '50-100 KW', '100-250 KW', '250-500 KW', '500 KW+'],
        showWhen: { field: 'propertyType', values: ['Warehouse/Godown', 'Industrial Building', 'Industrial Shed'] } },

      // === COMMON FIELDS ===
      { key: 'builtUpArea', label: 'Built-up Area', type: 'number', required: true, group: 'area', order: 10, min: 50, unit: 'sq ft' },
      { key: 'carpetArea', label: 'Carpet Area', type: 'number', required: false, group: 'area', order: 11, unit: 'sq ft' },
      { key: 'floor', label: 'Floor', type: 'select', required: false, group: 'basic', order: 6,
        options: ['Lower Basement', 'Upper Basement', 'Ground', '1', '2', '3', '4', '5', '6-10', '10+'] },
      { key: 'furnishing', label: 'Furnishing', type: 'select', required: true, group: 'features', order: 20,
        options: ['Unfurnished', 'Semi-Furnished', 'Fully Furnished', 'Bare Shell'] },
      { key: 'washrooms', label: 'Washrooms', type: 'select', required: false, group: 'features', order: 21,
        options: ['No Washroom', 'Shared', 'Private - 1', 'Private - 2', 'Private - 3+'] },
      { key: 'parking', label: 'Parking', type: 'select', required: false, group: 'features', order: 22,
        options: ['None', 'Public/Shared', 'Reserved - 1', 'Reserved - 2', 'Reserved - 3+'] },

      // === RENTAL SPECIFIC ===
      { key: 'availableFrom', label: 'Available From', type: 'date', required: false, group: 'rental', order: 30 },
      { key: 'securityDeposit', label: 'Security Deposit', type: 'select', required: true, group: 'rental', order: 31,
        options: ['1 Month', '2 Months', '3 Months', '6 Months', '12 Months', 'Negotiable'] },
      { key: 'lockInPeriod', label: 'Lock-in Period', type: 'select', required: false, group: 'rental', order: 32,
        options: ['None', '6 Months', '1 Year', '2 Years', '3 Years', '5 Years'] },
      { key: 'leaseLength', label: 'Lease Duration', type: 'select', required: false, group: 'rental', order: 33,
        options: ['11 Months', '2 Years', '3 Years', '5 Years', '9 Years', 'Negotiable'] },
      { key: 'rentIncrease', label: 'Annual Rent Escalation', type: 'select', required: false, group: 'rental', order: 34,
        options: ['5%', '10%', '15%', 'Fixed', 'Negotiable'] },
      { key: 'maintenanceIncluded', label: 'Maintenance Included', type: 'select', required: false, group: 'rental', order: 35, options: ['Yes', 'No'] },
      { key: 'electricityIncluded', label: 'Electricity Included', type: 'select', required: false, group: 'rental', order: 36, options: ['Yes', 'No'] },

      { key: 'amenities', label: 'Building Amenities', type: 'select', multiple: true, group: 'amenities', order: 40,
        options: ['Lift', 'Power Backup', 'Security', 'Central AC', 'Fire Safety', 'Cafeteria', 'ATM',
                  'Conference Room', 'Reception', 'Visitor Parking', 'Maintenance Staff'] },
    ],
  },

  // ============================================
  // LAND & PLOTS
  // ============================================
  {
    name: 'Land & Plots',
    slug: 'land-plots',
    fields: [
      { key: 'plotType', label: 'Land/Plot Type', type: 'select', required: true, group: 'basic', order: 1,
        options: ['Residential Plot', 'Commercial Plot', 'Industrial Land', 'Agricultural Land', 'Farm Land', 'Institutional Land', 'Mixed Use'] },
      { key: 'transactionType', label: 'Transaction Type', type: 'select', required: true, group: 'basic', order: 2,
        options: ['Sale', 'Lease'] },

      // === AREA FIELDS ===
      { key: 'plotArea', label: 'Plot Area', type: 'number', required: true, group: 'area', order: 10, min: 10 },
      { key: 'plotAreaUnit', label: 'Area Unit', type: 'select', required: true, group: 'area', order: 11,
        options: ['Sq Ft', 'Sq Yards', 'Sq Meters', 'Acres', 'Hectares', 'Bigha', 'Guntha', 'Marla', 'Kanal', 'Biswa'] },
      { key: 'length', label: 'Length', type: 'number', required: false, group: 'area', order: 12, unit: 'ft' },
      { key: 'breadth', label: 'Breadth', type: 'number', required: false, group: 'area', order: 13, unit: 'ft' },

      // === PLOT FEATURES ===
      { key: 'facing', label: 'Facing', type: 'select', required: false, group: 'features', order: 20,
        options: ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'] },
      { key: 'cornerPlot', label: 'Corner Plot', type: 'select', required: false, group: 'features', order: 21, options: ['Yes', 'No'] },
      { key: 'boundaryWall', label: 'Boundary Wall', type: 'select', required: false, group: 'features', order: 22, options: ['Yes', 'No', 'Partial'] },
      { key: 'gatedCommunity', label: 'Gated Community/Layout', type: 'select', required: false, group: 'features', order: 23, options: ['Yes', 'No'] },
      { key: 'roadWidth', label: 'Road Width', type: 'select', required: false, group: 'features', order: 24,
        options: ['Below 20 ft', '20-30 ft', '30-40 ft', '40-60 ft', '60-80 ft', '80-100 ft', '100+ ft'] },
      { key: 'roadType', label: 'Road Type', type: 'select', required: false, group: 'features', order: 25,
        options: ['Tar/Asphalt', 'Concrete', 'Gravel', 'Mud Road'] },
      { key: 'openSides', label: 'Open Sides', type: 'select', required: false, group: 'features', order: 26,
        options: ['1 Side', '2 Sides', '3 Sides', '4 Sides'] },

      // === AGRICULTURAL SPECIFIC ===
      { key: 'soilType', label: 'Soil Type', type: 'select', required: false, group: 'features', order: 27,
        options: ['Black Soil', 'Red Soil', 'Alluvial', 'Sandy', 'Clayey', 'Loamy'],
        showWhen: { field: 'plotType', values: ['Agricultural Land', 'Farm Land'] } },
      { key: 'waterSource', label: 'Water Source', type: 'select', multiple: true, group: 'features', order: 28,
        options: ['Borewell', 'Open Well', 'Canal', 'River', 'Pond', 'Municipal', 'Rain Fed', 'No Water'],
        showWhen: { field: 'plotType', values: ['Agricultural Land', 'Farm Land'] } },
      { key: 'farmHouse', label: 'Farm House Exists', type: 'select', required: false, group: 'features', order: 29, options: ['Yes', 'No'],
        showWhen: { field: 'plotType', values: ['Farm Land'] } },

      // === INDUSTRIAL SPECIFIC ===
      { key: 'industrialZone', label: 'Industrial Zone', type: 'select', required: false, group: 'features', order: 27,
        options: ['SEZ', 'Industrial Estate', 'MIDC', 'Private Industrial Area', 'Outside Zone'],
        showWhen: { field: 'plotType', values: ['Industrial Land'] } },
      { key: 'powerAvailability', label: 'Power Availability', type: 'select', required: false, group: 'features', order: 28,
        options: ['Up to 50 KW', '50-100 KW', '100-500 KW', '500 KW+', 'Not Available'],
        showWhen: { field: 'plotType', values: ['Industrial Land'] } },

      // === APPROVALS & LEGAL ===
      { key: 'approvals', label: 'Approvals/Clearances', type: 'select', multiple: true, group: 'legal', order: 40,
        options: ['RERA Registered', 'DTCP Approved', 'HMDA Approved', 'NA Order', 'Mutation Done', 'Clear Title',
                  'Panchayat Approved', 'BDA Approved', 'CMDA Approved', 'BMRDA Approved', 'NOC Available'] },
      { key: 'possessionStatus', label: 'Possession Status', type: 'select', required: false, group: 'legal', order: 41,
        options: ['Immediate', 'Within 1 Month', 'Within 3 Months', 'Within 6 Months', 'Encroached/Litigation'] },
      { key: 'ownership', label: 'Ownership Type', type: 'select', required: false, group: 'legal', order: 42,
        options: ['Freehold', 'Leasehold', 'Power of Attorney', 'Joint Ownership'] },

      // === NEARBY ===
      { key: 'nearbyLandmarks', label: 'Nearby', type: 'select', multiple: true, group: 'location', order: 50,
        options: ['Main Road', 'Highway', 'Metro Station', 'Railway Station', 'Bus Stand', 'Hospital',
                  'School/College', 'Market', 'Industrial Area', 'IT Park', 'Airport'] },
    ],
  },

  // ============================================
  // PG / HOSTEL
  // ============================================
  {
    name: 'PG / Hostel',
    slug: 'pg-hostel',
    fields: [
      { key: 'pgType', label: 'PG Type', type: 'select', required: true, group: 'basic', order: 1,
        options: ['Boys PG', 'Girls PG', 'Co-Living (Boys & Girls)', 'Working Women Hostel', 'Student Hostel'] },
      { key: 'roomType', label: 'Room Type', type: 'select', required: true, group: 'basic', order: 2,
        options: ['Single Occupancy', 'Double Sharing', 'Triple Sharing', '4 Sharing', '4+ Sharing', 'Dormitory'] },

      // === ROOM FEATURES ===
      { key: 'roomSize', label: 'Room Size (approx)', type: 'number', required: false, group: 'basic', order: 3, unit: 'sq ft' },
      { key: 'attachedBathroom', label: 'Attached Bathroom', type: 'select', required: true, group: 'basic', order: 4, options: ['Yes', 'No (Common)'] },
      { key: 'acRoom', label: 'AC Room', type: 'select', required: true, group: 'basic', order: 5, options: ['AC', 'Non-AC', 'Both Available'] },
      { key: 'balcony', label: 'Balcony', type: 'select', required: false, group: 'basic', order: 6, options: ['Yes', 'No'] },

      // === FOOD ===
      { key: 'foodIncluded', label: 'Food Included', type: 'select', required: true, group: 'food', order: 10,
        options: ['No Food', 'Breakfast Only', 'Breakfast & Dinner', 'All 3 Meals', 'Optional (Extra Cost)'] },
      { key: 'foodType', label: 'Food Type', type: 'select', required: false, group: 'food', order: 11,
        options: ['Veg Only', 'Non-Veg Available', 'Both'],
        showWhen: { field: 'foodIncluded', values: ['Breakfast Only', 'Breakfast & Dinner', 'All 3 Meals', 'Optional (Extra Cost)'] } },
      { key: 'cookingAllowed', label: 'Self Cooking Allowed', type: 'select', required: false, group: 'food', order: 12, options: ['Yes', 'No'] },

      // === TENANT PREFERENCE ===
      { key: 'availableFor', label: 'Available For', type: 'select', required: true, group: 'tenant', order: 20,
        options: ['Students Only', 'Working Professionals Only', 'Both Students & Working'] },
      { key: 'totalBeds', label: 'Total Beds Available', type: 'number', required: false, group: 'tenant', order: 21, min: 1 },
      { key: 'availableFrom', label: 'Available From', type: 'date', required: false, group: 'tenant', order: 22 },

      // === PRICING ===
      { key: 'securityDeposit', label: 'Security Deposit', type: 'select', required: true, group: 'pricing', order: 30,
        options: ['No Deposit', '1 Month', '2 Months', '3 Months'] },
      { key: 'noticePeriod', label: 'Notice Period', type: 'select', required: false, group: 'pricing', order: 31,
        options: ['No Notice', '15 Days', '1 Month', '2 Months'] },
      { key: 'electricityCharges', label: 'Electricity Charges', type: 'select', required: false, group: 'pricing', order: 32,
        options: ['Included in Rent', 'Extra as per Usage', 'Fixed Monthly'] },

      // === AMENITIES ===
      { key: 'amenities', label: 'Amenities Included', type: 'select', multiple: true, group: 'amenities', order: 40,
        options: ['WiFi', 'TV', 'Washing Machine', 'Refrigerator', 'Microwave', 'Water Purifier', 'Geyser/Hot Water',
                  'Power Backup', 'Housekeeping', 'Laundry Service', 'Room Cleaning'] },
      { key: 'commonAmenities', label: 'Common Area Amenities', type: 'select', multiple: true, group: 'amenities', order: 41,
        options: ['Common TV Room', 'Study Room', 'Gym', 'Terrace Access', 'Parking (2 Wheeler)', 'Parking (4 Wheeler)',
                  'Recreation Room', 'Library', 'Rooftop'] },
      { key: 'security', label: 'Security Features', type: 'select', multiple: true, group: 'amenities', order: 42,
        options: ['24x7 Security', 'CCTV', 'Biometric Entry', 'Warden', 'Visitor Register', 'Night Curfew'] },

      // === RULES ===
      { key: 'houseRules', label: 'House Rules', type: 'select', multiple: true, group: 'rules', order: 50,
        options: ['No Smoking', 'No Alcohol', 'No Pets', 'No Guests Overnight', 'Visitors Allowed (Daytime)',
                  'Night Curfew', 'No Loud Music', 'ID Proof Mandatory'] },
      { key: 'gateClosingTime', label: 'Gate Closing Time', type: 'select', required: false, group: 'rules', order: 51,
        options: ['No Restriction', '9 PM', '10 PM', '11 PM', '12 AM'] },
    ],
  },

  // ============================================
  // FLATMATES / ROOMMATES
  // ============================================
  {
    name: 'Flatmates / Roommates',
    slug: 'flatmates-roommates',
    fields: [
      { key: 'lookingFor', label: 'Looking For', type: 'select', required: true, group: 'basic', order: 1,
        options: ['Male Flatmate', 'Female Flatmate', 'Any Gender'] },
      { key: 'roomType', label: 'Room Available', type: 'select', required: true, group: 'basic', order: 2,
        options: ['Private Room', 'Shared Room (2 Sharing)', 'Shared Room (3+ Sharing)'] },

      // === PROPERTY DETAILS ===
      { key: 'propertyType', label: 'Property Type', type: 'select', required: true, group: 'property', order: 10,
        options: ['Apartment', 'Independent House', 'Villa', 'Builder Floor'] },
      { key: 'bhkType', label: 'Flat BHK', type: 'select', required: false, group: 'property', order: 11,
        options: ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '4+ BHK'] },
      { key: 'furnishing', label: 'Furnishing', type: 'select', required: true, group: 'property', order: 12,
        options: ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] },
      { key: 'attachedBathroom', label: 'Attached Bathroom', type: 'select', required: false, group: 'property', order: 13,
        options: ['Yes', 'No (Shared)', 'Common Bathroom'] },

      // === CURRENT OCCUPANTS ===
      { key: 'currentOccupants', label: 'Current Occupants', type: 'number', required: false, group: 'occupants', order: 20, min: 0 },
      { key: 'occupantType', label: 'Current Occupants Are', type: 'select', required: false, group: 'occupants', order: 21,
        options: ['Working Professionals', 'Students', 'Mixed'] },
      { key: 'occupantGender', label: 'Current Occupants Gender', type: 'select', required: false, group: 'occupants', order: 22,
        options: ['All Male', 'All Female', 'Mixed'] },

      // === PREFERENCES ===
      { key: 'preferredOccupation', label: 'Preferred Occupation', type: 'select', required: false, group: 'preferences', order: 30,
        options: ['Working Professional', 'Student', 'Any'] },
      { key: 'preferredAge', label: 'Preferred Age Group', type: 'select', required: false, group: 'preferences', order: 31,
        options: ['18-25', '25-30', '30-35', '35+', 'No Preference'] },
      { key: 'foodPreference', label: 'Food Preference', type: 'select', required: false, group: 'preferences', order: 32,
        options: ['Veg Only', 'Non-Veg OK', 'No Preference'] },
      { key: 'smokingAllowed', label: 'Smoking Allowed', type: 'select', required: false, group: 'preferences', order: 33, options: ['Yes', 'No'] },
      { key: 'drinkingAllowed', label: 'Drinking Allowed', type: 'select', required: false, group: 'preferences', order: 34, options: ['Yes', 'No'] },
      { key: 'petsAllowed', label: 'Pets Allowed', type: 'select', required: false, group: 'preferences', order: 35, options: ['Yes', 'No'] },
      { key: 'visitorsAllowed', label: 'Visitors Allowed', type: 'select', required: false, group: 'preferences', order: 36,
        options: ['Yes', 'No', 'Occasionally'] },

      // === PRICING ===
      { key: 'availableFrom', label: 'Available From', type: 'date', required: false, group: 'pricing', order: 40 },
      { key: 'securityDeposit', label: 'Security Deposit', type: 'select', required: true, group: 'pricing', order: 41,
        options: ['No Deposit', '1 Month', '2 Months', '3 Months'] },
      { key: 'rentIncludes', label: 'Rent Includes', type: 'select', multiple: true, group: 'pricing', order: 42,
        options: ['Electricity', 'Water', 'WiFi', 'Maid Service', 'Cooking Gas', 'Maintenance'] },

      // === AMENITIES ===
      { key: 'amenities', label: 'Available Amenities', type: 'select', multiple: true, group: 'amenities', order: 50,
        options: ['WiFi', 'AC', 'TV', 'Washing Machine', 'Refrigerator', 'Microwave', 'Geyser', 'Parking',
                  'Power Backup', 'Lift', 'Security', 'Gym', 'Swimming Pool'] },
    ],
  },

  // ============================================
  // CO-WORKING SPACE
  // ============================================
  {
    name: 'Co-working Space',
    slug: 'coworking-space',
    fields: [
      { key: 'spaceType', label: 'Space Type', type: 'select', required: true, group: 'basic', order: 1,
        options: ['Hot Desk', 'Dedicated Desk', 'Private Cabin', 'Private Office', 'Meeting Room', 'Conference Room', 'Event Space', 'Virtual Office'] },

      // === HOT DESK / DEDICATED DESK ===
      { key: 'deskCount', label: 'Number of Desks', type: 'number', required: false, group: 'basic', order: 2, min: 1,
        showWhen: { field: 'spaceType', values: ['Hot Desk', 'Dedicated Desk'] } },

      // === PRIVATE CABIN/OFFICE ===
      { key: 'cabinCapacity', label: 'Cabin/Office Capacity', type: 'select', required: false, group: 'basic', order: 2,
        options: ['1-2 People', '3-5 People', '6-10 People', '10-20 People', '20+ People'],
        showWhen: { field: 'spaceType', values: ['Private Cabin', 'Private Office'] } },
      { key: 'cabinArea', label: 'Cabin Area', type: 'number', required: false, group: 'basic', order: 3, unit: 'sq ft',
        showWhen: { field: 'spaceType', values: ['Private Cabin', 'Private Office'] } },

      // === MEETING/CONFERENCE ROOM ===
      { key: 'roomCapacity', label: 'Room Capacity', type: 'select', required: false, group: 'basic', order: 2,
        options: ['4 People', '6 People', '8 People', '10 People', '15 People', '20 People', '30+ People'],
        showWhen: { field: 'spaceType', values: ['Meeting Room', 'Conference Room', 'Event Space'] } },
      { key: 'bookingType', label: 'Booking Type', type: 'select', required: false, group: 'basic', order: 3,
        options: ['Hourly', 'Half Day', 'Full Day'],
        showWhen: { field: 'spaceType', values: ['Meeting Room', 'Conference Room', 'Event Space'] } },

      // === PRICING ===
      { key: 'pricingType', label: 'Pricing', type: 'select', required: true, group: 'pricing', order: 10,
        options: ['Per Hour', 'Per Day', 'Per Week', 'Per Month', 'Per Year'] },
      { key: 'minCommitment', label: 'Minimum Commitment', type: 'select', required: false, group: 'pricing', order: 11,
        options: ['No Minimum', '1 Month', '3 Months', '6 Months', '1 Year'] },
      { key: 'securityDeposit', label: 'Security Deposit', type: 'select', required: false, group: 'pricing', order: 12,
        options: ['No Deposit', '1 Month', '2 Months', '3 Months'] },

      // === TIMINGS ===
      { key: 'operatingHours', label: 'Operating Hours', type: 'select', required: false, group: 'timings', order: 20,
        options: ['24x7 Access', '8 AM - 10 PM', '9 AM - 9 PM', '9 AM - 6 PM', 'Custom'] },
      { key: 'weekendAccess', label: 'Weekend Access', type: 'select', required: false, group: 'timings', order: 21,
        options: ['Yes (Included)', 'Yes (Extra)', 'No'] },

      // === AMENITIES ===
      { key: 'amenities', label: 'Amenities Included', type: 'select', multiple: true, group: 'amenities', order: 30,
        options: ['High-Speed WiFi', 'Power Backup', 'AC', 'Printing/Scanning', 'Whiteboard', 'Projector',
                  'Video Conferencing', 'Landline', 'Locker', 'Cafeteria', 'Tea/Coffee', 'Snacks',
                  'Reception', 'Mail Handling', 'Housekeeping', 'Parking'] },
      { key: 'meetingRoomCredits', label: 'Meeting Room Credits', type: 'select', required: false, group: 'amenities', order: 31,
        options: ['Not Included', '2 hrs/month', '4 hrs/month', '8 hrs/month', 'Unlimited'] },
    ],
  },
];

async function seedCategories() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');
    console.log('');

    for (const categoryData of categories) {
      const existing = await Category.findOne({ slug: categoryData.slug });

      if (existing) {
        await Category.updateOne({ slug: categoryData.slug }, categoryData);
        console.log(`✓ Updated: ${categoryData.name}`);
      } else {
        await Category.create(categoryData);
        console.log(`✓ Created: ${categoryData.name}`);
      }
    }

    console.log('\n========================================');
    console.log('All categories seeded successfully!');
    console.log('========================================\n');

    const allCategories = await Category.find({}, 'name slug fields');
    console.log('Categories Summary:');
    console.log('-------------------');
    allCategories.forEach((cat, i) => {
      const conditionalFields = cat.fields.filter(f => f.showWhen).length;
      console.log(`${i + 1}. ${cat.name}`);
      console.log(`   Slug: /${cat.slug}`);
      console.log(`   Total Fields: ${cat.fields.length} (${conditionalFields} conditional)`);
      console.log('');
    });

  } catch (error) {
    console.error('Error seeding categories:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seedCategories();
