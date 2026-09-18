import Category from '../models/category.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler, ValidationError, ConflictError, NotFoundError } from '../utils/error.js';
import { config } from '../config/environment.js';
import { getTenantScopedCache, invalidateEverywhere } from '../utils/cache.js';
import { validateCategoryFields, describeFieldErrors } from '../utils/categoryFields.js';
import { logActivity } from '../utils/activity.js';

const CACHE_TTL_MS = (Number(config?.cache?.ttl) > 0 ? Number(config.cache.ttl) : 300) * 1000;
const MAX_CACHE_SIZE = Number(config?.cache?.maxSize) > 0 ? Number(config.cache.maxSize) : 100;
// Tenant-scoped: two agencies each have their own categories, and a shared
// `category:list` key would serve one of them the other's.
const cache = getTenantScopedCache({ ttlMs: CACHE_TTL_MS, maxSize: MAX_CACHE_SIZE });

function clearCategoryCache() {
  // Clears this instance AND tells the others, so a second instance
  // cannot keep answering from a cache the write just invalidated.
  invalidateEverywhere({ prefix: 'category:' });
}

const toSlug = (name) =>
  name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

/**
 * What a category looks like to a caller who is not signed in.
 *
 * `/category/list` and `/category/by-slug` are public — the browse filters need
 * them — so the internal columns must not ride along. `deletedBy` names a member
 * of staff, and `defaultLocation` is the agency's own map pin for a colony;
 * neither is a visitor's business.
 */
function publicView(category) {
  const {
    deletedBy, deletedAt, isDeleted, defaultLocation, __v,
    // `tenantId` names the workspace. A visitor browsing a property site has no
    // use for it, and it is the identifier the whole isolation model turns on —
    // there is no reason to publish it.
    tenantId,
    ...rest
  } = category;
  return rest;
}

const isStaff = (req) => req.user?.role === 'admin' || req.user?.role === 'employee';

