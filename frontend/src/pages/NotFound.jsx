import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

export default function NotFound() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((s) => s.user);
  return (
    <main className='relative min-h-[80vh] flex items-center justify-center overflow-hidden px-6 py-16'>
      {/* Ambient brand glow */}
      <div aria-hidden className='pointer-events-none absolute inset-0 -z-10'>
        <div className='absolute left-1/2 top-[-6rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl dark:bg-brand-500/10' />
        <div className='absolute bottom-[-8rem] right-[-4rem] h-80 w-80 rounded-full bg-marigold-300/30 blur-3xl dark:bg-marigold-500/10' />
        <div
          className='absolute inset-0 opacity-[0.04] dark:opacity-[0.06]'
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
          }}
        />
      </div>

      <div className='w-full max-w-xl text-center'>
        {/* Oversized 404 with a house glyph nestled between the digits */}
        <div className='relative mb-8 flex items-center justify-center gap-1 select-none'>
          <span className='font-display text-[7rem] sm:text-[9rem] font-extrabold leading-none tracking-tighter bg-gradient-to-br from-brand-600 to-brand-900 bg-clip-text text-transparent dark:from-brand-300 dark:to-brand-500'>
            4
          </span>
          <span className='relative inline-flex h-[6rem] w-[6rem] sm:h-[8rem] sm:w-[8rem] items-center justify-center'>
            <span className='absolute inset-0 rounded-full bg-gradient-to-br from-brand-500 to-brand-800 shadow-xl shadow-brand-600/25 dark:shadow-brand-900/40' />
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='1.8'
              strokeLinecap='round'
              strokeLinejoin='round'
              className='relative h-11 w-11 sm:h-14 sm:w-14 text-white'
            >
              <path d='M3 10.5 12 3l9 7.5' />
              <path d='M5 9.5V21h14V9.5' />
              <path d='M9.5 21v-6h5v6' />
            </svg>
          </span>
          <span className='font-display text-[7rem] sm:text-[9rem] font-extrabold leading-none tracking-tighter bg-gradient-to-br from-brand-600 to-brand-900 bg-clip-text text-transparent dark:from-brand-300 dark:to-brand-500'>
            4
          </span>
        </div>

        <h1 className='font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-50 mb-3'>
          {t('notFound.pageNotFound')}
        </h1>
        <p className='mx-auto max-w-md text-base text-slate-500 dark:text-slate-400 mb-8'>
          {t('notFound.thePageYouReLookingFor')}
        </p>

        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Link
            to='/'
            className='inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold shadow-sm shadow-brand-600/20 hover:bg-brand-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'
          >
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4'>
              <path d='M3 10.5 12 3l9 7.5' />
              <path d='M5 9.5V21h14V9.5' />
            </svg>
            {t('notFound.goHome')}
          </Link>
          <Link
            to={currentUser ? '/search' : '/sign-in'}
            className='inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white/80 backdrop-blur text-slate-700 text-sm font-semibold hover:bg-white hover:border-slate-300 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-slate-600 dark:focus-visible:ring-offset-slate-900'
          >
            {currentUser ? (
              <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4'>
                <circle cx='11' cy='11' r='7' />
                <path d='m20 20-3.5-3.5' />
              </svg>
            ) : (
              <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4'>
                <path d='M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' />
                <path d='M10 17l5-5-5-5' />
                <path d='M15 12H3' />
              </svg>
            )}
            {currentUser ? t('notFound.search') : t('notFound.signIn')}
          </Link>
        </div>
      </div>
    </main>
  );
}
