function cx(...xs) { return xs.filter(Boolean).join(' '); }

export default function Spinner({ size = 'md', className }) {
  const s = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8', xl: 'w-12 h-12' }[size] || 'w-6 h-6';
  return (
    <svg
      className={cx('animate-spin text-slate-400', s, className)}
      fill='none' viewBox='0 0 24 24'
    >
      <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
      <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
    </svg>
  );
}

export function PageLoader({ message = 'Loading…' }) {
  return (
    <div className='flex flex-col items-center justify-center min-h-[30vh] gap-3'>
      <Spinner size='lg' />
      <p className='text-sm text-slate-400'>{message}</p>
    </div>
  );
}
