import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const logsDir = path.join(process.cwd(), 'logs');

// Log rotation function
const rotateLogs = () => {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    
    // Get all log files
    const logFiles = fs.readdirSync(logsDir).filter(file => file.endsWith('.log'));
    
    if (logFiles.length === 0) {
      logger.info('No log files found to rotate');
      return;
    }
    
    // Rotate each log file
    logFiles.forEach(file => {
      const filePath = path.join(logsDir, file);
      const rotatedPath = path.join(logsDir, `${file}.${timestamp}`);
      
      try {
        // Check if file exists and has content
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          
          if (stats.size > 0) {
            // Rename current log file with timestamp
            fs.renameSync(filePath, rotatedPath);
            
            // Create new empty log file
            fs.writeFileSync(filePath, '');
            
            logger.info(`Rotated log file: ${file} -> ${file}.${timestamp}`);
          } else {
            logger.info(`Skipping empty log file: ${file}`);
          }
        }
      } catch (error) {
        logger.error(`Failed to rotate log file ${file}:`, {
          message: error.message,
          stack: error.stack,
        });
      }
    });
    
    // Clean up old rotated files (older than 30 days)
    cleanupOldLogs();
    
    logger.info('Log rotation completed successfully');
  } catch (error) {
    logger.error('Log rotation failed:', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// Clean up old log files
const cleanupOldLogs = () => {
  try {
    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const files = fs.readdirSync(logsDir);
    
    files.forEach(file => {
      // Check if file is a rotated log (contains date pattern)
      if (file.match(/\.log\.\d{4}-\d{2}-\d{2}$/)) {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          logger.info(`Cleaned up old log file: ${file}`);
        }
      }
    });
    
    logger.info(`Cleaned up log files older than ${retentionDays} days`);
  } catch (error) {
    logger.error('Failed to cleanup old logs:', {
      message: error.message,
      stack: error.stack,
    });
  }
};

// Compress rotated log files
const compressLogs = () => {
  try {
    const files = fs.readdirSync(logsDir);
    
    files.forEach(file => {
      // Check if file is a rotated log and not already compressed
      if (file.match(/\.log\.\d{4}-\d{2}-\d{2}$/) && !file.endsWith('.gz')) {
        const filePath = path.join(logsDir, file);
        const compressedPath = `${filePath}.gz`;
        
        // Use gzip to compress the file
        const { exec } = require('child_process');
        exec(`gzip "${filePath}"`, (error, stdout, stderr) => {
          if (error) {
            logger.error(`Failed to compress ${file}:`, {
              message: error.message,
            });
          } else {
            logger.info(`Compressed log file: ${file}`);
          }
        });
      }
    });
  } catch (error) {
    logger.error('Failed to compress logs:', {
      message: error.message,
      stack: error.stack,
    });
  }
};

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('Starting log rotation...');
  rotateLogs();
  
  // Compress logs if enabled
  if (process.env.COMPRESS_LOGS === 'true') {
    logger.info('Compressing rotated logs...');
    compressLogs();
  }
  
  logger.info('Log rotation process completed');
}

export { rotateLogs, cleanupOldLogs, compressLogs };
