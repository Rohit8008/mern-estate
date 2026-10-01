/**
 * Every write validates its body — or is listed here with a reason.
 *
 * About three quarters of POST/PUT/PATCH routes once reached their controller
 * with whatever JSON the caller sent: platform tenant edits, webhooks, share
 * links. A field typed as a string could arrive as `{ "$ne": null }` and land
 * in a query. The fix is not just the schemas that now exist; it is that the
 * next route cannot quietly skip one.
 *
 * This walks the live router the same way routeAccess.test.js does and fails
 * when a write has no `validateBody` on its stack (route-level, or carried
 * down from a `router.use`). Skipping validation becomes a deliberate edit to
 * UNVALIDATED below, with the reason next to it.
 *
 * Shrink the list as routes gain schemas; never add to it to make a new route
 * pass — write the schema.
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';

const UNVALIDATED = [
  // ── Multipart: the body is a file, checked by multer and magic bytes ──
  { method: 'POST', path: '/api/upload/single', why: 'multipart image upload; fileValidation checks type and size' },
  { method: 'POST', path: '/api/upload/multiple', why: 'multipart image upload; fileValidation checks type and size' },
  { method: 'POST', path: '/api/upload/audio', why: 'multipart audio upload; fileValidation checks type and size' },
  { method: 'POST', path: '/api/documents/upload', why: 'multipart document upload; documentTypes and fileValidation check it' },
  { method: 'POST', path: '/api/clients/:id/photos', why: 'multipart photo upload' },
  { method: 'POST', path: '/api/listing/:id/voice-notes', why: 'multipart voice note upload' },

  // ── Imports: spreadsheet rows with workspace-defined columns ──
  { method: 'POST', path: '/api/listing/import/suggest-mapping', why: 'listing import is being reworked separately; headers are free text by nature' },
  { method: 'POST', path: '/api/listing/import/preview', why: 'listing import is being reworked separately; rows validated per row in the controller' },
  { method: 'POST', path: '/api/listing/import/commit', why: 'listing import is being reworked separately; rows validated per row in the controller' },
  { method: 'POST', path: '/api/lead-import/suggest-mapping', why: 'lead import is being reworked separately; headers are free text by nature' },
  { method: 'POST', path: '/api/lead-import/preview', why: 'lead import is being reworked separately; rows validated per row in the controller' },
  { method: 'POST', path: '/api/lead-import/commit', why: 'lead import is being reworked separately; rows validated per row in the controller' },

  // ── Sessions and tokens: the credential is a cookie or the URL, not the body ──
  { method: 'POST', path: '/api/auth/refresh', why: 'reads only the refresh cookie' },
  { method: 'POST', path: '/api/auth/signout', why: 'reads only the session cookie' },
  { method: 'POST', path: '/api/auth/signout-all', why: 'reads only the session cookie' },
  { method: 'POST', path: '/api/auth/signup', why: 'public sign-up is disabled (answers 403 before reading the body)' },
  { method: 'POST', path: '/api/unsubscribe/:token', why: 'token in the URL; body is not read' },

  // ── Actions on a record named in the URL ──
  { method: 'POST', path: '/api/listing/soft-delete/:id', why: 'action on the id in the URL; no body' },
  { method: 'POST', path: '/api/listing/restore/:id', why: 'action on the id in the URL; no body' },
  { method: 'POST', path: '/api/category/restore/:id', why: 'action on the id in the URL; no body' },
  { method: 'POST', path: '/api/property-types/seed', why: 'admin action; seeds the built-in types, no body' },

  // ── Public and observability ──
  { method: 'POST', path: '/api/contact/', why: 'public contact form; required fields and email checked inline, rate limited' },
  { method: 'POST', path: '/api/observability/logs', why: 'frontend log ingest; entries are stored as opaque log data' },
  { method: 'POST', path: '/api/observability/query', why: 'admin log query proxied to OpenObserve' },
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);
let routes;

beforeAll(async () => {
  registerTenancy(mongoose);
  const { createApp } = await import('../app.js');
  routes = collectWrites(createApp());
});

/** Walk the router tree, carrying a router-level validateBody down to its routes. */
function collectWrites(app) {
  const found = [];
  const walk = (stack, prefix = '', inherited = false) => {
    let carried = inherited;
    for (const layer of stack) {
      if (layer.route) {
        const validated = carried || layer.route.stack.some((s) => s.name === 'validateBody');
        Object.keys(layer.route.methods)
          .map((m) => m.toUpperCase())
          .filter((m) => WRITE_METHODS.has(m))
          .forEach((method) => found.push({ method, path: prefix + layer.route.path, validated }));
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const src = layer.regexp?.source || '';
        const seg = src
          .replace('^\\/', '/')
          .replace('\\/?(?=\\/|$)', '')
          .replace(/\\\//g, '/')
          .replace(/\$$/, '');
        walk(layer.handle.stack, prefix + (seg === '/(?:/)?' || seg === '(?:/)?' ? '' : seg), carried);
      } else if (layer.name === 'validateBody') {
        carried = true;
      }
    }
  };
  walk(app._router.stack);
  return found;
}

const key = (r) => `${r.method} ${r.path}`;

describe('body validation coverage', () => {
  it('finds the write routes', () => {
    // If the walker broke, every check below would pass vacuously.
    expect(routes.length).toBeGreaterThan(100);
  });

  it('validates every write that is not explicitly exempted', () => {
    const exempt = new Set(UNVALIDATED.map(key));
    const missing = routes.filter((r) => !r.validated && !exempt.has(key(r)));
    if (missing.length) {
      throw new Error(
        `${missing.length} write route(s) reach their controller without validateBody:\n\n` +
          missing.map((r) => `  ${key(r)}`).join('\n') +
          '\n\nAdd a Joi schema in middleware/validation.js and validateBody(...) on the route. ' +
          'Remember stripUnknown: every field the controller reads must be named in the schema.'
      );
    }
  });

  it('keeps the exemption list honest', () => {
    // An exemption for a route that now validates, or no longer exists, is a
    // standing permission nothing checks.
    const byKey = new Map(routes.map((r) => [key(r), r]));
    const stale = UNVALIDATED.filter((e) => !byKey.has(key(e)) || byKey.get(key(e)).validated);
    expect(stale.map(key)).toEqual([]);
  });

  it('gives every exemption a reason', () => {
    expect(UNVALIDATED.filter((e) => !e.why || e.why.length < 15).map(key)).toEqual([]);
  });
});
