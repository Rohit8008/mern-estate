// Test script to create a buyer requirement
import mongoose from 'mongoose';
import BuyerRequirement from './backend/models/buyerRequirement.model.js';
import User from './backend/models/user.model.js';

const testBuyerRequirement = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-estate');
    console.log('Connected to MongoDB');

    // Find an admin user
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('No admin user found');
      return;
    }

    console.log('Found admin user:', adminUser.username);

    // Create a test buyer requirement
    const testRequirement = new BuyerRequirement({
      buyerName: 'John Doe',
      buyerEmail: 'john.doe@example.com',
      buyerPhone: '+1234567890',
      preferredLocation: 'New York',
      propertyType: 'sale',
      minPrice: 300000,
      maxPrice: 500000,
      minBedrooms: 2,
      minBathrooms: 2,
      preferredArea: 'Downtown',
      additionalRequirements: 'Near subway station',
      budget: '$300,000 - $500,000',
      timeline: 'Within 3 months',
      notes: 'First-time buyer',
      createdBy: adminUser._id,
      status: 'active',
      priority: 'high'
    });

    await testRequirement.save();
    console.log('Test buyer requirement created:', testRequirement);

    // Check how many buyer requirements exist
    const count = await BuyerRequirement.countDocuments();
    console.log('Total buyer requirements in database:', count);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
};

testBuyerRequirement();
