import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBadgeCheck,
  HiOutlineDocumentText,
  HiOutlineDownload,
  HiOutlineExclamation,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineMap,
  HiOutlinePhotograph,
  HiOutlineTrash,
  HiOutlineUpload,
} from 'react-icons/hi';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { Button, Badge, Select, Input, Spinner, EmptyState } from '../design-system';
import { formatDate } from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * A colony's paperwork and photographs.
 *
 * Buyers ask for these by name — "is it RERA registered?", "can I see the
 * layout?" — so each file carries a type rather than sitting in an untyped pile
 * under a `map` tag, which is what this replaces.
 *
 * Publishing is deliberate. Nothing here reaches the public page unless an
 * admin ticks the box: an approval letter naming individuals, or a brochure
 * with last season's pricing, should not become public because a default said
 * so. The upload form suggests a sensible value per type and stops there.
 */

const TYPE_ICON = {
  rera: HiOutlineBadgeCheck,
  layout: HiOutlineMap,
  approval: HiOutlineDocumentText,
  brochure: HiOutlineDocumentText,
  image: HiOutlinePhotograph,
  other: HiOutlineDocumentText,
};

const MAX_BYTES = 10 * 1024 * 1024;

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

function prettySize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isImage = (doc) => String(doc.mimeType || '').startsWith('image/');

