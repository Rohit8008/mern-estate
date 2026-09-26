import { Link } from 'react-router-dom';
import {
  HiOutlinePhone, HiOutlineMail, HiOutlineLocationMarker,
  HiOutlineHome, HiOutlineSearch, HiOutlineLockClosed,
  HiOutlineCalendar, HiOutlineLightningBolt, HiOutlineOfficeBuilding,
} from 'react-icons/hi';
import { CTA_DEMO, CTA_BROWSE, OWNER_PHONE, OWNER_EMAIL, BUSINESS } from '../utils/marketingCopy';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className='bg-slate-950 text-white'>
      <div className='max-w-7xl mx-auto px-4 py-14'>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10'>

          {/* Brand */}
          <div className='space-y-5'>
            <div className='flex items-center gap-2.5'>
              <div className='w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center flex-shrink-0'>
                <HiOutlineOfficeBuilding className='w-4 h-4 text-white' aria-hidden='true' />
              </div>
              <span className='text-lg font-bold'>{t('footer.realVista')}</span>
            </div>
            <p className='text-slate-400 text-sm leading-relaxed'>{t('footer.endToEndRealEstatePlatform')}</p>
            <a
              href={`mailto:${OWNER_EMAIL}`}
              className='inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors'
            >
              <HiOutlineMail className='w-4 h-4 text-brand-400 flex-shrink-0' aria-hidden='true' />{t('footer.talkToTheTeam')}</a>
          </div>

          {/* Platform */}
          <div>
            <h2 className='text-sm font-semibold text-white mb-5'>{t('footer.platform')}</h2>
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
                    <Icon className='w-3.5 h-3.5 text-brand-400 flex-shrink-0' aria-hidden='true' />
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to='/sign-up'
                  className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'
                >
                  <HiOutlineLockClosed className='w-3.5 h-3.5 text-slate-500 flex-shrink-0' aria-hidden='true' />{t('footer.registrationsClosed')}</Link>
              </li>
            </ul>
          </div>

          {/* For Agencies */}
          <div>
            <h2 className='text-sm font-semibold text-white mb-5'>{t('footer.forAgencies')}</h2>
            <ul className='space-y-3'>
              {[
                'Pipeline Management',
                'Analytics Dashboard',
                'Task & Calendar',
                'Document Management',
                'Owner & Listing CRM',
              ].map((item) => (
                <li key={item} className='flex items-center gap-2 text-slate-400 text-sm'>
                  <HiOutlineLightningBolt className='w-3.5 h-3.5 text-brand-400 flex-shrink-0' aria-hidden='true' />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${OWNER_EMAIL}?subject=Demo request, Real Vista`}
              className='inline-flex items-center gap-2 mt-5 text-sm text-brand-300 hover:text-brand-200 transition-colors font-medium'
            >
              <HiOutlineCalendar className='w-4 h-4' aria-hidden='true' />
              {CTA_DEMO}
            </a>
          </div>

          {/* Contact & Newsletter */}
          <div>
            <h2 className='text-sm font-semibold text-white mb-5'>{t('footer.getInTouch')}</h2>
            <div className='space-y-3 mb-6'>
              <a href={`tel:${OWNER_PHONE.replace(/\s/g, '')}`} className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'>
                <HiOutlinePhone className='w-4 h-4 text-brand-400 flex-shrink-0' aria-hidden='true' />
                {OWNER_PHONE}
              </a>
              <a href={`mailto:${OWNER_EMAIL}`} className='flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm'>
                <HiOutlineMail className='w-4 h-4 text-brand-400 flex-shrink-0' aria-hidden='true' />
                {OWNER_EMAIL}
              </a>
              <div className='flex items-start gap-2 text-slate-400 text-sm'>
                <HiOutlineLocationMarker className='w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5' aria-hidden='true' />
                <span>{BUSINESS.address}</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className='border-t border-slate-800'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-slate-400 text-xs'>
          <span>{t('footer.2026RealVistaAllRightsReserved')}</span>
          <nav aria-label={t('footer.legal')} className='flex flex-wrap justify-center gap-x-5 gap-y-2'>
            <Link to='/download' className='hover:text-white transition-colors'>{t('footer.androidApp')}</Link>
            <Link to='/privacy' className='hover:text-white transition-colors'>{t('footer.privacyPolicy')}</Link>
            <Link to='/terms' className='hover:text-white transition-colors'>{t('footer.termsOfService')}</Link>
            <Link to='/cookies' className='hover:text-white transition-colors'>{t('footer.cookiePolicy')}</Link>
            <Link to='/refunds' className='hover:text-white transition-colors'>{t('footer.refundPolicy')}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
