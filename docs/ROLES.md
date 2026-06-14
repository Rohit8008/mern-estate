# Role & Permission System

## Overview

| Concern | Mechanism |
|---|---|
| Model | `Role` document — 40+ boolean permission flags |
| Admin bypass | `admin` role always passes all permission checks |
| ABAC | `canAccessListing()` — attribute-based check per listing |
| Caching | Role documents cached 60s via in-process LRU (keyed by `assignedRole` ObjectId) |
| Assignment | Users have an `assignedRole` ObjectId + `assignedCategories[]` |

---

## Role Model

**File:** `backend/models/role.model.js`

### Schema

| Field | Type | Notes |
|---|---|---|
| `name` | String | Unique role name |
| `description` | String | |
| `isSystem` | Boolean | System roles cannot be deleted |
| `isActive` | Boolean | |
| `permissions` | Object | All 40+ permission flags (Boolean each) |

### Methods

```js
role.hasPermission(permissionKey)   // → Boolean
role.getActivePermissions()          // → String[] of granted permission names
Role.getDefaultRoles()               // → Array of seed role definitions
```

---

## Permission Flags

Permissions are grouped by resource:

### User Management
| Permission | Description |
|---|---|
| `viewUsers` | List/view user profiles |
| `createUser` | Create new users |
| `updateUser` | Edit user profiles |
| `deleteUser` | Delete users |
| `manageRoles` | Create/edit/delete roles |

### Client Management
| Permission | Description |
|---|---|
| `viewClients` | View client list and details |
| `createClient` | Add new clients |
| `updateClient` | Edit client records |
| `deleteClient` | Remove clients |
| `assignClient` | Assign clients to employees |

### Owner Management
| Permission | Description |
|---|---|
| `viewOwners` | View property owner list |
| `createOwner` | Add new owners |
| `updateOwner` | Edit owner records |
| `deleteOwner` | Remove owners |
| `toggleOwnerActive` | Activate/deactivate owners |

### Listing Management
| Permission | Description |
|---|---|
| `viewListings` | View listing list |
| `createListing` | Create new listings |
| `updateListing` | Edit listings |
| `deleteListing` | Delete listings |
| `assignListing` | Assign agent to listing |
| `bulkImportListings` | Bulk import from CSV |

### Task Management
| Permission | Description |
|---|---|
| `viewTasks` | View task list |
| `createTask` | Create tasks |
| `updateTask` | Edit tasks |
| `deleteTask` | Delete tasks |

### Document Management
| Permission | Description |
|---|---|
| `viewDocuments` | View uploaded documents |
| `uploadDocument` | Upload files |
| `deleteDocument` | Delete documents |

### Analytics
| Permission | Description |
|---|---|
| `viewAnalytics` | Access analytics dashboards |
| `viewAgentPerformance` | View agent-level metrics |

### Messaging
| Permission | Description |
|---|---|
| `sendMessages` | Send messages to other users |

---

## Default System Roles

Seeded via `npm run db:seed-roles`:

| Role | Key Permissions |
|---|---|
| **Super Admin** | All permissions granted |
| **Sales Manager** | Clients (all), listings (view/assign), analytics, tasks, owners |
| **Employee** | Clients (own), listings (view/create/update), tasks, messages |
| **Listing Manager** | Listings (all CRUD), categories, no client access |

---

## Middleware

**File:** `backend/middleware/permissions.js`

### Functions

```js
requirePermission(key)            // Single permission — 403 if missing
requireAllPermissions([k1, k2])   // All must be granted
requireAnyPermission([k1, k2])    // At least one must be granted
canManageResource(resourceType)   // Generic resource check
canToggleOwnerActive              // Owner status-toggle specific
canCreateListing                  // Checks createListing + category match for employee
canManageRoles                    // Role management gate
canAccessListing(user, listing)   // ABAC check (see below)
```

### Role Caching

`getCachedRole(roleId)` caches the fetched Role document in a 60-second in-process LRU cache keyed by `assignedRole` ObjectId. This eliminates a MongoDB round-trip on every permission-protected request.

### ABAC: `canAccessListing(user, listing)`

```
admin          → always true
employee       → true if:
                   listing.assignedAgent === user.id
                   OR user.assignedCategories includes listing.category
seller (userRef) → true if listing.userRef === user.id
others         → false
```

---

## Authorization Flow

```
Request arrives
  ↓
verifyToken          ← authenticates; sets req.user
  ↓
requireRole(['admin','employee'])   ← coarse role gate (optional)
  ↓
requirePermission('createListing')  ← fine-grained permission check
    → Role.findById(req.user.assignedRole)  [cached 60s]
    → role.hasPermission('createListing')
    → 403 if false
  ↓
canAccessListing(req.user, listing) ← ABAC for listing-specific routes
  ↓
Controller handler
```

---

## Employee Category Restrictions

Employees have `user.assignedCategories[]` — an array of `Category` ObjectIds. When an employee tries to create or view a listing:

1. `requireEmployeeOrAdminForCategory(getCategoryFn)` middleware resolves the listing's category
2. If `admin` → passes through
3. If `employee` → must have that category in `assignedCategories`
4. Otherwise → 403

---

## Frontend

| File | Route | Description |
|---|---|---|
| `frontend/src/components/RoleManagement.jsx` | `/admin` → Roles tab | Role CRUD UI |
| `frontend/src/pages/Admin.jsx` | `/admin` | Admin panel with role management |
| `frontend/src/hooks/useCrmAccess.js` | — | `canAccess` + `isAdmin` for CRM shell |

---

## Key Files

| File | Role |
|---|---|
| `backend/models/role.model.js` | Schema — 40+ permission flags, system role flag |
| `backend/models/user.model.js` | `assignedRole`, `assignedCategories` fields |
| `backend/middleware/permissions.js` | All permission middleware + ABAC + caching |
| `backend/controllers/role.controller.js` | Role CRUD API |
| `backend/routes/role.route.js` | `/api/roles` endpoints |
| `frontend/src/components/RoleManagement.jsx` | Role management UI |
| `frontend/src/hooks/useCrmAccess.js` | Frontend CRM access guard |
