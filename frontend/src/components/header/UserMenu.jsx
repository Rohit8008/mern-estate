import { Link } from 'react-router-dom';
import { FaUser, FaHandshake, FaCog, FaShieldAlt } from 'react-icons/fa';
import PropTypes from 'prop-types';

export default function UserMenu({
  currentUser,
  unread,
  showUserMenu,
  setShowUserMenu,
  isBuyerViewMode,
  toggleBuyerViewMode,
  onSignOut,
}) {
  if (!currentUser) {
    return (
      <Link
        to='/sign-in'
        className='flex items-center space-x-3 group hover:bg-gray-50 rounded-xl p-2 transition-all duration-300'
      >
        <div className='w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center shadow-lg'>
          <span className='text-gray-600 text-sm font-bold'>?</span>
        </div>
        <span className='text-gray-700 hover:text-gray-900 transition-colors font-semibold hidden sm:inline'>
          Sign In
        </span>
      </Link>
    );
  }

  return (
    <div className='relative user-menu'>
      <button
        onClick={() => setShowUserMenu(!showUserMenu)}
        className='flex items-center space-x-2 hover:bg-gray-50 rounded-lg p-2 transition-colors'
      >
        <img
          className='w-8 h-8 rounded-full object-cover'
          src={
            currentUser.avatar ||
            'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'
          }
          alt='profile'
        />
        <span className='hidden sm:block text-sm font-medium text-gray-700'>{currentUser.username}</span>
      </button>

      {showUserMenu && (
        <div className='absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-200 py-2 z-50'>
          <div className='px-4 py-3 border-b border-gray-100'>
            <div className='flex items-center space-x-3'>
              <img
                className='w-10 h-10 rounded-full object-cover border-2 border-gray-200'
                src={
                  currentUser.avatar ||
                  'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'
                }
                alt='profile'
              />
              <div>
                <div className='font-semibold text-gray-900'>{currentUser.username}</div>
                <div className='text-sm text-gray-500'>{currentUser.email}</div>
              </div>
            </div>
          </div>
          <div className='py-2'>
            <Link
              to='/profile'
              onClick={() => setShowUserMenu(false)}
              className='flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors'
            >
              <FaUser className='w-4 h-4' />
              <span>Profile</span>
            </Link>
            <Link
              to='/messages'
              onClick={() => setShowUserMenu(false)}
              className='flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors'
            >
              <FaHandshake className='w-4 h-4' />
              <span>Messages</span>
              {unread > 0 && (
                <span className='ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold'>
                  {unread}
                </span>
              )}
            </Link>
            <Link
              to='/settings'
              onClick={() => setShowUserMenu(false)}
              className='flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors'
            >
              <FaCog className='w-4 h-4' />
              <span>Settings</span>
            </Link>
            {(currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') && (
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  toggleBuyerViewMode();
                }}
                className={`flex items-center space-x-3 px-4 py-3 transition-colors w-full text-left ${
                  isBuyerViewMode ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                  />
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                  />
                </svg>
                <span>{isBuyerViewMode ? 'Exit Buyer View' : 'View as Buyer'}</span>
              </button>
            )}

            <div className='border-t border-gray-100 my-2'></div>
            <button
              onClick={() => {
                setShowUserMenu(false);
                onSignOut();
              }}
              className='flex items-center space-x-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors w-full text-left'
            >
              <FaShieldAlt className='w-4 h-4' />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

UserMenu.propTypes = {
  currentUser: PropTypes.shape({
    avatar: PropTypes.string,
    username: PropTypes.string,
    email: PropTypes.string,
    role: PropTypes.string,
  }),
  unread: PropTypes.number.isRequired,
  showUserMenu: PropTypes.bool.isRequired,
  setShowUserMenu: PropTypes.func.isRequired,
  isBuyerViewMode: PropTypes.bool.isRequired,
  toggleBuyerViewMode: PropTypes.func.isRequired,
  onSignOut: PropTypes.func.isRequired,
};
