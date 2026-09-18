import LeadSource, { DEFAULT_LEAD_SOURCES } from '../models/leadSource.model.js';
import Client from '../models/client.model.js';
import { errorHandler } from '../utils/error.js';
import { logFromRequest } from '../utils/activity.js';

const slugify = (name) => String(name).trim().toLowerCase().replace(/\s+/g, ' ');

export const listLeadSources = async (req, res, next) => {
  try {
    let sources = await LeadSource.find({}).sort({ name: 1 }).lean();

    // First read in a workspace seeds the product defaults, so the source
    // dropdown is never an empty box on day one.
    if (!sources.length) {
      await LeadSource.insertMany(
        DEFAULT_LEAD_SOURCES.map((name) => ({ name, slug: slugify(name), createdBy: req.user.id })),
        { ordered: false }
      ).catch(() => {});
      sources = await LeadSource.find({}).sort({ name: 1 }).lean();
    }

    res.json({ success: true, data: { sources } });
  } catch (err) {
    next(err);
  }
};

export const createLeadSource = async (req, res, next) => {
  try {
    const { name, monthlyCost, description } = req.body || {};
    if (!name || !String(name).trim()) return next(errorHandler(400, 'A source needs a name'));

    const slug = slugify(name);
    const existing = await LeadSource.findOne({ slug });
    if (existing) return res.json({ success: true, data: existing });

    const source = await LeadSource.create({
      name: String(name).trim(),
      slug,
      monthlyCost: Math.max(0, Number(monthlyCost) || 0),
      description: description || '',
      createdBy: req.user.id,
    });

    res.status(201).json({ success: true, data: source });
  } catch (err) {
    if (err?.code === 11000) return next(errorHandler(409, 'That source already exists'));
    next(err);
  }
};

export const updateLeadSource = async (req, res, next) => {
  try {
    const { name, monthlyCost, isActive, description } = req.body || {};
    const update = {};

    if (name && String(name).trim()) {
      update.name = String(name).trim();
      update.slug = slugify(name);
    }
    if (monthlyCost !== undefined) update.monthlyCost = Math.max(0, Number(monthlyCost) || 0);
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (typeof description === 'string') update.description = description;

    if (!Object.keys(update).length) return next(errorHandler(400, 'Nothing to update'));

    const source = await LeadSource.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!source) return next(errorHandler(404, 'Source not found'));

    res.json({ success: true, data: source });
  } catch (err) {
    if (err?.code === 11000) return next(errorHandler(409, 'A source with that name already exists'));
    next(err);
  }
};

/**
 * Deleting a source in use answers 409 with a count rather than proceeding —
 * the same rule categories follow. `?force=true` deletes anyway and leaves the
 * leads' stored text alone, so history is not rewritten.
 */
export const deleteLeadSource = async (req, res, next) => {
  try {
    const source = await LeadSource.findById(req.params.id);
    if (!source) return next(errorHandler(404, 'Source not found'));

    const inUse = await Client.countDocuments({
      source: { $regex: `^${source.slug}$`, $options: 'i' },
      isDeleted: { $ne: true },
    });

    if (inUse > 0 && req.query.force !== 'true') {
      return res.status(409).json({
        success: false,
        message: `${inUse} lead${inUse === 1 ? '' : 's'} came from "${source.name}".`,
        data: { inUse, canForce: true },
      });
    }

    await source.deleteOne();

    logFromRequest(req, {
      entityType: 'user',
      entityId: req.user.id,
      action: 'lead_source.deleted',
      message: `Deleted lead source "${source.name}"`,
      meta: { inUse },
    });

    res.json({ success: true, message: 'Source deleted' });
  } catch (err) {
    next(err);
  }
};

/**
 * Return on each channel: what it cost, what it produced.
 *
 * Analytics could already count leads per source. What was missing was the cost
 * side, so "cost per lead" and "cost per deal" — the numbers that decide where
 * next month's budget goes — could not be computed at all.
 *
 * Cost is the monthly figure multiplied by the number of months the window
 * spans, so a 90-day report is measured against roughly three months of spend
 * rather than one.
 */
export const getSourceRoi = async (req, res, next) => {
  try {
    const end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const start = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(end.getTime() - 30 * 86_400_000);

    const months = Math.max(1, (end - start) / (30 * 86_400_000));

    const match = { isDeleted: { $ne: true }, createdAt: { $gte: start, $lte: end } };
    if (req.user.role !== 'admin') match.assignedTo = req.user.id;

    const [sources, grouped] = await Promise.all([
      LeadSource.find({}).lean(),
      Client.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $toLower: { $ifNull: ['$source', 'unknown'] } },
            leads: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
            // Revenue is the value of deals that actually closed won.
            revenue: {
              $sum: {
                $reduce: {
                  input: { $ifNull: ['$deals', []] },
                  initialValue: 0,
                  in: {
                    $add: [
                      '$$value',
                      { $cond: [{ $eq: ['$$this.stage', 'closed_won'] }, { $ifNull: ['$$this.value', 0] }, 0] },
                    ],
                  },
                },
              },
            },
          },
        },
        { $sort: { leads: -1 } },
      ]),
    ]);

    const costBySlug = new Map(sources.map((s) => [s.slug, s.monthlyCost || 0]));
    const nameBySlug = new Map(sources.map((s) => [s.slug, s.name]));

    const rows = grouped.map((g) => {
      const slug = g._id || 'unknown';
      const cost = Math.round((costBySlug.get(slug) || 0) * months);

      return {
        source: nameBySlug.get(slug) || slug,
        slug,
        leads: g.leads,
        won: g.won,
        lost: g.lost,
        revenue: g.revenue || 0,
        cost,
        conversionRate: g.leads ? Math.round((g.won / g.leads) * 1000) / 10 : 0,
        // Null rather than zero when there is no cost on file: "we do not know"
        // and "it was free" are different answers and must not look alike.
        costPerLead: cost > 0 && g.leads ? Math.round(cost / g.leads) : null,
        costPerDeal: cost > 0 && g.won ? Math.round(cost / g.won) : null,
        roi: cost > 0 ? Math.round((((g.revenue || 0) - cost) / cost) * 1000) / 10 : null,
      };
    });

    res.json({
      success: true,
      data: {
        rows,
        periodMonths: Math.round(months * 10) / 10,
        totals: {
          leads: rows.reduce((s, r) => s + r.leads, 0),
          won: rows.reduce((s, r) => s + r.won, 0),
          cost: rows.reduce((s, r) => s + r.cost, 0),
          revenue: rows.reduce((s, r) => s + r.revenue, 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
