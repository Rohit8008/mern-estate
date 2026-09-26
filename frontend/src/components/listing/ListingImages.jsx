import { useRef, useState } from 'react';
import {
  HiOutlineCamera,
  HiOutlinePhotograph,
  HiOutlineStar,
  HiOutlineTrash,
  HiOutlineUpload,
} from 'react-icons/hi';
import { apiClient, normalizeImageUrl } from '../../utils/http';
import CameraCapture from '../CameraCapture';
import { Button, Badge } from '../../design-system';
import { useTranslation } from 'react-i18next';

/**
 * Photographs of a property.
 *
 * Camera capture existed only on the create form and documents only on the
 * edit form, so an agent standing at a property could photograph it while
 * adding it but not while correcting it — a split nobody decided on, just an
 * artefact of the two forms having been copied apart.
 *
 * The first image is the one that appears everywhere else in the product, so it
 * is labelled as such and can be promoted, rather than leaving people to guess
 * that order matters.
 */

const MAX_IMAGES = 12;
const MAX_BYTES = 2 * 1024 * 1024;

export default function ListingImages({ urls = [], onChange, disabled }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const room = MAX_IMAGES - urls.length;

  async function upload(files) {
    const list = Array.from(files || []);
    if (!list.length) return;

    if (list.length > room) {
      setError(`You can add ${room} more image${room === 1 ? '' : 's'} — ${MAX_IMAGES} is the limit.`);
      return;
    }
    const tooBig = list.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is over 2 MB. Shrink it and try again.`);
      return;
    }

    setUploading(true);
    setError('');
    try {
      // Uploaded in parallel, but the result order is preserved by
      // Promise.all — which matters because the first image is the cover.
      const uploaded = await Promise.all(
        list.map(async (file) => {
          const body = new FormData();
          body.append('image', file);
          const res = await apiClient.upload('/upload/single', body);
          return res.url;
        })
      );
      onChange([...urls, ...uploaded.filter(Boolean)]);
    } catch (err) {
      setError(err?.message || 'Those images could not be uploaded.');
    } finally {
      setUploading(false);
    }
  }

  const remove = (index) => onChange(urls.filter((_, i) => i !== index));

  const makeCover = (index) => {
    if (index === 0) return;
    const next = [...urls];
    const [img] = next.splice(index, 1);
    onChange([img, ...next]);
  };

  const reorder = (from, to) => {
    if (from === to || to < 0 || to >= urls.length) return;
    const next = [...urls];
    const [img] = next.splice(from, 1);
    next.splice(to, 0, img);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={HiOutlineUpload}
          loading={uploading}
          disabled={disabled || room <= 0}
          onClick={() => inputRef.current?.click()}
        >{t('listingImages.addPhotos')}</Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={HiOutlineCamera}
          disabled={disabled || uploading || room <= 0}
          onClick={() => setCameraOpen(true)}
        >{t('listingImages.takeAPhoto')}</Button>
        <span className="text-xs text-slate-500">
          {urls.length} of {MAX_IMAGES} · 2 MB each
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          aria-label="Add photos"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {urls.length === 0 ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
          className="rounded-xl border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-6 py-10 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <HiOutlinePhotograph className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
          <p className="text-sm text-slate-600 mt-2">{t('listingImages.dropPhotosHereOrClickTo')}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('listingImages.theFirstOneIsUsedAs')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {urls.map((url, i) => (
            <div
              key={`${url}-${i}`}
              draggable={!disabled}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) reorder(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3] ${
                dragIndex === i ? 'opacity-40' : ''
              }`}
            >
              <img
                src={normalizeImageUrl(url)}
                alt={i === 0 ? `Property photo 1 of ${urls.length} (cover)` : `Property photo ${i + 1} of ${urls.length}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {i === 0 && (
                <div className="absolute top-2 left-2">
                  <Badge variant="brand" size="xs">{t('listingImages.cover')}</Badge>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 p-2 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => makeCover(i)}
                    title={t('listingImages.useAsCover')}
                    aria-label={t('listingImages.useAsCover')}
                    className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-slate-700"
                  >
                    <HiOutlineStar className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  title={t('listingImages.remove')}
                  aria-label={t('listingImages.removePhoto')}
                  className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-rose-600"
                >
                  <HiOutlineTrash className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(blob) => {
          setCameraOpen(false);
          if (blob) upload([new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
        }}
      />
    </div>
  );
}
