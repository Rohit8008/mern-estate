import { useEffect, useState, useRef } from 'react';
import { apiClient } from '../utils/http';

const MIME_ICONS = {
  'application/pdf': { icon: '📄', label: 'PDF', color: 'text-red-600 bg-red-50 border-red-200' },
  'image/jpeg': { icon: '🖼️', label: 'Image', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  'image/png': { icon: '🖼️', label: 'Image', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  'image/webp': { icon: '🖼️', label: 'Image', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  'application/msword': { icon: '📝', label: 'Word', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: '📝', label: 'Word', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  'application/vnd.ms-excel': { icon: '📊', label: 'Excel', color: 'text-green-600 bg-green-50 border-green-200' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: '📊', label: 'Excel', color: 'text-green-600 bg-green-50 border-green-200' },
  'application/zip': { icon: '🗜️', label: 'ZIP', color: 'text-amber-600 bg-amber-50 border-amber-200' },
};

function getMimeInfo(mimeType) {
  return MIME_ICONS[mimeType] || { icon: '📎', label: 'File', color: 'text-slate-600 bg-slate-50 border-slate-200' };
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PropertyDocuments({ listingId, canEdit }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef(null);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await apiClient.get(`/documents?kind=listing&listingId=${listingId}&limit=50`);
      setDocs(res?.data || []);
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadDocs(); }, [listingId]);

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'listing');
      form.append('listingId', listingId);
      form.append('title', file.name);
      await apiClient.upload('/documents/upload', form);
      await loadDocs();
    } catch (_) {}
    finally { setUploading(false); }
  }

  function handleFileInput(e) {
    const files = Array.from(e.target.files || []);
    files.forEach(uploadFile);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files || []).forEach(uploadFile);
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/documents/${confirmDeleteId}`);
      setDocs(prev => prev.filter(d => d._id !== confirmDeleteId));
      setConfirmDeleteId(null);
    } catch (_) {}
    finally { setDeleting(false); }
  }

  return (
    <div className='bg-white rounded-xl shadow p-4 sm:p-6 mt-4'>
      {/* Header */}
      <div className='flex items-center justify-between mb-4'>
        <div>
          <h2 className='font-semibold text-lg text-slate-800'>Property Documents</h2>
          <p className='text-xs text-slate-500 mt-0.5'>Sale deeds, agreements, NOCs, site plans and more</p>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={loadDocs}
            className='p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            title='Refresh'
          >
            <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
            </svg>
          </button>
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type='file'
                multiple
                className='hidden'
                onChange={handleFileInput}
                accept='.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip'
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className='px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center gap-1.5'
              >
                <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
                </svg>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Drop zone */}
      {canEdit && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4 ${
            dragOver ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <svg className='w-8 h-8 text-slate-300 mx-auto mb-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' />
          </svg>
          <p className='text-sm text-slate-500'>
            {uploading
              ? <span className='font-medium text-slate-700'>Uploading...</span>
              : <><span className='font-medium text-slate-700'>Drop files here</span> or click to browse</>
            }
          </p>
          <p className='text-xs text-slate-400 mt-1'>PDF, Word, Excel, Images up to 10 MB</p>
        </div>
      )}

      {/* Documents list */}
      {loading ? (
        <div className='space-y-2'>
          {[1, 2, 3].map(i => (
            <div key={i} className='h-14 bg-slate-100 rounded-lg animate-pulse' />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className='text-center py-8'>
          <svg className='w-10 h-10 text-slate-200 mx-auto mb-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
          </svg>
          <p className='text-sm text-slate-400'>No documents uploaded yet</p>
        </div>
      ) : (
        <div className='space-y-2'>
          {docs.map((doc) => {
            const mime = getMimeInfo(doc.mimeType);
            const isConfirming = confirmDeleteId === doc._id;

            return (
              <div
                key={doc._id}
                className={`rounded-lg border transition-all overflow-hidden ${
                  isConfirming
                    ? 'border-rose-200 bg-rose-50'
                    : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50 group'
                }`}
              >
                {isConfirming ? (
                  /* ── Inline delete confirmation ── */
                  <div className='flex items-center gap-3 px-3 py-3'>
                    <div className='w-8 h-8 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0'>
                      <svg className='w-4 h-4 text-rose-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                      </svg>
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium text-rose-800 truncate'>{doc.title}</p>
                      <p className='text-xs text-rose-500'>Delete this document? This cannot be undone.</p>
                    </div>
                    <div className='flex items-center gap-2 shrink-0'>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deleting}
                        className='px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50'
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmDelete}
                        disabled={deleting}
                        className='px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1'
                      >
                        {deleting ? (
                          <>
                            <svg className='w-3 h-3 animate-spin' fill='none' viewBox='0 0 24 24'>
                              <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
                              <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v8z' />
                            </svg>
                            Deleting…
                          </>
                        ) : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal row ── */
                  <div className='flex items-center gap-3 p-3'>
                    <div className={`w-10 h-10 rounded-lg border flex items-center justify-center text-lg shrink-0 ${mime.color}`}>
                      {mime.icon}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium text-slate-800 truncate'>{doc.title}</p>
                      <p className='text-xs text-slate-400 mt-0.5'>
                        {mime.label} · {fmtSize(doc.size)} · {fmtDate(doc.createdAt)}
                      </p>
                    </div>
                    <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                      <a
                        href={doc.url}
                        target='_blank'
                        rel='noreferrer'
                        className='p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors'
                        title='Download / View'
                      >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' />
                        </svg>
                      </a>
                      {canEdit && (
                        <button
                          onClick={() => setConfirmDeleteId(doc._id)}
                          className='p-1.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors'
                          title='Delete'
                        >
                          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
                          </svg>
                        </button>
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
