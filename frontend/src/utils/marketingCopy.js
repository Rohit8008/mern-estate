/**
 * Shared copy for the public marketing surface.
 *
 * ONE LABEL PER INTENT. The landing page and footer between them previously
 * offered "Get a Demo", "Schedule a Free Demo", "Get a Free Demo", "Request
 * Demo" and "Request a Demo" for a single action, plus "Browse Properties" and
 * "Browse All Listings" for another. Five names for one button reads as five
 * different offers, and it splits analytics across labels that mean the same
 * thing. Import from here rather than typing a variant.
 */

export const CTA_DEMO = 'Book a demo';
export const CTA_BROWSE = 'Browse properties';

export const OWNER_PHONE = '+91 62839 30283';
export const OWNER_EMAIL = 'mittalrohit701@gmail.com';

/**
 * Who is behind the product, as printed on the legal pages and the footer.
 *
 * ONE place, because a legal page that names a different address from the
 * footer is worse than one that names none. Fields left null are not printed —
 * never fill one with a guess. The owner must supply:
 *   - legalName: the registered name (proprietorship, LLP or company) that
 *     contracts with agencies and issues invoices;
 *   - address: the full registered postal address (the city alone is not an
 *     address anyone can serve a notice to);
 *   - gstin / cin: once registered;
 *   - grievanceOfficer.name: the person who answers privacy requests. The DPDP
 *     Act and the IT Rules 2021 expect a named contact, not only an inbox.
 */
export const BUSINESS = {
  tradeName: 'Real Vista',
  legalName: null,
  address: 'Bathinda, Punjab 151001, India',
  email: OWNER_EMAIL,
  phone: OWNER_PHONE,
  gstin: null,
  cin: null,
  grievanceOfficer: { name: null, email: OWNER_EMAIL },
};
