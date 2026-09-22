import { Link } from 'react-router-dom';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import usePageTitle from '../hooks/usePageTitle';
import { useTranslation } from 'react-i18next';

/**
 * Privacy policy and terms, rendered from one component.
 *
 * The footer linked to both long before either existed — as <span>s styled to
 * look like links and going nowhere. These are the real pages behind those
 * links. The copy is a plain-language draft covering what the product actually
 * does with data; it is a starting point for counsel to review, not a
 * substitute for that review.
 */

const UPDATED = '4 August 2026';

const PRIVACY = [
  {
    heading: 'What we collect',
    body: 'Account details you give us (name, email, phone, agency), the property and contact records you create inside the workspace, and technical logs (IP address, browser, and timestamps) that we keep to spot abuse and diagnose faults.',
  },
  {
    heading: 'What we do with it',
    body: 'We use it to run the service: authenticate you, show your workspace its own records, send the notifications you have switched on, and bill your agency. We do not sell it, and we do not use your clients’ contact records to market anything to them.',
  },
  {
    heading: 'Who else sees it',
    body: 'Your records are scoped to your agency’s workspace and are not visible to other agencies on the platform. Our own staff access a workspace only to resolve a support request you have raised, and that access is read-only and logged.',
  },
  {
    heading: 'How long we keep it',
    body: 'Workspace data stays for as long as the account is open. Close the account and we delete it within 90 days, apart from records we are required to retain for tax and accounting.',
  },
  {
    heading: 'Your choices',
    body: 'You can export your data at any time from Settings, correct anything inaccurate, or ask us to delete the account outright. Write to the address at the bottom of this page and we will respond within 30 days.',
  },
  {
    heading: 'Cookies',
    body: 'We set one essential cookie to keep you signed in. There is no advertising or third-party tracking on this platform, so there is nothing else to opt out of.',
  },
];

const TERMS = [
  {
    heading: 'The agreement',
    body: 'Using Real Vista means you accept these terms on behalf of yourself and the agency you represent. If you do not accept them, do not use the service.',
  },
  {
    heading: 'Your account',
    body: 'Keep your credentials to yourself and tell us promptly if you think someone else has them. You are responsible for what happens under your login, including anything done by team members you invite.',
  },
  {
    heading: 'Acceptable use',
    body: 'Do not upload listings you have no right to market, scrape the platform, attempt to reach another agency’s workspace, or use the service to send unsolicited bulk messages. We may suspend an account that does any of these.',
  },
  {
    heading: 'Your content',
    body: 'Listings, documents and contact records you upload stay yours. You grant us only the licence needed to store, process and display them back to your team and to the recipients you deliberately share them with.',
  },
  {
    heading: 'Availability',
    body: 'We aim to keep the service running continuously but do not promise uninterrupted access. Planned maintenance is announced in advance where we can.',
  },
  {
    heading: 'Liability',
    body: 'Real Vista is a record-keeping tool, not a party to any property transaction. We are not liable for commercial decisions made on the basis of data in the platform, and our aggregate liability is limited to the fees paid in the preceding twelve months.',
  },
  {
    heading: 'Ending it',
    body: 'You may close your account at any time. We may end the agreement on 30 days’ notice, or immediately for a serious breach of the acceptable-use terms above.',
  },
];

function LegalPage({ title, intro, sections }) {
  const { t } = useTranslation();
  usePageTitle(title);

  return (
    <article className='max-w-3xl mx-auto px-4 py-16 lg:py-20'>
      <Link
        to='/'
        className='inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-10'
      >
        <HiOutlineArrowLeft className='w-4 h-4' />{t('legal.backToHome')}</Link>

      <header className='mb-10 pb-8 border-b border-slate-200'>
        <h1 className='text-4xl font-extrabold text-slate-900 tracking-[-0.03em] mb-3'>{title}</h1>
        <p className='text-slate-500 leading-relaxed max-w-[62ch] text-pretty'>{intro}</p>
        <p className='text-slate-400 text-sm mt-4 tabular-nums'>Last updated {UPDATED}</p>
      </header>

      <div className='space-y-9'>
        {sections.map(({ heading, body }) => (
          <section key={heading}>
            <h2 className='text-lg font-bold text-slate-900 mb-2'>{heading}</h2>
            <p className='text-slate-600 leading-relaxed max-w-[68ch] text-pretty'>{body}</p>
          </section>
        ))}
      </div>

      <footer className='mt-12 pt-8 border-t border-slate-200 text-sm text-slate-500'>
        Questions about this page? Email{' '}
        <a href='mailto:mittalrohit701@gmail.com' className='text-brand-700 font-medium hover:underline'>{t('legal.mittalrohit701GmailCom')}</a>
        .
      </footer>
    </article>
  );
}

export function Privacy() {
  const { t } = useTranslation();
  return (
    <LegalPage
      title={t('legal.privacyPolicy')}
      intro='What Real Vista collects, why we hold it, and what you can ask us to do with it.'
      sections={PRIVACY}
    />
  );
}

export function Terms() {
  const { t } = useTranslation();
  return (
    <LegalPage
      title={t('legal.termsOfService')}
      intro='The rules for using Real Vista, written to be read rather than skipped.'
      sections={TERMS}
    />
  );
}
