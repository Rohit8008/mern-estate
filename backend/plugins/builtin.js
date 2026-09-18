import { registerRule, veto, isRuleRegistered } from './registry.js';

/**
 * The rule implementations that ship with the product.
 *
 * These are the vocabulary a workspace selects from in Settings. Each one is
 * small and specific on purpose — the value is in combining a few named rules
 * per workspace, not in one rule with twenty options.
 */

export function registerBuiltinRules() {
  // Guarded against the registry itself rather than a module-level flag, so
  // clearing the registry (as tests do) genuinely allows re-registration —
  // a private boolean made this a silent no-op the second time round.
  if (isRuleRegistered('normaliseLocality')) return;

  // ── listing.beforeSave ───────────────────────────────────────────────────

  registerRule('normaliseLocality', {
    hook: 'listing.beforeSave',
    describe: 'Trim and title-case the locality, so "whitefield " and "Whitefield" group together',
    run: ({ listing }) => {
      if (!listing?.locality) return null;
      const locality = String(listing.locality)
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return { listing: { ...listing, locality } };
    },
  });

  registerRule('requirePriceOnPublish', {
    hook: 'listing.beforeSave',
    describe: 'Refuse to publish a property that has no price',
    run: ({ listing }) => {
      if (listing?.status === 'available' && !(listing.regularPrice > 1)) {
        veto('This property needs a price before it can be published');
      }
      return null;
    },
  });

  registerRule('defaultCityFromWorkspace', {
    hook: 'listing.beforeSave',
    describe: 'Fill an empty city with the workspace default',
    run: ({ listing }, config) => {
      if (listing?.city || !config?.city) return null;
      return { listing: { ...listing, city: config.city } };
    },
  });

  // ── deal.beforeStageChange ───────────────────────────────────────────────

  registerRule('requireNoteOnLoss', {
    hook: 'deal.beforeStageChange',
    describe: 'Ask for a reason before a deal can be marked lost',
    run: ({ toStage, notes }) => {
      if (toStage === 'closed_lost' && !String(notes || '').trim()) {
        veto('Add a note explaining why this deal was lost');
      }
      return null;
    },
  });

  registerRule('blockSkippingToWon', {
    hook: 'deal.beforeStageChange',
    describe: 'Stop a deal jumping straight to won from an early stage',
    run: ({ fromStage, toStage }) => {
      const early = ['new_lead', 'contacted'];
      if (toStage === 'closed_won' && early.includes(fromStage)) {
        veto('Move the deal through negotiation before closing it as won');
      }
      return null;
    },
  });

  // ── lead.onCreate ────────────────────────────────────────────────────────

  registerRule('tagLeadBySource', {
    hook: 'lead.onCreate',
    describe: 'Set a lead’s priority from where it came from',
    run: ({ client }, config) => {
      const mapping = config?.priorityBySource || {};
      const priority = mapping[String(client?.source || '').toLowerCase()];
      if (!priority) return null;
      return { client: { ...client, priority } };
    },
  });

  // ── listing.beforeImport ─────────────────────────────────────────────────

  registerRule('skipRowsWithoutPrice', {
    hook: 'listing.beforeImport',
    describe: 'Skip imported rows that carry no price, instead of creating them at zero',
    run: ({ row }) => {
      if (!row) return null;
      const price = Number(row.regularPrice || 0);
      return price > 0 ? null : { skip: true, skipReason: 'no price' };
    },
  });
}
