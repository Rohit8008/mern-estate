/**
 * The product's sales-pipeline vocabulary.
 *
 * Every stage the product understands is declared here once, and a workspace
 * chooses which of them its pipeline uses, in what order, under what name.
 * Same shape as the screen catalogue, for the same reason.
 *
 * ── Why a catalogue rather than free-text stages ─────────────────────────────
 * Letting each agency invent arbitrary stage keys sounds more flexible, and is
 * worse: `deals.stage` is an enum on the Client model, stage history would
 * accumulate values nothing can interpret, and cross-workspace reporting could
 * no longer aggregate ("how long does a deal sit in negotiation?" needs
 * `negotiation` to mean one thing). Choosing, ordering and renaming from a known
 * vocabulary gives an agency the pipeline they recognise while keeping the data
 * comparable.
 *
 * `id` must match the enum in models/client.model.js, and — as with screens —
 * must never be renamed: workspaces store their selection by id.
 */

/** @type {{id:string,label:string,color:string,order:number,isWon?:boolean,isLost?:boolean,legacy?:boolean}[]} */
export const STAGE_CATALOGUE = [
  { id: 'new_lead', label: 'New Lead', color: 'slate', order: 10 },
  { id: 'contacted', label: 'Contacted', color: 'blue', order: 20 },
  { id: 'qualified', label: 'Qualified', color: 'indigo', order: 30 },
  { id: 'site_visit_scheduled', label: 'Site Visit', color: 'purple', order: 40 },
  { id: 'negotiation', label: 'Negotiation', color: 'amber', order: 50 },
  { id: 'booking_token', label: 'Booking / Token', color: 'orange', order: 60 },
  { id: 'documentation', label: 'Documentation', color: 'yellow', order: 70 },
  { id: 'closed_won', label: 'Won', color: 'emerald', order: 80, isWon: true },
  { id: 'closed_lost', label: 'Lost', color: 'rose', order: 90, isLost: true },

  // Superseded by the stages above, kept because existing deals still carry
  // them. A workspace can still enable one; nothing new should default to them.
  { id: 'initial_contact', label: 'Initial Contact', color: 'slate', order: 100, legacy: true },
  { id: 'site_visit_done', label: 'Site Visit Done', color: 'indigo', order: 110, legacy: true },
  { id: 'payment_pending', label: 'Payment Pending', color: 'orange', order: 120, legacy: true },
];

const BY_ID = new Map(STAGE_CATALOGUE.map((s) => [s.id, s]));

export const STAGE_IDS = STAGE_CATALOGUE.map((s) => s.id);

export function getStage(id) {
  return BY_ID.get(id) || null;
}

export function isKnownStage(id) {
  return BY_ID.has(id);
}

/**
 * The two stages a pipeline cannot do without. A board with no way to mark a
 * deal won or lost has no end state, so deals accumulate forever and every
 * conversion number is wrong.
 */
export const REQUIRED_STAGE_IDS = ['closed_won', 'closed_lost'];

/** The product default: everything except the legacy stages. */
export const DEFAULT_STAGE_IDS = STAGE_CATALOGUE.filter((s) => !s.legacy).map((s) => s.id);

/**
 * This workspace's pipeline: which stages, in what order, called what.
 *
 * `tenant.workflow.dealStages` holds the selection. An empty or absent
 * selection means the product default — a new workspace gets a sensible
 * pipeline without anyone configuring one, and an existing workspace does not
 * lose its board the day this feature ships.
 */
export function resolveStagesForTenant(tenant) {
  const configured = tenant?.workflow?.dealStages;

  if (!Array.isArray(configured) || configured.length === 0) {
    return DEFAULT_STAGE_IDS.map((id) => ({ ...BY_ID.get(id), enabled: true, defaultLabel: BY_ID.get(id).label }));
  }

  const overrides = new Map(
    configured
      .filter((s) => s && isKnownStage(s.key))
      .map((s) => [s.key, s])
  );

  return STAGE_CATALOGUE.map((stage) => {
    const override = overrides.get(stage.id);
    return {
      id: stage.id,
      label: override?.label || stage.label,
      defaultLabel: stage.label,
      color: override?.color || stage.color,
      order: override?.order ?? stage.order,
      isWon: Boolean(stage.isWon),
      isLost: Boolean(stage.isLost),
      legacy: Boolean(stage.legacy),
      // A stage the workspace did not select is off — unlike screens, where an
      // absent flag means on. A pipeline is an explicit, ordered list: leaving
      // unselected stages on would make "choose your stages" do nothing.
      enabled: Boolean(override),
    };
  })
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
}

/**
 * Validate a proposed pipeline before storing it.
 * @returns {{key:string,label:string,color:string,order:number}[]} normalized
 */
export function validateStageSelection(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error('A pipeline needs at least one stage.');
  }

  const unknown = stages.filter((s) => !isKnownStage(s?.key)).map((s) => s?.key);
  if (unknown.length) {
    throw new Error(`Unknown stage: ${unknown.join(', ')}`);
  }

  const seen = new Set();
  const duplicates = stages.filter((s) => (seen.has(s.key) ? true : (seen.add(s.key), false)));
  if (duplicates.length) {
    throw new Error(`A stage can only appear once: ${duplicates.map((s) => s.key).join(', ')}`);
  }

  const missing = REQUIRED_STAGE_IDS.filter((id) => !seen.has(id));
  if (missing.length) {
    throw new Error(
      `A pipeline needs ${missing.map((id) => BY_ID.get(id).label).join(' and ')} — without an end state, deals never leave the board and every conversion figure is wrong.`
    );
  }

  return stages.map((s, i) => ({
    key: s.key,
    label: String(s.label || BY_ID.get(s.key).label).trim().slice(0, 60),
    color: s.color || BY_ID.get(s.key).color,
    order: (i + 1) * 10,
    isWon: Boolean(BY_ID.get(s.key).isWon),
    isLost: Boolean(BY_ID.get(s.key).isLost),
  }));
}
