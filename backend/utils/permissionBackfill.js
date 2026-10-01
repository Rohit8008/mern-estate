/**
 * Which newly-enforced permissions an EXISTING role should be given so that
 * nobody who works today stops working.
 *
 * Until now these keys could be ticked on a role but nothing consulted them, so
 * a role "Agent" with createListing + viewClients could also edit listings,
 * read buyer requirements and message colleagues through the API. Enforcing the
 * keys without this step would silently take all of that away. Each rule grants
 * a new key to roles that already hold its closest related permission; nothing
 * here ever removes one.
 *
 * Pure data + a pure function on purpose: scripts/migratePermissions.js uses
 * it, and tests/permissionEnforcement.test.js checks it without a database.
 *
 * The rules are applied to a fixed point, so running the migration twice (or
 * once on a role that already has some of the keys) changes nothing the second
 * time.
 */

const any = (p, keys) => keys.some((k) => p[k] === true);

/** Signals that a role is for people who change things, not only look. */
const WRITE_SIGNAL = [
  'createClient', 'updateClient', 'deleteClient',
  'createOwner', 'updateOwner', 'deleteOwner',
  'createListing', 'updateListing', 'deleteListing',
  'createCategory', 'updateCategory', 'deleteCategory',
  'uploadFiles',
];

/** A role that grants anything about the business data (not only system keys). */
const DATA_SIGNAL = [
  'viewClients', 'createClient', 'updateClient', 'deleteClient',
  'viewOwners', 'createOwner', 'updateOwner', 'deleteOwner',
  'viewListings', 'createListing', 'updateListing', 'deleteListing',
  'viewCategories', 'createCategory', 'updateCategory', 'deleteCategory',
  'viewBuyerRequirements', 'createBuyerRequirement', 'updateBuyerRequirement', 'deleteBuyerRequirement',
  'viewAnalytics',
];

const OTHER_DELETES = [
  'deleteClient', 'deleteOwner', 'deleteCategory', 'deleteBuyerRequirement', 'deleteUser',
];

/**
 * grant: the key to add. when: (permissions) => boolean. why: shown in the
 * migration's table and the docs.
 */
export const BACKFILL_RULES = Object.freeze([
  {
    grant: 'updateListing',
    why: 'holds createListing (the API let creators edit their own listings)',
    when: (p) => p.createListing === true,
  },
  {
    grant: 'viewListings',
    why: 'holds any listing permission (create, update, delete, publish)',
    when: (p) => any(p, ['createListing', 'updateListing', 'deleteListing', 'publishListing']),
  },
  {
    grant: 'deleteListing',
    why: 'can create/edit listings AND already holds another delete permission',
    when: (p) => any(p, ['createListing', 'updateListing']) && any(p, OTHER_DELETES),
  },
  {
    grant: 'toggleOwnerActive',
    why: 'holds updateOwner (the Activate/Deactivate button used it)',
    when: (p) => p.updateOwner === true,
  },
  {
    grant: 'viewCategories',
    why: 'holds any client/owner/listing/category/buyer/analytics permission (categories feed every form and filter)',
    when: (p) => any(p, DATA_SIGNAL),
  },
  {
    grant: 'viewBuyerRequirements',
    why: 'holds a create/update/delete buyer-requirement permission',
    when: (p) => any(p, ['createBuyerRequirement', 'updateBuyerRequirement', 'deleteBuyerRequirement']),
  },
  {
    grant: 'createBuyerRequirement',
    why: 'holds viewBuyerRequirements and is not a read-only role',
    when: (p) => p.viewBuyerRequirements === true && any(p, WRITE_SIGNAL),
  },
  {
    grant: 'updateBuyerRequirement',
    why: 'holds viewBuyerRequirements and is not a read-only role',
    when: (p) => p.viewBuyerRequirements === true && any(p, WRITE_SIGNAL),
  },
  {
    grant: 'deleteBuyerRequirement',
    why: 'holds viewBuyerRequirements and deleteClient',
    when: (p) => p.viewBuyerRequirements === true && p.deleteClient === true,
  },
  {
    grant: 'viewMessages',
    why: 'holds any permission at all (messaging was open to every employee)',
    when: (p) => Object.values(p).some((v) => v === true),
  },
  {
    grant: 'sendMessages',
    why: 'is not a read-only role',
    when: (p) => any(p, WRITE_SIGNAL),
  },
]);

/**
 * @param {object} permissions  a role's permissions as stored (key -> boolean)
 * @returns {{ grants: {key:string, why:string}[], after: object }}
 */
export function planGrants(permissions = {}) {
  const after = { ...permissions };
  const grants = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of BACKFILL_RULES) {
      if (after[rule.grant] !== true && rule.when(after)) {
        after[rule.grant] = true;
        grants.push({ key: rule.grant, why: rule.why });
        changed = true;
      }
    }
  }
  return { grants, after };
}

/** Keys with no route to enforce them, and why. Reported by the migration. */
export const NOT_ENFORCED = Object.freeze({
  publishListing: 'a listing has no publish state (status is available/sold/rented/under_negotiation); nothing to guard',
  deleteMessages: 'there is no message-delete endpoint',
});
