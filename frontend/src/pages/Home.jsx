import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import SwiperCore from 'swiper';
import 'swiper/css/bundle';
import ListingItem from '../components/ListingItem';
import { FaSearch, FaHome, FaUser, FaBuilding, FaStar, FaShieldAlt, FaHandshake, FaChartLine, FaPhone, FaEnvelope, FaMapMarkerAlt } from 'react-icons/fa';
import { parseJsonSafely, fetchWithRefresh } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';

export default function Home() {
  const [offerListings, setOfferListings] = useState([]);
  const [saleListings, setSaleListings] = useState([]);
  const [rentListings, setRentListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { currentUser } = useSelector((s) => s.user);
  const { isBuyerViewMode } = useBuyerView();
  const navigate = useNavigate();
  SwiperCore.use([Navigation]);

  useEffect(() => {
    if (!currentUser) {
      setOfferListings([]);
      setRentListings([]);
      setSaleListings([]);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchAllListings = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const [offerRes, rentRes, saleRes] = await Promise.all([
          fetchWithRefresh('/api/listing/get?offer=true&limit=4'),
          fetchWithRefresh('/api/listing/get?type=rent&limit=4'),
          fetchWithRefresh('/api/listing/get?type=sale&limit=4')
        ]);

        const [offerData, rentData, saleData] = await Promise.all([
          parseJsonSafely(offerRes),
          parseJsonSafely(rentRes),
          parseJsonSafely(saleRes)
        ]);

        const offerItems = offerData?.data?.listings || [];
        const rentItems = rentData?.data?.listings || [];
        const saleItems = saleData?.data?.listings || [];

        setOfferListings(offerItems);
        setRentListings(rentItems);
        setSaleListings(saleItems);
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError('Failed to load listings');
      } finally {
        setLoading(false);
      }
    };

    fetchAllListings();
  }, [currentUser]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/search?searchTerm=${encodeURIComponent(searchTerm.trim())}`);
    } else {
      navigate('/search');
    }
  };

  return (
    <div className='min-h-screen bg-white'>
      {/* Hero Section */}
      <section className='relative bg-gradient-to-br from-blue-50 via-white to-indigo-50 overflow-hidden'>
        {/* Background Pattern */}
        <div className='absolute inset-0 bg-[url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23e0e7ff" fill-opacity="0.1"%3E%3Ccircle cx="30" cy="30" r="2"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")] opacity-20'></div>
        
        <div className='relative max-w-7xl mx-auto px-4 py-24 lg:py-32'>
          <div className='text-center max-w-4xl mx-auto'>
            <div className='inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium mb-8'>
              <FaStar className='w-4 h-4' />
              Trusted by 10,000+ clients
            </div>
            
            <h1 className='text-5xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight'>
              Find Your Dream
              <span className='bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent'> Property</span>
            </h1>
            
            <p className='text-xl lg:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed'>
              Discover exceptional properties, connect with trusted agents, and make your real estate dreams a reality with RealVista.
            </p>
            
            {/* Enhanced Search Bar */}
            <div className='max-w-3xl mx-auto mb-12'>
              <form onSubmit={handleSearch} className='relative'>
                <div className='flex flex-col sm:flex-row gap-4 p-2 bg-white rounded-2xl shadow-2xl border border-gray-200'>
                  <div className='flex-1 relative'>
                    <FaSearch className='absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5' />
                    <input
                      type='text'
                      placeholder='Search by location, property type, or features...'
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className='w-full pl-12 pr-4 py-4 text-gray-900 placeholder-gray-500 focus:outline-none rounded-xl'
                    />
                  </div>
                  <button
                    type='submit'
                    className='bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-4 font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                  >
                    <FaSearch className='w-5 h-5' />
                    Search Properties
                  </button>
                </div>
              </form>
            </div>

            {/* Trust Indicators */}
            <div className='flex flex-wrap justify-center items-center gap-8 text-gray-500 text-sm'>
              <div className='flex items-center gap-2'>
                <FaShieldAlt className='w-4 h-4 text-green-500' />
                <span>Secure Transactions</span>
              </div>
              <div className='flex items-center gap-2'>
                <FaHandshake className='w-4 h-4 text-blue-500' />
                <span>Trusted Agents</span>
              </div>
              <div className='flex items-center gap-2'>
                <FaChartLine className='w-4 h-4 text-purple-500' />
                <span>Market Insights</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className='py-20 bg-white'>
        <div className='max-w-7xl mx-auto px-4'>
          <div className='text-center mb-16'>
            <h2 className='text-4xl font-bold text-gray-900 mb-4'>Why Choose RealVista?</h2>
            <p className='text-xl text-gray-600 max-w-3xl mx-auto'>
              We provide comprehensive real estate solutions with cutting-edge technology and personalized service.
            </p>
          </div>
          
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8'>
            <div className='text-center group'>
              <div className='w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform'>
                <FaSearch className='w-8 h-8 text-white' />
              </div>
              <h3 className='text-xl font-semibold text-gray-900 mb-3'>Smart Search</h3>
              <p className='text-gray-600'>Advanced filtering and AI-powered recommendations to find your perfect property.</p>
            </div>
            
            <div className='text-center group'>
              <div className='w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform'>
                <FaShieldAlt className='w-8 h-8 text-white' />
              </div>
              <h3 className='text-xl font-semibold text-gray-900 mb-3'>Secure Platform</h3>
              <p className='text-gray-600'>Bank-level security and verified listings ensure safe transactions.</p>
            </div>
            
            <div className='text-center group'>
              <div className='w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform'>
                <FaHandshake className='w-8 h-8 text-white' />
              </div>
              <h3 className='text-xl font-semibold text-gray-900 mb-3'>Expert Agents</h3>
              <p className='text-gray-600'>Connect with certified real estate professionals in your area.</p>
            </div>
            
            <div className='text-center group'>
              <div className='w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform'>
                <FaChartLine className='w-8 h-8 text-white' />
              </div>
              <h3 className='text-xl font-semibold text-gray-900 mb-3'>Market Insights</h3>
              <p className='text-gray-600'>Real-time market data and trends to make informed decisions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className='bg-gradient-to-br from-gray-50 to-blue-50 py-20'>
        <div className='max-w-7xl mx-auto px-4'>
          <div className='text-center mb-16'>
            <h2 className='text-4xl font-bold text-gray-900 mb-4'>Get Started Today</h2>
            <p className='text-xl text-gray-600'>Choose your path to real estate success</p>
          </div>
          
          <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
            <Link 
              to='/search' 
              className='bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 text-center group border border-gray-100'
            >
              <div className='w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform'>
                <FaHome className='w-8 h-8 text-white' />
              </div>
              <h3 className='text-2xl font-bold text-gray-900 mb-4'>Browse Properties</h3>
              <p className='text-gray-600 mb-6'>Explore our extensive collection of verified property listings with detailed information and high-quality photos.</p>
              <div className='inline-flex items-center text-blue-600 font-semibold group-hover:text-blue-700'>
                Start Browsing
                <svg className='w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
                </svg>
              </div>
            </Link>
            
            {!isBuyerViewMode && (currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') ? (
              <Link 
                to='/create-listing' 
                className='bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 text-center group border border-gray-100'
              >
                <div className='w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform'>
                  <FaBuilding className='w-8 h-8 text-white' />
                </div>
                <h3 className='text-2xl font-bold text-gray-900 mb-4'>List Property</h3>
                <p className='text-gray-600 mb-6'>Add your property to our platform and reach thousands of potential buyers and renters.</p>
                <div className='inline-flex items-center text-green-600 font-semibold group-hover:text-green-700'>
                  Create Listing
                  <svg className='w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
                  </svg>
                </div>
              </Link>
            ) : isBuyerViewMode || currentUser?.role === 'buyer' ? (
              <div className='bg-white p-8 rounded-2xl shadow-lg text-center group border-2 border-dashed border-gray-300'>
                <div className='w-16 h-16 bg-gray-300 rounded-2xl flex items-center justify-center mx-auto mb-6'>
                  <FaBuilding className='w-8 h-8 text-gray-500' />
                </div>
                <h3 className='text-2xl font-bold text-gray-500 mb-4'>List Property</h3>
                <p className='text-gray-400 mb-6'>Contact admin to list properties on our platform.</p>
                <div className='inline-flex items-center text-gray-400 font-semibold'>
                  Contact Admin
                </div>
              </div>
            ) : (
              <div className='bg-white p-8 rounded-2xl shadow-lg text-center group border-2 border-dashed border-gray-300'>
                <div className='w-16 h-16 bg-gray-300 rounded-2xl flex items-center justify-center mx-auto mb-6'>
                  <FaBuilding className='w-8 h-8 text-gray-500' />
                </div>
                <h3 className='text-2xl font-bold text-gray-500 mb-4'>List Property</h3>
                <p className='text-gray-400 mb-6'>Sign in to list your properties on our platform.</p>
                <Link to='/sign-in' className='inline-flex items-center text-blue-600 font-semibold hover:text-blue-700'>
                  Sign In
                </Link>
              </div>
            )}
            
            <Link 
              to='/buyer-requirements' 
              className='bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 text-center group border border-gray-100'
            >
              <div className='w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform'>
                <FaUser className='w-8 h-8 text-white' />
              </div>
              <h3 className='text-2xl font-bold text-gray-900 mb-4'>Find Buyers</h3>
              <p className='text-gray-600 mb-6'>Connect with verified buyers looking for properties in your area and close deals faster.</p>
              <div className='inline-flex items-center text-purple-600 font-semibold group-hover:text-purple-700'>
                View Buyers
                <svg className='w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className='py-20 bg-gradient-to-br from-blue-50 to-indigo-50'>
        <div className='max-w-7xl mx-auto px-4'>
          <div className='text-center mb-16'>
            <h2 className='text-4xl font-bold text-gray-900 mb-4'>What Our Clients Say</h2>
            <p className='text-xl text-gray-600'>Real stories from satisfied customers who found their dream properties</p>
          </div>
          
          <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
            <div className='bg-white p-8 rounded-2xl shadow-lg'>
              <div className='flex items-center mb-6'>
                <div className='w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg'>
                  S
                </div>
                <div className='ml-4'>
                  <h4 className='font-semibold text-gray-900'>Sarah Johnson</h4>
                  <p className='text-gray-600'>Property Buyer</p>
                </div>
              </div>
              <div className='flex items-center mb-4'>
                {[...Array(5)].map((_, i) => (
                  <FaStar key={i} className='w-5 h-5 text-yellow-400' />
                ))}
              </div>
              <p className='text-gray-600 italic'>
                "RealVista made finding my dream home so easy! The search filters were incredibly helpful, and my agent was professional and knowledgeable. Highly recommended!"
              </p>
            </div>
            
            <div className='bg-white p-8 rounded-2xl shadow-lg'>
              <div className='flex items-center mb-6'>
                <div className='w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg'>
                  M
                </div>
                <div className='ml-4'>
                  <h4 className='font-semibold text-gray-900'>Michael Chen</h4>
                  <p className='text-gray-600'>Property Seller</p>
                </div>
              </div>
              <div className='flex items-center mb-4'>
                {[...Array(5)].map((_, i) => (
                  <FaStar key={i} className='w-5 h-5 text-yellow-400' />
                ))}
              </div>
              <p className='text-gray-600 italic'>
                "Sold my property in just 2 weeks! The platform connected me with serious buyers and the transaction was smooth and secure. Excellent service!"
              </p>
            </div>
            
            <div className='bg-white p-8 rounded-2xl shadow-lg'>
              <div className='flex items-center mb-6'>
                <div className='w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg'>
                  A
                </div>
                <div className='ml-4'>
                  <h4 className='font-semibold text-gray-900'>Amanda Rodriguez</h4>
                  <p className='text-gray-600'>Real Estate Agent</p>
                </div>
              </div>
              <div className='flex items-center mb-4'>
                {[...Array(5)].map((_, i) => (
                  <FaStar key={i} className='w-5 h-5 text-yellow-400' />
                ))}
              </div>
              <p className='text-gray-600 italic'>
                "As an agent, RealVista has been a game-changer. The tools are intuitive, and I can manage all my listings efficiently. My clients love the experience too!"
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA Section */}
      <section className='py-20 bg-gradient-to-r from-blue-600 to-indigo-600'>
        <div className='max-w-7xl mx-auto px-4 text-center'>
          <h2 className='text-4xl font-bold text-white mb-4'>Ready to Get Started?</h2>
          <p className='text-xl text-blue-100 mb-8 max-w-3xl mx-auto'>
            Join thousands of satisfied customers who have found their perfect properties with RealVista.
          </p>
          
          <div className='flex flex-col sm:flex-row gap-4 justify-center items-center'>
            <Link 
              to='/search' 
              className='bg-white text-blue-600 px-8 py-4 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-lg'
            >
              Browse Properties
            </Link>
            <div className='flex items-center gap-6 text-blue-100'>
              <div className='flex items-center gap-2'>
                <FaPhone className='w-4 h-4' />
                <span>+91 62839 30283</span>
              </div>
              <div className='flex items-center gap-2'>
                <FaEnvelope className='w-4 h-4' />
                <span>mittalrohit701@gmail.com</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Properties */}
      {currentUser && (
        <section className='py-20 bg-white'>
          <div className='max-w-7xl mx-auto px-4'>
            <div className='text-center mb-16'>
              <h2 className='text-4xl font-bold text-gray-900 mb-4'>Featured Properties</h2>
              <p className='text-xl text-gray-600'>Discover our handpicked selection of premium properties</p>
            </div>

            {/* Special Offers */}
            {offerListings.length > 0 && (
              <div className='mb-16'>
                <div className='flex items-center gap-3 mb-8'>
                  <div className='w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center'>
                    <FaStar className='w-5 h-5 text-white' />
                  </div>
                  <h3 className='text-3xl font-bold text-gray-900'>Special Offers</h3>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8'>
                  {offerListings.map((listing) => (
                    <ListingItem key={listing._id} listing={listing} />
                  ))}
                </div>
              </div>
            )}

            {/* For Sale */}
            {saleListings.length > 0 && (
              <div className='mb-16'>
                <div className='flex items-center gap-3 mb-8'>
                  <div className='w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center'>
                    <FaHome className='w-5 h-5 text-white' />
                  </div>
                  <h3 className='text-3xl font-bold text-gray-900'>Properties for Sale</h3>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8'>
                  {saleListings.map((listing) => (
                    <ListingItem key={listing._id} listing={listing} />
                  ))}
                </div>
              </div>
            )}

            {/* For Rent */}
            {rentListings.length > 0 && (
              <div className='mb-16'>
                <div className='flex items-center gap-3 mb-8'>
                  <div className='w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center'>
                    <FaBuilding className='w-5 h-5 text-white' />
                  </div>
                  <h3 className='text-3xl font-bold text-gray-900'>Properties for Rent</h3>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8'>
                  {rentListings.map((listing) => (
                    <ListingItem key={listing._id} listing={listing} />
                  ))}
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className='text-center py-12'>
                <div className='inline-flex items-center gap-3'>
                  <div className='w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
                  <span className='text-gray-600'>Loading properties...</span>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className='text-center py-12'>
                <p className='text-red-600'>{error}</p>
              </div>
            )}

            {/* No Properties */}
            {!loading && !error && offerListings.length === 0 && saleListings.length === 0 && rentListings.length === 0 && (
              <div className='text-center py-12'>
                <p className='text-gray-600'>No properties available at the moment.</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}