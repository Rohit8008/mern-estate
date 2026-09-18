/**
 * Workspace rules: config selects behaviour, config never carries behaviour.
 *
 * `tenant.workflow.rules` shipped with five hook names and an `implementation`
 * string, and nothing ever read it — a workspace could configure a rule and get
 * silence. These cover the contract now that it is wired: order, veto, the
 * patch merge, and the two failure modes that have to stay quiet (an unknown
 * implementation, and a rule that throws where a veto was not intended).
 */

import mongoose from 'mongoose';
import { registerTenancy } from '../tenancy/tenantPlugin.js';
import { runWithTenant } from '../tenancy/tenantContext.js';

let registerRule, runHook, resetRules, availableRules, registerBuiltinRules, veto, RuleVetoError;

beforeAll(async () => {
  registerTenancy(mongoose);
  ({ registerRule, runHook, resetRules, availableRules, veto, RuleVetoError } =
    await import('../plugins/registry.js'));
  ({ registerBuiltinRules } = await import('../plugins/builtin.js'));
});

beforeEach(() => resetRules());

/** Run inside a workspace whose config selects the given rules. */
const withRules = (rules, fn) =>
  runWithTenant({ tenantId: new mongoose.Types.ObjectId().toString(), tenant: { workflow: { rules } } }, fn);

describe('registry', () => {
  it('refuses a rule naming an unknown hook', () => {
    expect(() => registerRule('x', { hook: 'nope', run: () => {} })).toThrow(/unknown hook/i);
  });

  it('refuses a rule with no run function', () => {
    expect(() => registerRule('x', { hook: 'lead.onCreate' })).toThrow(/no run function/i);
  });

  it('refuses to register the same name twice', () => {
    registerRule('dup', { hook: 'lead.onCreate', run: () => {} });
    expect(() => registerRule('dup', { hook: 'lead.onCreate', run: () => {} })).toThrow(/already registered/i);
  });

  it('lists what is available for a hook', () => {
    registerRule('a', { hook: 'lead.onCreate', describe: 'A', run: () => {} });
    registerRule('b', { hook: 'listing.beforeSave', describe: 'B', run: () => {} });

    expect(availableRules('lead.onCreate').map((r) => r.name)).toEqual(['a']);
    expect(availableRules()).toHaveLength(2);
  });
});

