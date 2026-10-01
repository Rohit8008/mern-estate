/**
 * Write the OpenAPI description to docs/openapi.json.
 *
 *   npm run docs:openapi
 *
 * Needs no database: it builds the app and walks its router. Tenancy is
 * registered before the app is imported for the same reason index.js does it —
 * models compiled before the plugin would be unscoped (see CLAUDE.md, "CLI
 * scripts").
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

registerTenancy(mongoose);
const { createApp } = await import('../app.js');
const { buildOpenApi } = await import('../utils/openapi.js');

const doc = buildOpenApi(createApp());
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'openapi.json');
fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${Object.keys(doc.paths).length} paths to ${path.relative(process.cwd(), out)}`);
process.exit(0);
