/**
 * Global Mongoose plugin that makes every model tenant-scoped.
 *
 * Shared-database multi-tenancy lives or dies on this file. Isolation is
 * enforced by code rather than by the database, so the plugin is written to
 * fail loudly rather than quietly do the wrong thing:
 *
 *   • a query with no tenant context THROWS (it does not silently run unscoped)
 *   • a query that names a different tenant than the context THROWS
 *   • an operation the plugin cannot scope (estimatedDocumentCount) THROWS
 *
 * Anything genuinely cross-tenant goes through `runWithoutTenantScope(reason)`
 * or `.setOptions({ tenantScope: false })`, both of which are greppable and
 * carry a stated reason.
 *
 * Registered once, globally, in index.js — before any model is compiled — so a
 * new model is scoped by existing, not by remembering to opt in.
 */

import mongoose from 'mongoose';
import {
  getTenantId,
  hasTenantContext,
  isTenantScopeBypassed,
} from './tenantContext.js';

/**
 * Collections that are deliberately global — they describe the platform, not
 * one agency's data. Everything else is tenant-scoped.
 */
const GLOBAL_MODELS = new Set(['Tenant']);

/** Queries whose filter we rewrite. */
const FILTER_HOOKS = [
  'count',
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
];

/** Updates also need the tenant stamped onto documents created by an upsert. */
const UPSERT_HOOKS = [
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
];

/** Cast a tenant id string to an ObjectId for contexts Mongoose won't cast. */
function toObjectId(id) {
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
}

export class TenantScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TenantScopeError';
    this.statusCode = 500;
  }
}

/**
 * Resolve the tenant to apply, or `null` when this operation should run
 * unscoped. Throws when scoping is required but impossible.
 *
 * @param {string} modelName for the error message — "which query was it?" is
 *        the first question anyone asks when this throws
 * @param {boolean} explicitlyUnscoped the caller passed `tenantScope: false`
 */
function resolveScope(modelName, explicitlyUnscoped) {
  if (explicitlyUnscoped || isTenantScopeBypassed()) return null;

  if (!hasTenantContext()) {
    throw new TenantScopeError(
      `${modelName}: a query ran with no tenant context. Wrap request handling in ` +
        'runWithTenant(), or, for deliberately cross-tenant work, in ' +
        "runWithoutTenantScope('why'). Scripts and jobs must do this explicitly."
    );
  }

  const tenantId = getTenantId();
  if (!tenantId) {
    throw new TenantScopeError(
      `${modelName}: tenant context is present but carries no tenantId.`
    );
  }
  return tenantId;
}

/** Compare a filter's existing tenantId against the context's. */
function assertSameTenant(modelName, existing, tenantId) {
  if (existing === undefined || existing === null) return;
  // A filter may legitimately narrow with the *same* tenant, which is a no-op.
  const same =
    String(existing) === String(tenantId) ||
    (existing?.$eq !== undefined && String(existing.$eq) === String(tenantId));
  if (!same) {
    throw new TenantScopeError(
      `${modelName}: a query asked for tenant ${JSON.stringify(existing)} while the ` +
        `request belongs to tenant ${tenantId}. Cross-tenant reads must go through ` +
        'runWithoutTenantScope().'
    );
  }
}

