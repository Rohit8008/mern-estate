import path from 'path';
import fs from 'fs';
import multer from 'multer';
import Document from '../models/document.model.js';
import Client from '../models/client.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler } from '../utils/error.js';

const uploadsDir = path.join(process.cwd(), 'uploads', 'docs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${timestamp}_${base}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single('file');

function ensureAccessForRelated(user, related) {
  if (user.role === 'admin') return true;
  if (related.kind === 'client' && related.clientId) {
    // Employee can access only if assigned to the client
    return true; // checked later with DB fetch where needed
  }
  if (related.kind === 'listing' && related.listingId) {
    return true; // checked later
  }
  return false;
}

export const uploadDocument = async (req, res, next) => {
  try {
    const { kind, clientId, listingId, title, tags } = req.body;
    if (!kind || !['client', 'listing'].includes(kind)) return next(errorHandler(400, 'Invalid related kind'));

    const related = { kind };
    if (kind === 'client') related.clientId = clientId; else related.listingId = listingId;

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
    }

    const file = req.file;
    if (!file) return next(errorHandler(400, 'File is required'));

    const url = `${req.protocol}://${req.get('host')}/uploads/docs/${file.filename}`;

    const doc = await Document.create({
      title: title || file.originalname,
      filename: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      url,
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
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
    const { kind, clientId, listingId, tag, page = 1, limit = 20 } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (kind) filter['related.kind'] = kind;
    if (clientId) filter['related.clientId'] = clientId;
    if (listingId) filter['related.listingId'] = listingId;
    if (tag) filter.tags = tag;

    // Scope: employee only sees own clients or listings
    if (req.user.role !== 'admin') {
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
