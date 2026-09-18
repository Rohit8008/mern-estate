/**
 * Database Restore Script
 *
 * Usage:
 *   npm run db:restore -- --list
 *   npm run db:restore -- --from backup-2026-09-18T02-00-00 --confirm
 *
 * There was a backup script and no way to use what it produced, which means the
 * backups had never been proven to restore. An untested backup is not a backup.
 *
 * Restoring is destructive and irreversible, so it refuses to run without
 * `--confirm`, and refuses outright in production unless
 * `ALLOW_PRODUCTION_RESTORE=true` is also set — the last thing anyone wants is
 * this running against the live database because a shell history was reused.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');

function parseArgs(argv) {
  const args = { list: false, from: null, confirm: false, drop: true };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') args.list = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--no-drop') args.drop = false;
    else if (arg === '--from') args.from = argv[++i];
    else if (arg.startsWith('--from=')) args.from = arg.slice('--from='.length);
  }
  return args;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('backup-'))
    .filter((name) => fs.statSync(path.join(BACKUP_DIR, name)).isDirectory())
    .sort()
    .reverse();
}

function databaseNameFrom(uri) {
  try {
    // The path segment after the host, minus any query string.
    const withoutQuery = uri.split('?')[0];
    const name = withoutQuery.split('/').pop();
    return name || null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const backups = listBackups();

  if (args.list || !args.from) {
    console.log(`Backups in ${BACKUP_DIR}:\n`);
    if (!backups.length) {
      console.log('  (none)');
    } else {
      for (const name of backups) {
        const stat = fs.statSync(path.join(BACKUP_DIR, name));
        console.log(`  ${name}  —  ${stat.mtime.toLocaleString()}`);
      }
    }
    if (!args.from) {
      console.log('\nRestore with:  npm run db:restore -- --from <name> --confirm');
    }
    return;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI is not set');
    process.exit(1);
  }

  const source = path.join(BACKUP_DIR, args.from);
  if (!fs.existsSync(source)) {
    console.error(`ERROR: no such backup: ${source}`);
    console.error('Run with --list to see what is available.');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_RESTORE !== 'true') {
    console.error('ERROR: refusing to restore in production.');
    console.error('Set ALLOW_PRODUCTION_RESTORE=true as well, and be sure.');
    process.exit(1);
  }

  try {
    await execAsync('mongorestore --version');
  } catch {
    console.error('ERROR: mongorestore is not installed (part of MongoDB Database Tools).');
    process.exit(1);
  }

  const dbName = databaseNameFrom(mongoUri);

  console.log('='.repeat(60));
  console.log('RESTORE — this REPLACES the current database');
  console.log('='.repeat(60));
  console.log(`  From:     ${source}`);
  console.log(`  Into:     ${dbName || '(from URI)'}`);
  console.log(`  Existing: ${args.drop ? 'DROPPED before restore' : 'kept, documents merged'}`);
  console.log('');

  if (!args.confirm) {
    console.error('Refusing to run without --confirm.');
    process.exit(1);
  }

  // Even with --confirm, make someone type the database name. A flag can be
  // recalled from shell history; the name has to be read off the screen.
  if (process.stdin.isTTY && dbName) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Type the database name (${dbName}) to proceed: `);
    rl.close();
    if (answer.trim() !== dbName) {
      console.error('Names did not match. Nothing was changed.');
      process.exit(1);
    }
  }

  // mongodump writes a directory per database; point mongorestore at it so the
  // data lands in the database the URI names rather than the one it came from.
  const dumped = fs.readdirSync(source).filter((n) => fs.statSync(path.join(source, n)).isDirectory());
  const dumpRoot = dumped.length === 1 ? path.join(source, dumped[0]) : source;

  const command = [
    'mongorestore',
    `--uri="${mongoUri}"`,
    args.drop ? '--drop' : '',
    '--gzip',
    `--dir="${dumpRoot}"`,
    dumped.length === 1 && dbName ? `--nsFrom="${dumped[0]}.*" --nsTo="${dbName}.*"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  console.log('\nRestoring…');
  const { stdout, stderr } = await execAsync(command, { maxBuffer: 20 * 1024 * 1024 });
  if (stdout) console.log(stdout);
  // mongorestore writes its progress to stderr, so this is not necessarily an error.
  if (stderr) console.log(stderr);

  console.log('\nRestore complete.');
}

main().catch((error) => {
  console.error('\nRestore failed:', error.message);
  process.exit(1);
});
