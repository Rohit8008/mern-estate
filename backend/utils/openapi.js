import { APP_VERSION } from './version.js';
import { AUTH_GUARDS, publicRouteFor } from '../security/publicRoutes.js';
import { ERROR_CODES } from './error.js';

/**
 * An OpenAPI 3.1 description of the API, built from the live router.
 *
 * Generated, never hand-written: paths come from the mounted routes, request
 * bodies from the same Joi schema validateBody enforces (it carries `.schema`),
 * and security from the guards on each route's stack. A hand-maintained spec
 * is wrong by the second release; this one cannot describe a route that does
 * not exist or a field the API would strip.
 *
 * What it does not know: response bodies (controllers build them by hand), so
 * every operation documents the shared error shape and leaves success open.
 */

// ── Router walk ─────────────────────────────────────────────────────────────
function mountSegment(layer) {
  const src = layer.regexp?.source || '';
  const seg = src
    .replace('^\\/', '/')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/')
    .replace(/\$$/, '');
  return seg === '/(?:/)?' || seg === '(?:/)?' ? '' : seg;
}

export function collectRoutes(app) {
  const found = [];
  const walk = (stack, prefix = '', inherited = []) => {
    const carried = [...inherited];
    for (const layer of stack) {
      if (layer.route) {
        const handlers = layer.route.stack.map((s) => s.handle);
        const names = layer.route.stack.map((s) => s.name);
        Object.keys(layer.route.methods)
          .filter((m) => m !== '_all')
          .forEach((m) => found.push({
            method: m.toUpperCase(),
            path: prefix + layer.route.path,
            guards: [...new Set([...carried, ...names.filter((n) => AUTH_GUARDS.has(n))])],
            bodySchema: handlers.find((h) => h?.name === 'validateBody' && h.schema)?.schema || null,
          }));
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountSegment(layer), carried);
      } else if (AUTH_GUARDS.has(layer.name)) {
        carried.push(layer.name);
      }
    }
  };
  walk(app._router.stack);
  return found;
}

// ── Joi → JSON Schema ───────────────────────────────────────────────────────
// Covers what this codebase's schemas use. Anything unrecognised becomes an
// open schema ({}) rather than a wrong one.
function fromDescription(d) {
  if (!d) return {};
  const flags = d.flags || {};
  const rules = Object.fromEntries((d.rules || []).map((r) => [r.name, r.args || {}]));
  const allow = (d.allow || []).filter((v) => typeof v !== 'object');
  let schema;

  switch (d.type) {
    case 'object': {
      const properties = {};
      const required = [];
      Object.entries(d.keys || {}).forEach(([key, child]) => {
        properties[key] = fromDescription(child);
        if (child.flags?.presence === 'required') required.push(key);
      });
      schema = { type: 'object', properties };
      if (required.length) schema.required = required;
      if (!d.keys) schema.additionalProperties = true;
      else if (flags.unknown) schema.additionalProperties = true;
      break;
    }
    case 'array':
      schema = { type: 'array' };
      if (d.items?.length === 1) schema.items = fromDescription(d.items[0]);
      else if (d.items?.length > 1) schema.items = { oneOf: d.items.map(fromDescription) };
      if (rules.min) schema.minItems = rules.min.limit;
      if (rules.max) schema.maxItems = rules.max.limit;
      break;
    case 'string':
      schema = { type: 'string' };
      if (rules.min) schema.minLength = rules.min.limit;
      if (rules.max) schema.maxLength = rules.max.limit;
      if (rules.email) schema.format = 'email';
      if (rules.uri) schema.format = 'uri';
      if (rules.hex) schema.pattern = '^[0-9a-fA-F]+$';
      if (rules.pattern?.regex) schema.pattern = String(rules.pattern.regex).replace(/^\/|\/[a-z]*$/g, '');
      break;
    case 'number':
      schema = { type: rules.integer ? 'integer' : 'number' };
      if (rules.min) schema.minimum = rules.min.limit;
      if (rules.max) schema.maximum = rules.max.limit;
      break;
    case 'boolean':
      schema = { type: 'boolean' };
      break;
    case 'date':
      schema = { type: 'string', format: 'date-time' };
      break;
    case 'alternatives':
      schema = { oneOf: (d.matches || []).map((m) => fromDescription(m.schema)).filter((s) => Object.keys(s).length) };
      break;
    default:
      schema = {};
  }

  if (flags.only && allow.length) {
    schema.enum = allow;
  } else if (allow.length) {
    // `.allow('')` and friends: the value is accepted in addition to the type.
    schema = { anyOf: [schema, { enum: allow }] };
  }
  if (flags.description) schema.description = flags.description;
  if (flags.default !== undefined && typeof flags.default !== 'function') schema.default = flags.default;
  return schema;
}

