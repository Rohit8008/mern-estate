import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The running version.
 *
 * Read from a VERSION file at the repository root rather than from
 * `npm_package_version`, which is only populated when the process was started
 * through npm — under PM2, Docker or a bare `node index.js` it is undefined and
 * every health response claimed "1.0.0" whatever was deployed.
 *
 * Read once at import: the file cannot change without a redeploy.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readVersion() {
  const candidates = [
    path.join(__dirname, '../../VERSION'),
    path.join(process.cwd(), 'VERSION'),
    path.join(process.cwd(), '../VERSION'),
  ];

  for (const file of candidates) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value) return value;
    } catch { /* try the next location */ }
  }

  return process.env.npm_package_version || '0.0.0-unknown';
}

export const APP_VERSION = readVersion();
