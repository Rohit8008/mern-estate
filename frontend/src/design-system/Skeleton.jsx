function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * A placeholder in the shape of what is loading.
 *
 * A spinner says "wait"; a skeleton says what is coming and where, so the page
 * does not jump when the data lands. Colours are theme tokens rather than
 * slate classes, so dark mode needs no entry in the override sheet.
 */
export default function Skeleton({ className }) {
  return (
    <div
      aria-hidden='true'
      className={cx('animate-pulse motion-reduce:animate-none rounded-md bg-secondary', className)}
    />
  );
}

/** A paragraph's worth of lines; the last one shorter, as text usually is. */
export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cx('space-y-2', className)} aria-hidden='true'>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx('h-3', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/**
 * Placeholder rows for inside a <Tbody>, so a loading table keeps its header
 * and column widths instead of collapsing to a spinner.
 */
export function SkeletonRows({ rows = 5, columns = 4 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden='true'>
      {Array.from({ length: columns }, (_, c) => (
        <td key={c} className='px-4 py-3'>
          {/* Varied widths so it reads as content, not as a striped bar. */}
          <Skeleton className={cx('h-3', c === 0 ? 'w-3/4' : (r + c) % 3 === 0 ? 'w-1/3' : 'w-1/2')} />
        </td>
      ))}
    </tr>
  ));
}

/** Matches KpiCard's footprint. */
export function SkeletonCard({ className }) {
  return (
    <div className={cx('bg-card border border-border rounded-xl p-5 shadow-sm', className)} aria-hidden='true'>
      <div className='flex items-center gap-3 mb-4'>
        <Skeleton className='w-9 h-9 rounded-xl' />
        <Skeleton className='h-3 w-24' />
      </div>
      <Skeleton className='h-6 w-20 mb-2' />
      <Skeleton className='h-3 w-32' />
    </div>
  );
}
