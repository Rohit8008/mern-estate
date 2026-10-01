/**
 * The generated OpenAPI description (utils/openapi.js).
 *
 * It is only worth having if it cannot drift, so these tie it to the router
 * and to the validation schemas it is built from.
 */

import mongoose from 'mongoose';
import Joi from 'joi';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { joiToJsonSchema } from '../utils/openapi.js';

let doc;

beforeAll(async () => {
  registerTenancy(mongoose);
  const { createApp } = await import('../app.js');
  const { buildOpenApi } = await import('../utils/openapi.js');
  doc = buildOpenApi(createApp());
});

describe('OpenAPI description', () => {
  it('documents the mounted API', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths).length).toBeGreaterThan(100);
  });

  it('uses OpenAPI path templates and no trailing slashes', () => {
    Object.keys(doc.paths).forEach((p) => {
      expect(p).not.toMatch(/:[A-Za-z]/);
      if (p !== '/') expect(p).not.toMatch(/\/$/);
    });
    expect(doc.paths['/api/clients/{id}']).toBeDefined();
  });

  it('takes request bodies from the enforcing Joi schema', () => {
    const body = doc.paths['/api/owner']?.post?.requestBody?.content['application/json'].schema;
    expect(body?.type).toBe('object');
    expect(body.required).toContain('name');
    expect(body.properties.name).toMatchObject({ type: 'string', minLength: 2 });
  });

  it('marks public routes as needing no session, and writes as needing CSRF', () => {
    const signin = doc.paths['/api/auth/signin'].post;
    expect(signin.security).toEqual([]);

    const createOwner = doc.paths['/api/owner'].post;
    expect(createOwner.security).toEqual([{ sessionCookie: [] }]);
    expect(createOwner.parameters.some((p) => p.name === 'X-CSRF-Token')).toBe(true);
  });

  it('documents the shared error shape', () => {
    expect(doc.components.schemas.Error.required).toEqual(expect.arrayContaining(['code', 'message']));
  });
});

describe('joiToJsonSchema', () => {
  it('converts the shapes this codebase uses', () => {
    const schema = joiToJsonSchema(Joi.object({
      status: Joi.string().valid('draft', 'sent').required(),
      count: Joi.number().integer().min(0),
      tags: Joi.array().items(Joi.string()).max(5),
      note: Joi.string().max(10).allow(''),
      when: Joi.date(),
    }));
    expect(schema.required).toEqual(['status']);
    expect(schema.properties.status.enum).toEqual(['draft', 'sent']);
    expect(schema.properties.count).toEqual({ type: 'integer', minimum: 0 });
    expect(schema.properties.tags).toMatchObject({ type: 'array', items: { type: 'string' }, maxItems: 5 });
    expect(schema.properties.note.anyOf).toEqual([{ type: 'string', maxLength: 10 }, { enum: [''] }]);
    expect(schema.properties.when).toEqual({ type: 'string', format: 'date-time' });
  });
});
