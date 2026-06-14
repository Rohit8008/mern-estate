# Global Search

## Overview

| Concern | Mechanism |
|---|---|
| Scope | Cross-entity: listings, clients, owners, buyers, tasks, users |
| Transport | REST API — `GET /api/search` |
| Query parsing | `backend/search/parser.js` — extracts filters and entity hints |
| Entity searchers | `backend/search/entitySearchers.js` — per-type query builders |
| Click tracking | Records which results are clicked for analytics |
| Saved searches | Users can save + pin frequently used searches |
| Analytics | Admin-only endpoint: top queries, zero-result queries, entity distribution |

---

## API Endpoints

**Base path:** `/api/search`  
**File:** `backend/routes/search.route.js`

All endpoints require authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Global cross-entity search |
| `GET` | `/suggest` | Autocomplete suggestions |
| `POST` | `/click` | Track a result click |
| `GET` | `/saved` | List user's saved searches |
| `POST` | `/saved` | Save a search |
| `DELETE` | `/saved/:id` | Delete a saved search |
| `PATCH` | `/saved/:id/pin` | Pin/unpin a saved search |
| `GET` | `/analytics` | Search analytics (admin only) |

---

## GET `/` — Main Search

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `q` | String | Search query (required) |
| `entities` | String | Comma-separated entity types to search: `listing,client,owner,buyer,task,user` |
| `limit` | Number | Results per entity type, default 5 |
| `page` | Number | Pagination |

### Response Shape

```json
{
  "results": {
    "listings": [...],
    "clients": [...],
    "owners": [...],
    "buyers": [...],
    "tasks": [...],
    "users": [...]
  },
  "total": 42,
  "query": "rohit villa mumbai"
}
```

Each result includes matched entity fields and a relevance hint.

---

## GET `/suggest` — Autocomplete

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `q` | String | Prefix to complete |
| `entities` | String | Limit to specific entity types |
| `limit` | Number | Default 10 |

Returns lightweight suggestion objects (name/title + entity type + ID) for rendering a dropdown.

---

## Query Parsing

**File:** `backend/search/parser.js`

The parser handles natural-language-style queries:
- Strips stop words
- Extracts entity-type hints (e.g. `client:rohit`)
- Extracts field filters (e.g. `city:mumbai price:5000000`)
- Returns structured `{ terms, filters, entityHints }`

---

## Entity Searchers

**File:** `backend/search/entitySearchers.js`

Each entity type has its own search logic:

| Entity | Search fields |
|---|---|
| `listing` | name, address, city, locality, description |
| `client` | name, email, phone, organization |
| `owner` | name, email, phone, companyName |
| `buyer` | buyerName, buyerEmail, buyerPhone, preferredLocation |
| `task` | title, description |
| `user` | username, email |

All searches use `$regex` with case-insensitive flag. Results are filtered by the requesting user's role (employees see only their assigned entities).

---

## Click Tracking

`POST /api/search/click` records:

```json
{
  "query": "string",
  "entityType": "listing",
  "entityId": "objectId",
  "position": 2
}
```

Stored in `backend/models/searchLog.model.js` for analytics.

---

## Saved Searches

Users can save search queries with a name:

```json
{
  "name": "Mumbai Villas Under 2Cr",
  "query": "villa",
  "filters": { "city": "Mumbai", "maxPrice": 20000000 },
  "isPinned": true
}
```

Pinned searches appear first in the saved list.

---

## Search Analytics (Admin)

`GET /api/search/analytics` returns:

- Top search queries by frequency
- Zero-result query list
- Entity distribution (which entity types get the most clicks)
- Average response time per entity type

---

## Key Files

| File | Role |
|---|---|
| `backend/search/parser.js` | Query parsing — extracts filters and entity hints |
| `backend/search/entitySearchers.js` | Per-entity search query builders |
| `backend/controllers/search.controller.js` | Orchestrates search + suggestions + analytics |
| `backend/routes/search.route.js` | Route wiring |
| `backend/models/searchLog.model.js` | Click tracking records |
| `backend/models/savedSearch.model.js` | Saved search storage |
