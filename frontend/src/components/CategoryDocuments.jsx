import { useEffect, useState, useRef } from 'react';
import { apiClient } from '../utils/http';
import { useTranslation } from 'react-i18next';

const MIME_ICONS = {
  'application/pdf': { icon: '📄', label: 'PDF', color: 'text-red-600 bg-red-50 border-red-200' },
  'image/jpeg': { icon: '🖼️', label: 'Image', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  'image/png': { icon: '🖼️', label: 'Image', color: 'text-purple-600 bg-purple-50 border-purple-200' },
};

function getMimeInfo(mimeType) {
  return MIME_ICONS[mimeType] || { icon: '📎', label: 'File', color: 'text-slate-600 bg-slate-50 border-slate-200' };
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Default colony/category map (JPEG/PDF) shared by every listing in this category,
 * stored via the existing polymorphic Document model (kind: 'category', tag: 'map').
 */
export default function CategoryDocuments({ categoryId, canEdit }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef(null);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await apiClient.get(`/documents?kind=category&categoryId=${categoryId}&tag=map&limit=10`);
      setDocs(res?.data || []);
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { if (categoryId) loadDocs(); }, [categoryId]);

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'category');
      form.append('categoryId', categoryId);
      form.append('title', file.name);
      form.append('tags', 'map');
      await apiClient.upload('/documents/upload', form);
      await loadDocs();
    } catch (_) {}
    finally { setUploading(false); }
  }

  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/documents/${confirmDeleteId}`);
      setDocs((prev) => prev.filter((d) => d._id !== confirmDeleteId));
      setConfirmDeleteId(null);
    } catch (_) {}
    finally { setDeleting(false); }
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-3'>
        <div>
          <h2 className='text-xl font-semibold text-gray-900'>{t('categoryDocuments.defaultColonyCategoryMap')}</h2>
          <p className='text-xs text-slate-500 mt-0.5'>{t('categoryDocuments.shownOnEveryListingInThis')}</p>
        </div>
        {canEdit && docs.length === 0 && (
          <>
            <input
              ref={fileInputRef}
              type='file'
              className='hidden'
              onChange={handleFileInput}
              accept='.pdf,.jpg,.jpeg,.png'
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className='px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50'
            >
              {uploading ? 'Uploading...' : 'Upload Map'}
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className='h-14 bg-slate-100 rounded-lg animate-pulse' />
      ) : docs.length === 0 ? (
        <p className='text-sm text-slate-400'>{t('categoryDocuments.noMapUploadedYet')}</p>
      ) : (
        <div className='space-y-2'>
          {docs.map((doc) => {
            const mime = getMimeInfo(doc.mimeType);
            const isConfirming = confirmDeleteId === doc._id;
            return (
              <div
                key={doc._id}
                className={`rounded-lg border overflow-hidden ${isConfirming ? 'border-rose-200 bg-rose-50' : 'border-slate-100'}`}
              >
                {isConfirming ? (
                  <div className='flex items-center gap-3 px-3 py-3'>
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium text-rose-800 truncate'>{doc.title}</p>
                      <p className='text-xs text-rose-500'>{t('categoryDocuments.deleteThisMapThisCannotBe')}</p>
                    </div>
                    <div className='flex items-center gap-2 shrink-0'>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deleting}
                        className='px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50'
                      >{t('categoryDocuments.cancel')}</button>
                      <button
                        onClick={handleConfirmDelete}
                        disabled={deleting}
                        className='px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50'
                      >
                        {deleting ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className='flex items-center gap-3 p-3'>
                    <div className={`w-10 h-10 rounded-lg border flex items-center justify-center text-lg shrink-0 ${mime.color}`}>
                      {mime.icon}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium text-slate-800 truncate'>{doc.title}</p>
                      <p className='text-xs text-slate-400 mt-0.5'>{mime.label} · {fmtSize(doc.size)}</p>
                    </div>
                    <div className='flex items-center gap-1'>
                      <a
                        href={doc.url}
                        target='_blank'
                        rel='noreferrer'
                        className='px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50'
                      >{t('categoryDocuments.view')}</a>
                      {canEdit && (
                        <button
                          onClick={() => setConfirmDeleteId(doc._id)}
                          className='px-3 py-1.5 text-xs font-medium text-rose-600 bg-white border border-slate-200 rounded-lg hover:bg-rose-50'
                        >{t('categoryDocuments.delete')}</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
