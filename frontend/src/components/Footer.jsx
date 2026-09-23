import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlinePhone, HiOutlineMail, HiOutlineLocationMarker,
  HiOutlineHome, HiOutlineSearch, HiOutlineLockClosed,
  HiOutlineCalendar, HiOutlineLightningBolt, HiOutlineOfficeBuilding,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { CTA_DEMO, CTA_BROWSE, OWNER_PHONE, OWNER_EMAIL } from '../utils/marketingCopy';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [subStatus, setSubStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setSubStatus({ type: 'error', message: 'Enter your email address to subscribe.' });
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
              <div className='w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center flex-shrink-0'>
                <HiOutlineOfficeBuilding className='w-4 h-4 text-white' />
              </div>
              <span className='text-lg font-bold'>{t('footer.realVista')}</span>
            </div>
            <p className='text-slate-400 text-sm leading-relaxed'>{t('footer.endToEndRealEstatePlatform')}</p>
            <a
              href={`mailto:${OWNER_EMAIL}`}
              className='inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors'
            >
              <HiOutlineMail className='w-4 h-4 text-brand-400 flex-shrink-0' />{t('footer.talkToTheTeam')}</a>
          </div>

          {/* Platform */}
          <div>
            <h3 className='text-sm font-semibold text-white mb-5'>{t('footer.platform')}</h3>
            <ul className='space-y-3'>
              {[
                { label: CTA_BROWSE, to: '/search',  icon: HiOutlineSearch },
                { label: 'Sign in',      to: '/sign-in', icon: HiOutlineHome },
              ].map(({ label, to, icon: Icon }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'
                  >
                    <Icon className='w-3.5 h-3.5 text-brand-400 flex-shrink-0' />
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to='/sign-up'
                  className='flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors text-sm'
                >
                  <HiOutlineLockClosed className='w-3.5 h-3.5 text-slate-600 flex-shrink-0' />{t('footer.registrationsClosed')}</Link>
              </li>
            </ul>
          </div>

          {/* For Agencies */}
          <div>
            <h3 className='text-sm font-semibold text-white mb-5'>{t('footer.forAgencies')}</h3>
            <ul className='space-y-3'>
              {[
                'Pipeline Management',
                'Analytics Dashboard',
                'Task & Calendar',
                'Document Management',
                'Owner & Listing CRM',
              ].map((item) => (
                <li key={item} className='flex items-center gap-2 text-slate-400 text-sm'>
                  <HiOutlineLightningBolt className='w-3.5 h-3.5 text-brand-400 flex-shrink-0' />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${OWNER_EMAIL}?subject=Demo request, Real Vista`}
              className='inline-flex items-center gap-2 mt-5 text-sm text-brand-300 hover:text-brand-200 transition-colors font-medium'
            >
              <HiOutlineCalendar className='w-4 h-4' />
              {CTA_DEMO}
            </a>
          </div>

          {/* Contact & Newsletter */}
          <div>
            <h3 className='text-sm font-semibold text-white mb-5'>{t('footer.getInTouch')}</h3>
            <div className='space-y-3 mb-6'>
              <a href={`tel:${OWNER_PHONE.replace(/\s/g, '')}`} className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'>
                <HiOutlinePhone className='w-4 h-4 text-brand-400 flex-shrink-0' />
                {OWNER_PHONE}
              </a>
              <a href={`mailto:${OWNER_EMAIL}`} className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'>
                <HiOutlineMail className='w-4 h-4 text-brand-400 flex-shrink-0' />
                {OWNER_EMAIL}
              </a>
              <div className='flex items-start gap-2 text-slate-400 text-sm'>
                <HiOutlineLocationMarker className='w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5' />
                <span>{t('footer.bathindaPunjab151001')}</span>
              </div>
            </div>

            {/* Newsletter */}
            <p className='text-slate-500 text-xs mb-2'>{t('footer.getNewListingsInYourInbox')}</p>
            <form onSubmit={handleSubscribe} className='flex gap-2'>
              <input
                type='email'
                placeholder={t('footer.yourEmailCom')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent'
              />
              <button
                type='submit'
                disabled={loading}
                className='px-3 py-2 bg-brand-600 hover:bg-brand-500 active:scale-95 text-white rounded-lg text-sm font-medium transition-[background-color,transform] duration-200 disabled:opacity-50 whitespace-nowrap'
              >
                {loading ? '…' : 'Join'}
              </button>
            </form>
            {subStatus.message && (
              <p role='status' className={`mt-2 text-xs ${subStatus.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {subStatus.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className='border-t border-slate-800'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-slate-600 text-xs'>
          <span>{t('footer.2026RealVistaAllRightsReserved')}</span>
          <nav aria-label={t('footer.legal')} className='flex gap-5'>
            <Link to='/download' className='hover:text-slate-300 transition-colors'>{t('footer.androidApp')}</Link>
            <Link to='/privacy' className='hover:text-slate-300 transition-colors'>{t('footer.privacyPolicy')}</Link>
            <Link to='/terms' className='hover:text-slate-300 transition-colors'>{t('footer.termsOfService')}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