export function tenantPlugin(schema, options = {}) {
  const modelName = options.modelName || schema.options?.modelName;

  // A schema can opt out for a genuinely global collection.
  if (schema.options?.tenantScoped === false) return;

  schema.add({
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
      immutable: true, // a record never moves between agencies by accident
    },
  });

  // ── Reads, updates and deletes ───────────────────────────────────────────
  FILTER_HOOKS.forEach((hook) => {
    schema.pre(hook, function applyTenantFilter() {
      const name = this.model?.modelName || modelName || 'Model';
      if (GLOBAL_MODELS.has(name)) return;

      const tenantId = resolveScope(name, this.getOptions()?.tenantScope === false);
      if (!tenantId) return;

      const filter = this.getFilter();
      assertSameTenant(name, filter.tenantId, tenantId);
      filter.tenantId = tenantId;
    });
  });

  UPSERT_HOOKS.forEach((hook) => {
    schema.pre(hook, function stampTenantOnUpsert() {
      const name = this.model?.modelName || modelName || 'Model';
      if (GLOBAL_MODELS.has(name)) return;
      if (!this.getOptions()?.upsert) return;

      const tenantId = resolveScope(name, this.getOptions()?.tenantScope === false);
      if (!tenantId) return;

      // $setOnInsert rather than $set: an upsert that matches must not rewrite
      // the tenantId of a document that already exists.
      const update = this.getUpdate() || {};
      if (Array.isArray(update)) return; // aggregation-pipeline update; caller's job
      update.$setOnInsert = { ...(update.$setOnInsert || {}), tenantId };
      this.setUpdate(update);
    });
  });

  // ── Aggregations ─────────────────────────────────────────────────────────
  // Analytics is where a leak would be least visible, so the $match goes at the
  // very front of the pipeline, before any $lookup or $group can widen it.
  schema.pre('aggregate', function applyTenantMatch() {
    const name = this.model?.modelName || modelName || 'Model';
    if (GLOBAL_MODELS.has(name)) return;

    const tenantId = resolveScope(name, this.options?.tenantScope === false);
    if (!tenantId) return;

    // An aggregation pipeline is passed to the driver verbatim — Mongoose does
    // NOT cast it against the schema the way it casts a query filter. Matching
    // the string form of the id against a stored ObjectId silently matches
    // nothing, which reads as "this tenant has no data" rather than as an
    // error. Cast explicitly.
    const scopedId = toObjectId(tenantId);
    const pipeline = this.pipeline();
    const first = pipeline[0];

    // Merge into a leading $match rather than unshifting a second one.
    // Unshifting displaces the caller's own $match to position two, and
    // MongoDB requires `$text` to sit in the FIRST $match of a pipeline — so a
    // text search would fail outright with "$match with $text is only allowed
    // as the first pipeline stage". Adding tenantId as a sibling key keeps
    // $text at the top level and still means AND.
    if (first && typeof first.$match === 'object' && !Array.isArray(first.$match)) {
      assertSameTenant(name, first.$match.tenantId, tenantId);
      first.$match.tenantId = scopedId;
      return;
    }

    pipeline.unshift({ $match: { tenantId: scopedId } });
  });

  // ── Writes ───────────────────────────────────────────────────────────────
  // `validate` rather than `save`: Mongoose runs validation as its own pre-save
  // hook registered before any of ours, so stamping in pre('save') is too late
  // and every create fails with "tenantId is required".
  function stampTenantOnDocument(next) {
    const name = this.constructor?.modelName || modelName || 'Model';
    if (GLOBAL_MODELS.has(name)) return next();

    try {
      const tenantId = resolveScope(name, false);
      if (!tenantId) return next();
      if (this.tenantId) {
        assertSameTenant(name, this.tenantId, tenantId);
      } else {
        this.tenantId = tenantId;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  }

  schema.pre('validate', stampTenantOnDocument);
  // Also on save, for documents written with `validateBeforeSave: false`.
  schema.pre('save', stampTenantOnDocument);

  schema.pre('insertMany', function stampTenantOnInsertMany(next, docs) {
    const name = this.modelName || modelName || 'Model';
    if (GLOBAL_MODELS.has(name)) return next();

    try {
      const tenantId = resolveScope(name, false);
      if (!tenantId) return next();

      // Replace each element with a copy rather than stamping the caller's own
      // object. Callers pass module-level constants to insertMany — seed data,
      // starter roles — and mutating those makes the FIRST insert poison every
      // later one with a stale tenantId. Mongoose holds this same array, so
      // swapping elements still reaches the driver.
      const list = Array.isArray(docs) ? docs : [docs];
      list.forEach((doc, i) => {
        if (!doc) return;
        if (doc.tenantId) {
          assertSameTenant(name, doc.tenantId, tenantId);
          return;
        }
        // A Mongoose document already has the path; a plain object gets a copy.
        if (typeof doc.set === 'function') doc.tenantId = tenantId;
        else list[i] = { ...doc, tenantId };
      });
      return next();
    } catch (err) {
      return next(err);
    }
  });

  // ── Operations Mongoose gives us no hook for ─────────────────────────────

  /**
   * `estimatedDocumentCount` reads collection metadata and takes no filter, so
   * across a shared database it would report every tenant's rows. There is no
   * safe way to scope it — refuse rather than return a number that looks right.
   */
  schema.statics.estimatedDocumentCount = function scopedEstimatedDocumentCount() {
    throw new TenantScopeError(
      `${this.modelName}.estimatedDocumentCount() cannot be tenant-scoped — it counts ` +
        'the whole collection. Use countDocuments().'
    );
  };

  /**
   * `bulkWrite` fires no query middleware, so each operation is scoped by hand.
   * Missing this would leave the fastest write path in the codebase — the one
   * bulk import uses — completely unscoped.
   */
  schema.statics.bulkWrite = function scopedBulkWrite(ops, opts = {}, cb) {
    const name = this.modelName;
    if (GLOBAL_MODELS.has(name) || !Array.isArray(ops)) {
      return mongoose.Model.bulkWrite.call(this, ops, opts, cb);
    }

    const tenantId = resolveScope(name, opts?.tenantScope === false);
    if (!tenantId) return mongoose.Model.bulkWrite.call(this, ops, opts, cb);

    const scoped = ops.map((op) => {
      if (!op || typeof op !== 'object') return op;
      const [kind] = Object.keys(op);
      const body = { ...op[kind] };

      if (kind === 'insertOne') {
        const doc = { ...body.document };
        if (doc.tenantId) assertSameTenant(name, doc.tenantId, tenantId);
        else doc.tenantId = tenantId;
        return { insertOne: { ...body, document: doc } };
      }

      if (['updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany'].includes(kind)) {
        const filter = { ...(body.filter || {}) };
        assertSameTenant(name, filter.tenantId, tenantId);
        filter.tenantId = tenantId;
        const next = { ...body, filter };

        if (body.upsert && next.update && !Array.isArray(next.update)) {
          next.update = {
            ...next.update,
            $setOnInsert: { ...(next.update.$setOnInsert || {}), tenantId },
          };
        }
        if (kind === 'replaceOne' && next.replacement) {
          next.replacement = { ...next.replacement, tenantId };
        }
        return { [kind]: next };
      }

      return op;
    });

    return mongoose.Model.bulkWrite.call(this, scoped, opts, cb);
  };

  /**
   * Convenience for the deliberate cross-tenant read, so call sites read as
   * intent rather than as an options bag:
   *   `await Listing.acrossTenants('platform usage report').countDocuments()`
   */
  schema.statics.acrossTenants = function acrossTenants(reason) {
    if (!reason) throw new TenantScopeError('acrossTenants(reason) requires a reason');
    return this.find().setOptions({ tenantScope: false, tenantScopeReason: reason });
  };
}

/** Which mongoose instances already carry the plugin. */
const registeredOn = new WeakSet();

/**
 * Register the plugin globally. Must run before any model is compiled, so it is
 * called at the top of index.js — importing a model file first would leave that
 * model unscoped.
 */
export function registerTenancy(mongooseInstance = mongoose) {
  // Applying a global plugin twice does not replace it — mongoose.plugins is an
  // array it pushes onto — so every schema compiled afterwards gets the hooks
  // and the tenantId path stamped twice. A caller that re-registers defensively
  // (a test bootstrapping the app, say) would otherwise run the suite under a
  // different plugin configuration than production.
  if (registeredOn.has(mongooseInstance)) return;
  registeredOn.add(mongooseInstance);

  // A global plugin is applied to EVERY schema, including the child schemas
  // used for embedded subdocuments — voice notes on a listing, deals on a
  // client, the field definitions on a category. Left on, this stamps a
  // required `tenantId` onto each of those nested objects, and every write
  // fails with "branding.tenantId is required".
  //
  // Tenancy belongs on the document, not on each of its embedded parts: a
  // subdocument is reached only through its parent, which is already scoped.
  mongooseInstance.set('applyPluginsToChildSchemas', false);
  mongooseInstance.plugin(tenantPlugin);
}

export { GLOBAL_MODELS };
