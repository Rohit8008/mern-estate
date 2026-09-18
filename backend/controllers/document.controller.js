import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import Document from '../models/document.model.js';
import Client from '../models/client.model.js';
import Listing from '../models/listing.model.js';
import Category from '../models/category.model.js';
import Transaction from '../models/transaction.model.js';
import { errorHandler } from '../utils/error.js';
import { resolveSafeExtension, safeBaseName, DOCUMENT_TYPES } from '../utils/fileValidation.js';
import {
  CATEGORY_DOC_TYPES,
  CATEGORY_DOC_TYPE_IDS,
  checkFileForType,
} from '../utils/documentTypes.js';
import { fileTypeFromBuffer } from 'file-type';

const uploadsDir = path.join(process.cwd(), 'uploads', 'docs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Buffered in memory so the real content can be checked (magic bytes) before anything is
// written to disk — the client-declared filename/mimetype are untrusted. Previously this
// wrote straight to disk using the extension from the client-supplied filename, which let an
// uploaded `.html`/`.js` file (of any declared mimetype, since there was no fileFilter here at
// all) get served back by express.static with a browser-executable Content-Type (stored XSS).
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single('file');

/** Every parent a document may be filed against, and the id field it uses. */
const RELATED_KINDS = {
  client: 'clientId',
  listing: 'listingId',
  category: 'categoryId',
  deal: 'dealId',
  transaction: 'transactionId',
};

function ensureAccessForRelated(user, related) {
  if (user.role === 'admin') return true;
  // Each kind's real ownership check needs a database read, so it happens in
  // the caller; this only rejects a shape that names no parent at all.
  const idField = RELATED_KINDS[related.kind];
  return Boolean(idField && related[idField]);
}

export const uploadDocument = async (req, res, next) => {
  try {
    const { kind, clientId, listingId, categoryId, dealId, transactionId, title, tags } = req.body;
    if (!kind || !RELATED_KINDS[kind]) return next(errorHandler(400, 'Invalid related kind'));

    const related = { kind };
    if (kind === 'client') related.clientId = clientId;
    else if (kind === 'listing') related.listingId = listingId;
    else if (kind === 'category') related.categoryId = categoryId;
    else if (kind === 'transaction') related.transactionId = transactionId;
    else if (kind === 'deal') {
      // A deal is a sub-document, so both ids are needed to locate it.
      related.dealId = dealId;
      related.clientId = clientId;
    }

    if (!ensureAccessForRelated(req.user, related)) return next(errorHandler(403, 'Forbidden'));

    // Validate ownership/assignment
    if (kind === 'client') {
      const c = await Client.findById(clientId).select('assignedTo');
      if (!c) return next(errorHandler(404, 'Client not found'));
      if (req.user.role !== 'admin' && String(c.assignedTo) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
    } else if (kind === 'listing') {
      const l = await Listing.findById(listingId).select('userRef');
      if (!l) return next(errorHandler(404, 'Listing not found'));
      if (req.user.role !== 'admin' && String(l.userRef) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
    } else if (kind === 'category') {
      const cat = await Category.findById(categoryId).select('slug');
      if (!cat) return next(errorHandler(404, 'Category not found'));
      if (req.user.role !== 'admin' && !(req.user.assignedCategories || []).includes(cat.slug)) {
        return next(errorHandler(403, 'Forbidden'));
      }
    } else if (kind === 'deal') {
      // The parent client decides who may file paperwork against the deal.
      const c = await Client.findOne({ _id: clientId, 'deals._id': dealId }).select('assignedTo');
      if (!c) return next(errorHandler(404, 'Deal not found'));
      if (req.user.role !== 'admin' && String(c.assignedTo) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
    } else if (kind === 'transaction') {
      const t = await Transaction.findById(transactionId).select('agent createdBy');
      if (!t) return next(errorHandler(404, 'Transaction not found'));
      const owner = String(t.agent || t.createdBy || '');
      if (req.user.role !== 'admin' && owner !== req.user.id) return next(errorHandler(403, 'Forbidden'));
    }

    const file = req.file;
    if (!file) return next(errorHandler(400, 'File is required'));

    const ext = await resolveSafeExtension(file.buffer, DOCUMENT_TYPES, file.originalname);
    if (!ext) return next(errorHandler(400, 'That file type is not supported. Use a PDF, an Office document, or a JPG/PNG image.'));

    // The type decides what the file is allowed to be — a RERA certificate is
    // not a photograph, and a colony picture is not a spreadsheet. Checked
    // against the DETECTED mime, never the declared one.
    let docType = 'other';
    if (kind === 'category') {
      docType = String(req.body.docType || 'other');
      if (!CATEGORY_DOC_TYPE_IDS.includes(docType)) {
        return next(errorHandler(400, `"${docType}" is not a document type.`));
      }
      const detected = await fileTypeFromBuffer(file.buffer);
      const mismatch = checkFileForType(docType, detected?.mime);
      if (mismatch) return next(errorHandler(400, mismatch));
    }

    // Only an admin may publish. An employee can add a document to a colony
    // they work on; putting it in front of the public is a different decision.
    const wantsPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
    if (wantsPublic && req.user.role !== 'admin') {
      return next(errorHandler(403, 'Only an admin can publish a document to the public page.'));
    }
    const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeBaseName(file.originalname)}${ext}`;
    await fs.promises.writeFile(path.join(uploadsDir, filename), file.buffer);

    // Served through an authenticated route, not off disk. `/uploads/docs` had no
    // session, no tenant and no ownership check in front of it.
    const url = `/api/documents/file/${filename}`;

    const doc = await Document.create({
      title: title || file.originalname,
      filename,
      mimeType: file.mimetype,
      size: file.size,
      url,
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
      docType,
      isPublic: wantsPublic,
      uploadedBy: req.user.id,
      related,
      storage: 'local',
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const listDocuments = async (req, res, next) => {
  try {
    const { kind, clientId, listingId, categoryId, dealId, transactionId, tag, page = 1, limit = 20 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (kind) filter['related.kind'] = kind;
    if (clientId) filter['related.clientId'] = clientId;
    if (listingId) filter['related.listingId'] = listingId;
    if (dealId) filter['related.dealId'] = dealId;
    if (transactionId) filter['related.transactionId'] = transactionId;
    if (categoryId) filter['related.categoryId'] = categoryId;
    if (tag) filter.tags = tag;

    if (req.query.docType) filter.docType = req.query.docType;

    // Scope: employee only sees own clients or listings, or categories they're
    // assigned to.
    if (req.user.role !== 'admin') {
      // A request naming no entity would previously skip every check below and
      // return the whole workspace's documents. An employee must ask about
      // something specific.
      if (!filter['related.clientId'] && !filter['related.listingId'] && !filter['related.categoryId']) {
        return next(errorHandler(400, 'Say which client, property or category you want documents for.'));
      }
      if (filter['related.clientId']) {
        const c = await Client.findById(filter['related.clientId']).select('assignedTo');
        if (!c) return next(errorHandler(404, 'Client not found'));
        if (String(c.assignedTo) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
      }
      if (filter['related.listingId']) {
        const l = await Listing.findById(filter['related.listingId']).select('userRef');
        if (!l) return next(errorHandler(404, 'Listing not found'));
        if (String(l.userRef) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
      }
      if (filter['related.categoryId']) {
        const cat = await Category.findById(filter['related.categoryId']).select('slug');
        if (!cat) return next(errorHandler(404, 'Category not found'));
        if (!(req.user.assignedCategories || []).includes(cat.slug)) return next(errorHandler(403, 'Forbidden'));
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Document.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Document.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, page: Number(page), limit: Number(limit), total });
  } catch (err) {
    next(err);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);
    if (!doc) return next(errorHandler(404, 'Document not found'));

    // Access check: admin or owner of related entity
    if (req.user.role !== 'admin') {
      if (doc.related.kind === 'client' && doc.related.clientId) {
        const c = await Client.findById(doc.related.clientId).select('assignedTo');
        if (!c || String(c.assignedTo) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
      } else if (doc.related.kind === 'listing' && doc.related.listingId) {
        const l = await Listing.findById(doc.related.listingId).select('userRef');
        if (!l || String(l.userRef) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
      } else if (doc.related.kind === 'category' && doc.related.categoryId) {
        const cat = await Category.findById(doc.related.categoryId).select('slug');
        if (!cat || !(req.user.assignedCategories || []).includes(cat.slug)) return next(errorHandler(403, 'Forbidden'));
      }
    }

    // Soft delete - don't remove the file
    await Document.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user.id,
    });
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) {
    next(err);
  }
};


// ─── GET /api/documents/category-types ────────────────────────────────────────

/** The document types a category can hold, for the upload form. */
export const getCategoryDocTypes = async (req, res) => {
  res.json({ success: true, data: CATEGORY_DOC_TYPES });
};

// ─── GET /api/documents/public/category/:categoryId ───────────────────────────

/**
 * A colony's published paperwork and photographs.
 *
 * Reachable without signing in, because that is the point: a buyer checking
 * whether a project is RERA registered should not need an account, and colony
 * photographs are marketing.
 *
 * Only documents an admin has explicitly published are returned, and only the
 * fields needed to show them — never `uploadedBy`, which names a member of
 * staff, nor the soft-delete trail.
 */
export const listPublicCategoryDocuments = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findOne({ _id: categoryId, isDeleted: { $ne: true } }).select('_id name slug');
    if (!category) return next(errorHandler(404, 'Category not found'));

    const docs = await Document.find({
      'related.kind': 'category',
      'related.categoryId': category._id,
      isPublic: true,
      isDeleted: { $ne: true },
    })
      .select('title url mimeType size docType createdAt')
      .sort({ docType: 1, createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      data: {
        category: { id: String(category._id), name: category.name, slug: category.slug },
        documents: docs,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Stream a stored document to someone entitled to see it.
 *
 * These bytes used to be served by `express.static('/uploads')`, which is
 * mounted OUTSIDE `/api` — so neither `resolveTenant` nor `verifyToken` ever
 * ran on them. A contract or a RERA certificate was readable by anyone holding
 * the URL, from any workspace, with no session, and `deleteDocument` keeps the
 * file on disk deliberately, so revoking a document never revoked its contents.
 *
 * The row is looked up through the tenant-scoped model, so a filename belonging
 * to another agency is simply not found. Then the same ownership rules
 * `deleteDocument` applies are applied again here.
 */
export const serveDocumentFile = async (req, res, next) => {
  try {
    const name = String(req.params.filename || '');
    // The stored name is ours, not the client's: timestamp, random hex and a
    // sanitised base. Anything else is not a filename we wrote.
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes('..')) {
      return next(errorHandler(400, 'Not a valid document reference.'));
    }

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const doc = await Document.findOne({
      url: { $regex: `/${escaped}$` },
      isDeleted: { $ne: true },
    });
    if (!doc) return next(errorHandler(404, 'Document not found'));

    if (req.user.role !== 'admin') {
      if (doc.related.kind === 'client' && doc.related.clientId) {
        const c = await Client.findById(doc.related.clientId).select('assignedTo');
        if (!c || String(c.assignedTo) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
      } else if (doc.related.kind === 'listing' && doc.related.listingId) {
        const l = await Listing.findById(doc.related.listingId).select('userRef');
        if (!l || String(l.userRef) !== req.user.id) return next(errorHandler(403, 'Forbidden'));
      } else if (doc.related.kind === 'category' && doc.related.categoryId) {
        const cat = await Category.findById(doc.related.categoryId).select('slug');
        if (!cat || !(req.user.assignedCategories || []).includes(cat.slug)) {
          return next(errorHandler(403, 'Forbidden'));
        }
      } else {
        return next(errorHandler(403, 'Forbidden'));
      }
    }

    const filePath = path.join(uploadsDir, name);
    // uploadsDir is absolute; resolve and re-check rather than trusting the regex alone.
    if (!path.resolve(filePath).startsWith(path.resolve(uploadsDir) + path.sep)) {
      return next(errorHandler(400, 'Not a valid document reference.'));
    }
    if (!fs.existsSync(filePath)) return next(errorHandler(404, 'Document file is missing on disk'));

    // Content-Type from the extension WE assigned at upload time, never from the
    // request, and always as an attachment so nothing renders in the origin.
    const ext = path.extname(name).toLowerCase();
    const mime = Object.entries(DOCUMENT_TYPES).find(([, e]) => e === ext)?.[0] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${(doc.title || name).replace(/[^A-Za-z0-9._ -]/g, '_')}${ext}"`);
    res.setHeader('Cache-Control', 'private, no-store');

    fs.createReadStream(filePath).on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
};
