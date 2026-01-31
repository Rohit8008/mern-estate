import fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

// Current log level (can be set via environment variable)
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

// Log file paths
const logFiles = {
  error: path.join(logsDir, 'error.log'),
  warn: path.join(logsDir, 'warn.log'),
  info: path.join(logsDir, 'info.log'),
  debug: path.join(logsDir, 'debug.log'),
  combined: path.join(logsDir, 'combined.log'),
  security: path.join(logsDir, 'security.log'),
  audit: path.join(logsDir, 'audit.log'),
};

// Helper function to format timestamp
const formatTimestamp = () => {
  return new Date().toISOString();
};

// Helper function to format log entry
const formatLogEntry = (level, message, meta = {}) => {
  const timestamp = formatTimestamp();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta,
  };
  
  return JSON.stringify(logEntry);
};

// Helper function to write to file
const writeToFile = (filePath, logEntry) => {
  try {
    fs.appendFileSync(filePath, logEntry + '\n');
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
};

// Helper function to write to all relevant files
const writeLog = (level, message, meta = {}) => {
  const logEntry = formatLogEntry(level, message, meta);
  
  // Write to combined log
  writeToFile(logFiles.combined, logEntry);
  
  // Write to specific level log
  if (logFiles[level.toLowerCase()]) {
    writeToFile(logFiles[level.toLowerCase()], logEntry);
  }
  
  // Console output for development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${level}] ${message}`, meta);
  }
};

// Main logging functions
export const logger = {
  error: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      writeLog('ERROR', message, meta);
    }
  },

  warn: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      writeLog('WARN', message, meta);
    }
  },

  info: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      writeLog('INFO', message, meta);
    }
  },

  debug: (message, meta = {}) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      writeLog('DEBUG', message, meta);
    }
  },

  // Security-specific logging
  security: (event, details = {}) => {
    const logEntry = formatLogEntry('SECURITY', event, {
      type: 'security_event',
      ...details,
    });
    
    writeToFile(logFiles.security, logEntry);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SECURITY] ${event}`, details);
    }
  },

  // Audit logging for important actions
  audit: (action, details = {}) => {
    const logEntry = formatLogEntry('AUDIT', action, {
      type: 'audit_event',
      ...details,
    });
    
    writeToFile(logFiles.audit, logEntry);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] ${action}`, details);
    }
  },
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      contentLength: res.get('Content-Length'),
    };
    
    if (res.statusCode >= 400) {
      logger.error('Request Error', logData);
    } else {
      logger.info('Request', logData);
    }
  });
  
  next();
};

// Error logging
export const logError = (error, req = null, additionalInfo = {}) => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...additionalInfo,
  };
  
  if (req) {
    errorData.request = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
    };
  }
  
  logger.error('Application Error', errorData);
};

// Security event logging
export const logSecurityEvent = (event, details = {}) => {
  logger.security(event, {
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Audit event logging
export const logAuditEvent = (action, userId, details = {}) => {
  logger.audit(action, {
    userId,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Database operation logging
export const logDatabaseOperation = (operation, collection, details = {}) => {
  logger.debug('Database Operation', {
    operation,
    collection,
    ...details,
  });
};

// Performance logging
export const logPerformance = (operation, duration, details = {}) => {
  logger.info('Performance', {
    operation,
    duration: `${duration}ms`,
    ...details,
  });
};

// Clean up old log files (run periodically)
export const cleanupLogs = (daysToKeep = 30) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  Object.values(logFiles).forEach(filePath => {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        logger.info('Cleaned up old log file', { filePath });
      }
    }
  });
};

// Log rotation (basic implementation)
export const rotateLogs = () => {
  const timestamp = new Date().toISOString().split('T')[0];
  
  Object.entries(logFiles).forEach(([level, filePath]) => {
    if (fs.existsSync(filePath)) {
      const rotatedPath = `${filePath}.${timestamp}`;
      fs.renameSync(filePath, rotatedPath);
      logger.info('Rotated log file', { originalPath: filePath, rotatedPath });
    }
  });
};
