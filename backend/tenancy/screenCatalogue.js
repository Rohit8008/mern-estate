/**
 * The catalogue of screens this product can show.
 *
 * Every screen the CRM has is declared here once. A workspace's `features` map
 * then says which of them that agency actually gets, and the sidebar is the
 * intersection of this catalogue, those flags, and the signed-in user's
 * permissions. That is what lets one deployment give a two-person agency a
 * four-item menu and an enterprise client the full product, with no branching
 * in the UI and no release to turn something on.
 *
 * ── The one rule ──────────────────────────────────────────────────────────────
 * `id` IS THE CONTRACT. Tenants enable screens by id, so renaming an id silently
 * disables that screen for every workspace that had it on. Change the label
 * freely; never change an id. To retire a screen, mark it `deprecated` and leave
 * the id in place.
 *
 * kpi-dashboard learned this the hard way — its `AllSidebarOptions` carries the
 * same warning against renaming `taskCreation`.
 */

/**
 * Sections, in the order the sidebar shows them.
 * Kept separate from the screens so ordering is one edit, not twenty.
 */
export const SCREEN_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'properties', label: 'Properties' },
  { id: 'crm', label: 'CRM' },
  { id: 'finance', label: 'Finance & Reports' },
  { id: 'admin', label: 'Admin' },
];

/**
 * @typedef {object} Screen
 * @property {string}  id           stable identifier — never rename
 * @property {string}  label        default menu label; a workspace may override it
 * @property {string}  section      one of SCREEN_SECTIONS
 * @property {string}  description  shown to an admin choosing what to enable
 * @property {string} [requires]    permission key the user also needs
 * @property {boolean}[adminOnly]   platform/workspace admins only, regardless of flags
 * @property {boolean}[core]        cannot be switched off — the product needs it
 * @property {boolean}[deprecated]  hidden from the admin picker, still honoured if on
 * @property {number}  order        position within its section
 */

/** @type {Screen[]} */
export const SCREEN_CATALOGUE = [
  // ── Overview ───────────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard',
    section: 'overview',
    description: 'Headline numbers and today\'s work for the whole agency.',
    requires: 'viewAnalytics',
    core: true,
    order: 10,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    section: 'overview',
    description: 'Charts for sales, stock movement and agent performance.',
    requires: 'viewAnalytics',
    order: 20,
  },

  // ── Properties ─────────────────────────────────────────────────────────────
  {
    id: 'properties',
    label: 'All Properties',
    section: 'properties',
    description: 'The property register — table, pipeline, cards and map views.',
    requires: 'viewListings',
    core: true,
    order: 10,
  },
  {
    id: 'categories',
    label: 'Categories',
    section: 'properties',
    description: 'Property categories and the custom fields each one collects.',
    requires: 'viewCategories',
    order: 20,
  },
  {
    id: 'createListing',
    label: 'Add Property',
    section: 'properties',
    description: 'The form for adding a single property by hand.',
    requires: 'createListing',
    core: true,
    order: 30,
  },
  {
    id: 'import',
    label: 'Import from Excel',
    section: 'properties',
    description: 'Bring a whole property list in from a spreadsheet.',
    adminOnly: true,
    order: 40,
  },

  // ── CRM ────────────────────────────────────────────────────────────────────
  {
    id: 'clients',
    label: 'Clients',
    section: 'crm',
    description: 'Buyers and enquiries, with their history and follow-ups.',
    requires: 'viewClients',
    order: 10,
  },
  {
    id: 'owners',
    label: 'Property Owners',
    section: 'crm',
    description: 'The landlords and sellers whose property you list.',
    requires: 'viewOwners',
    order: 20,
  },
  {
    id: 'pipeline',
    label: 'Sales Pipeline',
    section: 'crm',
    description: 'Deals on a board, by stage.',
    requires: 'viewClients',
    order: 30,
  },
  {
    id: 'buyers',
    label: 'Buyer Requirements',
    section: 'crm',
    description: 'What each buyer is looking for, matched against your stock.',
    requires: 'viewBuyerRequirements',
    order: 40,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    section: 'crm',
    description: 'Follow-ups and to-dos assigned across the team.',
    order: 50,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    section: 'crm',
    description: 'Site visits and appointments.',
    order: 60,
  },

  // ── Finance & Reports ──────────────────────────────────────────────────────
  {
    id: 'transactions',
    label: 'Transactions',
    section: 'finance',
    description: 'Bookings, payments and commission.',
    requires: 'viewAnalytics',
    order: 10,
  },
  {
    id: 'reports',
    label: 'Client Reports',
    section: 'finance',
    description: 'Branded property reports generated for a client.',
    requires: 'exportData',
    order: 20,
  },

  // ── Admin ──────────────────────────────────────────────────────────────────
  {
    id: 'adminPanel',
    label: 'Admin Panel',
    section: 'admin',
    description: 'Users, roles and workspace administration.',
    adminOnly: true,
    core: true,
    order: 10,
  },
  {
    id: 'settings',
    label: 'Settings',
    section: 'admin',
    description: 'Branding, locale and which screens this workspace uses.',
    adminOnly: true,
    core: true,
    order: 20,
  },
];

const BY_ID = new Map(SCREEN_CATALOGUE.map((s) => [s.id, s]));

export const SCREEN_IDS = SCREEN_CATALOGUE.map((s) => s.id);

export function getScreen(id) {
  return BY_ID.get(id) || null;
}

export function isKnownScreen(id) {
  return BY_ID.has(id);
}

/**
 * Is this screen on for the given workspace?
 *
 * An id absent from the flags map is ON. A workspace should not lose a screen
 * it already had the day feature flags are introduced, and it keeps the stored
 * map small — it records only what differs from the product default. Core
 * screens ignore the flag entirely.
 */
export function isScreenEnabled(screen, features) {
  if (!screen) return false;
  if (screen.core) return true;
  const value = features?.[screen.id];
  return value === undefined || value === null ? true : Boolean(value);
}

/**
 * The catalogue as one workspace sees it: every screen, whether it is on, and
 * the label that workspace uses for it.
 *
 * Labels are resolved here rather than in the browser so that a rename — an
 * agency calling Clients "Leads" — is one config value the whole product reads,
 * including anything that renders a menu outside this app.
 */
export function resolveScreensForTenant(tenant) {
  const features = tenant?.features instanceof Map
    ? Object.fromEntries(tenant.features)
    : tenant?.features || {};
  const labelOverrides = tenant?.settings?.navLabels || {};

  return SCREEN_CATALOGUE.map((screen) => ({
    id: screen.id,
    label: labelOverrides[screen.id] || screen.label,
    defaultLabel: screen.label,
    section: screen.section,
    description: screen.description,
    requires: screen.requires || null,
    adminOnly: Boolean(screen.adminOnly),
    core: Boolean(screen.core),
    deprecated: Boolean(screen.deprecated),
    order: screen.order,
    enabled: isScreenEnabled(screen, features),
  }));
}
