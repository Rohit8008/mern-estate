import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

export default function Unauthorized() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((s) => s.user);
  const isCrmUser = currentUser?.role === 'admin' || currentUser?.role === 'employee';

  return (
    <main className='min-h-[70vh] flex items-center justify-center px-6'>
      <div className='relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
        <div className='absolute inset-0 -z-10 bg-gradient-to-br from-rose-50/60 via-white to-white' />
        <div className='p-10 text-center'>
          <div className='mx-auto mb-6 h-16 w-16 rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 flex items-center justify-center'>
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='h-9 w-9'>
              <path fillRule='evenodd' d='M12 1.5a5.25 5.25 0 00-5.25 5.25v2.378c0 .37-.176.717-.474.94A5.985 5.985 0 004.5 15a6 6 0 0012 0c0-1.95-.94-3.68-2.376-4.932a1.157 1.157 0 01-.474-.94V6.75A5.25 5.25 0 0012 1.5zm.75 17.25a.75.75 0 11-1.5 0v-3a.75.75 0 111.5 0v3z' clipRule='evenodd' />
            </svg>
          </div>
          <h1 className='text-3xl font-bold text-slate-900 mb-2'>{t('unauthorized.accessDenied')}</h1>
          <p className='text-slate-500 mb-1'>You don&apos;t have permission to view this page.</p>
          {isCrmUser && (
            <p className='text-sm text-slate-400 mb-6'>{t('unauthorized.contactYourAdminToRequestAccess')}</p>
          )}
          <div className='flex flex-wrap items-center justify-center gap-3 mt-6'>
            {isCrmUser ? (
              <>
                <Link to='/tasks' className='px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1'>{t('unauthorized.goToTasks')}</Link>
                <Link to='/profile' className='px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1'>{t('unauthorized.myProfile')}</Link>
              </>
            ) : (
              <>
                <Link to='/' className='px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1'>{t('unauthorized.goHome')}</Link>
                <Link to='/sign-in' className='px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1'>{t('unauthorized.signIn')}</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
