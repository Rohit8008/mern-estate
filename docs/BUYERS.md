# Buyer Requirements

## Overview

| Concern | Mechanism |
|---|---|
| Storage | MongoDB `BuyerRequirement` model |
| Purpose | Track what buyers are looking for; match against available listings |
| Matching | `matchesProperty(listing)` instance method scores compatibility |
| Access | Employees see their own requirements; admins see all |

---

## Data Model

**File:** `backend/models/buyerRequirement.model.js`

### Buyer Contact

| Field | Type | Notes |
|---|---|---|
| `buyerName` | String | Required |
| `buyerEmail` | String | Optional |
| `buyerPhone` | String | Optional |

### Location Preferences

| Field | Type | Notes |
|---|---|---|
| `preferredLocation` | String | Free-text |
| `preferredCity` | String | Indexed |
| `preferredLocality` | String | Indexed |

### Property Preferences

| Field | Type | Notes |
|---|---|---|
| `propertyType` | String | `sale` \| `rent` |
| `propertyTypeInterest` | String | `residential` \| `commercial` \| `land` \| `any` |
| `minPrice` | Number | Budget minimum |
| `maxPrice` | Number | Budget maximum |
| `minBedrooms` | Number | |
| `minBathrooms` | Number | |
| `preferredArea` | Number | Preferred area in sq ft |
| `additionalRequirements` | String | Free-text notes |

### Tracking

| Field | Type | Notes |
|---|---|---|
| `status` | String | `active` \| `matched` \| `closed` \| `inactive` |
| `priority` | String | `low` \| `medium` \| `high` |
| `timeline` | String | Expected buying timeline |
| `notes` | String | Internal notes |
| `followUpDate` | Date | Next follow-up date; indexed |
| `assignedAgent` | ObjectId ref User | Indexed |
| `createdBy` | ObjectId ref User | |
| `matchedProperties` | ObjectId[] ref Listing | Found matching listings |

---

## Matching Algorithm

`requirement.matchesProperty(listing)` returns a score:

```
Score contributors:
  + Location match (city/locality)
  + Property type match
  + Budget within range
  + Bedrooms ≥ minimum
  + Bathrooms ≥ minimum
  + Area ≥ preferred
```

Higher score = better match. The `GET /:id/matches` endpoint runs this against available (non-deleted, available status) listings and returns results sorted by score descending.

---

## API Endpoints

**Base path:** `/api/buyer-requirements`  
**File:** `backend/routes/buyerRequirement.route.js`

All endpoints require authentication (`verifyToken`).

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List requirements |
| `POST` | `/` | Create requirement |
| `GET` | `/stats` | Aggregate statistics |
| `GET` | `/:id` | Get requirement details |
| `PUT` | `/:id` | Update requirement |
| `DELETE` | `/:id` | Delete requirement |
| `GET` | `/:id/matches` | Find matching listings |
| `POST` | `/matches` | Add a matched property |
| `DELETE` | `/matches` | Remove a matched property |
| `PATCH` | `/:id/status` | Update buyer status |

### GET `/` Query Parameters

| Param | Description |
|---|---|
| `search` | Name/email/phone search |
| `status` | Filter by status |
| `priority` | Filter by priority |
| `propertyType` | `sale` \| `rent` |
| `propertyTypeInterest` | `residential` \| `commercial` \| `land` \| `any` |
| `city` | Filter by preferred city |
| `locality` | Filter by preferred locality |
| `assignedAgent` | Filter by assigned agent |
| `limit` | Default 50 |
| `skip` | Pagination offset |

### GET `/stats` Response

Returns aggregations:
- Count by status
- Count by priority
- Count by `propertyTypeInterest`
- City breakdown
- Follow-ups due today / this week

---

## Frontend

**File:** `frontend/src/pages/BuyerRequirements.jsx`  
**Route:** `/buyers`

Features:
- Search and filter list
- Create/edit form (buyer contact + preferences)
- View matched properties for a requirement
- Status update (active → matched → closed)
- Delete with confirmation

---

## Key Files

| File | Role |
|---|---|
| `backend/models/buyerRequirement.model.js` | Schema + `matchesProperty()` scoring |
| `backend/controllers/buyerRequirement.controller.js` | CRUD + matching + stats |
| `backend/routes/buyerRequirement.route.js` | Route wiring |
| `frontend/src/pages/BuyerRequirements.jsx` | Buyer requirements UI |
