import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <main className='min-h-[70vh] flex items-center justify-center px-6'>
      <div className='relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='absolute inset-0 -z-10 bg-gradient-to-br from-indigo-50/60 via-white to-white' />
        <div className='p-10 text-center'>
          <div className='mx-auto mb-6 h-16 w-16 rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 flex items-center justify-center'>
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='h-9 w-9'>
              <path fillRule='evenodd' d='M2.25 12c0-5.385 4.365-9.75 9.75-9.75S21.75 6.615 21.75 12 17.385 21.75 12 21.75 2.25 17.385 2.25 12zm6-1.5A1.5 1.5 0 019.75 9h4.5a1.5 1.5 0 010 3h-4.5A1.5 1.5 0 018.25 10.5zM9 15a.75.75 0 000 1.5h6A.75.75 0 0015 15H9z' clipRule='evenodd' />
            </svg>
          </div>
          <h1 className='text-3xl font-bold text-slate-900 mb-2'>{t('notFound.pageNotFound')}</h1>
          <p className='text-slate-500 mb-6'>{t('notFound.thePageYouReLookingFor')}</p>
          <div className='flex flex-wrap items-center justify-center gap-3'>
            <Link to='/' className='px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1'>{t('notFound.goHome')}</Link>
            <Link to='/search' className='px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1'>{t('notFound.search')}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}


