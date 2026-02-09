import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

export default function MinimalHeader() {
  const location = useLocation();
  const { currentUser } = useSelector((state) => state.user);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className='bg-white/95 backdrop-blur-md border-b border-slate-200 fixed top-0 left-0 right-0 z-40'>
      <div className='max-w-6xl mx-auto px-4'>
        <div className='h-14 flex items-center justify-between'>
          <Link to='/' className='flex items-center gap-2'>
            <div className='w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 shadow-sm flex items-center justify-center'>
              <span className='text-white font-bold'>R</span>
            </div>
            <div className='font-bold text-slate-900'>RealVista</div>
          </Link>

          <nav className='hidden md:flex items-center gap-2'>
            <Link
              to='/search'
              className={`${isActive('/search') ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'} px-3 py-2 rounded-xl text-sm font-semibold`}
            >
              Search
            </Link>
            {currentUser && (
              <Link
                to='/dashboard'
                className={`${isActive('/dashboard') ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'} px-3 py-2 rounded-xl text-sm font-semibold`}
              >
                CRM
              </Link>
            )}
            {currentUser ? (
              <Link
                to='/profile'
                className={`${isActive('/profile') ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'} px-3 py-2 rounded-xl text-sm font-semibold`}
              >
                Profile
              </Link>
            ) : (
              <Link
                to='/sign-in'
                className='px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800'
              >
                Sign in
              </Link>
            )}
          </nav>

          <div className='md:hidden'>
            {currentUser ? (
              <Link to='/dashboard' className='px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold'>
                CRM
              </Link>
            ) : (
              <Link to='/sign-in' className='px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold'>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
