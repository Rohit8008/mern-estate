import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HiPlus, HiX } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Attach and detach workspace tags on one record.
 *
 * Colours are looked up as complete literal class strings. Tailwind scans
 * source as plain text, so `bg-${colour}-100` is never emitted and the chip
 * would render with no colour at all.
 */
const TAG_CLASSES = {
  slate:   'bg-slate-100 text-slate-700 ring-slate-200',
  red:     'bg-red-100 text-red-700 ring-red-200',
  amber:   'bg-amber-100 text-amber-700 ring-amber-200',
  emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  sky:     'bg-sky-100 text-sky-700 ring-sky-200',
  indigo:  'bg-indigo-100 text-indigo-700 ring-indigo-200',
  violet:  'bg-violet-100 text-violet-700 ring-violet-200',
  pink:    'bg-pink-100 text-pink-700 ring-pink-200',
  teal:    'bg-teal-100 text-teal-700 ring-teal-200',
};

export const tagClasses = (colour) => TAG_CLASSES[colour] || TAG_CLASSES.slate;

/** A read-only chip, for lists and cards. */
export function TagChip({ tag, onRemove }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ${tagClasses(tag.color)}`}>
      {tag.name}
      {onRemove && (
        <button
          type='button'
          onClick={() => onRemove(tag)}
          className='opacity-60 hover:opacity-100 transition-opacity'
          aria-label={`Remove ${tag.name}`}
        >
          <HiX className='w-3 h-3' />
        </button>
      )}
    </span>
  );
}

TagChip.propTypes = {
  tag: PropTypes.object.isRequired,
  onRemove: PropTypes.func,
};

export default function TagPicker({ kind, recordId, value = [], onChange, readOnly = false }) {
  const { t } = useTranslation();
  const { showError } = useNotification();

  const [all, setAll] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);

  // Memoised: the attach/detach callbacks depend on it, and a fresh array each
  // render would rebuild them every time.
  const attached = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const attachedIds = useMemo(
    () => new Set(attached.map((tag) => String(tag._id || tag))),
    [attached]
  );

  useEffect(() => {
    if (!open || all.length) return;
    apiClient
      .get('/tags')
      .then((res) => setAll(res?.data?.tags || []))
      .catch(() => showError('Could not load tags'));
  }, [open, all.length, showError]);

  // Close when clicking away, so the picker does not sit open over the page.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const attach = useCallback(async (tag) => {
    try {
      const res = await apiClient.post(`/tags/${kind}/${recordId}/${tag._id}`, {});
      onChange?.([...attached, res?.data || tag]);
    } catch (err) {
      showError(err?.message || 'Could not add the tag');
    }
  }, [kind, recordId, attached, onChange, showError]);

  const detach = useCallback(async (tag) => {
    try {
      await apiClient.delete(`/tags/${kind}/${recordId}/${tag._id}`);
      onChange?.(attached.filter((x) => String(x._id) !== String(tag._id)));
    } catch (err) {
      showError(err?.message || 'Could not remove the tag');
    }
  }, [kind, recordId, attached, onChange, showError]);

  /** Creating from the box returns the existing tag if the name is taken. */
  const createAndAttach = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const res = await apiClient.post('/tags', { name });
      const tag = res?.data;
      setAll((prev) => (prev.some((x) => x._id === tag._id) ? prev : [...prev, tag]));
      setQuery('');
      if (!attachedIds.has(String(tag._id))) await attach(tag);
    } catch (err) {
      showError(err?.message || 'Could not create the tag');
    }
  };

  const matches = all
    .filter((tag) => !attachedIds.has(String(tag._id)))
    .filter((tag) => !query.trim() || tag.name.toLowerCase().includes(query.trim().toLowerCase()));

  const exactExists = all.some((tag) => tag.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className='flex items-center gap-1.5 flex-wrap' ref={boxRef}>
      {attached.map((tag) => (
        <TagChip key={tag._id || tag} tag={tag} onRemove={readOnly ? undefined : detach} />
      ))}

      {!readOnly && (
        <div className='relative'>
          <button
            type='button'
            onClick={() => setOpen((o) => !o)}
            className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors'
          >
            <HiPlus className='w-3 h-3' />
            {t('tags.add')}
          </button>

          {open && (
            <div className='absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden'>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !exactExists) createAndAttach(); }}
                placeholder={t('tags.placeholder')}
                className='w-full px-3 py-2 text-sm border-b border-slate-100 focus:outline-none'
              />

              <div className='max-h-48 overflow-y-auto'>
                {matches.map((tag) => (
                  <button
                    key={tag._id}
                    type='button'
                    onClick={() => { attach(tag); setQuery(''); }}
                    className='flex items-center w-full px-3 py-2 hover:bg-slate-50 transition-colors text-left'
                  >
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ring-1 ${tagClasses(tag.color)}`}>
                      {tag.name}
                    </span>
                  </button>
                ))}

                {query.trim() && !exactExists && (
                  <button
                    type='button'
                    onClick={createAndAttach}
                    className='flex items-center gap-1.5 w-full px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors text-left'
                  >
                    <HiPlus className='w-3.5 h-3.5' />
                    Create &ldquo;{query.trim()}&rdquo;
                  </button>
                )}

                {!matches.length && !query.trim() && (
                  <p className='px-3 py-3 text-xs text-slate-400'>{t('tags.none')}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

TagPicker.propTypes = {
  kind: PropTypes.oneOf(['client', 'listing']).isRequired,
  recordId: PropTypes.string.isRequired,
  value: PropTypes.array,
  onChange: PropTypes.func,
  readOnly: PropTypes.bool,
};
