import mongoose from 'mongoose';
import User from '../models/user.model.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ytreal';

function parseArgs(argv) {
  const args = { email: 'mittalrohit701@gmail.com', username: 'test', password: 'Admin@123', resetPassword: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email') args.email = argv[++i] || '';
    else if (a === '--username') args.username = argv[++i] || '';
    else if (a === '--password') args.password = argv[++i] || '';
    else if (a === '--reset-password') args.resetPassword = true;
  }
  return args;
}

async function main() {
  const { email, username, password, resetPassword } = parseArgs(process.argv);
  if (!email) {
    console.error('Usage: node backend/scripts/makeAdmin.js --email <email> [--username <name>] [--password <password>] [--reset-password]');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  try {
    let user = await User.findOne({ email });
    if (!user) {
      // Don't pre-hash password - the User model's pre-save hook handles hashing
      user = await User.create({
        username: username || email.split('@')[0],
        email,
        password: password || 'Admin@123',
        role: 'admin',
        assignedCategories: [],
      });
      console.log(`Created new admin user: ${email}`);
      console.log(`Password: ${password || 'Admin@123'}`);
    } else {
      user.role = 'admin';
      if (resetPassword) {
        user.password = password || 'Admin@123';
        console.log(`Reset password for: ${email}`);
        console.log(`New password: ${password || 'Admin@123'}`);
      }
      await user.save();
      console.log(`Promoted existing user to admin: ${email}`);
    }
    console.log('Done.');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();


