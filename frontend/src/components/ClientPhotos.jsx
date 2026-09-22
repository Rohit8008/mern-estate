import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HiPhotograph, HiPlus, HiTrash, HiX } from 'react-icons/hi';
import { uploadToCloudinary } from '../utils/cloudinary';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Photos attached to a lead — a site visit, a whiteboard, a snapped document.
 *
 * Files go straight to Cloudinary from the browser, as listing images do, so a
 * 4MB photo never travels through the API; only the resulting URL is stored.
 */
export default function ClientPhotos({ clientId, photos = [], onChange, readOnly = false }) {
  const { t } = useTranslation();
  const { showError } = useNotification();

  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const upload = async (files) => {
    const list = [...files].filter((file) => file.type?.startsWith('image/'));
    if (!list.length) return;

    setUploading(true);
    try {
      for (const file of list) {
        // Resolves to the secure URL string itself.
        const url = await uploadToCloudinary(file, { folder: 'clients' });
        const res = await apiClient.post(`/clients/${clientId}/photos`, { url });
        onChange?.(res?.data || []);
      }
    } catch (err) {
      showError(err?.message || 'Could not upload that photo');
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = async (photoId) => {
    try {
      const res = await apiClient.delete(`/clients/${clientId}/photos/${photoId}`);
      onChange?.(res?.data || []);
      setPendingDelete(null);
    } catch (err) {
      showError(err?.message || 'Could not remove that photo');
    }
  };

  return (
    <div>
      <div className='flex items-center justify-between mb-3'>
        <h3 className='font-semibold text-sm text-slate-900'>{t('clientPhotos.photos')}</h3>
        {!readOnly && (
          <button
            type='button'
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className='inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50'
          >
            <HiPlus className='w-3.5 h-3.5' />
            {uploading ? 'Uploading…' : t('common.add')}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />

      {!photos.length ? (
        <button
          type='button'
          onClick={() => !readOnly && inputRef.current?.click()}
          disabled={readOnly}
          className='w-full flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-slate-300 transition-colors disabled:hover:border-slate-200'
        >
          <HiPhotograph className='w-7 h-7 mb-1.5' />
          <span className='text-xs'>{readOnly ? 'No photos' : 'Add a photo'}</span>
        </button>
      ) : (
        <div className='grid grid-cols-3 sm:grid-cols-4 gap-2'>
          {photos.map((photo) => (
            <div key={photo._id} className='relative group aspect-square'>
              <button
                type='button'
                onClick={() => setLightbox(photo)}
                className='w-full h-full rounded-lg overflow-hidden bg-slate-100'
              >
                <img
                  src={normalizeImageUrl(photo.url)}
                  alt={photo.caption || 'Client photo'}
                  loading='lazy'
                  className='w-full h-full object-cover'
                />
              </button>

              {!readOnly && (
                <button
                  type='button'
                  onClick={() => setPendingDelete(photo._id)}
                  className='absolute top-1 right-1 p-1 rounded-md bg-white/90 text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity'
                  aria-label={t('clientPhotos.removePhoto')}
                >
                  <HiTrash className='w-3.5 h-3.5' />
                </button>
              )}

              {pendingDelete === photo._id && (
                // Inline rather than a modal: this sits inside a detail panel
                // and a second overlay on top reads as a stuck dialog.
                <div className='absolute inset-0 bg-rose-50/95 rounded-lg flex flex-col items-center justify-center gap-1.5 p-1'>
                  <span className='text-[10px] text-rose-700 text-center'>{t('clientPhotos.remove')}</span>
                  <div className='flex gap-1'>
                    <button
                      type='button'
                      onClick={() => setPendingDelete(null)}
                      className='px-1.5 py-0.5 text-[10px] bg-white border border-slate-200 rounded'
                    >{t('clientPhotos.no')}</button>
                    <button
                      type='button'
                      onClick={() => remove(photo._id)}
                      className='px-1.5 py-0.5 text-[10px] bg-rose-600 text-white rounded'
                    >{t('clientPhotos.yes')}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className='fixed inset-0 !mt-0 z-50 bg-slate-900/80 flex items-center justify-center p-6'
          onClick={() => setLightbox(null)}
          role='presentation'
        >
          <button
            type='button'
            onClick={() => setLightbox(null)}
            className='absolute top-4 right-4 p-2 text-white/80 hover:text-white'
            aria-label={t('common.close')}
          >
            <HiX className='w-6 h-6' />
          </button>
          <img
            src={normalizeImageUrl(lightbox.url)}
            alt={lightbox.caption || 'Client photo'}
            className='max-w-full max-h-full rounded-lg object-contain'
          />
        </div>
      )}
    </div>
  );
}

ClientPhotos.propTypes = {
  clientId: PropTypes.string.isRequired,
  photos: PropTypes.array,
  onChange: PropTypes.func,
  readOnly: PropTypes.bool,
};
