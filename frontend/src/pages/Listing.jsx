import { useEffect, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useParams } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import SwiperCore from 'swiper';
import { useSelector } from 'react-redux';
import { Navigation } from 'swiper/modules';
import 'swiper/css/bundle';
import { MdBed, MdBathroom } from 'react-icons/md';
import {
  HiOutlineLocationMarker,
  HiOutlineShare,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineTruck,
  HiOutlineCube,
  HiOutlineExclamationCircle,
  HiOutlineCheck,
} from 'react-icons/hi';
import Contact from '../components/Contact';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { formatCurrency, formatListingPrice, isPlaceholderPrice, formatDate, formatArea } from '../utils/currency';
import { listingStatusLabel } from '../utils/listingStatus';

import { cn } from '../utils/cn';
import { useBuyerView } from '../contexts/BuyerViewContext';
import PropertyDocuments from '../components/PropertyDocuments';
import CategoryMapFallback from '../components/CategoryMapFallback';
import usePageTitle from '../hooks/usePageTitle';
import { Button, Badge, PageLoader } from '../design-system';
import { useTranslation } from 'react-i18next';
import SharePropertiesDialog from '../components/SharePropertiesDialog';
import { useNotification } from '../contexts/NotificationContext';

const STATUS_BADGE = { available: 'success', under_negotiation: 'warning', sold: 'default', rented: 'info' };

const defaultIcon = new L.Icon({
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// https://sabe.io/blog/javascript-format-numbers-commas#:~:text=The%20best%20way%20to%20format,format%20the%20number%20with%20commas.

function ShareLocationButton({ lat, lng, name }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  const handleShare = async () => {
    // Use native share sheet on mobile if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: name,
          text: `Check out this property location: ${name}`,
          url: mapsUrl,
        });
        return;
      } catch (_) { }
    }
    // Fallback: copy the Google Maps link to clipboard
    navigator.clipboard.writeText(mapsUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type='button'
      onClick={handleShare}
      className='flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors'
    >
      {copied ? (
        <>
          <HiOutlineCheck className='w-3.5 h-3.5' />{t('listing.linkCopied')}</>
      ) : (
        <>
          <HiOutlineShare className='w-3.5 h-3.5' />{t('listing.shareLocation')}</>
      )}
    </button>
  );
}

