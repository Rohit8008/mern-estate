import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../models/user.model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI is not set. Add it to backend/.env');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { email: '', username: '', password: 'ChangeMe@123', resetPassword: false };
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
        password,
        role: 'admin',
        assignedCategories: [],
      });
      console.log(`Created new admin user: ${email}`);
      console.log(`Password: ${password}`);
    } else {
      user.role = 'admin';
      if (resetPassword) {
        user.password = password;
        console.log(`Reset password for: ${email}`);
        console.log(`New password: ${password}`);
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


