/**
 * The canonical catalogue of role permissions.
 *
 * This is the ONE place a permission is named. `role.model.js` builds its
 * schema from PERMISSION_KEYS and `getAvailablePermissions` serves
 * PERMISSION_GROUPS to the Roles screen, so a permission can never again be
 * enforced on a route while being unassignable in the admin UI — the drift
 * that silently hid the entire clientManagement group.
 *
 * Adding a permission is one edit here. `requirePermission('...')` in a route
 * must use a key from this file; `tests/permissionCatalogue.test.js` fails the
 * build if a route asks for a permission that does not exist.
 */

export const PERMISSION_GROUPS = Object.freeze({
  userManagement: {
    createUser: 'Create new users',
    updateUser: 'Update user information',
    deleteUser: 'Delete users',
    viewUsers: 'View user list'
  },
  clientManagement: {
    createClient: 'Create new clients',
    updateClient: 'Update client information',
    deleteClient: 'Delete clients',
    viewClients: 'View client list'
  },
  ownerManagement: {
    createOwner: 'Create new owners',
    updateOwner: 'Update owner information',
    deleteOwner: 'Delete owners',
    viewOwners: 'View owner list',
    toggleOwnerActive: 'Activate/deactivate owners'
  },
  listingManagement: {
    createListing: 'Create new listings',
    updateListing: 'Update listing information',
    deleteListing: 'Delete listings',
    viewListings: 'View listing list',
    publishListing: 'Publish/unpublish listings'
  },
  categoryManagement: {
    createCategory: 'Create new categories',
    updateCategory: 'Update category information',
    deleteCategory: 'Delete categories',
    viewCategories: 'View category list'
  },
  messageManagement: {
    viewMessages: 'View messages',
    sendMessages: 'Send messages',
    deleteMessages: 'Delete messages'
  },
  buyerRequirements: {
    createBuyerRequirement: 'Create buyer requirements',
    updateBuyerRequirement: 'Update buyer requirements',
    deleteBuyerRequirement: 'Delete buyer requirements',
    viewBuyerRequirements: 'View buyer requirements'
  },
  system: {
    uploadFiles: 'Upload files',
    viewAnalytics: 'View analytics and reports',
    exportData: 'Export data',
    manageRoles: 'Manage roles and permissions',
    systemSettings: 'Access system settings',
    viewLogs: 'View system logs'
  }
});

/** Every permission key, flat. */
export const PERMISSION_KEYS = Object.freeze(
  Object.values(PERMISSION_GROUPS).flatMap((group) => Object.keys(group))
);

/** True when `key` is a real permission. Used by requirePermission to fail loudly. */
export const isPermissionKey = (key) => PERMISSION_KEYS.includes(key);

/**
 * The `permissions` sub-document for roleSchema: every key a Boolean defaulting
 * to false. Generated so the schema cannot fall behind the catalogue.
 */
export const permissionSchemaFields = () =>
  PERMISSION_KEYS.reduce((fields, key) => {
    fields[key] = { type: Boolean, default: false };
    return fields;
  }, {});
