/**
 * The sales-pipeline catalogue.
 *
 * Stage ids match the enum on `deals.stage` and are stored in each workspace's
 * selection, so — as with screens — they are a contract and must not be
 * renamed. The other thing worth pinning is that a pipeline always keeps an end
 * state: without Won and Lost, deals never leave the board and every conversion
 * figure the product reports is wrong.
 */

import {
  STAGE_CATALOGUE,
  STAGE_IDS,
  DEFAULT_STAGE_IDS,
  REQUIRED_STAGE_IDS,
  getStage,
  isKnownStage,
  resolveStagesForTenant,
  validateStageSelection,
} from '../tenancy/stageCatalogue.js';

describe('catalogue integrity', () => {
  it('has no duplicate ids', () => {
    expect(new Set(STAGE_IDS).size).toBe(STAGE_IDS.length);
  });

  it('keeps the shipped ids stable', () => {
    // These are stored in tenant config AND in every deal's `stage` field and
    // stage history. Renaming one orphans both.
    expect([...STAGE_IDS].sort()).toEqual(
      [
        'booking_token', 'closed_lost', 'closed_won', 'contacted', 'documentation',
        'initial_contact', 'negotiation', 'new_lead', 'payment_pending', 'qualified',
        'site_visit_done', 'site_visit_scheduled',
      ].sort()
    );
  });

  it('marks exactly one won and one lost stage', () => {
    expect(STAGE_CATALOGUE.filter((s) => s.isWon).map((s) => s.id)).toEqual(['closed_won']);
    expect(STAGE_CATALOGUE.filter((s) => s.isLost).map((s) => s.id)).toEqual(['closed_lost']);
  });

  it('leaves legacy stages out of the default pipeline', () => {
    expect(DEFAULT_STAGE_IDS).not.toContain('initial_contact');
    expect(DEFAULT_STAGE_IDS).toContain('new_lead');
  });
});

describe('resolveStagesForTenant', () => {
  it('gives an unconfigured workspace the product default', () => {
    // A new workspace gets a working board without anyone configuring one, and
    // an existing one does not lose its board the day this ships.
    for (const tenant of [{}, { workflow: {} }, { workflow: { dealStages: [] } }]) {
      const stages = resolveStagesForTenant(tenant);
      expect(stages.map((s) => s.id)).toEqual(DEFAULT_STAGE_IDS);
    }
  });

  it('returns only the stages a workspace selected, in its order', () => {
    const stages = resolveStagesForTenant({
      workflow: {
        dealStages: [
          { key: 'closed_won', order: 30 },
          { key: 'new_lead', order: 10 },
          { key: 'closed_lost', order: 20 },
        ],
      },
    });
    expect(stages.map((s) => s.id)).toEqual(['new_lead', 'closed_lost', 'closed_won']);
  });

  it('applies a workspace\'s own wording, keeping the default alongside', () => {
    const stages = resolveStagesForTenant({
      workflow: {
        dealStages: [
          { key: 'site_visit_scheduled', label: 'Viewing booked', order: 10 },
          { key: 'closed_won', order: 20 },
          { key: 'closed_lost', order: 30 },
        ],
      },
    });
    const visit = stages.find((s) => s.id === 'site_visit_scheduled');
    expect(visit.label).toBe('Viewing booked');
    expect(visit.defaultLabel).toBe('Site Visit');
  });

  it('ignores a stage id it does not recognise', () => {
    const stages = resolveStagesForTenant({
      workflow: {
        dealStages: [
          { key: 'not_a_stage', order: 5 },
          { key: 'closed_won', order: 10 },
          { key: 'closed_lost', order: 20 },
        ],
      },
    });
    expect(stages.map((s) => s.id)).toEqual(['closed_won', 'closed_lost']);
  });
});

describe('validateStageSelection', () => {
  const withEnds = (...keys) => [
    ...keys.map((key) => ({ key })),
    { key: 'closed_won' },
    { key: 'closed_lost' },
  ];

  it('normalizes order to the array position', () => {
    // Order is the meaning of a pipeline, so it comes from the list the admin
    // arranged rather than from numbers they have to keep consistent.
    const out = validateStageSelection(withEnds('new_lead', 'negotiation'));
    expect(out.map((s) => s.order)).toEqual([10, 20, 30, 40]);
    expect(out.map((s) => s.key)).toEqual(['new_lead', 'negotiation', 'closed_won', 'closed_lost']);
  });

  it('fills in the catalogue label and colour when none is given', () => {
    const [first] = validateStageSelection(withEnds('new_lead'));
    expect(first.label).toBe('New Lead');
    expect(first.color).toBe('slate');
  });

  it('carries the won/lost flags through from the catalogue', () => {
    const out = validateStageSelection(withEnds('new_lead'));
    expect(out.find((s) => s.key === 'closed_won').isWon).toBe(true);
    expect(out.find((s) => s.key === 'closed_lost').isLost).toBe(true);
  });

  it('refuses a pipeline with no end state', () => {
    expect(() => validateStageSelection([{ key: 'new_lead' }, { key: 'negotiation' }]))
      .toThrow(/Won and Lost/);
    expect(() => validateStageSelection([{ key: 'new_lead' }, { key: 'closed_won' }]))
      .toThrow(/Lost/);
    REQUIRED_STAGE_IDS.forEach((id) => expect(isKnownStage(id)).toBe(true));
  });

  it('refuses an unknown stage rather than storing it', () => {
    expect(() => validateStageSelection(withEnds('made_up'))).toThrow(/Unknown stage/);
  });

  it('refuses the same stage twice', () => {
    // Two columns with the same id would each claim the same deals.
    expect(() => validateStageSelection(withEnds('new_lead', 'new_lead'))).toThrow(/only appear once/);
  });

  it('refuses an empty pipeline', () => {
    expect(() => validateStageSelection([])).toThrow(/at least one/);
    expect(() => validateStageSelection(null)).toThrow(/at least one/);
  });

  it('trims an over-long label rather than rejecting the save', () => {
    const out = validateStageSelection([
      { key: 'new_lead', label: 'x'.repeat(200) },
      { key: 'closed_won' },
      { key: 'closed_lost' },
    ]);
    expect(out[0].label.length).toBe(60);
  });

  it('matches every catalogue id to a real stage', () => {
    STAGE_IDS.forEach((id) => expect(getStage(id)).not.toBeNull());
    expect(getStage('nope')).toBeNull();
  });
});
