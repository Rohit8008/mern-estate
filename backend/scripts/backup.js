/**
 * Database Backup Script
 *
 * Creates a backup of the MongoDB database.
 * Usage: npm run db:backup
 *
 * Prerequisites:
 * - mongodump must be installed (part of MongoDB Database Tools)
 * - MONGO_URI environment variable must be set
 *
 * For MongoDB Atlas:
 * - Backups are handled automatically by Atlas
 * - This script is for additional local backups or self-hosted MongoDB
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
const RETENTION_COUNT = parseInt(process.env.BACKUP_RETENTION_COUNT) || 7;

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

  console.log('Starting database backup...');
  console.log(`Backup path: ${backupPath}`);

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`Created backup directory: ${BACKUP_DIR}`);
  }

  // Get MongoDB URI
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI environment variable is not set');
    console.error('Please set MONGO_URI in your .env file or environment');
    process.exit(1);
  }

  // Check if mongodump is available
  try {
    await execAsync('mongodump --version');
  } catch (error) {
    console.error('ERROR: mongodump is not installed or not in PATH');
    console.error('Install MongoDB Database Tools: https://www.mongodb.com/docs/database-tools/installation/');
    process.exit(1);
  }

  // Create backup
  try {
    const startTime = Date.now();

    // Build mongodump command
    // Note: For Atlas connections, mongodump handles authentication automatically via the URI
    const command = `mongodump --uri="${mongoUri}" --out="${backupPath}" --gzip`;

    console.log('Running mongodump...');
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr); // mongodump outputs progress to stderr

    console.log(`\nBackup completed in ${duration}s`);
    console.log(`Backup saved to: ${backupPath}`);

    // Get backup size
    const backupSize = await getDirectorySize(backupPath);
    console.log(`Backup size: ${(backupSize / 1024 / 1024).toFixed(2)} MB`);

    return backupPath;
  } catch (error) {
    console.error('Backup failed:', error.message);
    // Clean up failed backup
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { recursive: true, force: true });
    }
    throw error;
  }
}

async function cleanupOldBackups() {
  console.log('\nCleaning up old backups...');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('No backup directory found');
    return;
  }

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-'))
    .sort()
    .reverse();

  console.log(`Found ${backups.length} backups, keeping ${RETENTION_COUNT}`);

  const toDelete = backups.slice(RETENTION_COUNT);

  for (const backup of toDelete) {
    const backupPath = path.join(BACKUP_DIR, backup);
    fs.rmSync(backupPath, { recursive: true, force: true });
    console.log(`Deleted: ${backup}`);
  }

  console.log(`Cleanup complete. ${toDelete.length} backup(s) deleted.`);
}

async function getDirectorySize(dirPath) {
  let size = 0;

  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      size += await getDirectorySize(filePath);
    } else {
      size += stat.size;
    }
  }

  return size;
}

async function listBackups() {
  console.log('\nExisting backups:');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('No backups found');
    return;
  }

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-'))
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.log('No backups found');
    return;
  }

  for (const backup of backups) {
    const backupPath = path.join(BACKUP_DIR, backup);
    const stat = fs.statSync(backupPath);
    const size = await getDirectorySize(backupPath);
    console.log(`  ${backup} - ${(size / 1024 / 1024).toFixed(2)} MB - ${stat.mtime.toLocaleString()}`);
  }
}

// Main execution
(async () => {
  console.log('='.repeat(50));
  console.log('MERN Estate Database Backup');
  console.log('='.repeat(50));

  try {
    await createBackup();
    await cleanupOldBackups();
    await listBackups();

    console.log('\n' + '='.repeat(50));
    console.log('Backup process completed successfully');
    console.log('='.repeat(50));

    process.exit(0);
  } catch (error) {
    console.error('\nBackup process failed:', error.message);
    process.exit(1);
  }
})();
