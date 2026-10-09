import path from 'path';
import { fileTypeFromBuffer } from 'file-type';

// Maps a magic-byte-detected MIME type to the extension the file is actually stored under.
// The stored extension must NEVER come from the client-supplied filename or declared
// Content-Type — both are attacker controlled. Spoofing the multipart Content-Type to
// "image/png" while uploading a `.html`/`.js` file used to be enough to get it saved with
// that real extension and served back by express.static with a browser-executable
// Content-Type (stored XSS).
export const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export const AUDIO_TYPES = {
  // Audio-only container blobs are frequently detected as the shared video/* container
  // mime since these containers don't self-report audio-vs-video — still safe to accept:
  // these magic bytes are just as distinct from HTML/JS/SVG as a stricter audio-only list.
  // The mobile app records AAC into an MP4/M4A container (the `record` plugin); MediaMuxer
  // stamps a generic `mp42`/`isom` ftyp brand, which file-type reports as `video/mp4` (only
  // an `M4A ` brand comes back as audio/x-m4a) — so accept video/mp4 too or every voice
  // note is rejected as "not audio".
  'audio/webm': '.webm', 'video/webm': '.webm',
  'audio/ogg': '.ogg', 'video/ogg': '.ogg',
  'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'video/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav', 'audio/x-wav': '.wav',
  'audio/aac': '.aac',
};

export const DOCUMENT_TYPES = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

// Legacy MS Office binary format (.doc/.xls/.ppt) all share the same CFB container magic
// bytes, so file-type can't tell them apart by content alone — trust the claimed extension
// only among this safe trio, never anything else.
const LEGACY_OFFICE_EXTS = new Set(['.doc', '.xls', '.ppt']);

// Resolves the safe extension to store `buffer` under given an allowlist of
// detected-mime -> extension, or null if the real content doesn't match anything allowed.
export async function resolveSafeExtension(buffer, allowlist, originalname = '') {
  const type = await fileTypeFromBuffer(buffer);
  if (!type) return null;
  if (type.mime === 'application/x-cfb' && allowlist === DOCUMENT_TYPES) {
    const claimed = path.extname(originalname).toLowerCase();
    return LEGACY_OFFICE_EXTS.has(claimed) ? claimed : '.doc';
  }
  return allowlist[type.mime] || null;
}

export function safeBaseName(originalname) {
  const ext = path.extname(originalname || '');
  const base = path.basename(originalname || '', ext).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
  return base || 'file';
}
