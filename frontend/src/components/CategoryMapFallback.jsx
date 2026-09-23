import { useEffect, useState } from 'react';
import { apiClient } from '../utils/http';
import { useTranslation } from 'react-i18next';

/**
 * Shows the colony/category's default map when this listing hasn't uploaded its own
 * (a document tagged 'map'). Visible to all viewers, including buyers, since the point
 * is to let a buyer see the colony layout even when the specific plot has none.
 */
export default function CategoryMapFallback({ categorySlug, listingId }) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!categorySlug || !listingId) { setLoading(false); return; }
      try {
        // Best-effort: a missing or off-limits map just means no fallback
        // image, so none of these may raise an error toast.
        const ownMap = await apiClient.get(`/documents?kind=listing&listingId=${listingId}&tag=map&limit=1`, { silent: true });
        if (cancelled) return;
        if ((ownMap?.data || []).length > 0) { setLoading(false); return; }

        const category = await apiClient.get(`/category/by-slug/${categorySlug}`, { silent: true });
        if (cancelled || !category?._id) { setLoading(false); return; }

        const categoryMap = await apiClient.get(`/documents?kind=category&categoryId=${category._id}&tag=map&limit=1`, { silent: true });
        if (cancelled) return;
        setDoc((categoryMap?.data || [])[0] || null);
      } catch (_) {
        // silently skip — this is a best-effort fallback, not core listing data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [categorySlug, listingId]);

  if (loading || !doc) return null;

  const isImage = doc.mimeType?.startsWith('image/');

  return (
    <div className='bg-white rounded-xl shadow p-4'>
      <div className='flex items-center justify-between mb-3'>
        <h3 className='font-semibold text-slate-800'>{t('categoryMapFallback.colonyMap2')}</h3>
        <a
          href={doc.url}
          target='_blank'
          rel='noreferrer'
          className='text-xs font-medium text-indigo-600 hover:text-indigo-500'
        >{t('categoryMapFallback.viewFullSize')}</a>
      </div>
      {isImage ? (
        <a href={doc.url} target='_blank' rel='noreferrer'>
          <img src={doc.url} alt={t('categoryMapFallback.colonyMap')} className='w-full rounded-lg border border-slate-100' />
        </a>
      ) : (
        <a
          href={doc.url}
          target='_blank'
          rel='noreferrer'
          className='flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50'
        >
          📄 {doc.title}
        </a>
      )}
    </div>
  );
}
