import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaPhone, FaEnvelope, FaMapMarkerAlt, FaFacebook, FaTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subStatus, setSubStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setSubStatus({ type: 'error', message: 'Please enter your email' });
      return;
    }
    setLoading(true);
    setSubStatus({ type: '', message: '' });
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setSubStatus({ type: 'success', message: data.message });
        setEmail('');
      } else {
        setSubStatus({ type: 'error', message: data.message });
      }
    } catch {
      setSubStatus({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className='bg-gray-900 text-white'>
      {/* Main Footer Content */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8'>
          {/* Company Info */}
          <div className='space-y-6'>
            <div className='flex items-center space-x-3'>
              <div className='w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center'>
                <span className='text-white font-bold text-lg'>R</span>
              </div>
              <span className='text-2xl font-bold'>RealVista</span>
            </div>
            <p className='text-gray-300 text-sm leading-relaxed'>
              Your trusted partner in real estate. We help you find the perfect property or sell your current one with expert guidance and personalized service.
            </p>
            <div className='flex space-x-4'>
              <a href='#' className='w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors'>
                <FaFacebook className='w-5 h-5' />
              </a>
              <a href='#' className='w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors'>
                <FaTwitter className='w-5 h-5' />
              </a>
              <a href='#' className='w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors'>
                <FaLinkedin className='w-5 h-5' />
              </a>
              <a href='#' className='w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors'>
                <FaInstagram className='w-5 h-5' />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className='text-lg font-semibold mb-6'>Quick Links</h3>
            <ul className='space-y-3'>
              <li>
                <Link to='/search' className='text-gray-300 hover:text-white transition-colors text-sm'>
                  Properties
                </Link>
              </li>
              <li>
                <Link to='/categories' className='text-gray-300 hover:text-white transition-colors text-sm'>
                  Categories
                </Link>
              </li>
              <li>
                <Link to='/buyer-requirements' className='text-gray-300 hover:text-white transition-colors text-sm'>
                  Buyer Requirements
                </Link>
              </li>
              <li>
                <Link to='/about' className='text-gray-300 hover:text-white transition-colors text-sm'>
                  About Us
                </Link>
              </li>
              <li>
                <Link to='/contact' className='text-gray-300 hover:text-white transition-colors text-sm'>
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className='text-lg font-semibold mb-6'>Our Services</h3>
            <ul className='space-y-3'>
              <li className='text-gray-300 text-sm'>Property Sales</li>
              <li className='text-gray-300 text-sm'>Property Rentals</li>
              <li className='text-gray-300 text-sm'>Property Management</li>
              <li className='text-gray-300 text-sm'>Investment Consulting</li>
              <li className='text-gray-300 text-sm'>Market Analysis</li>
              <li className='text-gray-300 text-sm'>Legal Support</li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className='text-lg font-semibold mb-6'>Contact Info</h3>
            <div className='space-y-4'>
              <div className='flex items-start space-x-3'>
                <FaMapMarkerAlt className='w-5 h-5 text-blue-400 mt-1 flex-shrink-0' />
                <div>
                  <p className='text-gray-300 text-sm'>
                    Bathinda<br />
                    Punjab, India 151001
                  </p>
                </div>
              </div>
              <div className='flex items-center space-x-3'>
                <FaPhone className='w-5 h-5 text-blue-400 flex-shrink-0' />
                <a href='tel:+1234567890' className='text-gray-300 hover:text-white transition-colors text-sm'>
                  +91 6283930283
                </a>
              </div>
              <div className='flex items-center space-x-3'>
                <FaEnvelope className='w-5 h-5 text-blue-400 flex-shrink-0' />
                <a href='mailto:mittalrohit701@gmail.com' className='text-gray-300 hover:text-white transition-colors text-sm'>
                  mittalrohit701@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Newsletter Signup */}
        <div className='mt-12 pt-8 border-t border-gray-800'>
          <div className='max-w-md mx-auto text-center'>
            <h3 className='text-xl font-semibold mb-4'>Stay Updated</h3>
            <p className='text-gray-300 text-sm mb-6'>
              Get the latest property listings and market insights delivered to your inbox.
            </p>
            <form onSubmit={handleSubscribe} className='flex flex-col sm:flex-row gap-3'>
              <input
                type='email'
                placeholder='Enter your email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors'
              />
              <button
                type='submit'
                disabled={loading}
                className='px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-50'
              >
                {loading ? 'Subscribing...' : 'Subscribe'}
              </button>
            </form>
            {subStatus.message && (
              <p className={`mt-3 text-sm ${subStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {subStatus.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className='bg-gray-950 border-t border-gray-800'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6'>
          <div className='flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0'>
            <div className='text-gray-400 text-sm'>
              © 2026 RealVista. All rights reserved.
            </div>
            <div className='flex space-x-6 text-sm'>
              <a href='#' className='text-gray-400 hover:text-white transition-colors'>
                Privacy Policy
              </a>
              <a href='#' className='text-gray-400 hover:text-white transition-colors'>
                Terms of Service
              </a>
              <a href='#' className='text-gray-400 hover:text-white transition-colors'>
                Cookie Policy
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
