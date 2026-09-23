import mongoose from 'mongoose';

/**
 * A tenant is one real estate agency using the product.
 *
 * This is the only collection that is NOT tenant-scoped — it describes the
 * platform rather than any one agency's data, so `tenantScoped: false` keeps
 * the global plugin off it.
 *
 * Everything an agency can customise hangs off this document, which is what
 * makes one deployment serve many agencies that each experience it as their
 * own product: their colours, their menu, their property fields, their rules.
 */

const brandingSchema = new mongoose.Schema(
  {
    productName: { type: String, default: '', maxlength: 60 },
    logoUrl: { type: String, default: '' },
    logoMarkUrl: { type: String, default: '' }, // square mark for collapsed nav / favicon
    loginBackgroundUrl: { type: String, default: '' },

    // Design tokens. The client writes these onto :root as CSS custom
    // properties, so an agency's palette flows through every component without
    // a rebuild — the approach kpi-dashboard uses for its themes.
    tokens: {
      brand: { type: String, default: '#4f46e5' },
      brandContrast: { type: String, default: '#ffffff' },
      accent: { type: String, default: '#0ea5e9' },
      sidebar: { type: String, default: '#0f172a' },
      sidebarText: { type: String, default: '#e2e8f0' },
    },

    supportEmail: { type: String, default: '' },
    supportPhone: { type: String, default: '' },

    // Set when an admin saves the workspace branding in Settings; it is what
    // "Set up your agency" on the onboarding checklist means.
    customizedAt: { type: Date, default: null },
  },
  { _id: false }
);

const localeSchema = new mongoose.Schema(
  {
    currency: { type: String, default: 'INR', maxlength: 3 },
    // Drives price display: 'en-IN' gives lakh/crore grouping, 'en-US' gives thousands.
    numberLocale: { type: String, default: 'en-IN', maxlength: 12 },
    timezone: { type: String, default: 'Asia/Kolkata', maxlength: 64 },
    dateFormat: { type: String, default: 'dd/MM/yyyy', maxlength: 20 },
    language: { type: String, default: 'en', maxlength: 8 },
    /**
     * Country dialling code, without the plus.
     *
     * WhatsApp's click-to-chat needs a full international number and silently
     * opens an empty chat when given a local one, so a number stored as
     * "98765 43210" has to be prefixed before it is usable. Agencies type local
     * numbers; this is what turns them into something WhatsApp accepts.
     */
    dialCode: { type: String, default: '91', maxlength: 4 },

    // Land area unit an agency actually trades in — sq. yard in Punjab/Haryana,
    // sq. ft in metros, cent/guntha further south.
    areaUnit: {
      type: String,
      enum: ['sqft', 'sqyard', 'sqm', 'acre', 'cent', 'guntha'],
      default: 'sqyard',
    },
  },
  { _id: false }
);

const limitsSchema = new mongoose.Schema(
  {
    maxUsers: { type: Number, default: 25 },
    maxListings: { type: Number, default: 10000 },
    maxStorageMb: { type: Number, default: 5120 },
    maxImportRowsPerMonth: { type: Number, default: 50000 },
  },
  { _id: false }
);

/**
 * Per-tenant business rules. These are the knobs an agency's workflow actually
 * turns; anything deeper ships as a named rule implementation (see `rules`).
 */
