import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend folder
dotenv.config({ path: join(__dirname, '..', '.env') });

// Environment validation
const requiredEnvVars = [
  'JWT_SECRET',
  'REFRESH_SECRET',
  'MONGO_URI',
  'NODE_ENV'
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
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000, // 15 minutes
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 24 * 60 * 60 * 1000, // 24 hours
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
    enableSecurityHeaders: process.env.ENABLE_SECURITY_HEADERS !== 'false',
    enableCORS: process.env.ENABLE_CORS !== 'false',
  },

  // CORS configuration
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean)
      : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000000,
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 1000000,
    strictMaxRequests: parseInt(process.env.STRICT_RATE_LIMIT_MAX) || 1000000,
  },

  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    allowedDocumentTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    uploadPath: process.env.UPLOAD_PATH || 'uploads',
    maxFilesPerUpload: parseInt(process.env.MAX_FILES_PER_UPLOAD) || 10,
  },

  // Email configuration
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    from: process.env.EMAIL_FROM || 'noreply@mern-estate.com',
  },

  // SMS configuration
  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableFileLogging: process.env.ENABLE_FILE_LOGGING !== 'false',
    logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30,
    enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== 'false',
  },

  // Cache configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 300, // 5 minutes
    maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 100,
    enableRedis: process.env.ENABLE_REDIS === 'true',
    redisUrl: process.env.REDIS_URL,
  },

  // API configuration
  api: {
    version: process.env.API_VERSION || 'v1',
    baseUrl: process.env.API_BASE_URL || '/api',
    enableSwagger: process.env.ENABLE_SWAGGER === 'true',
    enableMetrics: process.env.ENABLE_METRICS === 'true',
  },
};

// Validate configuration
export const validateConfig = () => {
  const errors = [];

  // Validate JWT secrets
  if (config.jwt.secret === 'dev_secret' && config.server.isProduction) {
    errors.push('JWT_SECRET must be set to a secure value in production');
  }

  if (config.jwt.refreshSecret === 'dev_refresh_secret' && config.server.isProduction) {
    errors.push('REFRESH_SECRET must be set to a secure value in production');
  }

  // Validate database URI
  if (!config.database.uri || config.database.uri === 'mongodb://127.0.0.1:27017/ytreal') {
    if (config.server.isProduction) {
      errors.push('MONGO_URI must be set to a production database in production');
    }
  }

  // Validate email configuration for production
  if (config.server.isProduction) {
    if (!config.email.host || !config.email.auth.user || !config.email.auth.pass) {
      errors.push('Email configuration is required for production');
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
