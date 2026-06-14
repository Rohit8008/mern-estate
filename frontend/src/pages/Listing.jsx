import { useEffect, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useParams } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import SwiperCore from 'swiper';
import { useSelector } from 'react-redux';
import { Navigation } from 'swiper/modules';
import 'swiper/css/bundle';
import {
  FaBath,
  FaBed,
  FaChair,
  FaMapMarkedAlt,
  FaMapMarkerAlt,
  FaParking,
  FaShare,
} from 'react-icons/fa';
import Contact from '../components/Contact';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Link, useNavigate } from 'react-router-dom';
import { FaEdit, FaTrash } from 'react-icons/fa';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import PropertyDocuments from '../components/PropertyDocuments';
import usePageTitle from '../hooks/usePageTitle';

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
      onClick={handleShare}
      className='flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors'
    >
      {copied ? (
        <>
          <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
          </svg>
          Link Copied!
        </>
      ) : (
        <>
          <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z' />
          </svg>
          Share Location
        </>
      )}
    </button>
  );
}

export default function Listing() {
  SwiperCore.use([Navigation]);
  const [listing, setListing] = useState(null);
  usePageTitle(listing?.name || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contact, setContact] = useState(false);
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
        const data = await apiClient.get(`/listing/get/${params.listingId}`);
        if (data.success === false) {
          setError(true);
          setLoading(false);
          return;
        }
        setListing(data);
        setLoading(false);
        setError(false);
      } catch (error) {
        setError(true);
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

  return (
    <main>
      {loading && <p className='text-center my-7 text-2xl'>Loading...</p>}
      {error && (
        <p className='text-center my-7 text-2xl'>Something went wrong!</p>
      )}
      {listing && !loading && !error && (
        <div>
          <div className='max-w-6xl mx-auto px-3'>
            <Swiper navigation>
              {listing.imageUrls.map((url) => (
                <SwiperSlide key={url}>
                  <div
                    className='h-[420px] sm:h-[480px] md:h-[520px] lg:h-[560px] rounded-xl overflow-hidden'
                    style={{
                      background: `url(${normalizeImageUrl(url)}) center no-repeat`,
                      backgroundSize: 'cover',
                    }}
                  ></div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
          <div
            className='fixed top-20 right-4 z-10 border rounded-full w-12 h-12 flex justify-center items-center bg-white/90 backdrop-blur cursor-pointer shadow hover:shadow-md'
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
              }, 2000);
            }}
          >
            <FaShare className='text-slate-600' />
          </div>
          {copied && (
            <p className='fixed top-36 right-6 z-10 rounded-md bg-slate-900 text-white text-xs px-2 py-1 shadow'>
              Link copied
            </p>
          )}
          <div className='max-w-6xl mx-auto px-3 my-7 grid grid-cols-1 lg:grid-cols-3 gap-6'>
            <div className='lg:col-span-2 flex flex-col gap-4'>
              <div className='bg-white rounded-xl shadow p-4 sm:p-6'>
                <div className='flex flex-col gap-2'>
                  <h1 className='text-2xl font-semibold text-slate-800'>{listing.name}</h1>
                  <p className='flex items-center gap-2 text-slate-600 text-sm'>
                    <FaMapMarkerAlt className='text-green-700' />
                    {listing.address}
                  </p>
                  <div className='flex items-center gap-3 text-xs text-slate-500'>
                    {(!currentUser?.role || currentUser?.role === 'buyer') ? (
                      // Hide owner details for buyers
                      listing.createdAt && (
                        <span>Posted on {new Date(listing.createdAt).toLocaleDateString()}</span>
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
                          <span>on {new Date(listing.createdAt).toLocaleDateString()}</span>
                        )}
                      </>
                    )}
                  </div>
                  <div className='flex flex-wrap gap-2 mt-2'>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${listing.type === 'rent' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                      {listing.type === 'rent' ? 'For Rent' : 'For Sale'}
                    </span>
                    {listing.offer && listing.discountPrice > 0 && (!currentUser?.role || currentUser?.role === 'buyer') ? (
                      <span className='px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800'>
                        Special Offer
                      </span>
                    ) : listing.offer && listing.discountPrice > 0 && (
                      <span className='px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800'>
                        ₹{(+listing.regularPrice - +listing.discountPrice).toLocaleString('en-IN')} OFF
                      </span>
                    )}
                    {listing.category && (
                      <span className='px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700'>
                        {listing.category.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <div className='mt-4 text-slate-800'>
                  <p className='font-semibold text-black mb-1'>Description</p>
                  <p className='leading-relaxed'>{listing.description}</p>
                </div>

                {/* Property Owners Section - Hidden in buyer view mode */}
                {!isBuyerViewMode && listing.owners && listing.owners.length > 0 && (
                  <div className='mt-6 text-slate-800'>
                    <p className='font-semibold text-black mb-3'>Property Owners</p>
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
                {/* Property Type Fields */}
                {listing.propertyTypeFields && Object.keys(listing.propertyTypeFields).length > 0 && (
                  <div className='mt-4'>
                    <p className='font-semibold text-black mb-3'>
                      {propertyTypeData?.name || 'Property'} Details
                    </p>
                    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'>
                      {Object.entries(listing.propertyTypeFields).map(([key, value]) => {
                        const field = propertyTypeData?.fields?.find(f => f.key === key);
                        const label = field?.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                        let displayValue;
                        if (typeof value === 'boolean') {
                          displayValue = value ? 'Yes' : 'No';
                        } else if (Array.isArray(value)) {
                          displayValue = value.join(', ');
                        } else {
                          displayValue = String(value);
                        }
                        const unit = field?.unit || '';
                        return (
                          <div key={key} className='bg-slate-50 rounded-lg p-3 border border-slate-100'>
                            <span className='text-xs font-medium text-slate-500 block mb-1'>{label}</span>
                            <span className='text-sm font-semibold text-slate-800'>
                              {displayValue}{unit && ` ${unit}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quick Info Pills - Only show if no propertyType is set (legacy/untyped listings) */}
                {!listing.propertyType && (!listing.propertyTypeFields || Object.keys(listing.propertyTypeFields).length === 0) && (
                  <ul className='mt-4 text-green-900 font-semibold text-sm flex flex-wrap items-center gap-3 sm:gap-4'>
                    <li className='flex items-center gap-2 whitespace-nowrap bg-green-50 text-green-800 px-3 py-1 rounded-full'>
                      <FaBed className='text-base' />
                      {listing.bedrooms > 1 ? `${listing.bedrooms} beds` : `${listing.bedrooms} bed`}
                    </li>
                    <li className='flex items-center gap-2 whitespace-nowrap bg-green-50 text-green-800 px-3 py-1 rounded-full'>
                      <FaBath className='text-base' />
                      {listing.bathrooms > 1 ? `${listing.bathrooms} baths` : `${listing.bathrooms} bath`}
                    </li>
                    <li className='flex items-center gap-2 whitespace-nowrap bg-green-50 text-green-800 px-3 py-1 rounded-full'>
                      <FaParking className='text-base' />
                      {listing.parking ? 'Parking spot' : 'No Parking'}
                    </li>
                    <li className='flex items-center gap-2 whitespace-nowrap bg-green-50 text-green-800 px-3 py-1 rounded-full'>
                      <FaChair className='text-base' />
                      {listing.furnished ? 'Furnished' : 'Unfurnished'}
                    </li>
                  </ul>
                )}
              </div>

              {/* New Property Details */}
              {(listing.areaName || listing.plotSize || listing.sqYard || listing.propertyNo || listing.remarks) && (
                <div className='bg-white rounded-xl shadow p-4 sm:p-6 mt-4'>
                  <h2 className='font-semibold text-lg mb-4 text-slate-800'>Property Details</h2>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    {listing.areaName && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>Area Name</span>
                        <span className='text-slate-800'>{listing.areaName}</span>
                      </div>
                    )}
                    {listing.plotSize && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>Plot Size</span>
                        <span className='text-slate-800'>{listing.plotSize}</span>
                      </div>
                    )}
                    {listing.sqYard && listing.sqYard > 0 && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>Square Yards</span>
                        <span className='text-slate-800'>{listing.sqYard} sq yards</span>
                      </div>
                    )}
                    {listing.sqYardRate && listing.sqYardRate > 0 && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>Rate per Sq Yard</span>
                        <span className='text-slate-800'>₹{listing.sqYardRate.toLocaleString()}</span>
                      </div>
                    )}
                    {listing.totalValue && listing.totalValue > 0 && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>Total Value</span>
                        <span className='text-slate-800 font-semibold'>₹{listing.totalValue.toLocaleString()}</span>
                      </div>
                    )}
                    {listing.propertyNo && (
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium text-slate-600'>Property Number</span>
                        <span className='text-slate-800'>{listing.propertyNo}</span>
                      </div>
                    )}
                  </div>
                  {listing.remarks && (
                    <div className='mt-4'>
                      <span className='text-sm font-medium text-slate-600 block mb-2'>Remarks</span>
                      <p className='text-slate-800 leading-relaxed'>{listing.remarks}</p>
                    </div>
                  )}
                  {listing.otherAttachment && (
                    <div className='mt-4'>
                      <span className='text-sm font-medium text-slate-600 block mb-2'>Other Documents</span>
                      <a
                        href={listing.otherAttachment}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 underline'
                      >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
                        </svg>
                        View Document
                      </a>
                    </div>
                  )}
                </div>
              )}

              {listing.attributes && Object.keys(listing.attributes).length > 0 && (
                <div className='bg-white rounded-xl shadow p-4 sm:p-6 mt-4'>
                  <h2 className='font-semibold text-lg mb-2'>Additional Information</h2>
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
              {listing.location && listing.location.lat && listing.location.lng && (
                <div className='bg-white rounded-xl shadow p-4'>
                  <div className='flex items-center justify-between mb-3'>
                    <h3 className='font-semibold text-slate-800'>Property Location</h3>
                    <div className='flex gap-2'>
                      {/* Open in Google Maps */}
                      <a
                        href={`https://www.google.com/maps?q=${listing.location.lat},${listing.location.lng}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors'
                      >
                        <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' />
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 11a3 3 0 11-6 0 3 3 0 016 0z' />
                        </svg>
                        Open in Maps
                      </a>
                      {/* Share location link */}
                      <ShareLocationButton lat={listing.location.lat} lng={listing.location.lng} name={listing.name} />
                    </div>
                  </div>
                  <div className='w-full h-72 rounded-lg overflow-hidden'>
                    <MapContainer
                      center={[listing.location.lat, listing.location.lng]}
                      zoom={13}
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                      />
                      <Marker
                        position={[listing.location.lat, listing.location.lng]}
                        icon={defaultIcon}
                      >
                        <Popup>
                          {listing.name}
                          <br />
                          {listing.address}
                        </Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                </div>
              )}
            {/* Property Documents — visible to admin/employee only */}
            {currentUser && !isBuyerViewMode && (currentUser.role === 'admin' || currentUser.role === 'employee') && listing._id && (
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
                    <div className='text-2xl font-bold text-blue-600 mb-2 flex items-center justify-center gap-2'>
                      <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
                      </svg>
                      Contact for Price
                    </div>
                    <p className='text-gray-600 text-sm'>
                      Get in touch to know the pricing details
                    </p>
                  </div>
                ) : (
                  // Show actual price for agents/employees
                  <div className='text-3xl font-bold text-slate-900'>
                    ₹{' '}
                    {listing.offer && listing.discountPrice
                      ? listing.discountPrice.toLocaleString('en-IN')
                      : listing.regularPrice.toLocaleString('en-IN')}
                    <span className='text-base font-medium text-slate-500'>
                      {listing.type === 'rent' ? ' / month' : ''}
                    </span>
                  </div>
                )}
                {(!currentUser?.role || currentUser?.role === 'buyer') ? null : (
                  listing.offer && listing.discountPrice > 0 && (
                    <div className='text-sm text-slate-500 line-through mt-2'>
                      ₹{listing.regularPrice.toLocaleString('en-IN')}
                    </div>
                  )
                )}
                {currentUser && listing.userRef !== currentUser._id && !contact && (
                  <button
                    onClick={() => setContact(true)}
                    className='mt-5 w-full bg-slate-700 text-white rounded-lg uppercase hover:opacity-95 p-3'
                  >
                    Contact landlord
                  </button>
                )}
                {contact && (
                  <div className='mt-4 space-y-3'>
                    <Contact listing={listing} />
                  </div>
                )}
                {currentUser &&
                  !isBuyerViewMode &&
                  (currentUser.role === 'admin' ||
                    currentUser.role === 'employee' ||
                    (currentUser.role === 'seller' &&
                      ((typeof listing.userRef === 'string' && listing.userRef === currentUser._id) ||
                        (listing.userRef && typeof listing.userRef === 'object' && listing.userRef._id === currentUser._id)))) && (
                    <div className='flex gap-3 mt-5'>
                      <Link to={`/update-listing/${listing._id}`} className='w-1/2'>
                        <button className='w-full flex items-center justify-center gap-2 bg-green-700 text-white rounded-lg uppercase hover:opacity-95 p-3'>
                          <FaEdit /> Edit
                        </button>
                      </Link>
                      <button
                        onClick={() => setPendingDelete(true)}
                        className='w-1/2 flex items-center justify-center gap-2 bg-red-700 text-white rounded-lg uppercase hover:opacity-95 p-3'
                      >
                        <FaTrash /> Delete
                      </button>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete}
        title='Delete this listing?'
        description='This cannot be undone.'
        confirmLabel='Delete'
        onConfirm={async () => {
          setPendingDelete(false);
          try {
            const data = await apiClient.delete(`/listing/delete/${listing._id}`);
            if (data.success === false) return;
            window.dispatchEvent(new CustomEvent('listing-deleted', { detail: { id: listing._id } }));
            if (window.history.length > 2) { navigate(-1); } else { navigate('/search'); }
          } catch (_) { }
        }}
        onCancel={() => setPendingDelete(false)}
      />
    </main>
  );
}
