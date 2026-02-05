import { Link } from 'react-router-dom';
import { FaHome, FaUser, FaMapMarkerAlt, FaShieldAlt, FaHandshake, FaCog } from 'react-icons/fa';
import PropTypes from 'prop-types';

export default function MobileMenu({
  open,
  onClose,
  currentUser,
  isBuyerViewMode,
  isActive,
  unread,
}) {
  if (!open) return null;

  return (
    <div className='lg:hidden border-t border-gray-200 bg-white/95 backdrop-blur-md shadow-lg'>
      <div className='px-6 py-6 space-y-6'>
        <nav className='space-y-3'>
          <Link
            onClick={onClose}
            to='/'
            className={`${
              isActive('/')
                ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-300'
                : 'text-gray-700 hover:bg-gray-50'
            } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
          >
            <FaHome className='w-5 h-5' />
            Home
          </Link>
          <Link
            onClick={onClose}
            to='/search'
            className={`${
              isActive('/search')
                ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-300'
                : 'text-gray-700 hover:bg-gray-50'
            } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
          >
            <FaHome className='w-5 h-5' />
            Properties
          </Link>
          {(currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') &&
            !isBuyerViewMode && (
              <Link
                onClick={onClose}
                to='/create-listing'
                className={`${
                  isActive('/create-listing')
                    ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-700 border-green-300'
                    : 'text-gray-700 hover:bg-gray-50'
                } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
              >
                <FaHome className='w-5 h-5' />
                Add Property
              </Link>
            )}
          {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
            <Link
              onClick={onClose}
              to='/clients'
              className={`${
                isActive('/clients')
                  ? 'bg-gradient-to-r from-teal-50 to-teal-100 text-teal-700 border-teal-300'
                  : 'text-gray-700 hover:bg-gray-50'
              } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
            >
              <FaUser className='w-5 h-5' />
              Clients
            </Link>
          )}
          {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
            <Link
              onClick={onClose}
              to='/buyer-requirements'
              className={`${
                isActive('/buyer-requirements')
                  ? 'bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700 border-purple-300'
                  : 'text-gray-700 hover:bg-gray-50'
              } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
            >
              <FaUser className='w-5 h-5' />
              Buyers
            </Link>
          )}
          {currentUser && (
            <Link
              onClick={onClose}
              to='/categories'
              className={`${
                isActive('/categories')
                  ? 'bg-gradient-to-r from-orange-50 to-orange-100 text-orange-700 border-orange-300'
                  : 'text-gray-700 hover:bg-gray-50'
              } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
            >
              <FaMapMarkerAlt className='w-5 h-5' />
              Categories
            </Link>
          )}
          {currentUser && (
            <Link
              onClick={onClose}
              to='/messages'
              className={`${
                isActive('/messages')
                  ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border-blue-300'
                  : 'text-gray-700 hover:bg-gray-50'
              } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent relative`}
            >
              <FaHandshake className='w-5 h-5' />
              Messages
              {unread > 0 && (
                <span className='ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold animate-pulse'>
                  {unread}
                </span>
              )}
            </Link>
          )}
          {currentUser && (
            <Link
              onClick={onClose}
              to='/settings'
              className={`${
                isActive('/settings')
                  ? 'bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 border-slate-300'
                  : 'text-gray-700 hover:bg-gray-50'
              } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
            >
              <FaCog className='w-5 h-5' />
              Settings
            </Link>
          )}
          {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
            <Link
              onClick={onClose}
              to='/admin'
              className={`${
                isActive('/admin')
                  ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border-red-300'
                  : 'text-gray-700 hover:bg-gray-50'
              } flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-300 border border-transparent`}
            >
              <FaShieldAlt className='w-5 h-5' />
              {currentUser?.role === 'admin' ? 'Admin' : 'Employee'}
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}

MobileMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  currentUser: PropTypes.shape({
    role: PropTypes.string,
  }),
  isBuyerViewMode: PropTypes.bool.isRequired,
  isActive: PropTypes.func.isRequired,
  unread: PropTypes.number.isRequired,
};
