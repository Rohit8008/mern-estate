import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend folder
dotenv.config({ path: join(__dirname, '..', '.env') });

// Environment validation
// SEC-004: MESSAGE_ENCRYPTION_KEY is required — without it the first Socket.IO
// message send throws inside an unhandled-rejection handler and kills the server.
const requiredEnvVars = [
  'JWT_SECRET',
  'REFRESH_SECRET',
  'MONGO_URI',
  'NODE_ENV',
  'MESSAGE_ENCRYPTION_KEY',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars);
  console.error('Please create a .env file with the required variables.');
  process.exit(1);
}

// Environment configuration
export const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
  },

  // Database configuration
  database: {
    uri: process.env.MONGO_URI,
    options: {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT) || 5000,
      socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT) || 45000,
    },
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.REFRESH_SECRET,
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || '15m',
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '30d',
    issuer: process.env.JWT_ISSUER || 'mern-estate-api',
    audience: process.env.JWT_AUDIENCE || 'mern-estate-client',
  },

  // Security configuration
  security: {
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000, // 15 minutes
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
  },

  // CORS configuration
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean)
      : [
          'http://localhost:5173',
          'http://localhost:3000',
          ...(process.env.EXTRA_CORS_ORIGINS
            ? process.env.EXTRA_CORS_ORIGINS.split(',').map(o => o.trim())
            : []),
        ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 20,
    strictMaxRequests: parseInt(process.env.STRICT_RATE_LIMIT_MAX) || 30,
  },

  // Email configuration
  email: {
    host: process.env.SMTP_HOST,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },

  // SMS configuration
  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
  },

  // Cache configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 300, // 5 minutes
    maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 100,
  },
};

// Validate configuration
export const validateConfig = () => {
  const errors = [];

  // Validate JWT secrets
  if (config.jwt.secret === 'dev_secret' && config.server.isProduction) {
    errors.push('JWT_SECRET must be set to a secure value in production');
  }
  if (config.jwt.secret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  if (config.jwt.refreshSecret === 'dev_refresh_secret' && config.server.isProduction) {
    errors.push('REFRESH_SECRET must be set to a secure value in production');
  }
  if (config.jwt.refreshSecret.length < 32) {
    errors.push('REFRESH_SECRET must be at least 32 characters long');
  }

  // Validate database URI
  if (!config.database.uri || config.database.uri === 'mongodb://127.0.0.1:27017/ytreal') {
    if (config.server.isProduction) {
      errors.push('MONGO_URI must be set to a production database in production');
    }
  }

  // Warn about email configuration for production (not required)
  if (config.server.isProduction) {
    if (!config.email.host || !config.email.auth.user || !config.email.auth.pass) {
      console.warn('Warning: Email configuration not set. Email features will be disabled.');
    }
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:', errors);
    process.exit(1);
  }

  console.log('Configuration validated successfully');
};

// Export default config
export default config;
