import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HiOutlineSearch, HiOutlineOfficeBuilding, HiOutlineShieldCheck,
  HiOutlineUserGroup, HiOutlineTrendingUp, HiOutlinePhone, HiOutlineMail,
  HiOutlineClipboardList, HiOutlineCalendar, HiOutlineChartBar,
  HiOutlineLightningBolt, HiX, HiOutlineCheck, HiOutlineDocumentText,
  HiOutlineLocationMarker, HiOutlineArrowRight, HiOutlineClock,
  HiOutlineChat, HiOutlineAdjustments, HiCheckCircle, HiOutlineGlobe,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import usePageTitle from '../hooks/usePageTitle';
import { CTA_DEMO, CTA_BROWSE, OWNER_PHONE, OWNER_EMAIL } from '../utils/marketingCopy';
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
const CAPABILITIES = [
  {
    title: 'Each agency sees only its own book',
    body: 'Every record carries a workspace id enforced at the database layer, not by a filter someone might forget to write. A query with no workspace context fails rather than returning a neighbour\u2019s listings.',
  },
  {
    title: 'Share a shortlist without giving away the book',
    body: 'A share link carries only the fields you chose to expose, expires on a date you set, can take a passcode, counts its own views, and can be revoked without destroying the audit trail.',
  },
  {
    title: 'Paperwork buyers ask for by name',
    body: 'RERA certificates, sanctioned layouts, approval letters and brochures are stored as typed documents, so "is this project RERA registered?" is a field rather than a hunt through attachments.',
  },
  {
    title: 'Your pipeline, your stage names',
    body: 'Sales stages, the screens in the sidebar, the fields on a property and your brand colours are configuration for each workspace, not a fork of the codebase.',
  },
];

/* Section-specific photography. Descriptive seeds keep each image stable
   across reloads so the layout never shifts between visits. */
const IMG = {
  hero: 'https://picsum.photos/seed/realvista-apartment-tower-dusk/1280/1440',
  seekers: 'https://picsum.photos/seed/realvista-residential-street-india/1200/900',
  workflow: 'https://picsum.photos/seed/realvista-agency-desk-planning/1200/800',
};

