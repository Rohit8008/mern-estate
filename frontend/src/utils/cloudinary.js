const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * Upload a file to Cloudinary with progress tracking.
 * @param {File|Blob} file
 * @param {object} opts
 * @param {string} [opts.folder] - Cloudinary folder (e.g. 'avatars', 'voice-notes')
 * @param {string} [opts.filename] - Optional public_id override
 * @param {function} [opts.onProgress] - Called with 0-100 progress value
 * @returns {Promise<string>} Secure URL of the uploaded file
 */
export function uploadToCloudinary(file, { folder = '', filename = '', onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const resourceType = file.type?.startsWith('audio') || file.type?.startsWith('video')
      ? 'video'   // Cloudinary uses 'video' resource type for audio too
      : 'image';

    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', UPLOAD_PRESET);
    if (folder) form.append('folder', folder);
    if (filename) form.append('public_id', filename);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url);
        } catch {
          reject(new Error('Invalid Cloudinary response'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err?.error?.message || `Cloudinary upload failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Cloudinary upload failed: ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Cloudinary upload network error'));
    xhr.send(form);
  });
}
