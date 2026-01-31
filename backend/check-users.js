// Check existing users
import mongoose from 'mongoose';
import User from './backend/models/user.model.js';

const checkUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-estate');
    console.log('Connected to MongoDB');

    // Find all users
    const users = await User.find({});
    console.log('Total users:', users.length);
    
    users.forEach(user => {
      console.log(`- ${user.username} (${user.email}) - Role: ${user.role}`);
    });

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
};

checkUsers();