export function joiToJsonSchema(joiSchema) {
  return fromDescription(joiSchema.describe());
}

// ── Document ────────────────────────────────────────────────────────────────
// A router's own '/' route lands on the mount path with a trailing slash
// ('/api/owner/'); the documented path is the mount path itself.
const toOpenApiPath = (p) => p.replace(/:([A-Za-z0-9_]+)\??/g, '{$1}').replace(/(.)\/$/, '$1');
const paramNames = (p) => [...p.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
const tagFor = (p) => p.replace(/^\/api\//, '').split('/')[0] || 'root';

const ERROR_RESPONSE = { $ref: '#/components/responses/Error' };

export function buildOpenApi(app) {
  const paths = {};

  collectRoutes(app)
    .filter((r) => r.path.startsWith('/api/'))
    .forEach((r) => {
      const path = toOpenApiPath(r.path);
      const method = r.method.toLowerCase();
      const declaredPublic = publicRouteFor(r.method, r.path);
      const op = {
        tags: [tagFor(r.path)],
        operationId: `${method}_${r.path.replace(/^\/api\//, '').replace(/[^A-Za-z0-9]+/g, '_')}`,
        ...(declaredPublic && { description: `Public: ${declaredPublic.why}` }),
        parameters: paramNames(r.path).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
        // Signed-in routes take the session cookie and, for writes, the CSRF
        // header (middleware/csrf.js). Public routes take neither.
        security: r.guards.length ? [{ sessionCookie: [] }] : [],
        responses: {
          200: { description: 'Success. Most endpoints answer `{ success: true, data }`.' },
          400: ERROR_RESPONSE,
          ...(r.guards.length && { 401: ERROR_RESPONSE, 403: ERROR_RESPONSE }),
          404: ERROR_RESPONSE,
          429: ERROR_RESPONSE,
          500: ERROR_RESPONSE,
        },
      };
      if (r.bodySchema) {
        op.requestBody = { required: true, content: { 'application/json': { schema: joiToJsonSchema(r.bodySchema) } } };
      }
      if (r.guards.length && ['post', 'put', 'patch', 'delete'].includes(method)) {
        op.parameters.push({ name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' }, description: 'From GET /api/auth/csrf.' });
      }
      paths[path] = { ...(paths[path] || {}), [method]: op };
    });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Real Vista CRM API',
      version: APP_VERSION,
      description:
        'Generated from the live router and its validation schemas. Every request is scoped to one ' +
        'workspace; every response carries `X-Request-Id`, which error bodies repeat as `requestId`.',
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'access_token' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['success', 'statusCode', 'code', 'message'],
          properties: {
            success: { const: false },
            statusCode: { type: 'integer' },
            code: {
              type: 'string',
              description: 'Stable, machine-readable. Branch on this, never on `message`. Endpoints may add their own (e.g. CSRF_TOKEN_INVALID).',
              examples: Object.values(ERROR_CODES),
            },
            message: { type: 'string', description: 'For a person; wording may change.' },
            type: { type: 'string' },
            field: { type: 'string' },
            details: { type: 'object', additionalProperties: true },
            requestId: { type: 'string' },
          },
        },
      },
      responses: {
        Error: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  };
}
