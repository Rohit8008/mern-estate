import { useTranslation } from 'react-i18next';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import { pageRange } from './pageRange';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const btn = 'inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Pages are 1-based. `total` is the size of the whole filtered set — take it
 * from the server (a facets/count endpoint), never from the page in hand.
 */
export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizes = [10, 20, 50, 100], className }) {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label={t('ds.pagination')}
      className={cx('flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-3 text-sm', className)}
    >
      <div className='flex items-center gap-3 text-muted-foreground'>
        <span className='tabular-nums'>{t('ds.showingRange', { from, to, total })}</span>
        {onPageSizeChange && (
          <label className='flex items-center gap-2'>
            <span className='sr-only sm:not-sr-only'>{t('ds.perPage')}</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className='h-8 rounded-lg border border-border bg-card text-foreground px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
            >
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className='flex items-center gap-1'>
        <button
          type='button'
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label={t('common.previous')}
          className={cx(btn, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
        >
          <HiChevronLeft className='w-4 h-4' aria-hidden='true' />
        </button>
        {pageRange(page, pageCount).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className='px-1 text-muted-foreground' aria-hidden='true'>…</span>
          ) : (
            <button
              key={n}
              type='button'
              onClick={() => onPageChange(n)}
              aria-current={n === page ? 'page' : undefined}
              aria-label={t('ds.pageN', { n })}
              className={cx(
                btn, 'tabular-nums',
                n === page ? 'bg-slate-900 text-white dark:bg-brand-600' : 'text-foreground/80 hover:bg-accent'
              )}
            >
              {n}
            </button>
          )
        )}
        <button
          type='button'
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label={t('common.next')}
          className={cx(btn, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
        >
          <HiChevronRight className='w-4 h-4' aria-hidden='true' />
        </button>
      </div>
    </nav>
  );
}