/** How many live listings sit in each of the given categories. */
async function countListingsByCategory(slugs) {
  if (!slugs.length) return {};
  const rows = await Listing.aggregate([
    { $match: { category: { $in: slugs }, isDeleted: { $ne: true } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

// ─── POST /api/category/create ────────────────────────────────────────────────

export const createCategory = async (req, res, next) => {
  try {
    const { name, fields } = req.body;
    if (!name || !name.trim()) return next(errorHandler(400, 'Give the category a name.'));

    const slug = toSlug(name);
    if (!slug) {
      return next(errorHandler(400, 'That name has no letters or digits to build an address from.'));
    }

    // Deleted categories match too. A second row with the same slug would fork
    // the data — a listing refers to its category by slug, so two rows sharing
    // one is ambiguous. Offering to restore is the honest answer.
    const existing = await Category.findOne({ slug });
    if (existing) {
      if (existing.isDeleted) {
        return next(
          new ConflictError(
            `"${existing.name}" was deleted earlier and still holds this address. Restore it instead of creating a new one.`
          )
        );
      }
      return next(new ConflictError(`You already have a category called "${existing.name}".`));
    }

    const { fields: clean, errors } = validateCategoryFields(fields || []);
    if (errors.length) return next(new ValidationError(describeFieldErrors(errors), 'fields'));

    const category = await Category.create({ name: name.trim(), slug, fields: clean });
    clearCategoryCache();

    logActivity({
      entityType: 'category',
      entityId: category._id,
      action: 'created',
      message: `Category "${category.name}" created`,
      createdBy: req.user.id,
    }).catch(() => {});

    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/category/list ───────────────────────────────────────────────────

export const getCategories = async (req, res, next) => {
  try {
    // Staff see usage counts and internal fields; the public browse filters do
    // not. Keyed separately so one is never served to the other.
    const staff = isStaff(req);
    const cacheKey = staff ? 'category:list:staff' : 'category:list:public';

    const cached = cache.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const categories = await Category.find({ isDeleted: { $ne: true } }).sort({ name: 1 }).lean();

    let payload;
    if (staff) {
      // The count is what makes "can I safely delete this?" answerable without
      // leaving the page.
      const counts = await countListingsByCategory(categories.map((c) => c.slug));
      payload = categories.map((c) => ({ ...c, listingCount: counts[c.slug] || 0 }));
    } else {
      payload = categories.map(publicView);
    }

    cache.set(cacheKey, payload);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/category/by-slug/:slug ──────────────────────────────────────────

export const getCategoryBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const staff = isStaff(req);
    const cacheKey = `category:slug:${staff ? 'staff' : 'public'}:${slug}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const cat = await Category.findOne({ slug, isDeleted: { $ne: true } }).lean();
    if (!cat) return next(new NotFoundError('No category at that address.'));

    const payload = staff
      ? { ...cat, listingCount: (await countListingsByCategory([cat.slug]))[cat.slug] || 0 }
      : publicView(cat);

    cache.set(cacheKey, payload);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/category/:id ──────────────────────────────────────────────────

/**
 * Rename a category.
 *
 * The slug deliberately does not change. Every listing refers to its category by
 * slug, so changing the address would orphan all of them — a rename is a change
 * of label, not of identity.
 */
export const renameCategory = async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return next(errorHandler(400, 'Give the category a name.'));
    if (name.length > 50) return next(errorHandler(400, 'Category name cannot exceed 50 characters.'));

    const category = await Category.findById(req.params.id);
    if (!category || category.isDeleted) return next(new NotFoundError('Category not found.'));

    const clash = await Category.findOne({
      name,
      _id: { $ne: category._id },
      isDeleted: { $ne: true },
    });
    if (clash) return next(new ConflictError(`Another category is already called "${name}".`));

    const previous = category.name;
    category.name = name;
    await category.save();
    clearCategoryCache();

    logActivity({
      entityType: 'category',
      entityId: category._id,
      action: 'updated',
      message: `Category renamed from "${previous}" to "${name}"`,
      createdBy: req.user.id,
    }).catch(() => {});

    res.status(200).json(category);
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/category/delete/:id ──────────────────────────────────────────

/**
 * Delete a category.
 *
 * Refused while listings still use it. A listing refers to its category by slug,
 * so deleting one in use leaves those properties pointing at something that no
 * longer resolves: their category fields stop rendering and the board's filter
 * loses them. The count comes back with the refusal so an admin can act on it,
 * and `?force=true` covers the deliberate case.
 */
export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category || category.isDeleted) return next(new NotFoundError('Category not found.'));

    const inUse = await Listing.countDocuments({ category: category.slug, isDeleted: { $ne: true } });

    if (inUse > 0 && req.query.force !== 'true') {
      const err = new ConflictError(
        `${inUse} propert${inUse === 1 ? 'y is' : 'ies are'} still in "${category.name}". ` +
          'Move them to another category first, or confirm you want to delete it anyway.'
      );
      err.details = { listingCount: inUse, categorySlug: category.slug };
      return next(err);
    }

    await Category.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user?.id || null,
    });

    clearCategoryCache();

    logActivity({
      entityType: 'category',
      entityId: category._id,
      action: 'deleted',
      message: `Category "${category.name}" deleted${inUse ? ` while ${inUse} properties still used it` : ''}`,
      meta: { listingCount: inUse, forced: req.query.force === 'true' },
      createdBy: req.user.id,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `"${category.name}" deleted.`,
      listingsAffected: inUse,
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/category/update-fields/:id ─────────────────────────────────────

/**
 * Replace a category's field definitions.
 *
 * Two things make this more than a save. The definitions are validated — they
 * govern how every listing in the category is stored, and nothing checked them
 * before. And removing a field is reported rather than done quietly: the values
 * stay in the database but stop being rendered anywhere, so an admin tidying up
 * a form can lose data without being able to see that they have.
 */
export const updateCategoryFields = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fields } = req.body;

    const category = await Category.findById(id);
    if (!category || category.isDeleted) return next(new NotFoundError('Category not found.'));

    const { fields: clean, errors } = validateCategoryFields(fields);
    if (errors.length) {
      const err = new ValidationError(describeFieldErrors(errors), 'fields');
      err.details = { fieldErrors: errors };
      return next(err);
    }

    // Which fields are going away, and does anything hold a value for them?
    const previousKeys = (category.fields || []).map((f) => f.key);
    const nextKeys = new Set(clean.map((f) => f.key));
    const removed = previousKeys.filter((k) => !nextKeys.has(k));

    let removedWithData = [];
    if (removed.length) {
      const counts = await Promise.all(
        removed.map(async (key) => ({
          key,
          label: (category.fields.find((f) => f.key === key) || {}).label || key,
          count: await Listing.countDocuments({
            [`attributes.${key}`]: { $exists: true, $nin: [null, ''] },
            isDeleted: { $ne: true },
          }),
        }))
      );
      removedWithData = counts.filter((c) => c.count > 0);
    }

    if (removedWithData.length && req.query.force !== 'true') {
      const summary = removedWithData
        .map((r) => `${r.label} (${r.count} propert${r.count === 1 ? 'y' : 'ies'})`)
        .join(', ');
      const err = new ConflictError(
        `Removing ${summary} would hide values already recorded. ` +
          'The data stays in the database but nothing will show it. Confirm to go ahead.'
      );
      err.details = { removedWithData };
      return next(err);
    }

    category.fields = clean;
    await category.save();
    clearCategoryCache();

    logActivity({
      entityType: 'category',
      entityId: category._id,
      action: 'updated',
      message: `Fields updated for "${category.name}" (${clean.length} field${clean.length === 1 ? '' : 's'})`,
      meta: { removed, removedWithData },
      createdBy: req.user.id,
    }).catch(() => {});

    res.status(200).json({ ...category.toObject(), removedWithData });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/category/update-location/:id ───────────────────────────────────

export const updateCategoryLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { defaultLocation } = req.body;

    let update;
    if (!defaultLocation) {
      update = { defaultLocation: { lat: null, lng: null } };
    } else {
      const { lat, lng } = defaultLocation;
      // Range-checked, not merely type-checked: a longitude of 7700 is a typo
      // that would put every listing in the category off the map.
      const validLat = lat === null || lat === undefined || (typeof lat === 'number' && Math.abs(lat) <= 90);
      const validLng = lng === null || lng === undefined || (typeof lng === 'number' && Math.abs(lng) <= 180);
      if (!validLat || !validLng) {
        return next(errorHandler(400, 'Latitude must be between -90 and 90, longitude between -180 and 180.'));
      }
      update = { defaultLocation: { lat: lat ?? null, lng: lng ?? null } };
    }

    const updated = await Category.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!updated) return next(new NotFoundError('Category not found.'));

    clearCategoryCache();
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/category/restore/:id ───────────────────────────────────────────

/** Undo a delete. The deleted row still holds the slug, so this is the way back. */
export const restoreCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return next(new NotFoundError('Category not found.'));
    if (!category.isDeleted) return next(errorHandler(400, 'That category is not deleted.'));

    const clash = await Category.findOne({
      slug: category.slug,
      _id: { $ne: category._id },
      isDeleted: { $ne: true },
    });
    if (clash) {
      return next(
        new ConflictError(`"${clash.name}" now uses that address. Rename it before restoring this one.`)
      );
    }

    category.isDeleted = false;
    category.deletedAt = null;
    category.deletedBy = null;
    await category.save();
    clearCategoryCache();

    logActivity({
      entityType: 'category',
      entityId: category._id,
      action: 'restored',
      message: `Category "${category.name}" restored`,
      createdBy: req.user.id,
    }).catch(() => {});

    res.status(200).json(category);
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/category/deleted ────────────────────────────────────────────────

/** Deleted categories, so a delete can be undone rather than only regretted. */
export const getDeletedCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .limit(50)
      .lean();
    const counts = await countListingsByCategory(categories.map((c) => c.slug));
    res.status(200).json(categories.map((c) => ({ ...c, listingCount: counts[c.slug] || 0 })));
  } catch (error) {
    next(error);
  }
};