export default function Listing() {
  const { t } = useTranslation();
  SwiperCore.use([Navigation]);
  const [listing, setListing] = useState(null);
  usePageTitle(listing?.name || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contact, setContact] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { showSuccess } = useNotification();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [categoryFields, setCategoryFields] = useState([]);
  const [propertyTypeData, setPropertyTypeData] = useState(null);
  const params = useParams();
  const { currentUser } = useSelector((state) => state.user);
  const navigate = useNavigate();
  const { isBuyerViewMode } = useBuyerView();

  useEffect(() => {
    const fetchListing = async () => {
      try {
        setLoading(true);
        // silent: this page explains the failure itself; the global toast
        // repeated it.
        const data = await apiClient.get(`/listing/get/${params.listingId}`, { silent: true });
        if (data.success === false) {
          setError('failed');
          setLoading(false);
          return;
        }
        setListing(data);
        setLoading(false);
        setError(false);
      } catch (error) {
        // A deleted listing, or an id from another workspace, is a 404 or a
        // malformed-id 400: say it is not available rather than "went wrong".
        setError([400, 404].includes(error?.statusCode) ? 'notFound' : 'failed');
        setLoading(false);
      }
    };
    fetchListing();
  }, [params.listingId]);

  useEffect(() => {
    const fetchCategory = async () => {
      if (!listing?.category) { setCategoryFields([]); return; }
      try {
        const data = await apiClient.get(`/category/by-slug/${listing.category}`);
        setCategoryFields(Array.isArray(data?.fields) ? data.fields : []);
      } catch (_) {
        setCategoryFields([]);
      }
    };
    fetchCategory();
  }, [listing?.category]);

  useEffect(() => {
    const fetchPropertyType = async () => {
      if (!listing?.propertyType) { setPropertyTypeData(null); return; }
      try {
        const data = await apiClient.get(`/property-types/${listing.propertyType}`);
        setPropertyTypeData(data?.data || data || null);
      } catch (_) {
        setPropertyTypeData(null);
      }
    };
    fetchPropertyType();
  }, [listing?.propertyType]);

  // Street address plus the separate locality/city/state columns, skipping
  // blanks and a city the address already names.
  const locationLine = listing
    ? [listing.address, listing.locality, listing.city, listing.state]
        .map((part) => String(part || '').trim())
        .filter((part, i, all) => part && !all.slice(0, i).some((prev) => prev.toLowerCase().includes(part.toLowerCase())))
        .join(', ')
    : '';
  const listerId = listing ? String(listing.userRef?._id || listing.userRef || '') : '';
  const isOwnListing = Boolean(currentUser && listerId && listerId === String(currentUser._id));
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'employee';
  // Who may change this listing: an admin, whoever added it, or the agent it is
  // assigned to. Employees saw Edit and Delete on every listing and were then
  // refused by the server.
  const assignedId = listing ? String(listing.assignedAgent?._id || listing.assignedAgent || '') : '';
  const canWorkOn = currentUser?.role === 'admin' || isOwnListing || (currentUser && assignedId === String(currentUser._id));
  const hasCategoryFacts = Boolean(listing?.category && Object.keys(listing?.attributes || {}).length);

  return (
    <main>
      {loading && <PageLoader message='Loading listing…' />}
      {error && (
        <div className='max-w-md mx-auto my-16 px-4 text-center'>
          <div className='mx-auto mb-4 w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 flex items-center justify-center'>
            <HiOutlineExclamationCircle className='w-7 h-7' />
          </div>
          {error === 'notFound' ? (
            <>
              <h2 className='text-lg font-semibold text-slate-900 mb-1'>{t('listing.notFoundTitle')}</h2>
              <p className='text-sm text-slate-500 mb-5'>{t('listing.notFoundBody')}</p>
              <div className='flex items-center justify-center gap-3'>
                <Button onClick={() => navigate(isStaff ? '/properties' : '/search')}>{t('listing.backToProperties')}</Button>
              </div>
            </>
          ) : (
            <>
              <h2 className='text-lg font-semibold text-slate-900 mb-1'>{t('listing.somethingWentWrong')}</h2>
              <p className='text-sm text-slate-500 mb-5'>{t('listing.loadFailedBody')}</p>
              <div className='flex items-center justify-center gap-3'>
                <Button variant='secondary' onClick={() => navigate(-1)}>{t('listing.goBack')}</Button>
                <Button onClick={() => window.location.reload()}>{t('listing.tryAgain')}</Button>
              </div>
            </>
          )}
        </div>
      )}
      {listing && !loading && !error && (
        <div>
          <div className='max-w-6xl mx-auto px-3'>
            <Swiper navigation>
              {listing.imageUrls.map((url, index) => (
                <SwiperSlide key={url}>
                  <div className='h-[420px] sm:h-[480px] md:h-[520px] lg:h-[560px] rounded-xl overflow-hidden'>
                    <img
                      src={normalizeImageUrl(url)}
                      alt={`${listing.name} — photo ${index + 1}`}
                      className='w-full h-full object-cover'
                    />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
          <button
            type='button'
            aria-label={isStaff ? t('listing.shareWithClient') : t('listing.copyListingLink')}
            className='fixed top-20 right-4 z-10 border border-slate-200 rounded-full w-12 h-12 flex justify-center items-center bg-white/90 backdrop-blur cursor-pointer shadow hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1'
            onClick={() => {
              // For staff this page's own address is behind sign-in, so a client
              // who got it met a login screen. Staff make a real share link.
              if (isStaff) { setShareOpen(true); return; }
              navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
              }, 2000);
            }}
          >
            <HiOutlineShare className='text-slate-600 w-5 h-5' />
          </button>
          {copied && (
            <p className='fixed top-36 right-6 z-10 rounded-md bg-slate-900 text-white text-xs px-2 py-1 shadow'>{t('listing.linkCopied2')}</p>
          )}
          {isStaff && (
            <SharePropertiesDialog open={shareOpen} onClose={() => setShareOpen(false)} listings={[listing]} />
          )}
          <div className='max-w-6xl mx-auto px-3 my-7 grid grid-cols-1 lg:grid-cols-3 gap-6'>
            <div className='lg:col-span-2 flex flex-col gap-4'>
              <div className='bg-white rounded-xl shadow p-4 sm:p-6'>
                <div className='flex flex-col gap-2'>
                  <h1 className='text-2xl font-semibold text-slate-800'>{listing.name}</h1>
                  {/* The address line alone was often blank: a city typed into the
                      form lives in its own column. */}
                  {locationLine && (
                    <p className='flex items-center gap-2 text-slate-600 text-sm'>
                      <HiOutlineLocationMarker className='text-slate-400 w-4 h-4' />
                      {locationLine}
                    </p>
                  )}
                  <div className='flex items-center gap-3 text-xs text-slate-500'>
                    {(!currentUser?.role || currentUser?.role === 'buyer') ? (
                      // Hide owner details for buyers
                      listing.createdAt && (
                        <span>Posted on {formatDate(listing.createdAt)}</span>
                      )
                    ) : (
                      // Show owner details for agents/employees
                      <>
                        {listing.owner && (
                          <Link to={`/user/${listing.owner._id}`} className='flex items-center gap-2 hover:underline'>
                            <img
                              src={listing.owner.avatar}
                              alt='owner'
                              className='w-5 h-5 rounded-full object-cover'
                            />
                            Posted by {listing.owner.username}
                          </Link>
                        )}
                        {listing.createdAt && (
                          <span>on {formatDate(listing.createdAt)}</span>
                        )}
                      </>
                    )}
                  </div>
                  <div className='flex flex-wrap gap-2 mt-2'>
                    <Badge variant={listing.type === 'rent' ? 'info' : 'purple'} size='md'>
                      {listing.type === 'rent' ? 'For Rent' : 'For Sale'}
                    </Badge>
                    {/* Sold / rented / in negotiation was shown nowhere on this page. */}
                    <Badge variant={STATUS_BADGE[listing.status] || 'default'} size='md'>
                      {listingStatusLabel(listing.status)}
                    </Badge>
                    {listing.offer && listing.discountPrice > 0 && (!currentUser?.role || currentUser?.role === 'buyer') ? (
                      <Badge variant='success' size='md'>{t('listing.specialOffer')}</Badge>
                    ) : listing.offer && listing.discountPrice > 0 && (
                      <Badge variant='success' size='md'>
                        {formatCurrency(+listing.regularPrice - +listing.discountPrice)} OFF
                      </Badge>
                    )}
                    {listing.category && (
                      <Badge variant='default' size='md'>{listing.category.toUpperCase()}</Badge>
                    )}
                  </div>
                </div>
                {listing.description?.trim() && (
                  <div className='mt-4 text-slate-800'>
                    <p className='font-semibold text-black mb-1'>{t('listing.description')}</p>
                    <p className='leading-relaxed'>{listing.description}</p>
                  </div>
                )}

                {/* Property Owners Section - Hidden in buyer view mode */}
                {!isBuyerViewMode && listing.owners && listing.owners.length > 0 && (
                  <div className='mt-6 text-slate-800'>
                    <p className='font-semibold text-black mb-3'>{t('listing.propertyOwners')}</p>
                    <div className='space-y-3'>
                      {listing.owners.map((owner, index) => (
                        <div key={owner._id || index} className='bg-slate-50 rounded-lg p-4 border border-slate-200'>
                          <div className='flex items-start justify-between'>
                            <div className='flex-1'>
                              <h4 className='font-medium text-slate-900 mb-1'>{owner.name}</h4>
                              {owner.companyName && (
                                <p className='text-sm text-slate-600 mb-2'>{owner.companyName}</p>
                              )}
                              <div className='space-y-1'>
                                {owner.email && (
                                  <p className='text-sm text-slate-600 flex items-center gap-2'>
                                    <svg className='w-4 h-4 text-slate-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' />
                                    </svg>
                                    {owner.email}
                                  </p>
                                )}
                                {owner.phone && (
                                  <p className='text-sm text-slate-600 flex items-center gap-2'>
                                    <svg className='w-4 h-4 text-slate-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' />
                                    </svg>
                                    {owner.phone}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* The propertyTypeFields block that used to sit here read a
                    second, parallel dynamic-field store that nothing wrote to.
                    It was retired by scripts/migrateFieldStores.js; category
                    fields render from `attributes` above. */}
                {/* Quick info pills, unless category fields already describe the
                    property. Keyed on the category, not the property type: a type
                    set without a category hid every one of these facts. */}
                {!hasCategoryFacts && (Boolean(listing.bedrooms || listing.bathrooms) || listing.parking || listing.furnished) && (
                  <ul className='mt-4 text-slate-700 font-semibold text-sm flex flex-wrap items-center gap-3 sm:gap-4'>
                    {listing.bedrooms > 0 && (
                      <li className='flex items-center gap-2 whitespace-nowrap bg-slate-100 text-slate-700 px-3 py-1 rounded-full'>
                        <MdBed className='text-base' />
                        {listing.bedrooms > 1 ? `${listing.bedrooms} beds` : `${listing.bedrooms} bed`}
                      </li>
                    )}
                    {listing.bathrooms > 0 && (
                      <li className='flex items-center gap-2 whitespace-nowrap bg-slate-100 text-slate-700 px-3 py-1 rounded-full'>
                        <MdBathroom className='text-base' />
                        {listing.bathrooms > 1 ? `${listing.bathrooms} baths` : `${listing.bathrooms} bath`}
                      </li>
                    )}
                    <li className='flex items-center gap-2 whitespace-nowrap bg-slate-100 text-slate-700 px-3 py-1 rounded-full'>
                      <HiOutlineTruck className='text-base' />
                      {listing.parking ? 'Parking spot' : 'No Parking'}
                    </li>
                    <li className='flex items-center gap-2 whitespace-nowrap bg-slate-100 text-slate-700 px-3 py-1 rounded-full'>
                      <HiOutlineCube className='text-base' />
                      {listing.furnished ? 'Furnished' : 'Unfurnished'}
                    </li>
                  </ul>
                )}
              </div>

              {/* New Property Details */}
              {Boolean(listing.areaName || listing.plotSize || listing.sqYard > 0 || listing.areaSqFt > 0 || listing.sqYardRate > 0 || listing.totalValue > 1 || listing.propertyNo || listing.remarks) && (
                <div className='bg-white rounded-xl shadow p-4 sm:p-6 mt-4'>
                  <h2 className='font-semibold text-lg mb-4 text-slate-800'>{t('listing.propertyDetails')}</h2>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    {listing.areaName && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>{t('listing.areaName')}</span>
                        <span className='text-slate-800'>{listing.areaName}</span>
                      </div>
                    )}
                    {listing.plotSize && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>{t('listing.plotSize')}</span>
                        <span className='text-slate-800'>{listing.plotSize}</span>
                      </div>
                    )}
                    {/* `x && …` rendered a bare "0" for every zero value here. */}
                    {(listing.sqYard > 0 || listing.areaSqFt > 0) && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>{t('listing.area')}</span>
                        <span className='text-slate-800'>{listing.sqYard > 0 ? `${listing.sqYard} sq yards` : formatArea(listing.areaSqFt)}</span>
                      </div>
                    )}
                    {listing.sqYardRate > 0 && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>{t('listing.ratePerSqYard')}</span>
                        <span className='text-slate-800'>{formatCurrency(listing.sqYardRate)}</span>
                      </div>
                    )}
                    {listing.totalValue > 0 && !isPlaceholderPrice(listing.totalValue) && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>{t('listing.totalValue')}</span>
                        <span className='text-slate-800 font-semibold'>{formatListingPrice(listing.totalValue)}</span>
                      </div>
                    )}
                    {listing.propertyNo && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>{t('listing.propertyNumber')}</span>
                        <span className='text-slate-800'>{listing.propertyNo}</span>
                      </div>
                    )}
                  </div>
                  {listing.remarks && (
                    <div className='mt-4'>
                      <span className='text-sm font-medium text-slate-600 block mb-2'>{t('listing.remarks')}</span>
                      <p className='text-slate-800 leading-relaxed'>{listing.remarks}</p>
                    </div>
                  )}
                  {listing.otherAttachment && (
                    <div className='mt-4'>
                      <span className='text-sm font-medium text-slate-600 block mb-2'>{t('listing.otherDocuments')}</span>
                      <a
                        href={listing.otherAttachment}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 underline'
                      >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
                        </svg>{t('listing.viewDocument')}</a>
                    </div>
                  )}
                </div>
              )}

              {listing.attributes && Object.keys(listing.attributes).length > 0 && (
                <div className='bg-white rounded-xl shadow p-4 sm:p-6 mt-4'>
                  <h2 className='font-semibold text-lg mb-2'>{t('listing.additionalInformation')}</h2>
                  <ul className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700'>
                    {Object.entries(listing.attributes).map(([k, v]) => {
                      const f = categoryFields.find((cf) => cf.key === k);
                      const label = f?.label || k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
                      let value;
                      if (Array.isArray(v)) value = v.join(', ');
                      else if (typeof v === 'boolean') value = v ? 'Yes' : 'No';
                      else value = String(v);
                      return (
                        <li key={k}>
                          <span className=''>{label}</span>: {value}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {listing.effectiveLocation && listing.effectiveLocation.lat && listing.effectiveLocation.lng && (
                <div className='bg-white rounded-xl shadow p-4'>
                  <div className='flex items-center justify-between mb-3'>
                    <div className='flex items-center gap-2'>
                      <h3 className='font-semibold text-slate-800'>{t('listing.propertyLocation')}</h3>
                      {!(listing.location && listing.location.lat && listing.location.lng) && (
                        <Badge variant='slate'>{t('listing.colonyDefault')}</Badge>
                      )}
                    </div>
                    <div className='flex gap-2'>
                      {/* Open in Google Maps */}
                      <a
                        href={`https://www.google.com/maps?q=${listing.effectiveLocation.lat},${listing.effectiveLocation.lng}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 transition-colors'
                      >
                        <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' />
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 11a3 3 0 11-6 0 3 3 0 016 0z' />
                        </svg>{t('listing.openInMaps')}</a>
                      {/* Share location link */}
                      <ShareLocationButton lat={listing.effectiveLocation.lat} lng={listing.effectiveLocation.lng} name={listing.name} />
                    </div>
                  </div>
                  <div className='w-full h-72 rounded-lg overflow-hidden'>
                    <MapContainer
                      center={[listing.effectiveLocation.lat, listing.effectiveLocation.lng]}
                      zoom={13}
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                      />
                      <Marker
                        position={[listing.effectiveLocation.lat, listing.effectiveLocation.lng]}
                        icon={defaultIcon}
                      >
                        <Popup>
                          {listing.name}
                          <br />
                          {locationLine}
                        </Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                </div>
              )}
              {listing.category && listing._id && (
                <CategoryMapFallback categorySlug={listing.category} listingId={listing._id} />
              )}
            {/* Property Documents — visible to admin/employee only */}
            {currentUser && !isBuyerViewMode && isStaff && canWorkOn && listing._id && (
              <PropertyDocuments
                listingId={listing._id}
                canEdit={
                  currentUser.role === 'admin' ||
                  String(listing.userRef) === String(currentUser._id) ||
                  (listing.userRef?._id && String(listing.userRef._id) === String(currentUser._id))
                }
              />
            )}

            </div>
            <div className='lg:col-span-1'>
              <div className='bg-white rounded-xl shadow p-5 sticky top-24'>
                {(!currentUser?.role || currentUser?.role === 'buyer' || isBuyerViewMode) ? (
                  // Show "Contact for Price" for buyers or when in buyer view mode
                  <div className='text-center py-4'>
                    <div className='text-2xl font-bold text-indigo-600 mb-2 flex items-center justify-center gap-2'>
                      <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
                      </svg>{t('listing.contactForPrice')}</div>
                    <p className='text-slate-500 text-sm'>{t('listing.getInTouchToKnowThe')}</p>
                  </div>
                ) : (
                  // Show actual price for agents/employees
                  <div className={cn('text-3xl font-bold text-slate-900', isPlaceholderPrice(listing.regularPrice) && 'text-xl text-slate-500')}>
                    {formatListingPrice(listing.offer && listing.discountPrice ? listing.discountPrice : listing.regularPrice)}
                    {!isPlaceholderPrice(listing.regularPrice) && (
                      <span className='text-base font-medium text-slate-500'>
                        {listing.type === 'rent' ? ' / month' : ''}
                      </span>
                    )}
                  </div>
                )}
                {(!currentUser?.role || currentUser?.role === 'buyer') ? null : (
                  listing.offer && listing.discountPrice > 0 && (
                    <div className='text-sm text-slate-500 line-through mt-2'>
                      {formatListingPrice(listing.regularPrice)}
                    </div>
                  )
                )}
                {/* A buyer's button. Agency staff reach owners through Property Owners,
                    and the lister has no one to contact about their own listing. */}
                {currentUser && !isOwnListing && !isStaff && !contact && (
                  <Button onClick={() => setContact(true)} size='lg' className='mt-5 w-full justify-center'>{t('listing.contactLandlord')}</Button>
                )}
                {contact && (
                  <div className='mt-4 space-y-3'>
                    <Contact listing={listing} />
                  </div>
                )}
                {currentUser &&
                  !isBuyerViewMode &&
                  (currentUser.role === 'admin' ||
                    (currentUser.role === 'employee' && canWorkOn) ||
                    (currentUser.role === 'seller' &&
                      ((typeof listing.userRef === 'string' && listing.userRef === currentUser._id) ||
                        (listing.userRef && typeof listing.userRef === 'object' && listing.userRef._id === currentUser._id)))) && (
                    <div className='flex gap-3 mt-5'>
                      <Button
                        as={Link}
                        to={`/update-listing/${listing._id}`}
                        variant='secondary'
                        icon={HiOutlinePencil}
                        className='w-1/2 justify-center'
                      >{t('listing.edit')}</Button>
                      <Button
                        variant='danger'
                        icon={HiOutlineTrash}
                        onClick={() => setPendingDelete(true)}
                        className='w-1/2 justify-center'
                      >{t('listing.delete')}</Button>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete}
        title={t('listing.deleteThisListing')}
        description={t('listing.thisCannotBeUndone')}
        confirmLabel={t('listing.delete')}
        onConfirm={async () => {
          setPendingDelete(false);
          try {
            const data = await apiClient.delete(`/listing/delete/${listing._id}`);
            if (data.success === false) return;
            window.dispatchEvent(new CustomEvent('listing-deleted', { detail: { id: listing._id } }));
            showSuccess(`${listing.name} was deleted.`);
            navigate(isStaff ? '/properties' : '/search');
          } catch (_) { }
        }}
        onCancel={() => setPendingDelete(false)}
      />
    </main>
  );
}
