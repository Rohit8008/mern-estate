import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className='min-h-[70vh] flex items-center justify-center px-6'>
      <div className='relative w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow'>
        <div className='absolute inset-0 -z-10 bg-gradient-to-br from-sky-50 via-fuchsia-50 to-amber-50' />
        <div className='p-10 text-center'>
          <div className='mx-auto mb-6 h-16 w-16 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center'>
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='h-9 w-9'>
              <path fillRule='evenodd' d='M2.25 12c0-5.385 4.365-9.75 9.75-9.75S21.75 6.615 21.75 12 17.385 21.75 12 21.75 2.25 17.385 2.25 12zm6-1.5A1.5 1.5 0 019.75 9h4.5a1.5 1.5 0 010 3h-4.5A1.5 1.5 0 018.25 10.5zM9 15a.75.75 0 000 1.5h6A.75.75 0 0015 15H9z' clipRule='evenodd' />
            </svg>
          </div>
          <h1 className='text-3xl font-bold text-slate-800 mb-2'>Page not found</h1>
          <p className='text-slate-600 mb-6'>The page you’re looking for doesn’t exist or has moved.</p>
          <div className='flex flex-wrap items-center justify-center gap-3'>
            <Link to='/' className='px-4 py-2 rounded-lg bg-slate-800 text-white hover:opacity-95'>Go Home</Link>
            <Link to='/search' className='px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50'>Search</Link>
          </div>
        </div>
      </div>
    </main>
  );
}


