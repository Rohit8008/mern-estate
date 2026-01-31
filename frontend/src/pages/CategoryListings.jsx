import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import ListingItem from '../components/ListingItem';
import { parseJsonSafely } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';

export default function CategoryListings() {
  const { slug } = useParams();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchListings = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/listing/get?category=${encodeURIComponent(slug)}&limit=24`);
        const data = await parseJsonSafely(res);
        const items = data?.data?.listings || [];
        setListings(items);
        setLoading(false);
      } catch (e) {
        setError('Failed to load listings');
        setLoading(false);
      }
    };
    fetchListings();
  }, [slug]);

  return (
    <main className='min-h-screen bg-gray-50'>
      <div className='max-w-7xl mx-auto px-4 py-8'>
        {/* Header Section */}
        <div className='mb-8'>
          <div className='flex items-center justify-between mb-6'>
            <div>
              <h1 className='text-4xl font-bold text-gray-900 mb-2'>
                {slug?.charAt(0).toUpperCase() + slug?.slice(1)}
              </h1>
              <p className='text-lg text-gray-600'>
                Discover amazing properties in {slug?.charAt(0).toUpperCase() + slug?.slice(1)}
              </p>
            </div>
            {!isBuyerViewMode && (currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') && (
              <Link
                to={`/create-listing?category=${encodeURIComponent(slug)}`}
                className='px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl'
              >
                + Create Listing
              </Link>
            )}
          </div>
          
          {/* Stats */}
          <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-200'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-6'>
                <div className='text-center'>
                  <div className='text-2xl font-bold text-blue-600'>{listings.length}</div>
                  <div className='text-sm text-gray-600'>Properties</div>
                </div>
                <div className='w-px h-12 bg-gray-200'></div>
                <div className='text-center'>
                  <div className='text-2xl font-bold text-green-600'>
                    {listings.filter(l => l.type === 'sale').length}
                  </div>
                  <div className='text-sm text-gray-600'>For Sale</div>
                </div>
                <div className='text-center'>
                  <div className='text-2xl font-bold text-purple-600'>
                    {listings.filter(l => l.type === 'rent').length}
                  </div>
                  <div className='text-sm text-gray-600'>For Rent</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className='flex items-center justify-center py-12'>
            <div className='flex items-center gap-3'>
              <div className='w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
              <span className='text-gray-600'>Loading properties...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className='bg-red-50 border border-red-200 rounded-lg p-6 text-center'>
            <div className='text-red-600 font-medium mb-2'>Failed to load listings</div>
            <div className='text-red-500 text-sm'>{error}</div>
          </div>
        )}

        {/* Listings Grid */}
        {!loading && !error && (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
            {listings.map((l) => (
              <ListingItem key={l._id} listing={l} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && listings.length === 0 && (
          <div className='text-center py-16'>
            <div className='w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center'>
              <svg className='w-12 h-12 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' />
              </svg>
            </div>
            <h3 className='text-xl font-semibold text-gray-900 mb-2'>No properties found</h3>
            <p className='text-gray-600 mb-6'>
              There are no listings in the {slug} category yet.
            </p>
            {!isBuyerViewMode && (currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') && (
              <Link
                to={`/create-listing?category=${encodeURIComponent(slug)}`}
                className='inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors'
              >
                <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 6v6m0 0v6m0-6h6m-6 0H6' />
                </svg>
                Create First Listing
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}


