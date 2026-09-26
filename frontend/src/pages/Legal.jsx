import { Link } from 'react-router-dom';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import usePageTitle from '../hooks/usePageTitle';
import { useTranslation } from 'react-i18next';
import { BUSINESS } from '../utils/marketingCopy';

/**
 * Privacy, terms, cookies and refunds, rendered from one component.
 *
 * THE RULE FOR THIS FILE: every sentence describes what the code does today.
 * The first version promised a data export nobody could reach, a deletion that
 * only deactivated the account, "one essential cookie" where there were three,
 * and a 90-day purge that nothing performed. Each of those is a misleading
 * statement to the people the policy exists to inform. When behaviour changes,
 * change the sentence in the same commit — and bump LEGAL_UPDATED together with
 * backend/utils/legalVersion.js, which is the version people accept at sign-up.
 *
 * This is a plain-language draft for counsel to review, not a substitute for
 * that review.
 */

export const LEGAL_UPDATED = '26 September 2026';

const operator = BUSINESS.legalName ? `${BUSINESS.tradeName} (operated by ${BUSINESS.legalName})` : BUSINESS.tradeName;

const PRIVACY = [
  {
    heading: 'Who this covers, and who is responsible',
    body: [
      `${operator} provides a CRM that real estate agencies use to run their business. Two different kinds of personal data pass through it, and the responsibility for each is different.`,
      'Your own account (if you are on an agency’s team) and a demo request you send us: we decide why and how that data is used, so for it we are the Data Fiduciary under the Digital Personal Data Protection Act, 2023.',
      'The records an agency keeps about its own contacts — leads, buyers, property owners: the agency decides what to collect and why, so the agency is the Data Fiduciary and we process that data on its behalf. If you are one of those contacts, the agency that holds your details is the one to ask; we will help it answer you.',
    ],
  },
  {
    heading: 'What we collect',
    list: [
      'Account details: name, email address and phone number, and anything you add to your profile (address, photo, short bio, website). Only name and email are required.',
      'The records your agency creates in its workspace: properties, owners, leads, buyer requirements, tasks, documents, messages, photos and voice notes.',
      'Security records: when you sign in or out, the IP address, browser and time, including failed sign-in attempts. We keep a list of your signed-in devices so you can end those sessions.',
      'Demo requests: the name, email, phone, agency name, team size and message you type into the form. These are emailed to us and are not stored in our database.',
    ],
    body: 'We do not collect Aadhaar numbers, dates of birth or payment card details.',
  },
  {
    heading: 'Why we use it',
    list: [
      'To run the service: sign you in, show your workspace its own records, and send the notifications you have switched on.',
      'To keep it secure: detect abuse and investigate incidents.',
      'To bill your agency and keep the accounting records the law requires.',
      'To reply to a demo request you sent us.',
    ],
    body: 'We do not sell personal data, show advertising, or use your agency’s contact records to market anything to anyone.',
  },
  {
    heading: 'Who else receives it',
    body: 'Each agency’s workspace is isolated from every other agency’s in our database. Our own staff can open a workspace in a read-only mode to resolve a support request; they cannot change records in it, and each such session is logged. The service relies on these providers, which receive only what they need to do their part:',
    list: [
      'Cloudinary — stores profile photos, property and contact photos, and voice notes you upload. Its servers may be outside India.',
      'Email delivery — messages are sent through our email provider (Google’s mail service by default), or through your agency’s own mail server if it has configured one.',
      'Map providers — when you open a map, your browser loads map images from OpenStreetMap and, for the satellite and terrain views, Esri and OpenTopoMap. They see your IP address and the area shown. Address lookups are sent from our servers to OpenStreetMap’s Nominatim service, without your IP address.',
      'cdnjs (Cloudflare) serves the map pin icons, and Pixabay serves the default profile picture. Both see your IP address when your browser loads them.',
      'Our hosting and logging providers, which run the servers and keep the operational logs described below.',
      'Services your agency chooses to connect: an agency admin can set up webhooks that send lead, deal and share events to another service. That transfer is the agency’s decision.',
    ],
  },
  {
    heading: 'Transfers outside India',
    body: 'Some of the providers above process data outside India. We do not transfer personal data to any country the Government of India has restricted under section 16 of the DPDP Act.',
  },
  {
    heading: 'How long we keep it',
    list: [
      'Your account: for as long as it is open. When you delete it, your name, email, phone, address and other profile details are removed straight away. Records you created for your agency stay with the agency, attributed to "Former team member".',
      'Security records: 180 days, then deleted automatically. Indian law (CERT-In directions, 2022) requires us to keep them that long.',
      'Notifications and search history on our servers: 90 days.',
      'An agency’s workspace: until the agency asks us to close it. We then delete its data within 90 days of that request, apart from invoices and billing records, which tax law requires us to keep.',
      'Backups: copies may remain in backups for a limited period after deletion and are not used for anything except restoring the service.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'Under the DPDP Act you can ask for a summary of the data we hold about you, have it corrected or completed, have it erased, and nominate someone to exercise these rights if you die or cannot act.',
      'You can do most of this yourself: correct your details on your Profile page, download a copy of your data from there ("Download my data"), and delete your account from the same page. For anything else, write to the contact below. We reply within 30 days.',
      'If you are unhappy with our answer, you can complain to the Data Protection Board of India.',
    ],
  },
  {
    heading: 'Security',
    body: 'Passwords are stored only as salted hashes. Session cookies cannot be read by page scripts, and in production are sent only over encrypted connections. Private messages are encrypted in our database. No system is perfectly secure; if a breach affects your data, we will tell you and the Data Protection Board as the law requires.',
  },
  {
    heading: 'Children',
    body: 'Real Vista is a business tool for people aged 18 and over. We do not knowingly process the personal data of children.',
  },
  {
    heading: 'Cookies and device storage',
    body: 'We use only the cookies and browser storage needed to keep you signed in and remember your settings. There is no advertising or analytics tracking. The Cookie Policy lists each one.',
    link: { to: '/cookies', label: 'Read the Cookie Policy' },
  },
  {
    heading: 'Changes to this policy',
    body: 'If we change this policy in a way that matters, we will update the date at the top and tell account holders before the change takes effect.',
  },
];

