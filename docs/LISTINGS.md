# Real Estate Listings

## Overview

| Concern | Mechanism |
|---|---|
| Storage | MongoDB `Listing` model with soft delete |
| Images | Firebase Storage (client-side upload) — URLs stored in `listing.imageUrls[]` |
| Dynamic fields | Per-category `attributes` Map validated against `Category.fields` schema |
| Access control | ABAC — admin / owner / employee by category / assigned agent |
| Real-time | Socket.IO notifies relevant employees/admins on create/update/delete |
| Cache | In-process LRU (300s TTL, 100 entries) keyed on query string |

---

## Data Model

**File:** `backend/models/listing.model.js`

### Core Fields

| Field | Type | Notes |
|---|---|---|
| `name` | String | Listing title |
| `description` | String | Full description |
| `address` | String | Street address |
| `city` | String | Indexed |
| `locality` | String | Indexed |
| `state` | String | |
| `pincode` | String | |
| `regularPrice` | Number | Listed price |
| `discountPrice` | Number | Optional discounted price |
| `offer` | Boolean | Whether a discount applies |
| `bedrooms` | Number | |
| `bathrooms` | Number | |
| `furnished` | Boolean | |
| `parking` | Boolean | |
| `areaSqFt` | Number | Area in sq ft |
| `type` | String | `sale` \| `rent` |
| `status` | String | `available` \| `sold` \| `under_negotiation` |
| `imageUrls` | String[] | Firebase Storage URLs |
| `location` | `{ lat, lng }` | Leaflet map coordinates |

### Categorization

| Field | Type | Values |
|---|---|---|
| `propertyCategory` | String | `residential` \| `commercial` \| `land` \| `unknown` |
| `propertyType` | String | `apartment` \| `villa` \| `house` \| `other` |
| `commercialType` | String | `office` \| `shop` \| `showroom` \| `warehouse` \| `other` |
| `plotType` | String | `residential` \| `commercial` \| `agricultural` \| `other` |
| `category` | ObjectId ref | Links to `Category` model for dynamic fields |
| `attributes` | Map\<String, Mixed\> | Dynamic category-specific fields |

### Relationships

| Field | Type | Notes |
|---|---|---|
| `userRef` | ObjectId ref User | Primary listing owner (seller) |
| `ownerIds` | ObjectId[] ref Owner | Property owners (multiple) |
| `assignedAgent` | ObjectId ref User | Assigned employee/agent |

### Soft Delete

| Field | Type |
|---|---|
| `isDeleted` | Boolean |
| `deletedAt` | Date |

---

## API Endpoints

**Base path:** `/api/listing`  
**File:** `backend/routes/listing.route.js`

| Method | Path | Auth | Permission | Description |
|---|---|---|---|---|
| `GET` | `/get` | Public | — | List listings with filters |
| `GET` | `/get/:id` | Public | — | Single listing detail |
| `GET` | `/search` | Public | — | Fuzzy search with highlighting |
| `GET` | `/suggestions` | Public | — | Autocomplete suggestions |
| `GET` | `/popular-searches` | Public | — | Top search terms |
| `POST` | `/create` | Auth | `createListing` | Create new listing |
| `POST` | `/update/:id` | Auth | `updateListing` | Update listing |
| `DELETE` | `/delete/:id` | Auth | `deleteListing` | Hard delete |
| `POST` | `/soft-delete/:id` | Admin | — | Soft delete |
| `POST` | `/restore/:id` | Admin | — | Restore soft-deleted |
| `POST` | `/assign-agent` | Admin | — | Assign agent to listing |
| `POST` | `/unassign-agent` | Admin | — | Remove agent assignment |
| `GET` | `/my-assigned` | Auth | — | Current agent's listings |
| `POST` | `/bulk-import` | Admin | — | Bulk import from CSV/Excel (max 100) |

### GET `/get` Query Parameters

| Param | Type | Description |
|---|---|---|
| `searchTerm` | String | Free-text search |
| `type` | String | `sale` \| `rent` |
| `city` | String | Case-insensitive regex |
| `locality` | String | Case-insensitive regex |
| `status` | String | `available` \| `sold` \| `under_negotiation` |
| `propertyCategory` | String | `residential` \| `commercial` \| `land` |
| `propertyType` | String | Residential subtype |
| `commercialType` | String | Commercial subtype |
| `plotType` | String | Land subtype |
| `assignedAgent` | String | Agent ID or `unassigned` |
| `minPrice` | Number | Minimum price filter |
| `maxPrice` | Number | Maximum price filter |
| `minAreaSqFt` | Number | Minimum area filter |
| `maxAreaSqFt` | Number | Maximum area filter |
| `bedrooms` | Number | Exact match |
| `bathrooms` | Number | Exact match |
| `furnished` | Boolean | |
| `parking` | Boolean | |
| `offer` | Boolean | Has discount |
| `includeDeleted` | Boolean | Admin only — include soft-deleted |
| `limit` | Number | Default 12 |
| `startIndex` | Number | Pagination offset |
| `sort` | String | Sort field |
| `order` | String | `asc` \| `desc` |

---

## Access Control

**File:** `backend/middleware/permissions.js`

`canAccessListing(user, listing)` — attribute-based check:

```
admin         → always allowed
employee      → allowed if listing.assignedAgent === user.id
                OR user.assignedCategories includes listing.category
owner (seller) → allowed if listing.userRef === user.id
```

Routes that mutate data require `requirePermission('createListing' | 'updateListing' | 'deleteListing')` from the user's Role document.

---

## Dynamic Category Attributes

Each listing can have a `category` that defines extra fields via `PropertyType.fields`. Before saving, `validateCategoryAttributes()` runs:

1. Required field check — returns 400 if a required attribute is missing
2. Type coercion — converts values to the declared type
3. Pattern validation — regex match; throws `ValidationError` on mismatch (only `SyntaxError` from a malformed regex pattern in the DB is suppressed)

---

## Real-Time Notifications

When a listing is created, updated, deleted, or (un)assigned, `socket.js` emits to:

- `user:{adminId}` for all admins
- `user:{employeeId}` for all employees whose `assignedCategories` match

Event names: `listing:created`, `listing:updated`, `listing:deleted`, `listing:assigned`, `listing:unassigned`

---

## Frontend

| File | Route | Description |
|---|---|---|
| `frontend/src/pages/PropertiesBoard.jsx` | `/properties` | CRM listing board |
| `frontend/src/pages/Home.jsx` | `/` | Public listing search |
| `frontend/src/pages/Listing.jsx` | `/listing/:id` | Public listing detail |
| `frontend/src/pages/CreateListing.jsx` | `/create-listing` | Seller create form |
| `frontend/src/components/PropertyTypeFields.jsx` | — | Renders dynamic category fields |

**PropertiesBoard view modes:** `table` · `pipeline` (kanban by status) · `cards` · `map` (Leaflet)

---

## Key Files

| File | Role |
|---|---|
| `backend/models/listing.model.js` | Schema — 12 compound indexes, soft delete, dynamic attributes |
| `backend/controllers/listing.controller.js` | CRUD, search, fuzzy match, bulk import, agent assign |
| `backend/routes/listing.route.js` | Route wiring + permission middleware |
| `backend/middleware/permissions.js` | `canAccessListing`, `requirePermission` |
| `frontend/src/pages/PropertiesBoard.jsx` | CRM 4-view board |
| `frontend/src/components/PropertyTypeFields.jsx` | Dynamic field renderer |
