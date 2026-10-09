import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { verifyToken } from '../utils/verifyUser.js';
import { fileTypeFromBuffer } from 'file-type';
import { resolveSafeExtension, safeBaseName, IMAGE_TYPES, AUDIO_TYPES } from '../utils/fileValidation.js';
import { logger } from '../utils/logger.js';
import { assertStorageAvailable } from '../tenancy/limits.js';
import { storedDocumentBytes } from '../controllers/document.controller.js';

/**
 * The plan's storage cap, checked before anything is written.
 *
 * Usage counts what the database records sizes for — documents. Images and
 * voice notes saved here leave no size record behind, so they are not part of
 * "used"; each upload is still weighed against the cap, which stops a
 * workspace whose documents already fill its plan from adding more files.
 * Counting these too needs a size record per stored file, which does not
 * exist yet.
 */
const checkStorage = (bytes) => assertStorageAvailable(bytes, storedDocumentBytes);

const router = express.Router();

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Buffer uploads in memory so the real content can be inspected (magic bytes) before
// anything is written to disk — the client-declared mimetype and filename are untrusted.
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const memoryAudioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Validates `file`'s real content against `allowlist`, then writes it to disk under a
// filename whose extension comes only from the detected type. Returns the stored filename,
// or null if the content doesn't match anything in the allowlist.
async function persistValidatedFile(file, allowlist) {
  const ext = await resolveSafeExtension(file.buffer, allowlist, file.originalname);
  if (!ext) {
    // Say WHAT was seen vs what's allowed, so a "wrong type" rejection is
    // diagnosable from the logs instead of guessing (this is exactly how the
    // voice-note container mismatch stayed invisible).
    const detected = await fileTypeFromBuffer(file.buffer).catch(() => null);
    logger.warn('upload rejected: unsupported type', {
      detected_mime: detected?.mime || 'unrecognised',
      detected_ext: detected?.ext || null,
      size_bytes: file.size,
      allowed: Object.keys(allowlist).join(','),
    });
    return null;
  }
  const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeBaseName(file.originalname)}${ext}`;
  await fs.promises.writeFile(path.join(uploadsDir, filename), file.buffer);
  return filename;
}

router.post('/single', verifyToken, (req, res, next) => {
  memoryUpload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    try {
      await checkStorage(req.file.size);
      const filename = await persistValidatedFile(req.file, IMAGE_TYPES);
      if (!filename) {
        return res.status(400).json({ success: false, message: 'Only image uploads are allowed' });
      }
      res.status(201).json({ success: true, url: `/uploads/${filename}` });
    } catch (e) {
      next(e);
    }
  });
});

router.post('/multiple', verifyToken, (req, res, next) => {
  memoryUpload.array('images', 6)(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large. Maximum size is 10MB per image.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No image files provided' });
    }

    try {
      await checkStorage(req.files.reduce((sum, f) => sum + f.size, 0));
      const urls = [];
      for (const f of req.files) {
        const filename = await persistValidatedFile(f, IMAGE_TYPES);
        if (!filename) {
          return res.status(400).json({ success: false, message: `"${f.originalname}" is not a valid image file` });
        }
        urls.push(`${req.protocol}://${req.get('host')}/uploads/${filename}`);
      }
      res.status(201).json({ success: true, urls });
    } catch (e) {
      next(e);
    }
  });
});

router.post('/audio', verifyToken, (req, res, next) => {
  memoryAudioUpload.single('audio')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large. Maximum size is 25MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    try {
      await checkStorage(req.file.size);
    } catch (e) {
      return next(e); // a plan limit is a 402, not "failed to save"
    }

    try {
      const filename = await persistValidatedFile(req.file, AUDIO_TYPES);
      if (!filename) {
        return res.status(400).json({ success: false, message: 'Only audio uploads are allowed' });
      }
      res.status(201).json({ success: true, url: `/uploads/${filename}` });
    } catch (e) {
      res.status(500).json({ success: false, message: 'Failed to save audio file' });
    }
  });
});

export default router;