export default function CategoryMedia({ categoryId, canEdit, isAdmin }) {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [docType, setDocType] = useState('image');
  const [title, setTitle] = useState('');
  const [makePublic, setMakePublic] = useState(false);
  const inputRef = useRef(null);

  const selectedType = useMemo(() => types.find((t) => t.id === docType) || null, [types, docType]);

  // The form pre-ticks what the type suggests; it never decides for the admin.
  useEffect(() => {
    if (selectedType) setMakePublic(Boolean(selectedType.suggestPublic) && isAdmin);
  }, [selectedType, isAdmin]);

  const load = useCallback(async () => {
    if (!categoryId) return;
    setLoading(true);
    try {
      const [typeRes, docRes] = await Promise.all([
        apiClient.get('/documents/category-types', { silent: true }),
        apiClient.get(`/documents?kind=category&categoryId=${categoryId}&limit=100`, { silent: true }),
      ]);
      setTypes(typeRes?.data || []);
      setDocs(docRes?.data || []);
    } catch (err) {
      showError(err?.message || 'Could not load this colony\'s files.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      showError(`"${file.name}" is over 10 MB. Compress it and try again.`);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'category');
      form.append('categoryId', categoryId);
      form.append('docType', docType);
      form.append('title', title.trim() || file.name);
      if (makePublic) form.append('isPublic', 'true');

      await apiClient.upload('/documents/upload', form);
      setTitle('');
      await load();
      showSuccess(makePublic ? 'Uploaded and published.' : 'Uploaded.');
    } catch (err) {
      showError(err?.message || 'That file could not be uploaded.');
    } finally {
      setUploading(false);
    }
  }

  async function remove(id) {
    try {
      await apiClient.delete(`/documents/${id}`);
      setDocs((prev) => prev.filter((d) => d._id !== id));
      setConfirmDeleteId(null);
      showSuccess('Removed.');
    } catch (err) {
      showError(err?.message || 'Could not remove that file.');
    }
  }

  const images = docs.filter(isImage);
  const files = docs.filter((d) => !isImage(d));
  const labelFor = (id) => types.find((t) => t.id === id)?.label || id;

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_1fr] gap-3">
            <Select label={t('categoryMedia.whatIsIt')} value={docType} onChange={(e) => setDocType(e.target.value)}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </Select>
            <Input
              label={t('categoryMedia.title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedType?.label || 'Optional — the filename is used otherwise'}
              hint={selectedType?.description}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <label
              className={cx(
                'flex items-center gap-2 text-sm',
                isAdmin ? 'text-slate-700 cursor-pointer' : 'text-slate-400 cursor-not-allowed'
              )}
              title={isAdmin ? undefined : 'Only an admin can publish to the public page'}
            >
              <input
                type="checkbox"
                checked={makePublic}
                disabled={!isAdmin}
                onChange={(e) => setMakePublic(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />{t('categoryMedia.showOnThePublicColonyPage')}</label>

            <Button
              type="button"
              icon={HiOutlineUpload}
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >{t('categoryMedia.chooseAFile')}</Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={
                selectedType?.accepts === 'image'
                  ? 'image/*'
                  : selectedType?.accepts === 'document'
                    ? '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
                    : undefined
              }
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {makePublic && (
            <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              <HiOutlineExclamation className="w-4 h-4 flex-shrink-0 mt-0.5" />{t('categoryMedia.anyoneWhoVisitsTheColonyPage')}</p>
          )}
        </div>
      )}

      {/* ── Photographs ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900">{t('categoryMedia.photographs')}</h3>
          <span className="text-xs text-slate-400">{images.length}</span>
        </div>

        {images.length === 0 ? (
          <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl px-4 py-6 text-center">{t('categoryMedia.noPhotosOfThisColonyYet')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((doc) => (
              <figure
                key={doc._id}
                className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3]"
              >
                <img
                  src={normalizeImageUrl(doc.url)}
                  alt={doc.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 flex gap-1">
                  {doc.isPublic && (
                    <Badge variant="success" size="xs">{t('categoryMedia.public')}</Badge>
                  )}
                </div>
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                  <span className="text-[11px] text-white truncate block">{doc.title}</span>
                </figcaption>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => (confirmDeleteId === doc._id ? remove(doc._id) : setConfirmDeleteId(doc._id))}
                    className={cx(
                      'absolute top-2 right-2 p-1.5 rounded-lg transition-opacity',
                      confirmDeleteId === doc._id
                        ? 'bg-rose-600 text-white opacity-100'
                        : 'bg-white/90 text-rose-600 opacity-0 group-hover:opacity-100 focus:opacity-100'
                    )}
                    title={confirmDeleteId === doc._id ? 'Click again to remove' : 'Remove'}
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                )}
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* ── Paperwork ────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900">{t('categoryMedia.documents')}</h3>
          <span className="text-xs text-slate-400">{files.length}</span>
        </div>

        {files.length === 0 ? (
          <div className="py-6">
            <EmptyState
              icon={HiOutlineDocumentText}
              title={t('categoryMedia.noDocumentsYet')}
              body={t('categoryMedia.addTheReraCertificateTheLayout')}
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {files.map((doc) => {
              const Icon = TYPE_ICON[doc.docType] || HiOutlineDocumentText;
              return (
                <li key={doc._id} className="flex items-center gap-3 px-4 py-3 bg-white">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 ring-1 ring-slate-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-slate-500" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900 truncate">{doc.title}</span>
                      <Badge variant="slate" size="xs">{labelFor(doc.docType)}</Badge>
                      {doc.isPublic ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                          <HiOutlineEye className="w-3 h-3" />{t('categoryMedia.public')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          <HiOutlineEyeOff className="w-3 h-3" />{t('categoryMedia.internal')}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {prettySize(doc.size)} · {formatDate(doc.createdAt)}
                    </div>
                  </div>

                  <a
                    href={normalizeImageUrl(doc.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title={t('categoryMedia.open')}
                  >
                    <HiOutlineDownload className="w-4 h-4" />
                  </a>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => (confirmDeleteId === doc._id ? remove(doc._id) : setConfirmDeleteId(doc._id))}
                      className={cx(
                        'p-1.5 rounded-lg transition-colors',
                        confirmDeleteId === doc._id
                          ? 'bg-rose-600 text-white'
                          : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                      )}
                      title={confirmDeleteId === doc._id ? 'Click again to remove' : 'Remove'}
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