const TERMS = [
  {
    heading: 'The agreement',
    body: `These terms are an agreement between ${operator} and the agency that uses the service. If you use it on an agency’s behalf, you confirm that you are allowed to accept them for that agency. If you do not accept them, do not use the service.`,
  },
  {
    heading: 'Accounts',
    body: 'Accounts are created by invitation from an agency admin. Keep your password to yourself and tell us promptly if you think someone else has it. The agency is responsible for what happens under the logins of the team members it invites.',
  },
  {
    heading: 'Your agency’s responsibilities for its contacts',
    body: 'The records you keep about leads, buyers and owners are personal data that your agency controls. You are responsible for having a lawful reason to hold them, for honouring a contact’s request to stop being contacted or to have their data erased, and for any message you send them through the service — including automated follow-up emails. Real Vista gives you the tools to erase a contact’s details; using them when asked is up to you.',
  },
  {
    heading: 'Acceptable use',
    body: 'Do not upload listings you have no right to market, upload content you do not have the right to share, scrape the platform, attempt to reach another agency’s workspace, or use the service to send unsolicited bulk messages. We may suspend an account that does any of these.',
  },
  {
    heading: 'Your content',
    body: 'Listings, documents, photos and contact records you upload stay yours. You grant us only the licence needed to store, process and display them to your team and to the recipients you deliberately share them with. You confirm you have the right to upload them, including the photographs.',
  },
  {
    heading: 'Our software',
    body: 'The software, its design and the Real Vista name belong to us. These terms give you the right to use the service while your agency’s subscription is active; they do not transfer ownership of it.',
  },
  {
    heading: 'Fees',
    body: 'New workspaces start with a free trial. After that, fees are the ones set out in your agency’s invoice, payable within the period stated on it. Refunds and cancellations are covered by the Refund and Cancellation Policy.',
    link: { to: '/refunds', label: 'Read the Refund and Cancellation Policy' },
  },
  {
    heading: 'Availability',
    body: 'We aim to keep the service running continuously but do not promise uninterrupted access. We announce planned maintenance in advance where we can.',
  },
  {
    heading: 'Liability',
    body: 'Real Vista is a record-keeping tool, not a party to any property transaction, and does not verify listings, owners or documents that agencies upload. We are not liable for commercial decisions made on the basis of data in the platform. To the extent the law allows, our total liability is limited to the fees your agency paid in the twelve months before the claim.',
  },
  {
    heading: 'Ending it',
    body: 'You may close your agency’s account at any time. We may end the agreement on 30 days’ notice, or immediately for a serious breach of the acceptable-use terms above. After closure you can ask for an export of your agency’s data; we then delete it as described in the Privacy Policy.',
  },
  {
    heading: 'Changes to these terms',
    body: 'If we change these terms in a way that matters, we will tell account holders at least 30 days before the change takes effect.',
  },
  {
    heading: 'Law and disputes',
    body: 'These terms are governed by the laws of India. Disputes are subject to the courts at Bathinda, Punjab. Before going to court, write to us at the contact below and we will try to resolve it.',
  },
];