export default function Home() {
  const { t } = useTranslation();
  usePageTitle();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', teamSize: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState('');
  const [submitMsg, setSubmitMsg] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    navigate(searchTerm.trim() ? `/search?searchTerm=${encodeURIComponent(searchTerm.trim())}` : '/search');
  };

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
    <main className='font-sans bg-slate-950'>

      {/*
        PAGE THEME LOCK: this marketing page is dark end to end. It previously
        ran dark hero, dark strip, white, near-black, light grey, white, brand.
        Four theme flips in one scroll reads as four different websites. Section
        separation now comes from tonal steps inside one family (slate-950 to
        slate-900) plus imagery, never from inverting the page.
      */}

      {/* ── HERO ─ asymmetric split: copy left, real photography right ───────── */}
      <section className='relative min-h-[92dvh] flex flex-col justify-center overflow-hidden border-b border-white/10'>
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,_rgba(43,111,170,0.30),_transparent_55%)] pointer-events-none' aria-hidden='true' />

        <div className='relative max-w-7xl mx-auto px-4 pt-24 pb-16 w-full'>
          <div className='grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-20 items-center'>

            {/*
              HERO STACK: exactly four text elements. The outcome-badge row and
              the "trusted by 54 agencies" avatar strip that used to sit here
              have moved to their own sections below, where social proof
              belongs. A hero is one message and one action.
            */}
            <div>
              <p className='inline-flex items-center gap-2 bg-brand-500/15 text-brand-200 border border-brand-400/25 px-4 py-1.5 rounded-full text-sm font-semibold mb-7'>
                <HiOutlineLightningBolt className='w-3.5 h-3.5' aria-hidden='true' />{t('home.propertyManagementAndCrm')}</p>

              <h1 className='text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-[1.05] tracking-[-0.03em] text-balance'>{t('home.sellFaster')}<span className='text-brand-300'>{t('home.manageSmarter')}</span>
              </h1>

              <p className='text-lg text-slate-300 mb-9 leading-relaxed max-w-[52ch] text-pretty'>{t('home.verifiedListingsForBuyersAndA')}</p>

              <div className='flex flex-col sm:flex-row gap-3'>
                <button
                  onClick={openModal}
                  className='bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white px-7 py-3.5 rounded-xl font-semibold transition-[background-color,transform] duration-200 inline-flex items-center justify-center gap-2 text-base whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'
                >
                  <HiOutlineCalendar className='w-5 h-5' aria-hidden='true' />
                  {CTA_DEMO}
                </button>
                <Link
                  to='/search'
                  className='border border-white/15 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white px-7 py-3.5 rounded-xl font-semibold transition-[background-color,transform] duration-200 inline-flex items-center justify-center gap-2 text-base whitespace-nowrap'
                >
                  <HiOutlineSearch className='w-5 h-5' aria-hidden='true' />
                  {CTA_BROWSE}
                </Link>
              </div>
            </div>

            {/* Real photography, not a div-built fake dashboard. The search
                panel overlaps the image edge so the two read as one object. */}
            <div className='relative'>
              <div className='relative rounded-3xl overflow-hidden aspect-[4/5] max-h-[32rem] w-full border border-white/10'>
                <img
                  src={IMG.hero}
                  alt={t('home.apartmentTowersAtDuskInA')}
                  className='w-full h-full object-cover'
                  width='1280'
                  height='1440'
                />
                <div className='absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent' aria-hidden='true' />
              </div>

              <div className='relative sm:absolute sm:-bottom-7 sm:left-5 sm:right-5 mt-4 sm:mt-0 bg-slate-900/92 border border-white/10 rounded-2xl p-5 backdrop-blur-md shadow-xl'>
                <form onSubmit={handleSearch}>
                  <label htmlFor='hero-search' className='block text-white/75 text-sm font-medium mb-2'>{t('home.findYourNextProperty')}</label>
                  <div className='flex gap-2'>
                    <div className='flex-1 relative'>
                      <HiOutlineSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-white/45 w-4 h-4' aria-hidden='true' />
                      <input
                        id='hero-search'
                        type='text'
                        placeholder={t('home.cityAreaOrPropertyType')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className='w-full pl-9 pr-3 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-white/45 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/40 transition-colors'
                      />
                    </div>
                    <button
                      type='submit'
                      aria-label={t('home.searchProperties')}
                      className='bg-brand-600 hover:bg-brand-700 active:scale-95 text-white px-5 py-3 rounded-xl transition-[background-color,transform] duration-200'
                    >
                      <HiOutlineSearch className='w-4 h-4' aria-hidden='true' />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ─ lives under the hero, never inside it ─────────────── */}
      <section className='bg-slate-900 border-b border-white/5 py-10'>
        {/*
          This strip used to read "Trusted by 54 agencies across India" beside
          four invented initials. There is no such customer list to point at,
          so it now states what the software does. Every item is a feature in
          the codebase, not a promise about market traction.
        */}
        <div className='max-w-7xl mx-auto px-4'>
          <ul className='flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-slate-400 text-sm'>
            {[
              { icon: HiOutlineShieldCheck, text: 'RERA documents stored by type' },
              { icon: HiOutlineGlobe, text: 'Listings reviewed before publishing' },
              { icon: HiOutlineClock, text: 'Share links expire and can be revoked' },
              { icon: HiCheckCircle, text: 'Each workspace isolated at the database' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className='flex items-center gap-2'>
                <Icon className='w-4 h-4 text-brand-400 flex-shrink-0' aria-hidden='true' />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FOR SEEKERS ─ split with image, layout family used once ──────────── */}
      <section className='py-24 bg-slate-950'>
        <div className='max-w-7xl mx-auto px-4'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center'>

            <div className='order-2 lg:order-1 relative'>
              <div className='rounded-3xl overflow-hidden aspect-[4/3] border border-white/10'>
                <img
                  src={IMG.seekers}
                  alt={t('home.aResidentialStreetOfLowRise')}
                  className='w-full h-full object-cover'
                  width='1200'
                  height='900'
                  loading='lazy'
                />
              </div>
              {/*
                These tiles carried invented inventory counts (184 apartments,
                76 villas...). The real counts are not reachable here anyway:
                the property book requires a session, so an anonymous visitor's
                page has no honest number to print. They are now what they
                should always have been, which is navigation.
              */}
              <nav aria-label={t('home.browseByPropertyType')} className='grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden lg:-mt-10 lg:mx-6 relative'>
                {['Apartments', 'Villas', 'Commercial', 'Plots'].map((label) => (
                  <Link
                    key={label}
                    to={`/search?searchTerm=${encodeURIComponent(label)}`}
                    className='bg-slate-900 hover:bg-slate-800 px-4 py-5 text-center text-sm font-medium text-slate-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400'
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className='order-1 lg:order-2'>
              <h2 className='text-4xl font-extrabold text-white mb-5 leading-[1.1] tracking-[-0.02em] text-balance'>{t('home.findTheRightProperty')}<span className='text-brand-300'>{t('home.withoutTheNoise')}</span>
              </h2>
              <p className='text-slate-400 text-lg mb-9 leading-relaxed max-w-[56ch] text-pretty'>{t('home.everyListingIsReviewedBeforeIt')}</p>

              <ul className='space-y-5 mb-9'>
                {[
                  { icon: HiOutlineSearch, title: 'Smart filters', desc: 'City, budget, BHK, furnishing, and twenty more attributes.' },
                  { icon: HiOutlineLocationMarker, title: 'Map view', desc: 'Explore neighbourhoods, amenities, and commute distances.' },
                  { icon: HiOutlineShieldCheck, title: 'Verified listings', desc: 'Manually reviewed before publishing. No ghost listings.' },
                  { icon: HiOutlineChat, title: 'Direct agent contact', desc: 'Message the listing agent. No intermediaries.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <li key={title} className='flex items-start gap-4'>
                    <span className='w-9 h-9 bg-brand-500/15 ring-1 ring-brand-400/25 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5'>
                      <Icon className='w-4 h-4 text-brand-300' aria-hidden='true' />
                    </span>
                    <span>
                      <span className='block font-semibold text-white text-sm mb-0.5'>{title}</span>
                      <span className='block text-slate-400 text-sm leading-relaxed text-pretty'>{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                to='/search'
                className='inline-flex items-center gap-2 border border-white/15 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white px-7 py-3 rounded-xl font-semibold transition-[background-color,transform] duration-200 whitespace-nowrap'
              >
                {CTA_BROWSE}
                <HiOutlineArrowRight className='w-4 h-4' aria-hidden='true' />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── OUTCOMES ─ full-width band, breaks the split-layout run ──────────── */}
      <section className='py-20 bg-slate-900 border-y border-white/5'>
        <div className='max-w-7xl mx-auto px-4'>
          <h2 className='text-3xl font-extrabold text-white mb-3 tracking-[-0.02em] text-balance max-w-[24ch]'>{t('home.thePartsThatAreHardTo')}</h2>
          <p className='text-slate-400 mb-12 max-w-[58ch] text-pretty'>{t('home.askAboutAnyOfTheseOn')}</p>

          <dl className='grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10'>
            {CAPABILITIES.map(({ title, body }) => (
              <div key={title} className='border-t border-white/15 pt-5'>
                <dt className='text-white font-bold text-lg mb-2 text-balance'>{title}</dt>
                <dd className='text-slate-400 leading-relaxed text-pretty max-w-[54ch]'>{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── CRM CAPABILITIES ─ asymmetric bento, six items, six cells ────────── */}
      <section className='py-24 bg-slate-950'>
        <div className='max-w-7xl mx-auto px-4'>
          <div className='max-w-[34ch] mb-14'>
            <h2 className='text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-[1.05] tracking-[-0.03em] text-balance'>{t('home.theCrmThatMovesAsFast')}</h2>
            <p className='text-slate-400 text-lg text-pretty max-w-[52ch]'>{t('home.spreadsheetsWhatsappThreadsAndStickyNotes')}</p>
          </div>

          {/*
            Bento with rhythm: the lead tile spans two columns and carries a
            photograph, so the grid is not six identical text cards. Six items,
            six cells, no empty tiles.
          */}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            <article className='md:col-span-2 relative rounded-2xl overflow-hidden border border-white/10 min-h-[16rem] flex'>
              <img
                src={IMG.workflow}
                alt=''
                aria-hidden='true'
                className='absolute inset-0 w-full h-full object-cover'
                width='1200'
                height='800'
                loading='lazy'
              />
              <div className='absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/40' aria-hidden='true' />
              <div className='relative p-7 flex flex-col justify-end max-w-md'>
                <span className='w-10 h-10 bg-brand-500/20 ring-1 ring-brand-400/30 rounded-xl flex items-center justify-center mb-5'>
                  <HiOutlineClipboardList className='w-5 h-5 text-brand-300' aria-hidden='true' />
                </span>
                <p className='text-sm font-medium italic text-brand-300 mb-1.5'>{t('home.neverLoseALeadAgain')}</p>
                <h3 className='text-white font-bold text-lg mb-2'>{t('home.salesPipeline')}</h3>
                <p className='text-slate-300 text-sm leading-relaxed text-pretty'>{t('home.aKanbanBoardFromFirstEnquiry')}</p>
              </div>
            </article>

            {[
              { icon: HiOutlineCalendar, title: 'Tasks and calendar', tagline: 'Zero missed follow-ups.', desc: 'Assign tasks, schedule site visits, get reminders.' },
              { icon: HiOutlineChartBar, title: 'Analytics', tagline: 'Decisions with evidence.', desc: 'Revenue, conversion, agent performance and source attribution.' },
              { icon: HiOutlineDocumentText, title: 'Documents', tagline: 'Paperwork handled.', desc: 'KYC, agreements and property docs. Branded client reports.' },
              { icon: HiOutlineOfficeBuilding, title: 'Listings and owners', tagline: 'One source of truth.', desc: 'Your whole portfolio and every owner relationship in one place.' },
              { icon: HiOutlineUserGroup, title: 'Contacts', tagline: 'Know every client.', desc: 'Interaction history, preferences and notes, linked to deals.' },
            ].map(({ icon: Icon, title, tagline, desc }) => (
              <article key={title} className='bg-slate-900 border border-white/10 hover:border-white/20 rounded-2xl p-7 transition-colors duration-200'>
                <span className='w-10 h-10 bg-brand-500/15 ring-1 ring-brand-400/25 rounded-xl flex items-center justify-center mb-5'>
                  <Icon className='w-5 h-5 text-brand-300' aria-hidden='true' />
                </span>
                <p className='text-sm font-medium italic text-brand-300 mb-1.5'>{tagline}</p>
                <h3 className='text-white font-bold text-base mb-2'>{title}</h3>
                <p className='text-slate-400 text-sm leading-relaxed text-pretty'>{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─ vertical rail, a fourth layout family ─────────────── */}
      <section className='py-24 bg-slate-900 border-y border-white/5'>
        <div className='max-w-3xl mx-auto px-4'>
          <h2 className='text-3xl lg:text-4xl font-extrabold text-white mb-14 tracking-[-0.02em] text-balance'>{t('home.upAndRunningInThreeSteps')}</h2>

          {/* The verb is the label. "Stage 1 / Stage 2 / Stage 3" adds nothing
              the order of the list does not already say. */}
          <ol className='relative border-l border-white/15 space-y-12 pl-8'>
            {[
              { icon: HiOutlineAdjustments, title: 'Onboard your team', desc: 'Add agents, import contacts and listings. We migrate the data, so there is no spreadsheet copy-paste.' },
              { icon: HiOutlineClipboardList, title: 'Manage your pipeline', desc: 'Track leads across stages, assign tasks, log calls and schedule follow-ups.' },
              { icon: HiOutlineTrendingUp, title: 'Close faster', desc: 'Find the sources that convert, repeat what works, and hit revenue targets consistently.' },
            ].map(({ icon: Icon, title, desc }) => (
              <li key={title} className='relative'>
                <span className='absolute -left-[3.05rem] top-0 w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center ring-4 ring-slate-900'>
                  <Icon className='w-4 h-4 text-white' aria-hidden='true' />
                </span>
                <h3 className='font-bold text-white text-lg mb-2'>{title}</h3>
                <p className='text-slate-400 leading-relaxed text-pretty max-w-[58ch]'>{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── STRAIGHT ANSWERS ─ replaces invented testimonials ───────────────── */}
      <section className='py-24 bg-slate-950'>
        <div className='max-w-5xl mx-auto px-4'>
          {/*
            This section used to be three testimonials: named people, named
            agencies, quoted speech, each with a metric badge. None of it was
            real. Attributing invented words to "Priya Kapoor, Director of
            Sales, KapoorHomes Realty" is a fabricated endorsement, and the
            metric badges were invented twice over.

            An early product with no referenceable customers is better served
            by answering the objections a buyer actually has. Every answer here
            is checkable. When real customers agree to be quoted, a testimonial
            wall belongs in this slot.

            Laid out as a side-by-side list rather than an accordion: four
            questions do not need to be hidden behind a click.
          */}
          <h2 className='text-3xl lg:text-4xl font-extrabold text-white mb-4 tracking-[-0.02em] text-balance'>{t('home.straightAnswers')}</h2>
          <p className='text-slate-400 mb-14 max-w-[56ch] text-pretty'>{t('home.theQuestionsAgencyOwnersAskOn')}</p>

          <dl className='grid gap-x-14 gap-y-10 md:grid-cols-2'>
            {[
              {
                q: 'How many agencies use this?',
                a: 'Not many yet, and we would rather say so than invent a number. You would be early, which means the roadmap is still open to you and support comes from the people who wrote the code.',
              },
              {
                q: 'Can another agency see our listings?',
                a: 'No. Workspace separation is enforced in the data layer, so a query that arrives without a workspace context fails instead of returning someone else\u2019s records. Support access is read-only and logged.',
              },
              {
                q: 'We already have years of data in spreadsheets.',
                a: 'Bring the CSV or Excel file you have. The importer maps your column headings onto property fields, so the sheet does not have to match a template first.',
              },
              {
                q: 'What happens if we leave?',
                a: 'Your listings and portfolio export to CSV from the screens that hold them, so the records open in any spreadsheet. Ask us for a full workspace dump and you will get one.',
              },
            ].map(({ q, a }) => (
              <div key={q} className='border-t border-white/15 pt-5'>
                <dt className='text-white font-bold text-lg mb-2 text-balance'>{q}</dt>
                <dd className='text-slate-400 leading-relaxed text-pretty'>{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className='py-24 bg-brand-900 relative overflow-hidden'>
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_30%_-10%,_rgba(111,167,221,0.28),_transparent_60%)] pointer-events-none' aria-hidden='true' />
        <div className='absolute inset-0 crm-banner-dots opacity-60 pointer-events-none' aria-hidden='true' />

        <div className='relative max-w-4xl mx-auto px-4 text-center'>
          <h2 className='text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-[1.05] tracking-[-0.03em] text-balance'>{t('home.seeItAgainstYourOwnPipeline')}</h2>
          <p className='text-brand-100 text-xl mb-10 max-w-[52ch] mx-auto text-pretty'>{t('home.a30MinuteWalkthroughMappedTo')}</p>

          <div className='flex flex-col sm:flex-row gap-3 justify-center mb-12'>
            <button
              onClick={openModal}
              className='bg-white text-brand-800 hover:bg-brand-50 active:scale-[0.98] px-9 py-4 rounded-xl font-bold text-base transition-[background-color,transform] duration-200 inline-flex items-center justify-center gap-2 whitespace-nowrap shadow-[0_10px_30px_-10px_rgba(8,31,50,0.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900'
            >
              <HiOutlineCalendar className='w-5 h-5' aria-hidden='true' />
              {CTA_DEMO}
            </button>
            <Link
              to='/search'
              className='border border-white/25 bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white px-9 py-4 rounded-xl font-bold text-base transition-[background-color,transform] duration-200 inline-flex items-center justify-center gap-2 whitespace-nowrap'
            >
              <HiOutlineSearch className='w-5 h-5' aria-hidden='true' />
              {CTA_BROWSE}
            </Link>
          </div>

          <div className='flex flex-col sm:flex-row justify-center items-center gap-x-8 gap-y-3 text-brand-100 text-sm'>
            <a href={`tel:${OWNER_PHONE.replace(/\s/g, '')}`} className='flex items-center gap-2 hover:text-white transition-colors'>
              <HiOutlinePhone className='w-4 h-4' aria-hidden='true' />
              {OWNER_PHONE}
            </a>
            <a href={`mailto:${OWNER_EMAIL}`} className='flex items-center gap-2 hover:text-white transition-colors'>
              <HiOutlineMail className='w-4 h-4' aria-hidden='true' />
              {OWNER_EMAIL}
            </a>
          </div>
        </div>
      </section>

      {/* ── DEMO DIALOG ──────────────────────────────────────────────────────── */}
      {showDemo && (
        <div
          className='fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto'
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
                <div className='text-center py-8'>
                  <div className='w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4'>
                    <HiOutlineCheck className='w-7 h-7 text-emerald-600' aria-hidden='true' />
                  </div>
                  <h3 className='text-lg font-bold text-slate-900 mb-2'>{t('home.demoRequestConfirmed')}</h3>
                  <p className='text-slate-500 text-sm mb-6'>{submitMsg}</p>
                  <div className='text-sm text-slate-500 bg-slate-50 rounded-xl p-4 text-left space-y-1.5'>
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
                        value={form.phone} onChange={handleFormChange} placeholder='+91 98431 77206'
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

                  <p className='text-xs text-slate-500 text-center'>
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
