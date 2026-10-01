/**
 * The built-in roles, defined once.
 *
 * Both the "Restore default roles" button (Role.getDefaultRoles, behind
 * POST /api/roles/initialize-defaults) and `npm run db:seed-roles` read this
 * list. They used to hold separate copies - three roles in the model, five in
 * the script - so a workspace got a different set depending on how it was
 * seeded. Permission keys must exist in utils/permissionCatalogue.js
 * (tests/defaultRoles.test.js checks).
 *
 * Plain data on purpose: no imports, so the seed script can load it without
 * compiling a model ahead of the tenancy plugin.
 */
export const DEFAULT_ROLES = Object.freeze([
  {
    name: 'Super Admin',
    description: 'Full system access with all permissions',
    isSystem: true,
    permissions: {
      createUser: true, updateUser: true, deleteUser: true, viewUsers: true,
      createClient: true, updateClient: true, deleteClient: true, viewClients: true,
      createOwner: true, updateOwner: true, deleteOwner: true, viewOwners: true, toggleOwnerActive: true,
      createListing: true, updateListing: true, deleteListing: true, viewListings: true, publishListing: true,
      createCategory: true, updateCategory: true, deleteCategory: true, viewCategories: true,
      viewMessages: true, sendMessages: true, deleteMessages: true,
      createBuyerRequirement: true, updateBuyerRequirement: true, deleteBuyerRequirement: true, viewBuyerRequirements: true,
      uploadFiles: true, viewAnalytics: true, exportData: true,
      manageRoles: true, systemSettings: true, viewLogs: true,
    },
  },
  {
    name: 'Sales Manager',
    description: 'Manages clients, deals, and sales pipeline. Full access to CRM sales tools.',
    isSystem: false,
    permissions: {
      viewUsers: true,
      createClient: true, updateClient: true, deleteClient: true, viewClients: true,
      viewOwners: true,
      createListing: true, updateListing: true, viewListings: true, publishListing: true,
      viewCategories: true,
      viewMessages: true, sendMessages: true,
      createBuyerRequirement: true, updateBuyerRequirement: true, deleteBuyerRequirement: true, viewBuyerRequirements: true,
      uploadFiles: true, viewAnalytics: true, exportData: true,
    },
  },
  {
    name: 'Listing Manager',
    description: 'Creates and manages property listings and owners.',
    isSystem: true,
    permissions: {
      createOwner: true, updateOwner: true, viewOwners: true, toggleOwnerActive: true,
      createListing: true, updateListing: true, viewListings: true, publishListing: true,
      viewCategories: true,
      viewMessages: true, sendMessages: true,
      viewBuyerRequirements: true,
      uploadFiles: true,
    },
  },
  {
    name: 'Employee',
    description: 'Basic employee with limited read and create permissions.',
    isSystem: true,
    permissions: {
      viewClients: true,
      viewOwners: true,
      createListing: true, viewListings: true,
      viewCategories: true,
      viewMessages: true, sendMessages: true,
      viewBuyerRequirements: true,
      uploadFiles: true,
    },
  },
  {
    name: 'Viewer',
    description: 'Read-only access to listings, clients, and owners. Cannot create or modify anything.',
    isSystem: false,
    permissions: {
      viewClients: true,
      viewOwners: true,
      viewListings: true,
      viewCategories: true,
      viewMessages: true,
      viewBuyerRequirements: true,
    },
  },
]);