const COOKIES = [
  {
    heading: 'The short version',
    body: 'Real Vista sets three cookies, all of them needed for signing in to work. There are no advertising, analytics or social-media cookies, and nothing tracks you across other websites. Because every cookie here is strictly necessary for a service you asked for, there is no consent banner — there is nothing optional to switch off.',
  },
  {
    heading: 'Cookies',
    table: {
      head: ['Name', 'What it does', 'How long it lasts'],
      rows: [
        ['access_token', 'Proves you are signed in. Page scripts cannot read it.', 'About 15 minutes, renewed while you use the service'],
        ['refresh_token', 'Renews your sign-in without asking for your password again. Page scripts cannot read it.', '30 days, or until you sign out'],
        ['csrf_token', 'A random value that stops other websites from submitting forms as you. It identifies nobody.', '30 days, or until you sign out'],
      ],
    },
  },
  {
    heading: 'Storage in your browser',
    body: 'Some settings are kept in your browser’s local storage rather than in cookies. They never leave your device unless the app sends them to our servers as part of normal use.',
    list: [
      'Your basic profile (name, email, role), so the app can open without waiting for the server.',
      'Your language, appearance and the workspace you last signed in to.',
      'Your recent searches and saved filters.',
      'A copy of the app itself and recently viewed images, so it loads quickly.',
    ],
    after: 'Signing out removes your profile, search history, saved filters and cached images from this browser. Language, appearance and the workspace name are kept, as they say nothing about you.',
  },
  {
    heading: 'Third-party content',
    body: 'Maps load images from OpenStreetMap, Esri and OpenTopoMap, map pins from cdnjs, and the default profile picture from Pixabay. Those providers see your IP address when your browser fetches them, as with any website. They do not set cookies through Real Vista.',
  },
  {
    heading: 'Controlling cookies',
    body: 'You can delete or block cookies in your browser settings. If you block the three above, you will not be able to sign in.',
  },
];

const REFUNDS = [
  {
    heading: 'Free trial',
    body: 'New workspaces start with a 14-day free trial. We do not ask for payment details to start one, and nothing is charged when it ends.',
  },
  {
    heading: 'How billing works',
    body: 'After the trial, your agency is invoiced monthly for the plan it has chosen. There is no automatic card charge: invoices are raised by us and paid by your agency by bank transfer within the period stated on the invoice.',
  },
  {
    heading: 'Cancelling',
    body: 'You can cancel at any time by writing to the contact below. Cancellation takes effect at the end of the month you have already been invoiced for, and no further invoices are raised. You keep full access until then.',
  },
  {
    heading: 'Refunds',
    body: 'Fees for a month that has already started are not refunded when you cancel part-way through it. We refund in full:',
    list: [
      'an invoice raised in error, or a payment made twice for the same invoice;',
      'any fee paid for a month after the one in which you asked us to cancel.',
    ],
    after: 'If the service is unavailable for a significant part of a month because of a fault on our side, write to us and we will credit or refund a fair share of that month’s fee.',
  },
  {
    heading: 'How to ask for a refund',
    body: 'Write to the contact below with your agency name and the invoice number. We reply within 7 working days, and pay an approved refund to the account the payment came from within 14 days of approving it.',
  },
];

