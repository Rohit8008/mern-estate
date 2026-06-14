# Property Owners

## Overview

| Concern | Mechanism |
|---|---|
| Storage | MongoDB `Owner` model |
| Purpose | Track property owners/landlords separate from system users |
| Relationship to listings | `listing.ownerIds[]` references Owner documents |
| Real-time | Socket.IO broadcasts on owner create/update/delete |
| Access | Permission-gated: `viewOwners`, `createOwner`, `updateOwner`, `deleteOwner` |

> **Owners ≠ Clients.** Owners are property sellers/landlords. Clients are buyers/leads tracked in the CRM pipeline.

---

## Data Model

**File:** `backend/models/owner.model.js`

| Field | Type | Notes |
|---|---|---|
| `name` | String | Required |
| `email` | String | Optional |
| `phone` | String | Optional; indexed |
| `companyName` | String | Optional |
| `taxId` | String | Optional — PAN/GSTIN etc. |
| `addressLine1` | String | |
| `addressLine2` | String | |
| `city` | String | |
| `state` | String | |
| `postalCode` | String | |
| `country` | String | Default `India` |
| `isActive` | Boolean | Default `true`; indexed |
| `notes` | String | Max 1000 chars |
| `isDeleted` | Boolean | Soft delete |
| `deletedAt` | Date | |
| `createdBy` | ObjectId ref User | |

**Indexes:** `phone`, `isActive`, `isDeleted + isActive`, `name` (text)

---

## API Endpoints

**Base path:** `/api/owners`  
**File:** `backend/routes/owner.route.js`

All endpoints require authentication (`verifyToken`).

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/list` | `viewOwners` | List owners with search/filter |
| `GET` | `/:id` | `viewOwners` | Get owner details |
| `POST` | `/` | `createOwner` | Create owner |
| `PUT` | `/:id` | `updateOwner` | Update owner |
| `DELETE` | `/:id` | `deleteOwner` | Soft delete owner |

### GET `/list` Query Parameters

| Param | Description |
|---|---|
| `search` | Name regex search |
| `isActive` | `true` \| `false` |
| `limit` | Default 50 |
| `skip` | Pagination offset |

---

## Real-Time Notifications

On owner create/update/delete, `socket.js` emits `owner:updated` to:
- All admin users (`user:{adminId}`)
- All employees currently connected

---

## Frontend

**File:** `frontend/src/pages/OwnersBoard.jsx`  
**Route:** `/owners`

Features:
- Owner list with search
- Create/edit modal form (contact, company, address, notes)
- Active/inactive status toggle (requires `toggleOwnerActive` permission)
- Soft delete with `ConfirmDialog` confirmation
- Real-time refresh via Socket.IO

---

## Key Files

| File | Role |
|---|---|
| `backend/models/owner.model.js` | Schema |
| `backend/controllers/owner.controller.js` | CRUD + Socket.IO broadcast |
| `backend/routes/owner.route.js` | Route wiring + permission middleware |
| `frontend/src/pages/OwnersBoard.jsx` | Owner board UI |
