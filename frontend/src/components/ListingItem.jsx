import { Link } from 'react-router-dom';
import { MdLocationOn, MdBed, MdBathroom, MdSquareFoot } from 'react-icons/md';
import { FaHeart, FaShare, FaEye } from 'react-icons/fa';
import { useSelector } from 'react-redux';
import { useBuyerView } from '../contexts/BuyerViewContext';
import Badge from './ui/Badge';
import { cn } from '../utils/cn';

export default function ListingItem({ listing, layout = 'grid' }) {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  // Check if user is a buyer (no role or role is 'buyer') or in buyer view mode
  const isBuyer = !currentUser?.role || currentUser?.role === 'buyer' || isBuyerViewMode;

  return (
    <div
      className={cn(
        'bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group w-full border border-gray-100 hover:border-gray-200',
        layout === 'list' && 'md:flex'
      )}
    >
      <Link to={`/listing/${listing._id}`} className={cn('block', layout === 'list' && 'md:flex md:w-full')}>
        {/* Image Container */}
        <div className={cn('relative overflow-hidden', layout === 'list' ? 'md:w-80 md:flex-shrink-0' : '')}>
          <img
            src={
              listing.imageUrls[0] ||
              'https://53.fs1.hubspotusercontent-na1.net/hub/53/hubfs/Sales_Blog/real-estate-business-compressor.jpg?width=595&height=400&name=real-estate-business-compressor.jpg'
            }
            alt={listing.name}
            className={cn(
              'w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]',
              layout === 'list' ? 'h-56 md:h-full' : 'h-56'
            )}
          />

          {/* Gradient Overlay */}
          <div className='absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>

          {/* Status Badges */}
          <div className='absolute top-4 left-4 flex flex-col gap-2'>
            {listing.offer && <Badge variant='danger' className='shadow-sm'>Offer</Badge>}
            {listing.type === 'rent' && <Badge variant='info' className='shadow-sm'>Rent</Badge>}
            {listing.type === 'sale' && <Badge variant='success' className='shadow-sm'>Sale</Badge>}
          </div>
        </div>

        {/* Content */}
        <div className={cn('p-6', layout === 'list' ? 'md:flex-1' : '')}>
          {/* Price - Hidden for buyers */}
          {!isBuyer && (
            <div className='mb-4'>
              <div className='text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-1'>
                ₹{listing.offer
                  ? listing.discountPrice.toLocaleString('en-IN')
                  : listing.regularPrice.toLocaleString('en-IN')}
                {listing.type === 'rent' && (
                  <span className='text-lg font-normal text-gray-600'> / month</span>
                )}
              </div>
              {listing.offer && (
                <div className='text-sm text-gray-500 line-through'>
                  ₹{listing.regularPrice.toLocaleString('en-IN')}
                </div>
              )}
            </div>
          )}

          {/* Show "Contact for Price" for buyers */}
          {isBuyer && (
            <div className='mb-4'>
              <div className='text-2xl font-bold text-blue-700 mb-1'>
                <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
                </svg>
                Contact for Price
              </div>
              <div className='text-sm text-gray-500'>
                Get in touch to know the pricing details
              </div>
            </div>
          )}

          {/* Property Details */}
          <div className='flex items-center gap-4 mb-4 text-sm text-gray-600'>
            <div className='flex items-center gap-1'>
              <MdBed className='w-4 h-4 text-gray-500' />
              <span>{listing.bedrooms} {listing.bedrooms === 1 ? 'bed' : 'beds'}</span>
            </div>
            <div className='flex items-center gap-1'>
              <MdBathroom className='w-4 h-4 text-gray-500' />
              <span>{listing.bathrooms} {listing.bathrooms === 1 ? 'bath' : 'baths'}</span>
            </div>
            {listing.area && (
              <div className='flex items-center gap-1'>
                <MdSquareFoot className='w-4 h-4 text-gray-500' />
                <span>{listing.area} sqft</span>
              </div>
            )}
          </div>

          {/* Address */}
          <div className='mb-3'>
            <p className='text-sm text-gray-600 line-clamp-1'>
              {listing.address}
            </p>
          </div>

          {/* Description */}
          <p className='text-sm text-gray-500 line-clamp-2 mb-4'>
            {listing.description}
          </p>

          {/* Footer */}
          <div className='flex items-center justify-between pt-3 border-t border-gray-100'>
            <span className='text-xs text-gray-500'>
              {isBuyer ? 'View Details' : 'Show to Buyer'}
            </span>
            <span className='text-xs text-gray-400'>
              {new Date(listing.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
