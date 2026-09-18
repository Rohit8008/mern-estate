import { getTenant } from '../tenancy/tenantContext.js';
import { logger } from '../utils/logger.js';

/**
 * Named rule implementations, resolved from workspace config.
 *
 * `tenant.workflow.rules` has been in the schema from the start — five hook
 * names, an `implementation` string, a config blob, an order — and nothing ever
 * read it. A workspace could configure a rule in settings and get no behaviour
 * and no warning.
 *
 * This is the missing half. The shape is deliberately "vocabulary in code,
 * selection in config", the same rule the rest of the product follows: an
 * implementation is a function registered here by name, and a workspace chooses
 * from that vocabulary. Config never carries code.
 *
 * That is the important difference from a plugin system that loads files from
 * disk and runs them: this cannot introduce new code into the process, so a
 * workspace admin editing settings can never execute anything the deployment
 * did not ship.
 */

/** The extension points a rule can attach to. Must match tenant.model.js. */
export const HOOKS = Object.freeze([
  'listing.beforeSave',
  'listing.afterSave',
  'listing.beforeImport',
  'deal.beforeStageChange',
  'lead.onCreate',
]);

/**
 * A rule deliberately refusing the operation.
 *
 * This is the difference between "the workspace configured a rule that says no"
 * and "the rule is broken". A veto is the point of rules like "ask for a reason
 * before marking a deal lost", so it has to reach the user as a validation
 * error; an unexpected error means somebody's automation is misconfigured, and
 * that must not stop them saving a property.
 *
 * Swallowing both — which is what catching every error did — made every veto
 * rule silently do nothing.
 */
export class RuleVetoError extends Error {
  constructor(message, { implementation, hook } = {}) {
    super(message);
    this.name = 'RuleVetoError';
    this.statusCode = 400;
    this.isOperational = true;
    this.implementation = implementation;
    this.hook = hook;
  }
}

/** Throw from inside a rule to refuse the operation with a message for the user. */
export function veto(message) {
  throw new RuleVetoError(message);
}

/** @type {Map<string, {hook: string, describe: string, run: Function}>} */
const implementations = new Map();

/**
 * Register a rule implementation.
 *
 * @param {string} name     what config refers to it by; a contract, never rename
 * @param {object} spec
 * @param {string} spec.hook      which extension point it attaches to
 * @param {string} spec.describe  one line for the settings screen
 * @param {Function} spec.run     async (context, config) => void | patch
 */
export function registerRule(name, spec) {
  if (!HOOKS.includes(spec?.hook)) {
    throw new Error(`Rule '${name}' names an unknown hook: ${spec?.hook}`);
  }
  if (typeof spec.run !== 'function') {
    throw new Error(`Rule '${name}' has no run function`);
  }
  if (implementations.has(name)) {
    throw new Error(`Rule '${name}' is already registered`);
  }

  implementations.set(name, { describe: '', ...spec });
}

/** Everything registered, for the settings screen's picker. */
export function availableRules(hook) {
  return [...implementations.entries()]
    .filter(([, spec]) => !hook || spec.hook === hook)
    .map(([name, spec]) => ({ name, hook: spec.hook, describe: spec.describe }));
}

/** Whether an implementation of this name is registered. */
export function isRuleRegistered(name) {
  return implementations.has(name);
}

/** Test seam. */
export function resetRules() {
  implementations.clear();
}

/**
 * Run every rule the current workspace has enabled for `hook`, in order.
 *
 * Rules receive a context and may return a partial patch, which is merged into
 * it — so `listing.beforeSave` rules can normalise a field without each one
 * having to know about the others.
 *
 * A failing rule is logged and skipped rather than allowed to fail the user's
 * request: a misconfigured rule should degrade the workspace's automation, not
 * break its ability to save a property.
 */
export async function runHook(hook, context = {}) {
  if (!HOOKS.includes(hook)) throw new Error(`Unknown hook: ${hook}`);

  const rules = (getTenant()?.workflow?.rules || [])
    .filter((rule) => rule.enabled !== false && rule.hook === hook)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!rules.length) return context;

  let result = { ...context };

  for (const rule of rules) {
    const spec = implementations.get(rule.implementation);

    if (!spec) {
      // Config naming an implementation that does not exist is the failure this
      // whole file is meant to make visible rather than silent.
      logger.warn('Workspace rule names an implementation that is not registered', {
        hook,
        implementation: rule.implementation,
      });
      continue;
    }

    try {
      const patch = await spec.run(result, rule.config || {});
      if (patch && typeof patch === 'object') result = { ...result, ...patch };
    } catch (err) {
      // A veto is the rule working. It propagates to the caller, which turns it
      // into a 400 the user can act on.
      if (err instanceof RuleVetoError) {
        err.implementation = rule.implementation;
        err.hook = hook;
        throw err;
      }

      // Anything else is the rule being broken, which is the workspace's
      // automation failing — not a reason to fail the user's request.
      logger.error('Workspace rule failed', {
        hook,
        implementation: rule.implementation,
        message: err.message,
      });
    }
  }

  return result;
}