function Section({ heading, body, list, after, table, link }) {
  const paragraphs = Array.isArray(body) ? body : body ? [body] : [];
  return (
    <section>
      <h2 className='text-lg font-bold text-slate-900 mb-2'>{heading}</h2>
      <div className='space-y-3 text-slate-600 leading-relaxed max-w-[68ch] text-pretty'>
        {paragraphs.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
        {list && (
          <ul className='list-disc pl-5 space-y-2'>
            {list.map((item) => <li key={item.slice(0, 40)}>{item}</li>)}
          </ul>
        )}
        {table && (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm border border-slate-200 rounded-lg'>
              <thead className='bg-slate-100 text-slate-900'>
                <tr>{table.head.map((h) => <th key={h} scope='col' className='text-left font-semibold px-3 py-2'>{h}</th>)}</tr>
              </thead>
              <tbody className='divide-y divide-slate-200'>
                {table.rows.map(([name, ...cells]) => (
                  <tr key={name}>
                    <th scope='row' className='text-left font-mono font-medium text-slate-900 px-3 py-2 align-top whitespace-nowrap'>{name}</th>
                    {cells.map((c) => <td key={c} className='px-3 py-2 align-top'>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {after && <p>{after}</p>}
        {link && (
          <p><Link to={link.to} className='text-brand-700 font-medium underline underline-offset-2 hover:text-brand-900'>{link.label}</Link></p>
        )}
      </div>
    </section>
  );
}

/** Printed on every legal page: who we are and how to reach the person who answers. */
function BusinessDetails() {
  const rows = [
    ['Business', BUSINESS.legalName ? `${BUSINESS.legalName}, trading as ${BUSINESS.tradeName}` : BUSINESS.tradeName],
    ['Address', BUSINESS.address],
    ['GSTIN', BUSINESS.gstin],
    ['CIN', BUSINESS.cin],
    ['Phone', BUSINESS.phone],
  ].filter(([, value]) => value);

  return (
    <footer className='mt-12 pt-8 border-t border-slate-200 text-sm text-slate-600 space-y-6'>
      <div>
        <h2 className='text-base font-bold text-slate-900 mb-2'>Contact and grievances</h2>
        <p className='max-w-[68ch]'>
          Questions, privacy requests and complaints go to our grievance contact
          {BUSINESS.grievanceOfficer.name ? ` (${BUSINESS.grievanceOfficer.name})` : ''}:{' '}
          <a href={`mailto:${BUSINESS.grievanceOfficer.email}`} className='text-brand-700 font-medium underline underline-offset-2 hover:text-brand-900'>
            {BUSINESS.grievanceOfficer.email}
          </a>
          . We acknowledge within 7 days and reply in full within 30 days.
        </p>
      </div>
      <div>
        <h2 className='text-base font-bold text-slate-900 mb-2'>Business details</h2>
        <dl className='grid grid-cols-[auto,1fr] gap-x-6 gap-y-1'>
          {rows.map(([label, value]) => (
            <div key={label} className='contents'>
              <dt className='font-medium text-slate-900'>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <nav aria-label='Legal pages' className='flex flex-wrap gap-x-5 gap-y-2'>
        {[['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service'], ['/cookies', 'Cookie Policy'], ['/refunds', 'Refund and Cancellation Policy']].map(([to, label]) => (
          <Link key={to} to={to} className='text-brand-700 font-medium underline underline-offset-2 hover:text-brand-900'>{label}</Link>
        ))}
      </nav>
    </footer>
  );
}

function LegalPage({ title, intro, sections }) {
  const { t } = useTranslation();
  usePageTitle(title);

  return (
    <main className='max-w-3xl mx-auto px-4 py-16 lg:py-20'>
      <Link
        to='/'
        className='inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors mb-10'
      >
        <HiOutlineArrowLeft className='w-4 h-4' aria-hidden='true' />{t('legal.backToHome')}</Link>

      <article>
        <header className='mb-10 pb-8 border-b border-slate-200'>
          <h1 className='text-4xl font-extrabold text-slate-900 tracking-[-0.03em] mb-3'>{title}</h1>
          <p className='text-slate-600 leading-relaxed max-w-[62ch] text-pretty'>{intro}</p>
          <p className='text-slate-600 text-sm mt-4 tabular-nums'>Last updated {LEGAL_UPDATED}</p>
        </header>

        <div className='space-y-9'>
          {sections.map((section) => <Section key={section.heading} {...section} />)}
        </div>

        <BusinessDetails />
      </article>
    </main>
  );
}

export function Privacy() {
  const { t } = useTranslation();
  return (
    <LegalPage
      title={t('legal.privacyPolicy')}
      intro='What Real Vista collects, why we hold it, who else receives it, and what you can ask us to do with it.'
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

export function Cookies() {
  const { t } = useTranslation();
  return (
    <LegalPage
      title={t('legal.cookiePolicy')}
      intro='Every cookie and piece of browser storage Real Vista uses, and why.'
      sections={COOKIES}
    />
  );
}

export function Refunds() {
  const { t } = useTranslation();
  return (
    <LegalPage
      title={t('legal.refundPolicy')}
      intro='How trials, invoices, cancellations and refunds work.'
      sections={REFUNDS}
    />
  );
}
