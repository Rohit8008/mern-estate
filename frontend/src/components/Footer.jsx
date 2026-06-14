import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlinePhone, HiOutlineMail, HiOutlineLocationMarker,
  HiOutlineHome, HiOutlineSearch, HiOutlineUserAdd,
  HiOutlineCalendar, HiOutlineLightningBolt,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';

const OWNER_PHONE = '+91 62839 30283';
const OWNER_EMAIL = 'mittalrohit701@gmail.com';

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
      const data = await apiClient.post('/newsletter/subscribe', { email });
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
    <footer className='bg-slate-950 text-white'>
      <div className='max-w-7xl mx-auto px-4 py-14'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10'>

          {/* Brand */}
          <div className='space-y-5'>
            <div className='flex items-center gap-2.5'>
              <div className='w-9 h-9 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0'>
                <HiOutlineHome className='w-4 h-4 text-white' />
              </div>
              <span className='text-lg font-bold'>Real Vista</span>
            </div>
            <p className='text-slate-400 text-sm leading-relaxed'>
              End-to-end real estate platform — verified listings for buyers and a full CRM for agencies ready to grow.
            </p>
            <div className='flex gap-2'>
              {['in', 'tw', 'ig', 'yt'].map((s) => (
                <a
                  key={s}
                  href='#'
                  aria-label={s}
                  className='w-8 h-8 bg-slate-800 hover:bg-indigo-600 border border-slate-700 rounded-lg flex items-center justify-center text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase'
                >
                  {s}
                </a>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <h3 className='text-sm font-semibold text-white mb-5 uppercase tracking-wide'>Platform</h3>
            <ul className='space-y-3'>
              {[
                { label: 'Browse Properties', to: '/search',  icon: HiOutlineSearch },
                { label: 'Sign In',           to: '/sign-in', icon: HiOutlineHome },
                { label: 'Create Account',    to: '/sign-up', icon: HiOutlineUserAdd },
              ].map(({ label, to, icon: Icon }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'
                  >
                    <Icon className='w-3.5 h-3.5 text-indigo-500 flex-shrink-0' />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* For Agencies */}
          <div>
            <h3 className='text-sm font-semibold text-white mb-5 uppercase tracking-wide'>For Agencies</h3>
            <ul className='space-y-3'>
              {[
                'Pipeline Management',
                'Analytics Dashboard',
                'Task & Calendar',
                'Document Management',
                'Owner & Listing CRM',
              ].map((item) => (
                <li key={item} className='flex items-center gap-2 text-slate-400 text-sm'>
                  <HiOutlineLightningBolt className='w-3.5 h-3.5 text-indigo-500 flex-shrink-0' />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${OWNER_EMAIL}?subject=Demo Request — Real Vista`}
              className='inline-flex items-center gap-2 mt-5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium'
            >
              <HiOutlineCalendar className='w-4 h-4' />
              Request a Demo
            </a>
          </div>

          {/* Contact & Newsletter */}
          <div>
            <h3 className='text-sm font-semibold text-white mb-5 uppercase tracking-wide'>Get in Touch</h3>
            <div className='space-y-3 mb-6'>
              <a href={`tel:${OWNER_PHONE.replace(/\s/g, '')}`} className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'>
                <HiOutlinePhone className='w-4 h-4 text-indigo-500 flex-shrink-0' />
                {OWNER_PHONE}
              </a>
              <a href={`mailto:${OWNER_EMAIL}`} className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'>
                <HiOutlineMail className='w-4 h-4 text-indigo-500 flex-shrink-0' />
                {OWNER_EMAIL}
              </a>
              <div className='flex items-start gap-2 text-slate-400 text-sm'>
                <HiOutlineLocationMarker className='w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5' />
                <span>Bathinda, Punjab — 151001</span>
              </div>
            </div>

            {/* Newsletter */}
            <p className='text-slate-500 text-xs mb-2'>Get new listings in your inbox</p>
            <form onSubmit={handleSubscribe} className='flex gap-2'>
              <input
                type='email'
                placeholder='your@email.com'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
              />
              <button
                type='submit'
                disabled={loading}
                className='px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap'
              >
                {loading ? '…' : 'Join'}
              </button>
            </form>
            {subStatus.message && (
              <p className={`mt-2 text-xs ${subStatus.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {subStatus.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className='border-t border-slate-800'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-slate-600 text-xs'>
          <span>© 2026 Real Vista. All rights reserved.</span>
          <div className='flex gap-5'>
            <span className='hover:text-slate-400 cursor-default'>Privacy Policy</span>
            <span className='hover:text-slate-400 cursor-default'>Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
