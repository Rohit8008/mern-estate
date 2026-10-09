import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { HiOutlineOfficeBuilding, HiPlus } from 'react-icons/hi';
import ListingItem from '../components/ListingItem';
import { apiClient } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useTranslation } from 'react-i18next';
import { EmptyState, Button, PageLoader } from '../design-system';

export default function CategoryListings() {
  const { t } = useTranslation();
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
        const data = await apiClient.get(`/listing/get?category=${encodeURIComponent(slug)}&limit=24`);
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
    <main>
      <div>
        {/* Header Section */}
        <div className='mb-8'>
          <div className='flex items-center justify-between mb-6'>
            <div>
              <h1 className='text-4xl font-bold text-slate-900 mb-2'>
                {slug?.charAt(0).toUpperCase() + slug?.slice(1)}
              </h1>
              <p className='text-lg text-slate-600'>
                Discover amazing properties in {slug?.charAt(0).toUpperCase() + slug?.slice(1)}
              </p>
            </div>
            {!isBuyerViewMode && (currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') && (
              <Link
                to={`/create-listing?category=${encodeURIComponent(slug)}`}
                className='px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl'
              >{t('categoryListings.createListing')}</Link>
            )}
          </div>
          
          {/* Stats */}
          <div className='bg-white rounded-xl p-6 shadow-sm border border-slate-200'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-6'>
                <div className='text-center'>
                  <div className='text-2xl font-bold text-indigo-600'>{listings.length}</div>
                  <div className='text-sm text-slate-600'>{t('categoryListings.properties')}</div>
                </div>
                <div className='w-px h-12 bg-gray-200'></div>
                <div className='text-center'>
                  <div className='text-2xl font-bold text-green-600'>
                    {listings.filter(l => l.type === 'sale').length}
                  </div>
                  <div className='text-sm text-slate-600'>{t('categoryListings.forSale')}</div>
                </div>
                <div className='text-center'>
                  <div className='text-2xl font-bold text-purple-600'>
                    {listings.filter(l => l.type === 'rent').length}
                  </div>
                  <div className='text-sm text-slate-600'>{t('categoryListings.forRent')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && <PageLoader message={t('categoryListings.loadingProperties')} />}

        {/* Error State */}
        {error && (
          <div className='bg-red-50 border border-red-200 rounded-lg p-6 text-center'>
            <div className='text-red-600 font-medium mb-2'>{t('categoryListings.failedToLoadListings')}</div>
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
          <EmptyState
            icon={HiOutlineOfficeBuilding}
            title={t('categoryListings.noPropertiesFound')}
            body={`There are no listings in the ${slug} category yet.`}
            action={
              !isBuyerViewMode && (currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') && (
                <Button as={Link} to={`/create-listing?category=${encodeURIComponent(slug)}`} icon={HiPlus}>
                  {t('categoryListings.createFirstListing')}
                </Button>
              )
            }
          />
        )}
      </div>
    </main>
  );
}


