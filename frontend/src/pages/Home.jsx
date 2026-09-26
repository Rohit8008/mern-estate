import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlinePhone, HiOutlineMail, HiOutlineCalendar, HiX, HiOutlineCheck,
  HiOutlineInboxIn, HiOutlineBell, HiOutlineDocumentText, HiOutlineLink,
  HiOutlineShieldCheck, HiOutlineAdjustments,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import usePageTitle from '../hooks/usePageTitle';
import { CTA_DEMO, OWNER_PHONE, OWNER_EMAIL } from '../utils/marketingCopy';
import DealJourney from '../components/landing/DealJourney';
import { useTranslation } from 'react-i18next';

/**
 * Tailwind scans source files as plain text, so a class built by interpolation
 * (`text-${color}-400`) is never emitted into the stylesheet. Every coloured
 * number, icon chip and avatar on this page was written that way and was
 * rendering with no colour at all. Colour choices here are complete literal
 * strings, which is what the scanner needs to see.
 *
 * The page commits to ONE accent (brand petrol blue) on a locked dark theme.
 * Emerald survives in exactly one role: a positive, verified state.
 */

/**
 * CLAIMS POLICY FOR THIS PAGE.
 *
 * Everything stated here describes something the software actually does, and
 * each item can be traced to code. There are deliberately no performance
 * statistics ("38% faster deal closure", "2.7x more leads"), no customer
 * counts, and no attributed testimonials, because none of those could be
 * substantiated, and presenting unmeasured figures as medians is a misleading
 * advertisement under the Consumer Protection Act 2019 rather than a design
 * choice. A capability a buyer can verify in a demo persuades better than a
 * percentage they have no reason to believe.
 *
 * If real, measured figures or consenting named customers exist later, they
 * belong here, with a source.
 */
/* The book: what an agent gets between the first call and the registry
   office. Copy is in the locale files under landing.book.items; each key maps
   to code (portal import + phone-key dedupe, tasks and lead scoring, typed
   documents, share links, tenant isolation, per-workspace config). */
const BOOK_ITEMS = [
  { key: 'enquiries', icon: HiOutlineInboxIn },
  { key: 'followUps', icon: HiOutlineBell },
  { key: 'paperwork', icon: HiOutlineDocumentText },
  { key: 'sharing', icon: HiOutlineLink },
  { key: 'isolation', icon: HiOutlineShieldCheck },
  { key: 'yourWay', icon: HiOutlineAdjustments },
];

const FAQ_KEYS = ['howMany', 'otherAgency', 'spreadsheets', 'leaving'];