describe('runHook', () => {
  it('returns the context untouched when the workspace has no rules', async () => {
    const result = await withRules([], () => runHook('lead.onCreate', { client: { name: 'A' } }));
    expect(result.client.name).toBe('A');
  });

  it('merges a rule’s patch into the context', async () => {
    registerRule('setPriority', {
      hook: 'lead.onCreate',
      run: ({ client }) => ({ client: { ...client, priority: 'high' } }),
    });

    const result = await withRules(
      [{ hook: 'lead.onCreate', implementation: 'setPriority', enabled: true }],
      () => runHook('lead.onCreate', { client: { name: 'A' } })
    );

    expect(result.client).toEqual({ name: 'A', priority: 'high' });
  });

  it('runs rules in the configured order, later ones seeing earlier patches', async () => {
    const seen = [];
    registerRule('first', {
      hook: 'lead.onCreate',
      run: ({ client }) => { seen.push('first'); return { client: { ...client, step: 1 } }; },
    });
    registerRule('second', {
      hook: 'lead.onCreate',
      run: ({ client }) => { seen.push(`second saw ${client.step}`); return { client: { ...client, step: 2 } }; },
    });

    const result = await withRules([
      { hook: 'lead.onCreate', implementation: 'second', enabled: true, order: 2 },
      { hook: 'lead.onCreate', implementation: 'first', enabled: true, order: 1 },
    ], () => runHook('lead.onCreate', { client: {} }));

    expect(seen).toEqual(['first', 'second saw 1']);
    expect(result.client.step).toBe(2);
  });

  it('skips a disabled rule', async () => {
    let ran = false;
    registerRule('off', { hook: 'lead.onCreate', run: () => { ran = true; } });

    await withRules([{ hook: 'lead.onCreate', implementation: 'off', enabled: false }],
      () => runHook('lead.onCreate', {}));

    expect(ran).toBe(false);
  });

  it('ignores rules attached to a different hook', async () => {
    let ran = false;
    registerRule('other', { hook: 'listing.beforeSave', run: () => { ran = true; } });

    await withRules([{ hook: 'listing.beforeSave', implementation: 'other', enabled: true }],
      () => runHook('lead.onCreate', {}));

    expect(ran).toBe(false);
  });

  it('does not throw when config names an implementation that is not registered', async () => {
    // The old failure mode was silence; the new one must be a log, not a crash.
    await expect(
      withRules([{ hook: 'lead.onCreate', implementation: 'ghost', enabled: true }],
        () => runHook('lead.onCreate', { client: { name: 'A' } }))
    ).resolves.toMatchObject({ client: { name: 'A' } });
  });

  it('lets a veto through to the caller, so a refusal actually refuses', async () => {
    registerRule('refuse', {
      hook: 'deal.beforeStageChange',
      run: () => veto('Add a note explaining why this deal was lost'),
    });

    await expect(
      withRules([{ hook: 'deal.beforeStageChange', implementation: 'refuse', enabled: true }],
        () => runHook('deal.beforeStageChange', { toStage: 'closed_lost' }))
    ).rejects.toThrow(/Add a note/);
  });

  it('gives a veto a 400, so it reaches the user as a validation error', async () => {
    registerRule('refuse2', { hook: 'lead.onCreate', run: () => veto('no') });

    const error = await withRules(
      [{ hook: 'lead.onCreate', implementation: 'refuse2', enabled: true }],
      () => runHook('lead.onCreate', {})
    ).catch((e) => e);

    expect(error).toBeInstanceOf(RuleVetoError);
    expect(error.statusCode).toBe(400);
    expect(error.implementation).toBe('refuse2');
  });

  it('stops at a veto rather than running later rules', async () => {
    let laterRan = false;
    registerRule('stop', { hook: 'lead.onCreate', run: () => veto('nope') });
    registerRule('later', { hook: 'lead.onCreate', run: () => { laterRan = true; } });

    await withRules([
      { hook: 'lead.onCreate', implementation: 'stop', enabled: true, order: 1 },
      { hook: 'lead.onCreate', implementation: 'later', enabled: true, order: 2 },
    ], () => runHook('lead.onCreate', {})).catch(() => {});

    expect(laterRan).toBe(false);
  });

  it('keeps going when one rule throws an unexpected error', async () => {
    registerRule('bad', { hook: 'lead.onCreate', run: () => { throw new Error('boom'); } });
    registerRule('good', {
      hook: 'lead.onCreate',
      run: ({ client }) => ({ client: { ...client, ok: true } }),
    });

    const result = await withRules([
      { hook: 'lead.onCreate', implementation: 'bad', enabled: true, order: 1 },
      { hook: 'lead.onCreate', implementation: 'good', enabled: true, order: 2 },
    ], () => runHook('lead.onCreate', { client: {} }));

    expect(result.client.ok).toBe(true);
  });

  it('rejects an unknown hook name outright', async () => {
    await expect(withRules([], () => runHook('nope', {}))).rejects.toThrow(/unknown hook/i);
  });
});

describe('built-in rules', () => {
  beforeEach(() => {
    resetRules();
    registerBuiltinRules();
  });

  it('title-cases a messy locality', async () => {
    const result = await withRules(
      [{ hook: 'listing.beforeSave', implementation: 'normaliseLocality', enabled: true }],
      () => runHook('listing.beforeSave', { listing: { locality: '  whitefield   east ' } })
    );
    expect(result.listing.locality).toBe('Whitefield East');
  });

  it('refuses to publish a property with no price', async () => {
    await expect(
      withRules([{ hook: 'listing.beforeSave', implementation: 'requirePriceOnPublish', enabled: true }],
        () => runHook('listing.beforeSave', { listing: { status: 'available', regularPrice: 0 } }))
    ).rejects.toThrow(/needs a price/);
  });

  it('allows a priced property through the same rule', async () => {
    await expect(
      withRules([{ hook: 'listing.beforeSave', implementation: 'requirePriceOnPublish', enabled: true }],
        () => runHook('listing.beforeSave', { listing: { status: 'available', regularPrice: 5000000 } }))
    ).resolves.toBeDefined();
  });

  it('asks for a reason before a deal is marked lost', async () => {
    await expect(
      withRules([{ hook: 'deal.beforeStageChange', implementation: 'requireNoteOnLoss', enabled: true }],
        () => runHook('deal.beforeStageChange', { toStage: 'closed_lost', notes: '' }))
    ).rejects.toThrow(/why this deal was lost/);
  });

  it('accepts a loss that carries a reason', async () => {
    await expect(
      withRules([{ hook: 'deal.beforeStageChange', implementation: 'requireNoteOnLoss', enabled: true }],
        () => runHook('deal.beforeStageChange', { toStage: 'closed_lost', notes: 'Bought elsewhere' }))
    ).resolves.toBeDefined();
  });
});
