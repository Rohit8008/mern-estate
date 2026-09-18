import { Link } from 'react-router-dom';
import { MdBed, MdBathroom, MdSquareFoot } from 'react-icons/md';
import { HiOutlinePhotograph } from 'react-icons/hi';
import { useSelector } from 'react-redux';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { Badge } from '../design-system';
import { cn } from '../utils/cn';
import { normalizeImageUrl } from '../utils/http';
import { formatDate, formatListingPrice, isPlaceholderPrice } from '../utils/currency';
import { useTranslation } from 'react-i18next';

export default function ListingItem({ listing, layout = 'grid' }) {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  // Check if user is a buyer (no role or role is 'buyer') or in buyer view mode
  const isBuyer = !currentUser?.role || currentUser?.role === 'buyer' || isBuyerViewMode;

  return (
    <div
      className={cn(
        'bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden group w-full border border-slate-200 hover:border-slate-300',
        layout === 'list' && 'md:flex'
      )}
    >
      <Link to={`/listing/${listing._id}`} className={cn('block', layout === 'list' && 'md:flex md:w-full')}>
        {/* Image Container */}
        <div className={cn('relative overflow-hidden bg-slate-100', layout === 'list' ? 'md:w-80 md:flex-shrink-0' : '')}>
          {listing.imageUrls?.[0] ? (
            <img
              src={normalizeImageUrl(listing.imageUrls[0])}
              alt={listing.name}
              className={cn(
                'w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]',
                layout === 'list' ? 'h-56 md:h-full' : 'h-56'
              )}
              onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
            />
          ) : null}
          <div
            className={cn(
              'items-center justify-center bg-slate-100 text-slate-300',
              listing.imageUrls?.[0] ? 'hidden' : 'flex',
              layout === 'list' ? 'h-56 md:h-full' : 'h-56'
            )}
          >
            <HiOutlinePhotograph className='w-10 h-10' />
          </div>

          {/* Gradient Overlay */}
          <div className='absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>

          {/* Status Badges */}
          <div className='absolute top-4 left-4 flex flex-col gap-2'>
            {listing.offer && <Badge variant='error' className='shadow-sm'>{t('listingItem.offer')}</Badge>}
            {listing.type === 'rent' && <Badge variant='info' className='shadow-sm'>{t('listingItem.rent')}</Badge>}
            {listing.type === 'sale' && <Badge variant='success' className='shadow-sm'>{t('listingItem.sale')}</Badge>}
          </div>
        </div>

        {/* Content */}
        <div className={cn('p-6', layout === 'list' ? 'md:flex-1' : '')}>
          {/* Price - Hidden for buyers */}
          {!isBuyer && (
            <div className='mb-4'>
              <div className={cn('text-3xl font-bold text-slate-900 mb-1', isPlaceholderPrice(listing.regularPrice) && 'text-xl text-slate-500')}>
                {formatListingPrice(listing.offer && listing.discountPrice ? listing.discountPrice : listing.regularPrice)}
                {listing.type === 'rent' && !isPlaceholderPrice(listing.regularPrice) && (
                  <span className='text-lg font-normal text-slate-500'> / month</span>
                )}
              </div>
              {listing.offer && listing.discountPrice > 0 && (
                <div className='text-sm text-slate-400 line-through'>
                  {formatListingPrice(listing.regularPrice)}
                </div>
              )}
            </div>
          )}

          {/* Show "Contact for Price" for buyers */}
          {isBuyer && (
            <div className='mb-4'>
              <div className='flex items-center gap-2 text-base font-bold text-indigo-700 mb-1'>
                <svg className='w-4 h-4 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
                </svg>{t('listingItem.contactForPrice')}</div>
              <div className='text-xs text-slate-400'>{t('listingItem.enquireToKnowPricingDetails')}</div>
            </div>
          )}

          {/* Property Details */}
          <div className='flex items-center gap-4 mb-4 text-sm text-slate-600'>
            {listing.propertyCategory === 'land' ? (
              listing.sqYard > 0 && (
                <div className='flex items-center gap-1'>
                  <MdSquareFoot className='w-4 h-4 text-slate-400' aria-hidden='true' />
                  <span>{listing.sqYard} sq yards</span>
                </div>
              )
            ) : (
              <>
                <div className='flex items-center gap-1'>
                  <MdBed className='w-4 h-4 text-slate-400' aria-hidden='true' />
                  <span>{listing.bedrooms} {listing.bedrooms === 1 ? 'bed' : 'beds'}</span>
                </div>
                <div className='flex items-center gap-1'>
                  <MdBathroom className='w-4 h-4 text-slate-400' aria-hidden='true' />
                  <span>{listing.bathrooms} {listing.bathrooms === 1 ? 'bath' : 'baths'}</span>
                </div>
                {listing.areaSqFt > 0 && (
                  <div className='flex items-center gap-1'>
                    <MdSquareFoot className='w-4 h-4 text-slate-400' aria-hidden='true' />
                    <span>{listing.areaSqFt} sqft</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Address */}
          <div className='mb-3'>
            <p className='text-sm text-slate-600 line-clamp-1'>
              {listing.address}
            </p>
          </div>

          {/* Description */}
          <p className='text-sm text-slate-400 line-clamp-2 mb-4'>
            {listing.description}
          </p>

          {/* Footer */}
          <div className='flex items-center justify-between pt-3 border-t border-slate-100'>
            <span className='text-xs font-medium text-indigo-600'>
              {isBuyer ? 'View Details →' : 'Show to Buyer →'}
            </span>
            <span className='text-xs text-slate-400'>
              {formatDate(listing.createdAt, { day: 'numeric' })}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