const workflowSchema = new mongoose.Schema(
  {
    // Sales pipeline stages, in order. Renaming or reordering here is the most
    // common customisation request from a new agency.
    dealStages: {
      type: [
        new mongoose.Schema(
          {
            key: { type: String, required: true, maxlength: 40 },
            label: { type: String, required: true, maxlength: 60 },
            order: { type: Number, default: 0 },
            color: { type: String, default: 'slate', maxlength: 20 },
            isWon: { type: Boolean, default: false },
            isLost: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: undefined, // undefined => the product default set
    },

    listingStatuses: { type: [String], default: undefined },

    // How a new lead finds an agent: nobody, round-robin, or by locality owner.
    leadAssignment: {
      type: String,
      enum: ['manual', 'round_robin', 'by_locality'],
      default: 'manual',
    },

    requireApprovalToPublish: { type: Boolean, default: false },
    requireApprovalOverPrice: { type: Number, default: 0 }, // 0 = never

    // Named rule implementations to run at extension points — the
    // channelkart-bundle model, where the core stays generic and per-client
    // behaviour is resolved by name from config rather than branched in code.
    rules: {
      type: [
        new mongoose.Schema(
          {
            hook: {
              type: String,
              required: true,
              enum: [
                'listing.beforeSave',
                'listing.afterSave',
                'listing.beforeImport',
                'deal.beforeStageChange',
                'lead.onCreate',
              ],
            },
            implementation: { type: String, required: true, maxlength: 80 },
            config: { type: mongoose.Schema.Types.Mixed, default: {} },
            enabled: { type: Boolean, default: true },
            order: { type: Number, default: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

/**
 * Per-workspace outbound mail.
 *
 * Mail used to come from one set of process-env credentials, so every agency's
 * notifications arrived from the vendor's address — wrong on the envelope, and
 * a deliverability problem once more than one customer is live. A workspace
 * that configures its own SMTP sends as itself; one that does not falls back to
 * the platform transport, so nothing breaks by leaving this empty.
 *
 * The password is stored encrypted (utils/encryption.js) and never returned by
 * toPublicConfig().
 */
const mailSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    host: { type: String, default: '', trim: true, maxlength: 200 },
    port: { type: Number, default: 587 },
    secure: { type: Boolean, default: false },
    user: { type: String, default: '', trim: true, maxlength: 200 },
    /** AES-GCM ciphertext, not the password. */
    passEncrypted: { type: String, default: '', maxlength: 2000, select: false },
    from: { type: String, default: '', trim: true, maxlength: 200 },
    fromName: { type: String, default: '', trim: true, maxlength: 120 },
    /** Set by the "send test email" button, so the screen can show last verified. */
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },

    /** Subdomain and URL identity: acme.realvista.app */
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 40,
      match: [/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Slug must be lowercase letters, digits and hyphens'],
    },

    /** Optional vanity domain, e.g. crm.acmerealty.in */
    customDomain: { type: String, default: '', lowercase: true, trim: true, maxlength: 120 },

    status: {
      type: String,
      enum: ['trial', 'active', 'suspended', 'cancelled'],
      default: 'trial',
      index: true,
    },

    plan: {
      type: String,
      enum: ['trial', 'starter', 'growth', 'enterprise'],
      default: 'trial',
    },

    trialEndsAt: { type: Date, default: null },

    /**
     * Subscription state, separate from `status`.
     *
     * `status` is whether we serve the workspace; this is where it stands
     * commercially. Keeping them apart is deliberate — an agency whose card
     * failed should not lose access to its own property register the same hour,
     * and "past due" is a conversation, not a shutdown.
     */
    billing: {
      /** How this workspace is billed. `manual` = invoiced by hand, recorded here. */
      provider: { type: String, default: 'manual', maxlength: 40 },
      providerCustomerId: { type: String, default: '', maxlength: 200 },
      state: {
        type: String,
        enum: ['none', 'trialing', 'active', 'past_due', 'cancelled'],
        default: 'none',
      },
      /** When the current paid period ends, and the next invoice is due. */
      renewsAt: { type: Date, default: null },
      cancelAtPeriodEnd: { type: Boolean, default: false },
    },

    /**
     * Enabled navigation/screen ids and module flags. The client ships the full
     * catalogue of screens; this decides which of them an agency sees, so a new
     * module can go live for one client without a release for everyone.
     */
    features: {
      type: Map,
      of: Boolean,
      default: () => new Map(),
    },

    branding: { type: brandingSchema, default: () => ({}) },
    locale: { type: localeSchema, default: () => ({}) },
    limits: { type: limitsSchema, default: () => ({}) },
    workflow: { type: workflowSchema, default: () => ({}) },
    mail: { type: mailSchema, default: () => ({}) },

    /**
     * Rolling monthly import usage, against limits.maxImportRowsPerMonth.
     *
     * The cap existed with nothing to measure it, because there was no job to
     * reset a counter — so "per month" was never enforced. `periodStart` is the
     * first of the current UTC month; the monthly job rolls it forward.
     */
    importUsage: {
      periodStart: { type: Date, default: null },
      rows: { type: Number, default: 0 },
    },

    /**
     * Free-form namespaced settings, for anything that doesn't warrant a schema
     * change — channelkart's `profile.attributes` in miniature. Keep genuinely
     * structural options above; use this for the long tail.
     */
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },

    billingEmail: { type: String, default: '', lowercase: true, trim: true },

    /** Platform-side notes, never shown to the tenant. */
    internalNotes: { type: String, default: '', maxlength: 2000 },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    // The one collection the tenant plugin must not touch.
    tenantScoped: false,
  }
);

tenantSchema.index(
  { customDomain: 1 },
  { unique: true, partialFilterExpression: { customDomain: { $type: 'string', $ne: '' } } }
);

/** Whether this tenant may currently be served. */
tenantSchema.methods.isServiceable = function isServiceable() {
  if (this.isDeleted) return false;
  if (this.status === 'suspended' || this.status === 'cancelled') return false;
  if (this.status === 'trial' && this.trialEndsAt && this.trialEndsAt < new Date()) return false;
  return true;
};

/**
 * The subset of the tenant a browser is allowed to see. Called on every login
 * and config fetch, so it must never leak `internalNotes`, limits internals or
 * billing details.
 */
tenantSchema.methods.toPublicConfig = function toPublicConfig() {
  return {
    id: String(this._id),
    slug: this.slug,
    name: this.name,
    status: this.status,
    plan: this.plan,
    features: Object.fromEntries(this.features || []),
    branding: this.branding,
    locale: this.locale,
    workflow: {
      dealStages: this.workflow?.dealStages,
      listingStatuses: this.workflow?.listingStatuses,
      leadAssignment: this.workflow?.leadAssignment,
      requireApprovalToPublish: this.workflow?.requireApprovalToPublish,
    },
  };
};

/**
 * The mail settings an admin may see and edit.
 *
 * Never includes the password: `passEncrypted` is `select: false` so it is not
 * normally loaded at all, and `hasPassword` tells the screen whether one is
 * stored without revealing it.
 */
tenantSchema.methods.toMailConfig = function toMailConfig() {
  const mail = this.mail || {};
  return {
    enabled: Boolean(mail.enabled),
    host: mail.host || '',
    port: mail.port ?? 587,
    secure: Boolean(mail.secure),
    user: mail.user || '',
    from: mail.from || '',
    fromName: mail.fromName || '',
    hasPassword: Boolean(mail.passEncrypted),
    verifiedAt: mail.verifiedAt || null,
  };
};

const Tenant = mongoose.model('Tenant', tenantSchema);

export default Tenant;
