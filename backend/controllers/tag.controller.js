import mongoose from 'mongoose';
import Tag, { TAG_COLOR_NAMES } from '../models/tag.model.js';
import Client from '../models/client.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler } from '../utils/error.js';
import { logFromRequest } from '../utils/activity.js';

/**
 * Managing and applying a workspace's tags.
 *
 * The taggable kinds and where the ids live. Deals are sub-documents of Client,
 * so a deal's tags are stored on the sub-document.
 */
const TAGGABLE = {
  client: {
    model: () => Client,
    find: (id) => Client.findOne({ _id: id, isDeleted: { $ne: true } }).select('assignedTo tagIds'),
    owner: (doc) => doc.assignedTo,
    pull: (id, tagId) => Client.updateOne({ _id: id }, { $pull: { tagIds: tagId } }),
    push: (id, tagId) => Client.updateOne({ _id: id }, { $addToSet: { tagIds: tagId } }),
    countUsing: (tagId) => Client.countDocuments({ tagIds: tagId, isDeleted: { $ne: true } }),
  },
  listing: {
    model: () => Listing,
    find: (id) => Listing.findOne({ _id: id, isDeleted: { $ne: true } }).select('userRef assignedAgent tagIds'),
    owner: (doc) => doc.assignedAgent || doc.userRef,
    pull: (id, tagId) => Listing.updateOne({ _id: id }, { $pull: { tagIds: tagId } }),
    push: (id, tagId) => Listing.updateOne({ _id: id }, { $addToSet: { tagIds: tagId } }),
    countUsing: (tagId) => Listing.countDocuments({ tagIds: tagId, isDeleted: { $ne: true } }),
  },
};

const slugify = (name) => String(name).trim().toLowerCase().replace(/\s+/g, ' ');

/** Recompute a tag's usage from the records that actually carry it. */
async function refreshUsage(tagId) {
  const counts = await Promise.all(
    Object.values(TAGGABLE).map((spec) => spec.countUsing(tagId))
  );
  const total = counts.reduce((a, b) => a + b, 0);
  await Tag.updateOne({ _id: tagId }, { $set: { usageCount: total } });
  return total;
}

export const listTags = async (req, res, next) => {
  try {
    const tags = await Tag.find({}).sort({ name: 1 }).lean();
    res.json({
      success: true,
      data: { tags, colors: TAG_COLOR_NAMES },
    });
  } catch (err) {
    next(err);
  }
};

export const createTag = async (req, res, next) => {
  try {
    const { name, color, description } = req.body || {};
    if (!name || !String(name).trim()) return next(errorHandler(400, 'A tag needs a name'));

    const slug = slugify(name);

    // Creating a tag that already exists returns the existing one rather than
    // failing: the common caller is an inline "add tag" box where the user is
    // not thinking about whether it exists yet.
    const existing = await Tag.findOne({ slug });
    if (existing) return res.status(200).json({ success: true, data: existing.toPublicJSON() });

    const tag = await Tag.create({
      name: String(name).trim(),
      slug,
      color: TAG_COLOR_NAMES.includes(color) ? color : 'slate',
      description: description || '',
      createdBy: req.user.id,
    });

    logFromRequest(req, {
      entityType: 'user',
      entityId: req.user.id,
      action: 'tag.created',
      message: `Created tag "${tag.name}"`,
    });

    res.status(201).json({ success: true, data: tag.toPublicJSON() });
  } catch (err) {
    // The unique {tenantId, slug} index is the real guard against a race
    // between two people creating the same tag at the same moment.
    if (err?.code === 11000) {
      const existing = await Tag.findOne({ slug: slugify(req.body?.name) });
      if (existing) return res.status(200).json({ success: true, data: existing.toPublicJSON() });
    }
    next(err);
  }
};

export const updateTag = async (req, res, next) => {
  try {
    const { name, color, description } = req.body || {};
    const update = {};

    if (name && String(name).trim()) {
      update.name = String(name).trim();
      update.slug = slugify(name);
    }
    if (color && TAG_COLOR_NAMES.includes(color)) update.color = color;
    if (typeof description === 'string') update.description = description;

    if (!Object.keys(update).length) return next(errorHandler(400, 'Nothing to update'));

    const tag = await Tag.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!tag) return next(errorHandler(404, 'Tag not found'));

    // Nothing stores the tag's text, so a rename propagates by itself.
    res.json({ success: true, data: tag.toPublicJSON() });
  } catch (err) {
    if (err?.code === 11000) return next(errorHandler(409, 'A tag with that name already exists'));
    next(err);
  }
};

/**
 * Deleting a tag detaches it everywhere first.
 *
 * Leaving dangling ids on records would mean every read had to filter out tags
 * that no longer exist — the kind of cleanup that gets forgotten in one place
 * and shows up as a blank chip.
 */
export const deleteTag = async (req, res, next) => {
  try {
    const tag = await Tag.findById(req.params.id);
    if (!tag) return next(errorHandler(404, 'Tag not found'));

    const tagId = tag._id;
    await Promise.all(
      Object.values(TAGGABLE).map((spec) => spec.model().updateMany({ tagIds: tagId }, { $pull: { tagIds: tagId } }))
    );
    await tag.deleteOne();

    logFromRequest(req, {
      entityType: 'user',
      entityId: req.user.id,
      action: 'tag.deleted',
      message: `Deleted tag "${tag.name}"`,
    });

    res.json({ success: true, message: 'Tag deleted' });
  } catch (err) {
    next(err);
  }
};

/** Attach or detach, depending on `req.method`. */
async function setTag(req, res, next, attach) {
  try {
    const { kind, id, tagId } = req.params;
    const spec = TAGGABLE[kind];
    if (!spec) return next(errorHandler(400, 'That kind of record cannot be tagged'));

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(tagId)) {
      return next(errorHandler(400, 'Invalid id'));
    }

    const [record, tag] = await Promise.all([spec.find(id), Tag.findById(tagId)]);
    if (!record) return next(errorHandler(404, 'Record not found'));
    if (!tag) return next(errorHandler(404, 'Tag not found'));

    // Same rule as editing the record itself: an employee may tag what they own.
    if (req.user.role !== 'admin') {
      const owner = spec.owner(record);
      if (!owner || String(owner) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
    }

    await (attach ? spec.push(id, tag._id) : spec.pull(id, tag._id));
    const usageCount = await refreshUsage(tag._id);

    res.json({ success: true, data: { ...tag.toPublicJSON(), usageCount } });
  } catch (err) {
    next(err);
  }
}

export const attachTag = (req, res, next) => setTag(req, res, next, true);
export const detachTag = (req, res, next) => setTag(req, res, next, false);
