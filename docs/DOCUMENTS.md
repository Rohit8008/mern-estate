# Documents

## Overview

| Concern | Mechanism |
|---|---|
| Storage | Local filesystem via `multer` — `backend/uploads/docs/` |
| Relations | Polymorphic — attached to either a `Client` or a `Listing` |
| Organization | Tags array for categorization |
| Access | Owner or admin can view/delete |
| Max file size | 10 MB |

---

## Data Model

**File:** `backend/models/document.model.js`

| Field | Type | Notes |
|---|---|---|
| `title` | String | Required — display name |
| `filename` | String | Actual filename on disk |
| `mimeType` | String | e.g. `application/pdf`, `image/png` |
| `size` | Number | File size in bytes |
| `url` | String | Relative URL to serve the file |
| `storageType` | String | `local` \| `s3` |
| `tags` | String[] | Searchable tags (no text index — use array `$in`) |
| `kind` | String | `client` \| `listing` — which entity this belongs to |
| `refId` | ObjectId | ID of the `Client` or `Listing` |
| `uploadedBy` | ObjectId ref User | |
| `isDeleted` | Boolean | Soft delete |
| `deletedAt` | Date | |

**Indexes:** `kind + refId` compound (list documents for an entity), `uploadedBy`, `tags`

> No text index on `tags` — query tags with `{ tags: { $in: [...] } }`.

---

## API Endpoints

**Base path:** `/api/documents`  
**File:** `backend/routes/document.route.js`

All endpoints require authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List documents (filter by `kind` + `refId`) |
| `POST` | `/upload` | Upload a document (multipart/form-data) |
| `DELETE` | `/:id` | Soft delete a document |

### GET `/` Query Parameters

| Param | Description |
|---|---|
| `kind` | `client` \| `listing` — required |
| `refId` | ObjectId of the client or listing — required |
| `tags` | Comma-separated tag list (optional filter) |

### POST `/upload` — Form Fields

| Field | Type | Notes |
|---|---|---|
| `file` | File | Binary, max 10 MB |
| `title` | String | Display name |
| `kind` | String | `client` \| `listing` |
| `refId` | String | ObjectId of related entity |
| `tags` | String | JSON array string e.g. `["agreement","id-proof"]` |

---

## File Storage

Uploaded files land at `backend/uploads/docs/<timestamp>_<originalname>`.

The backend serves this directory as a static route so files are accessible at `/uploads/docs/<filename>`.

For production deployments where the backend and frontend are on separate domains, ensure the `uploads/` directory is either:
- Served by Nginx as a static alias, or
- Migrated to cloud storage (S3/Firebase) via the `storageType: 's3'` model field

---

## Frontend Usage

Documents are rendered per-entity — embedded in the client detail panel and the listing detail page.

| File | Role |
|---|---|
| `frontend/src/components/PropertyDocuments.jsx` | Inline document list + upload for listings |
| `frontend/src/pages/ContactsBoard.jsx` | Document section inside client detail |

**Confirmation pattern for document delete:** Inline rose-50 strip with Cancel + Delete (not `ConfirmDialog` modal) — Leaflet maps on the same page cause z-index conflicts with modals.

---

## Key Files

| File | Role |
|---|---|
| `backend/models/document.model.js` | Schema — polymorphic kind/refId |
| `backend/controllers/document.controller.js` | Upload, list, soft delete |
| `backend/routes/document.route.js` | Route wiring + multer middleware |
| `frontend/src/components/PropertyDocuments.jsx` | Document UI for listings |
