import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';

export default function DesktopNav({ currentUser, isBuyerViewMode, isActive }) {
  return (
    <nav className='hidden lg:flex items-center space-x-1'>
      {currentUser && (
        <Link
          to='/search'
          className={`${
            isActive('/search')
              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          } px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
        >
          Properties
        </Link>
      )}
      {(currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') &&
        !isBuyerViewMode && (
          <Link
            to='/create-listing'
            className={`${
              isActive('/create-listing')
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border border-green-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            } px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
          >
            Add Property
          </Link>
        )}
      {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
        <Link
          to='/clients'
          className={`${
            isActive('/clients')
              ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-emerald-700 border border-emerald-200'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          } px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
        >
          Clients
        </Link>
      )}
      {(currentUser?.role === 'admin' || currentUser?.role === 'employee') && !isBuyerViewMode && (
        <Link
          to='/buyer-requirements'
          className={`${
            isActive('/buyer-requirements')
              ? 'bg-gradient-to-r from-purple-50 to-violet-50 text-purple-700 border border-purple-200'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          } px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
        >
          Buyers
        </Link>
      )}
      {currentUser && (
        <Link
          to='/categories'
          className={`${
            isActive('/categories')
              ? 'bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700 border border-orange-200'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          } px-4 py-2 rounded-xl font-semibold transition-all duration-200 hover:shadow-md`}
        >
          Categories
        </Link>
      )}
    </nav>
  );
}

DesktopNav.propTypes = {
  currentUser: PropTypes.shape({
    role: PropTypes.string,
  }),
  isBuyerViewMode: PropTypes.bool.isRequired,
  isActive: PropTypes.func.isRequired,
};