export default function Home() {
  const { t } = useTranslation();
  usePageTitle();
  const [showDemo, setShowDemo] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', teamSize: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState('');
  const [submitMsg, setSubmitMsg] = useState('');

  const handleFormChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitState('');
    try {
      const res = await apiClient.post('/contact', form);
      setSubmitState('success');
      setSubmitMsg(res.message || "We'll be in touch within 24 hours.");
      setForm({ name: '', email: '', phone: '', company: '', teamSize: '', message: '' });
    } catch (err) {
      setSubmitState('error');
      setSubmitMsg(err.message || "We couldn't send your request. Please try again, or email us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const successRef = useRef(null);

  // The submit button that had focus is replaced by the confirmation; without
  // this, focus drops to <body> and a screen reader hears nothing.
  useEffect(() => {
    if (submitState === 'success') successRef.current?.focus();
  }, [submitState]);

  const closeModal = useCallback(() => {
    setShowDemo(false);
    setSubmitState('');
    setSubmitMsg('');
  }, []);

  const openModal = (e) => {
    openerRef.current = e.currentTarget;
    setShowDemo(true);
  };

  /**
   * A dialog you cannot dismiss with Escape, that lets the page scroll behind
   * it, and that drops keyboard focus back at the top of the document is a
   * dialog only a mouse user can operate. Tab is kept inside the panel while
   * it is open, and focus returns to whichever button opened it on close.
   */
  useEffect(() => {
    if (!showDemo) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    const opener = openerRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.querySelector('input, button')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [showDemo, closeModal]);

  return (
    <main className='font-sans bg-[#f3f5f4] text-brand-950'>
      {/*
        Light, one family: mist page, white panels, petrol ink, and marigold in
        exactly one place, the deal journey. It replaced a dark page of stock
        fog photographs whose hero pushed "Browse properties", which needs a
        session since anonymous browsing was removed.
      */}

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className='pt-28 pb-20 lg:pt-36 lg:pb-28'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-12 lg:gap-10 items-start'>
          <div className='lg:col-span-6 xl:col-span-6 lg:pt-10'>
            <h1 className='font-display font-bold text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.08] tracking-[-0.02em] text-brand-950 text-balance max-w-[13ch]'>
              {t('landing.heroTitle')}
            </h1>
            <p className='mt-7 text-lg sm:text-xl leading-relaxed text-slate-600 max-w-[46ch] text-pretty'>
              {t('landing.heroBody')}
            </p>
            <div className='mt-10 flex flex-col sm:flex-row gap-3'>
              <button
                onClick={openModal}
                className='inline-flex items-center justify-center gap-2 rounded-full bg-brand-800 hover:bg-brand-900 active:scale-[0.98] text-white px-7 py-3.5 font-semibold transition-[background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f5f4]'
              >
                <HiOutlineCalendar className='w-5 h-5' aria-hidden='true' />
                {CTA_DEMO}
              </button>
              <Link
                to='/sign-in'
                className='inline-flex items-center justify-center rounded-full border border-brand-950/15 bg-white hover:bg-slate-50 active:scale-[0.98] text-brand-950 px-7 py-3.5 font-semibold transition-[background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f5f4]'
              >
                {t('landing.signIn')}
              </Link>
            </div>
            <p className='mt-6 text-sm text-slate-600 max-w-[46ch] text-pretty'>
              {t('landing.inviteNote')}{' '}
              <Link to='/download' className='font-medium text-brand-700 hover:underline'>{t('landing.getAndroidApp')}</Link>
            </p>
          </div>

          <div className='lg:col-span-6 xl:col-span-5 xl:col-start-8'>
            <DealJourney />
          </div>
        </div>
      </section>

      {/* ── THE BOOK ─────────────────────────────────────────────────────────── */}
      <section className='bg-white border-y border-brand-950/5 py-20 lg:py-28'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-12'>
          <div className='lg:col-span-4'>
            <div className='lg:sticky lg:top-28'>
              <h2 className='font-display font-bold text-3xl lg:text-4xl leading-[1.1] tracking-[-0.015em] text-balance'>
                {t('landing.book.title')}
              </h2>
              <p className='mt-5 text-lg text-slate-600 leading-relaxed max-w-[36ch] text-pretty'>{t('landing.book.body')}</p>
            </div>
          </div>
          <ul className='lg:col-span-8 grid sm:grid-cols-2 gap-x-12 gap-y-14'>
            {BOOK_ITEMS.map(({ key, icon: Icon }) => (
              <li key={key}>
                <div className='w-12 h-12 rounded-2xl bg-brand-50 ring-1 ring-brand-100 text-brand-700 flex items-center justify-center'>
                  <Icon className='w-6 h-6' aria-hidden='true' />
                </div>
                <h3 className='mt-5 font-display font-bold text-xl leading-snug tracking-[-0.01em] text-balance'>
                  {t(`landing.book.items.${key}.title`)}
                </h3>
                <p className='mt-2 text-slate-600 leading-relaxed max-w-[44ch] text-pretty'>
                  {t(`landing.book.items.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── STRAIGHT ANSWERS ─────────────────────────────────────────────────── */}
      {/*
        In place of testimonials, which were invented and have been removed.
        Every answer is checkable. When real customers agree to be quoted, a
        testimonial belongs here, with a source.
      */}
      <section className='py-20 lg:py-28'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-12'>
          <div className='lg:col-span-4'>
            <h2 className='font-display font-bold text-3xl lg:text-4xl leading-[1.1] tracking-[-0.015em] text-balance'>
              {t('home.straightAnswers')}
            </h2>
            <p className='mt-5 text-lg text-slate-600 leading-relaxed max-w-[36ch] text-pretty'>{t('home.theQuestionsAgencyOwnersAskOn')}</p>
          </div>
          <dl className='lg:col-span-8 divide-y divide-brand-950/10 border-y border-brand-950/10'>
            {FAQ_KEYS.map((key) => (
              <div key={key} className='py-7 grid md:grid-cols-5 gap-3 md:gap-10'>
                <dt className='md:col-span-2 font-display font-bold text-lg leading-snug text-balance'>{t(`landing.faq.${key}.q`)}</dt>
                <dd className='md:col-span-3 text-slate-600 leading-relaxed text-pretty'>{t(`landing.faq.${key}.a`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── CLOSING ──────────────────────────────────────────────────────────── */}
      <section className='bg-brand-950 text-white'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-24 grid lg:grid-cols-12 gap-10 items-end'>
          <div className='lg:col-span-7'>
            <h2 className='font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.08] tracking-[-0.02em] text-balance max-w-[16ch]'>
              {t('home.seeItAgainstYourOwnPipeline')}
            </h2>
            <p className='mt-6 text-lg text-brand-100 max-w-[44ch] text-pretty'>{t('home.a30MinuteWalkthroughMappedTo')}</p>
          </div>
          <div className='lg:col-span-5 lg:justify-self-end flex flex-col gap-6'>
            <button
              onClick={openModal}
              className='inline-flex items-center justify-center gap-2 rounded-full bg-white hover:bg-brand-50 active:scale-[0.98] text-brand-950 px-8 py-4 font-semibold transition-[background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950'
            >
              <HiOutlineCalendar className='w-5 h-5' aria-hidden='true' />
              {CTA_DEMO}
            </button>
            <div className='flex flex-col sm:flex-row lg:flex-col gap-3 text-brand-100'>
              <a href={`tel:${OWNER_PHONE.replace(/\s/g, '')}`} className='inline-flex items-center gap-2 hover:text-white transition-colors'>
                <HiOutlinePhone className='w-4 h-4' aria-hidden='true' />
                {OWNER_PHONE}
              </a>
              <a href={`mailto:${OWNER_EMAIL}`} className='inline-flex items-center gap-2 hover:text-white transition-colors'>
                <HiOutlineMail className='w-4 h-4' aria-hidden='true' />
                {OWNER_EMAIL}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── DEMO DIALOG ──────────────────────────────────────────────────────── */}
      {showDemo && (
        <div
          className='fixed inset-0 !mt-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto'
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            ref={dialogRef}
            role='dialog'
            aria-modal='true'
            aria-labelledby='demo-dialog-title'
            className='bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 overflow-hidden'
          >
            <div className='bg-brand-800 px-6 py-5 flex items-start justify-between gap-4'>
              <div>
                <h2 id='demo-dialog-title' className='flex items-center gap-2 text-white font-bold text-lg mb-1'>
                  <HiOutlineCalendar className='w-5 h-5 flex-shrink-0' aria-hidden='true' />
                  {CTA_DEMO}
                </h2>
                {/* One separator per line, not three. */}
                <p className='text-brand-100 text-sm'>{t('home.30MinutesNoCommitment')}</p>
              </div>
              <button
                onClick={closeModal}
                aria-label={t('home.closeDialog')}
                className='text-white/60 hover:text-white p-1 rounded-lg transition-colors mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
              >
                <HiX className='w-5 h-5' aria-hidden='true' />
              </button>
            </div>

            <div className='px-6 py-6'>
              {submitState === 'success' ? (
                <div className='text-center py-8' role='status'>
                  <div className='w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4'>
                    <HiOutlineCheck className='w-7 h-7 text-emerald-600' aria-hidden='true' />
                  </div>
                  <h3 ref={successRef} tabIndex={-1} className='text-lg font-bold text-slate-900 mb-2 focus:outline-none'>{t('home.demoRequestConfirmed')}</h3>
                  <p className='text-slate-600 text-sm mb-6'>{submitMsg}</p>
                  <div className='text-sm text-slate-600 bg-slate-50 rounded-xl p-4 text-left space-y-1.5'>
                    <p>{t('home.weWillReachOutWithin')}<strong className='text-slate-700'>{t('home.24Hours')}</strong>{t('home.toConfirmATime')}</p>
                    <p>{t('home.soonerIsFineTooCall')}<strong className='text-slate-700'>{OWNER_PHONE}</strong>.</p>
                  </div>
                  <button onClick={closeModal} className='mt-6 text-brand-700 font-semibold text-sm hover:underline'>{t('home.close')}</button>
                </div>
              ) : (
                <form onSubmit={handleDemoSubmit} className='space-y-4'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <div>
                      <label htmlFor='demo-name' className='block text-xs font-semibold text-slate-700 mb-1.5'>{t('home.fullName')}</label>
                      <input
                        id='demo-name' name='name' autoComplete='name' value={form.name} onChange={handleFormChange} required placeholder={t('home.rahulMehta')}
                        className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
                      />
                    </div>
                    <div>
                      <label htmlFor='demo-email' className='block text-xs font-semibold text-slate-700 mb-1.5'>{t('home.businessEmail')}</label>
                      <input
                        id='demo-email' name='email' type='email' autoComplete='email' value={form.email} onChange={handleFormChange} required placeholder={t('home.rahulAgencyCom')}
                        className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
                      />
                    </div>
                    <div>
                      <label htmlFor='demo-phone' className='block text-xs font-semibold text-slate-700 mb-1.5'>{t('home.phoneNumber')}</label>
                      <input
                        id='demo-phone' name='phone' type='tel' autoComplete='tel' inputMode='tel' pattern='[0-9+()\s-]{7,}'
                        title='Digits, spaces and + ( ) - only'
                        value={form.phone} onChange={handleFormChange} placeholder='+91 XXXXX XXXXX'
                        className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
                      />
                    </div>
                    <div>
                      <label htmlFor='demo-company' className='block text-xs font-semibold text-slate-700 mb-1.5'>{t('home.agencyName')}</label>
                      <input
                        id='demo-company' name='company' autoComplete='organization' value={form.company} onChange={handleFormChange} required placeholder={t('home.yourAgencyName')}
                        className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor='demo-team' className='block text-xs font-semibold text-slate-700 mb-1.5'>{t('home.teamSize')}</label>
                    <select
                      id='demo-team' name='teamSize' value={form.teamSize} onChange={handleFormChange}
                      className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
                    >
                      <option value=''>{t('home.selectTeamSize')}</option>
                      <option value='1-5'>{t('home.justMeOrUpTo5')}</option>
                      <option value='6-15'>{t('home.6To15Agents')}</option>
                      <option value='16-50'>{t('home.16To50Agents')}</option>
                      <option value='50+'>{t('home.moreThan50Agents')}</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor='demo-message' className='block text-xs font-semibold text-slate-700 mb-1.5'>{t('home.whatDoYouWantToSee')}</label>
                    <textarea
                      id='demo-message' name='message' value={form.message} onChange={handleFormChange} rows={3}
                      placeholder={t('home.pipelineManagementReportingDocumentHandling')}
                      className='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent'
                    />
                  </div>

                  {submitState === 'error' && (
                    <p role='alert' className='text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2'>
                      {submitMsg}
                    </p>
                  )}

                  <button
                    type='submit'
                    disabled={submitting}
                    className='w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100 text-white py-3.5 rounded-xl font-bold transition-[background-color,transform] duration-200 flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2'
                  >
                    {submitting ? (
                      <>
                        <span className='w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin' aria-hidden='true' />{t('home.sending')}</>
                    ) : (
                      <>
                        <HiOutlineCalendar className='w-4 h-4' aria-hidden='true' />
                        {CTA_DEMO}
                      </>
                    )}
                  </button>

                  {/* The notice belongs where the data is collected (DPDP Act s.5):
                      what it is for, and where the full policy is. */}
                  <p className='text-xs text-slate-600 leading-relaxed'>
                    We use these details only to arrange and follow up on your demo, and never
                    add you to a mailing list. Ask us and we delete them. See our{' '}
                    <Link to='/privacy' className='text-brand-700 font-medium underline underline-offset-2'>Privacy Policy</Link>.
                  </p>

                  <p className='text-xs text-slate-600 text-center'>
                    Or email{' '}
                    <a href={`mailto:${OWNER_EMAIL}`} className='text-brand-700 font-medium hover:underline'>{OWNER_EMAIL}</a>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
