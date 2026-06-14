import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  HiOutlineSearch, HiOutlineHome, HiOutlineOfficeBuilding,
  HiOutlineShieldCheck, HiOutlineUserGroup, HiOutlineTrendingUp,
  HiOutlinePhone, HiOutlineMail, HiStar,
  HiOutlineClipboardList, HiOutlineCalendar, HiOutlineChartBar,
  HiOutlineLightningBolt, HiX, HiOutlineCheck,
  HiOutlineDocumentText, HiOutlineCurrencyRupee, HiOutlineLocationMarker,
  HiOutlineArrowRight, HiOutlineClock, HiOutlineChat,
  HiOutlineBriefcase, HiOutlineCollection, HiOutlineAdjustments,
  HiCheckCircle, HiOutlineGlobe,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import usePageTitle from '../hooks/usePageTitle';

const OWNER_PHONE = '+91 62839 30283';
const OWNER_EMAIL = 'mittalrohit701@gmail.com';

export default function Home() {
  usePageTitle();
  const { currentUser } = useSelector((s) => s.user);
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', teamSize: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState('');
  const [submitMsg, setSubmitMsg] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (currentUser) {
      navigate(searchTerm.trim() ? `/search?searchTerm=${encodeURIComponent(searchTerm.trim())}` : '/search');
    } else {
      navigate('/sign-in');
    }
  };

  const handleFormChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitState('');
    try {
      const res = await apiClient.post('/contact', form);
      setSubmitState('success');
      setSubmitMsg(res.message || "Request received! We'll be in touch within 24 hours.");
      setForm({ name: '', email: '', phone: '', company: '', teamSize: '', message: '' });
    } catch (err) {
      setSubmitState('error');
      setSubmitMsg(err.message || 'Something went wrong. Please email us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => { setShowDemo(false); setSubmitState(''); setSubmitMsg(''); };

  return (
    <div className='font-sans'>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section className='relative bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 overflow-hidden min-h-[92vh] flex flex-col justify-center'>
        {/* Ambient glows */}
        <div className='absolute top-0 left-1/3 w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none' />
        <div className='absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none' />

        <div className='relative max-w-7xl mx-auto px-4 py-24 w-full'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-16 items-center'>

            {/* Left */}
            <div>
              <div className='inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-4 py-1.5 rounded-full text-sm font-semibold mb-7'>
                <HiOutlineLightningBolt className='w-3.5 h-3.5 text-yellow-400' />
                Property Management &amp; CRM Platform
              </div>

              <h1 className='text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-[1.1] tracking-tight'>
                Sell Faster.
                <br />
                <span className='bg-gradient-to-r from-indigo-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent'>
                  Manage Smarter.
                </span>
                <br />
                <span className='text-white/70 text-4xl lg:text-5xl font-bold'>Close More Deals.</span>
              </h1>

              <p className='text-lg text-slate-300 mb-8 leading-relaxed max-w-xl'>
                Real Vista is the end-to-end platform for modern real estate teams — verified listings for buyers, and a full-featured CRM for agencies ready to grow.
              </p>

              {/* Outcome badges */}
              <div className='flex flex-wrap gap-3 mb-10'>
                {[
                  '40% faster deal closure',
                  '3× more qualified leads',
                  '100% verified listings',
                ].map((b) => (
                  <span key={b} className='flex items-center gap-1.5 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-medium'>
                    <HiCheckCircle className='w-3.5 h-3.5' />
                    {b}
                  </span>
                ))}
              </div>

              <div className='flex flex-col sm:flex-row gap-3 mb-8'>
                <button
                  onClick={() => setShowDemo(true)}
                  className='bg-indigo-600 hover:bg-indigo-500 text-white px-7 py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-base'
                >
                  <HiOutlineCalendar className='w-5 h-5' />
                  Get a Demo — It&apos;s Free
                </button>
                <Link
                  to={currentUser ? '/search' : '/sign-in'}
                  className='border border-white/15 bg-white/5 hover:bg-white/10 text-white px-7 py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-base'
                >
                  <HiOutlineSearch className='w-5 h-5' />
                  Browse Properties
                </Link>
              </div>

              <div className='flex items-center gap-3 text-slate-500 text-sm'>
                <div className='flex -space-x-2'>
                  {['P','R','S','A'].map((l, i) => (
                    <div key={i} className={`w-7 h-7 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold ${['bg-indigo-500','bg-blue-500','bg-violet-500','bg-emerald-500'][i]} text-white`}>{l}</div>
                  ))}
                </div>
                <span>Trusted by <strong className='text-slate-300'>50+ agencies</strong> across India</span>
              </div>
            </div>

            {/* Right — search + quick stats */}
            <div className='space-y-4'>
              {/* Search card */}
              <div className='bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md'>
                <p className='text-white/60 text-sm font-medium mb-3 uppercase tracking-wide'>Find your next property</p>
                <form onSubmit={handleSearch}>
                  <div className='flex gap-2'>
                    <div className='flex-1 relative'>
                      <HiOutlineSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4' />
                      <input
                        type='text'
                        placeholder='City, area, or property type…'
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className='w-full pl-9 pr-3 py-3 bg-white/10 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-indigo-500 transition-colors'
                      />
                    </div>
                    <button type='submit' className='bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl transition-colors'>
                      <HiOutlineSearch className='w-4 h-4' />
                    </button>
                  </div>
                </form>
                <div className='flex flex-wrap gap-2 mt-3'>
                  {['Apartment','Villa','Commercial','Plot'].map((t) => (
                    <button
                      key={t}
                      onClick={() => navigate(currentUser ? `/search?searchTerm=${t}` : '/sign-in')}
                      className='text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-full transition-colors'
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mini stats */}
              <div className='grid grid-cols-2 gap-3'>
                {[
                  { v: '500+',  l: 'Active Listings',   c: 'indigo' },
                  { v: '50+',   l: 'Partner Agencies',  c: 'blue' },
                  { v: '98%',   l: 'Verified Listings', c: 'emerald' },
                  { v: '24 hr', l: 'Avg Response Time', c: 'amber' },
                ].map(({ v, l, c }) => (
                  <div key={l} className='bg-white/5 border border-white/10 rounded-xl p-4'>
                    <div className={`text-2xl font-extrabold text-${c}-400 mb-0.5`}>{v}</div>
                    <div className='text-white/50 text-xs'>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className='absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/20 text-xs animate-bounce'>
          <div className='w-4 h-7 border border-white/20 rounded-full flex items-center justify-center'>
            <div className='w-1 h-2 bg-white/30 rounded-full' />
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ───────────────────────────────────────────────────────── */}
      <section className='bg-slate-900 border-y border-slate-800 py-5'>
        <div className='max-w-7xl mx-auto px-4'>
          <div className='flex flex-wrap items-center justify-center gap-8 text-slate-500 text-sm'>
            {[
              { icon: HiOutlineShieldCheck,  text: 'RERA Verified Listings' },
              { icon: HiOutlineGlobe,        text: 'PAN India Coverage' },
              { icon: HiOutlineLightningBolt,text: 'Real-Time Updates' },
              { icon: HiOutlineClock,        text: '24-Hour Agent Response' },
              { icon: HiCheckCircle,         text: 'Data Security & Privacy' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className='flex items-center gap-2 text-slate-400'>
                <Icon className='w-4 h-4 text-indigo-500 flex-shrink-0' />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR PROPERTY SEEKERS ──────────────────────────────────────────────── */}
      <section className='py-24 bg-white'>
        <div className='max-w-7xl mx-auto px-4'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-16 items-center'>

            <div>
              <div className='inline-flex items-center gap-2 text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full text-sm font-semibold mb-5'>
                <HiOutlineHome className='w-4 h-4' />
                For Property Buyers &amp; Renters
              </div>
              <h2 className='text-4xl font-extrabold text-slate-900 mb-5 leading-tight'>
                Find the right property,
                <span className='text-indigo-600'> without the noise.</span>
              </h2>
              <p className='text-slate-500 text-lg mb-8 leading-relaxed'>
                Stop scrolling through outdated listings. Real Vista shows you only verified, up-to-date properties — with full details, photos, maps, and direct agent contact.
              </p>

              <div className='space-y-4 mb-8'>
                {[
                  { icon: HiOutlineSearch,         title: 'Smart Filters',          desc: 'Search by city, property type, budget, BHK, furnishing, and 20+ more attributes.' },
                  { icon: HiOutlineLocationMarker, title: 'Interactive Map View',   desc: 'Explore neighbourhoods, nearby amenities, and commute distances on the map.' },
                  { icon: HiOutlineShieldCheck,    title: '100% Verified Listings', desc: 'Every property is manually reviewed before going live — no ghost listings.' },
                  { icon: HiOutlineChat,           title: 'Direct Agent Contact',   desc: 'Message the listing agent instantly — no third-party intermediaries.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className='flex items-start gap-4'>
                    <div className='w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5'>
                      <Icon className='w-4 h-4 text-indigo-600' />
                    </div>
                    <div>
                      <div className='font-semibold text-slate-900 text-sm mb-0.5'>{title}</div>
                      <div className='text-slate-500 text-sm leading-relaxed'>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                to={currentUser ? '/search' : '/sign-in'}
                className='inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-7 py-3 rounded-xl font-semibold transition-colors'
              >
                Browse All Listings
                <HiOutlineArrowRight className='w-4 h-4' />
              </Link>
            </div>

            {/* Property types visual */}
            <div className='grid grid-cols-2 gap-4'>
              {[
                { icon: HiOutlineHome,           label: 'Apartments',   count: '180+', color: 'indigo' },
                { icon: HiOutlineOfficeBuilding, label: 'Villas',       count: '75+',  color: 'blue' },
                { icon: HiOutlineBriefcase,      label: 'Commercial',   count: '120+', color: 'violet' },
                { icon: HiOutlineCollection,     label: 'Plots',        count: '90+',  color: 'emerald' },
              ].map(({ icon: Icon, label, count, color }) => (
                <button
                  key={label}
                  onClick={() => navigate(currentUser ? `/search?searchTerm=${label}` : '/sign-in')}
                  className={`group bg-${color}-50 border border-${color}-100 hover:border-${color}-300 rounded-2xl p-6 text-left transition-all hover:shadow-md`}
                >
                  <div className={`w-10 h-10 bg-${color}-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-${color}-200 transition-colors`}>
                    <Icon className={`w-5 h-5 text-${color}-600`} />
                  </div>
                  <div className={`text-2xl font-extrabold text-${color}-700 mb-0.5`}>{count}</div>
                  <div className='text-slate-600 font-medium text-sm'>{label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR AGENCIES — THE CRM PITCH ─────────────────────────────────────── */}
      <section className='py-24 bg-slate-950 relative overflow-hidden'>
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/30 via-transparent to-transparent pointer-events-none' />

        <div className='relative max-w-7xl mx-auto px-4'>
          <div className='text-center mb-16'>
            <div className='inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-4 py-1.5 rounded-full text-sm font-semibold mb-5'>
              <HiOutlineOfficeBuilding className='w-4 h-4' />
              For Real Estate Agencies &amp; Teams
            </div>
            <h2 className='text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-tight'>
              The CRM that moves as fast
              <br />
              <span className='bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent'>as your team does.</span>
            </h2>
            <p className='text-slate-400 text-xl max-w-2xl mx-auto'>
              Replace your spreadsheets, WhatsApp threads, and sticky notes with one powerful platform built specifically for real estate teams.
            </p>
          </div>

          {/* Guaranteed outcomes bar */}
          <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16'>
            {[
              { v: '40%',   l: 'Faster Deal Closure',     c: 'indigo' },
              { v: '3×',    l: 'More Qualified Leads',     c: 'blue' },
              { v: '60%',   l: 'Less Admin Time',          c: 'violet' },
              { v: '97%',   l: 'Task On-time Completion',  c: 'emerald' },
            ].map(({ v, l, c }) => (
              <div key={l} className='bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/8 transition-colors'>
                <div className={`text-4xl font-extrabold text-${c}-400 mb-1`}>{v}</div>
                <div className='text-slate-400 text-sm font-medium'>{l}</div>
                <div className='mt-2 text-xs text-slate-600 italic'>Guaranteed outcome</div>
              </div>
            ))}
          </div>

          {/* CRM Feature cards */}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-14'>
            {[
              {
                icon: HiOutlineClipboardList, color: 'indigo',
                title: 'Sales Pipeline',
                tagline: 'Never lose a lead again.',
                desc: 'Visual Kanban board to move deals from inquiry to registration. Know exactly where every prospect stands, every time.',
              },
              {
                icon: HiOutlineCalendar, color: 'blue',
                title: 'Tasks & Calendar',
                tagline: 'Zero missed follow-ups.',
                desc: 'Assign tasks, schedule site visits, and get reminders. Your team always knows what to do next.',
              },
              {
                icon: HiOutlineChartBar, color: 'violet',
                title: 'Analytics Dashboard',
                tagline: 'Data-driven decisions.',
                desc: 'Track revenue, conversion rates, agent performance, and source attribution — all in real time.',
              },
              {
                icon: HiOutlineDocumentText, color: 'emerald',
                title: 'Documents & Reports',
                desc: 'Store KYC, agreements, and property docs. Send branded client reports with one click.',
                tagline: 'Paperwork handled.',
              },
              {
                icon: HiOutlineOfficeBuilding, color: 'amber',
                title: 'Listings & Owners',
                tagline: 'One source of truth.',
                desc: 'Manage your entire property portfolio and owner relationships from a single dashboard.',
              },
              {
                icon: HiOutlineUserGroup, color: 'rose',
                title: 'Contact Management',
                tagline: 'Know every client.',
                desc: 'Full contact profiles with interaction history, preferences, and notes — all linked to deals.',
              },
            ].map(({ icon: Icon, color, title, tagline, desc }) => (
              <div key={title} className='bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all hover:bg-white/8 group'>
                <div className={`w-10 h-10 bg-${color}-500/20 ring-1 ring-${color}-500/30 rounded-xl flex items-center justify-center mb-5`}>
                  <Icon className={`w-5 h-5 text-${color}-400`} />
                </div>
                <div className={`text-xs font-semibold text-${color}-400 mb-1 uppercase tracking-wide`}>{tagline}</div>
                <h3 className='text-white font-bold text-base mb-2'>{title}</h3>
                <p className='text-slate-500 text-sm leading-relaxed'>{desc}</p>
              </div>
            ))}
          </div>

          <div className='text-center'>
            <button
              onClick={() => setShowDemo(true)}
              className='bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-4 rounded-xl font-bold text-base transition-colors inline-flex items-center gap-2'
            >
              <HiOutlineCalendar className='w-5 h-5' />
              Schedule a Free Demo
            </button>
            <p className='text-slate-600 text-sm mt-3'>No credit card required · 30-minute walkthrough · Custom to your team size</p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className='py-20 bg-slate-50'>
        <div className='max-w-5xl mx-auto px-4'>
          <div className='text-center mb-14'>
            <h2 className='text-3xl lg:text-4xl font-extrabold text-slate-900 mb-3'>
              Up and running in 3 steps
            </h2>
            <p className='text-slate-500 text-lg'>From signup to your first closed deal in days, not months.</p>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
            {[
              {
                step: '01', color: 'indigo',
                icon: HiOutlineAdjustments,
                title: 'Onboard your team',
                desc: 'Add your agents, import existing contacts and listings. We migrate your data — no spreadsheet copy-paste.',
              },
              {
                step: '02', color: 'blue',
                icon: HiOutlineClipboardList,
                title: 'Manage your pipeline',
                desc: 'Track every lead across the sales stages. Assign tasks, log calls, and schedule follow-ups automatically.',
              },
              {
                step: '03', color: 'emerald',
                icon: HiOutlineTrendingUp,
                title: 'Close faster & grow',
                desc: 'Use analytics to find your best sources, replicate what works, and hit your revenue targets consistently.',
              },
            ].map(({ step, color, icon: Icon, title, desc }) => (
              <div key={step} className='relative bg-white rounded-2xl p-7 border border-slate-200 shadow-sm hover:shadow-md transition-shadow'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className={`w-8 h-8 bg-${color}-600 text-white rounded-full flex items-center justify-center text-xs font-extrabold`}>{step}</div>
                  <div className={`h-px flex-1 bg-${color}-100`} />
                  <Icon className={`w-6 h-6 text-${color}-400`} />
                </div>
                <h3 className='font-bold text-slate-900 mb-2 text-base'>{title}</h3>
                <p className='text-slate-500 text-sm leading-relaxed'>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────────── */}
      <section className='py-20 bg-white'>
        <div className='max-w-7xl mx-auto px-4'>
          <div className='text-center mb-14'>
            <h2 className='text-3xl lg:text-4xl font-extrabold text-slate-900 mb-3'>What our clients say</h2>
            <p className='text-slate-500 text-lg max-w-xl mx-auto'>Teams that switched to Real Vista closed more deals in their first 90 days.</p>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            {[
              {
                initials: 'PK', color: 'indigo',
                name: 'Priya Kapoor',
                role: 'Director of Sales',
                company: 'KapoorHomes Realty · Mumbai',
                review: 'We managed 40 listings across 3 agents with nothing but WhatsApp. Real Vista gave us a pipeline view we never had. Deal closures went up 35% in the first quarter.',
                metric: '+35% closures',
              },
              {
                initials: 'RS', color: 'blue',
                name: 'Rahul Sharma',
                role: 'Founder',
                company: 'SkyNest Properties · Pune',
                review: 'The task reminders alone saved us — no more missed site visits or forgotten follow-ups. Our team of 6 now manages what took 10 before. Absolute game changer.',
                metric: '40% less admin',
              },
              {
                initials: 'FA', color: 'violet',
                name: 'Farida Ansari',
                role: 'Senior Agent',
                company: 'Ansari Estates · Hyderabad',
                review: 'I used to spend 2 hours every morning updating spreadsheets. Now I open the dashboard and everything is there. I can focus on clients instead of paperwork.',
                metric: '2 hrs saved/day',
              },
            ].map(({ initials, color, name, role, company, review, metric }) => (
              <div key={name} className='bg-slate-50 border border-slate-100 rounded-2xl p-7 flex flex-col'>
                <div className='flex items-start justify-between mb-5'>
                  <div className='flex items-center gap-3'>
                    <div className={`w-11 h-11 bg-${color}-100 rounded-full flex items-center justify-center text-${color}-700 font-extrabold text-sm flex-shrink-0`}>
                      {initials}
                    </div>
                    <div>
                      <div className='font-bold text-slate-900 text-sm'>{name}</div>
                      <div className='text-slate-500 text-xs'>{role}</div>
                      <div className='text-slate-400 text-xs'>{company}</div>
                    </div>
                  </div>
                  <div className={`text-xs font-bold text-${color}-600 bg-${color}-50 border border-${color}-100 px-2.5 py-1 rounded-full whitespace-nowrap`}>
                    {metric}
                  </div>
                </div>
                <div className='flex gap-0.5 mb-4'>
                  {[...Array(5)].map((_, i) => <HiStar key={i} className='w-4 h-4 text-yellow-400' />)}
                </div>
                <p className='text-slate-600 text-sm leading-relaxed flex-1'>"{review}"</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className='py-20 bg-gradient-to-br from-indigo-600 to-indigo-800 relative overflow-hidden'>
        <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-600/30 via-transparent to-transparent pointer-events-none' />
        <div className='relative max-w-4xl mx-auto px-4 text-center'>
          <h2 className='text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-tight'>
            Sales Uplift Guaranteed.
          </h2>
          <p className='text-indigo-200 text-xl mb-10 max-w-2xl mx-auto'>
            See Real Vista in action with a personalised 30-minute demo. We&apos;ll show you exactly how it maps to your agency&apos;s workflow.
          </p>

          <div className='flex flex-col sm:flex-row gap-3 justify-center mb-12'>
            <button
              onClick={() => setShowDemo(true)}
              className='bg-white text-indigo-700 hover:bg-indigo-50 px-9 py-4 rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2 shadow-lg'
            >
              <HiOutlineCalendar className='w-5 h-5' />
              Get a Free Demo
            </button>
            <Link
              to={currentUser ? '/search' : '/sign-in'}
              className='border border-white/25 bg-white/10 hover:bg-white/20 text-white px-9 py-4 rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2'
            >
              <HiOutlineSearch className='w-5 h-5' />
              Browse Properties
            </Link>
          </div>

          <div className='flex flex-col sm:flex-row justify-center items-center gap-6 text-indigo-200 text-sm'>
            <a href={`tel:${OWNER_PHONE.replace(/\s/g, '')}`} className='flex items-center gap-2 hover:text-white transition-colors'>
              <HiOutlinePhone className='w-4 h-4' />
              {OWNER_PHONE}
            </a>
            <span className='hidden sm:block text-indigo-500'>|</span>
            <a href={`mailto:${OWNER_EMAIL}`} className='flex items-center gap-2 hover:text-white transition-colors'>
              <HiOutlineMail className='w-4 h-4' />
              {OWNER_EMAIL}
            </a>
          </div>
        </div>
      </section>

      {/* ── DEMO REQUEST MODAL ───────────────────────────────────────────────── */}
      {showDemo && (
        <div
          className='fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto'
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 overflow-hidden'>

            <div className='bg-gradient-to-br from-indigo-600 to-indigo-800 px-6 py-5 flex items-start justify-between'>
              <div>
                <div className='flex items-center gap-2 mb-1'>
                  <HiOutlineCalendar className='w-5 h-5 text-white' />
                  <span className='text-white font-bold text-lg'>Schedule a Free Demo</span>
                </div>
                <p className='text-indigo-200 text-sm'>30 minutes · Personalised walkthrough · No commitment</p>
              </div>
              <button onClick={closeModal} className='text-white/50 hover:text-white p-1 rounded-lg transition-colors mt-0.5'>
                <HiX className='w-5 h-5' />
              </button>
            </div>

            <div className='px-6 py-6'>
              {submitState === 'success' ? (
                <div className='text-center py-8'>
                  <div className='w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                    <HiOutlineCheck className='w-7 h-7 text-emerald-600' />
                  </div>
                  <h3 className='text-lg font-bold text-slate-900 mb-2'>Demo request confirmed!</h3>
                  <p className='text-slate-500 text-sm mb-6'>{submitMsg}</p>
                  <div className='text-sm text-slate-500 bg-slate-50 rounded-xl p-4 text-left space-y-1.5'>
                    <p>We&apos;ll reach out within <strong className='text-slate-700'>24 hours</strong> to confirm a time.</p>
                    <p>Can&apos;t wait? Call us at <strong className='text-slate-700'>{OWNER_PHONE}</strong></p>
                  </div>
                  <button onClick={closeModal} className='mt-6 text-indigo-600 font-semibold text-sm hover:underline'>Close</button>
                </div>
              ) : (
                <form onSubmit={handleDemoSubmit} className='space-y-4'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-xs font-semibold text-slate-600 mb-1.5'>Full Name *</label>
                      <input name='name' value={form.name} onChange={handleFormChange} required placeholder='Rahul Mehta'
                        className='w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                      />
                    </div>
                    <div>
                      <label className='block text-xs font-semibold text-slate-600 mb-1.5'>Business Email *</label>
                      <input name='email' type='email' value={form.email} onChange={handleFormChange} required placeholder='rahul@agency.com'
                        className='w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                      />
                    </div>
                    <div>
                      <label className='block text-xs font-semibold text-slate-600 mb-1.5'>Phone Number</label>
                      <input name='phone' value={form.phone} onChange={handleFormChange} placeholder='+91 98765 43210'
                        className='w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                      />
                    </div>
                    <div>
                      <label className='block text-xs font-semibold text-slate-600 mb-1.5'>Agency / Company *</label>
                      <input name='company' value={form.company} onChange={handleFormChange} required placeholder='Your agency name'
                        className='w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                      />
                    </div>
                  </div>

                  <div>
                    <label className='block text-xs font-semibold text-slate-600 mb-1.5'>Team Size</label>
                    <select name='teamSize' value={form.teamSize} onChange={handleFormChange}
                      className='w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
                    >
                      <option value=''>Select team size…</option>
                      <option value='1–5'>Just me / 1–5 agents</option>
                      <option value='6–15'>6–15 agents</option>
                      <option value='16–50'>16–50 agents</option>
                      <option value='50+'>50+ agents</option>
                    </select>
                  </div>

                  <div>
                    <label className='block text-xs font-semibold text-slate-600 mb-1.5'>What do you want to see?</label>
                    <textarea name='message' value={form.message} onChange={handleFormChange} rows={3}
                      placeholder='e.g. pipeline management, reporting, document handling…'
                      className='w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none'
                    />
                  </div>

                  {submitState === 'error' && (
                    <p className='text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2'>{submitMsg}</p>
                  )}

                  <button type='submit' disabled={submitting}
                    className='w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white py-3.5 rounded-xl font-bold transition-colors flex items-center justify-center gap-2'
                  >
                    {submitting ? (
                      <><div className='w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin' /> Sending…</>
                    ) : (
                      <><HiOutlineCalendar className='w-4 h-4' /> Request Demo</>
                    )}
                  </button>

                  <p className='text-xs text-slate-400 text-center'>
                    Or email us at{' '}
                    <a href={`mailto:${OWNER_EMAIL}`} className='text-indigo-500 hover:underline'>{OWNER_EMAIL}</a>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
