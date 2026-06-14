# CRM — Clients & Sales Pipeline

## Overview

| Concern | Mechanism |
|---|---|
| Storage | MongoDB `Client` model — embedded deals, follow-ups, communications |
| Pipeline view | Kanban board with 11 deal stages |
| Lead scoring | Instance method `calculateScore()` based on 4 signals |
| Role access | Employees see only their assigned clients; admins see all |
| Real-time | Socket.IO broadcasts on client updates |

---

## Data Model

**File:** `backend/models/client.model.js`

### Core Fields

| Field | Type | Notes |
|---|---|---|
| `name` | String | Required |
| `email` | String | Optional |
| `phone` | String | Optional |
| `alternatePhone` | String | Optional |
| `organization` | String | Company/organization |
| `status` | String | See pipeline stages below |
| `priority` | String | `low` \| `medium` \| `high` \| `urgent` |
| `source` | String | Lead source (referral, web, etc.) |
| `budget.min` | Number | |
| `budget.max` | Number | |
| `budget.currency` | String | Default `INR` |
| `requirements` | String | Free-text requirements |
| `preferredLocations` | String[] | Array of location strings |
| `propertyType` | String | Preferred property type |
| `score` | Number | Computed lead score |
| `assignedTo` | ObjectId ref User | Assigned employee |
| `createdBy` | ObjectId ref User | |
| `interestedListings` | ObjectId[] ref Listing | Listings the client is interested in |
| `tags` | String[] | Custom labels |
| `notes` | String | Internal notes |

### Client Status (Pipeline Stages)

```
lead → contacted → qualified → proposal → negotiation → won | lost
```

### Embedded Schemas

**Deals** (`client.deals[]`)
| Field | Notes |
|---|---|
| `stage` | `new_lead` → `closed_won` \| `closed_lost` (11 stages) |
| `value` | Deal value in rupees |
| `commission` | Expected commission |
| `stageHistory[]` | `{ stage, changedAt, changedBy, note }` — full audit trail |
| `listing` | Associated property |
| `notes` | Deal-level notes |

**Follow-ups** (`client.followUps[]`)
| Field | Notes |
|---|---|
| `dueAt` | Follow-up datetime |
| `type` | `call` \| `email` \| `meeting` \| `site_visit` \| `other` |
| `completed` | Boolean |
| `reminders[]` | Reminder timestamps |
| `assignedTo` | Which employee handles it |

**Communications** (`client.communications[]`)
| Field | Notes |
|---|---|
| `type` | `call` \| `email` \| `meeting` \| `site_visit` \| `message` \| `other` |
| `direction` | `inbound` \| `outbound` |
| `summary` | Short summary |
| `details` | Full notes |
| `outcome` | Result of communication |
| `duration` | Duration in minutes (calls/meetings) |

---

## Lead Scoring

`client.calculateScore()` returns a number 0–100 based on:

| Signal | Max | Notes |
|---|---|---|
| Engagement | 30 | Communication count, recency, follow-up history |
| Budget | 25 | Whether min/max budget is set |
| Urgency | 25 | Pipeline stage proximity to close |
| Fit | 20 | Requirements clarity, property type specified |

Score is recomputed and stored on every save.

---

## API Endpoints

**Base path:** `/api/clients`  
**File:** `backend/routes/client.route.js`

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/` | `viewClients` | List clients (employees: own only) |
| `POST` | `/` | `createClient` | Create client |
| `GET` | `/:id` | `viewClients` | Get client details |
| `PATCH` | `/:id` | `updateClient` | Update client |
| `DELETE` | `/:id` | `deleteClient` | Delete client |
| `POST` | `/:id/assign` | Admin | Assign client to employee |
| `POST` | `/:id/interested/add` | `updateClient` | Add interested listing |
| `POST` | `/:id/interested/remove` | `updateClient` | Remove interested listing |

### GET `/` Query Parameters

| Param | Description |
|---|---|
| `search` | Text search on name/email/phone |
| `status` | Filter by pipeline status |
| `priority` | `low` \| `medium` \| `high` \| `urgent` |
| `tag` | Filter by tag |
| `assignedTo` | Filter by assigned employee |
| `limit` | Default 50 |
| `skip` | Pagination offset |

---

## Sales Pipeline

**File:** `frontend/src/pages/DealsBoard.jsx`  
**Route:** `/pipeline`

The Deals Board shows clients arranged in Kanban columns by deal stage.

### Deal Stages (in order)

| Stage | Display |
|---|---|
| `new_lead` | New Lead |
| `contacted` | Contacted |
| `qualified` | Qualified |
| `site_visit_scheduled` | Site Visit Scheduled |
| `site_visit_done` | Site Visit Done |
| `negotiation` | Negotiation |
| `booking_token` | Booking Token |
| `documentation` | Documentation |
| `payment_pending` | Payment Pending |
| `closed_won` | Closed Won |
| `closed_lost` | Closed Lost |

Stage transitions are recorded in `deal.stageHistory[]` with timestamp and `changedBy` user reference.

---

## Frontend

| File | Route | Description |
|---|---|---|
| `frontend/src/pages/ContactsBoard.jsx` | `/clients` | CRM leads/contacts list |
| `frontend/src/pages/DealsBoard.jsx` | `/pipeline` | Kanban pipeline view |

**ContactsBoard view modes:** `cards` · `table`  
**Filters:** status, priority, search, assignedTo

---

## Key Files

| File | Role |
|---|---|
| `backend/models/client.model.js` | Schema — embedded deals/followUps/communications, lead scoring |
| `backend/controllers/client.controller.js` | CRUD, search, assignment, interested listings |
| `backend/routes/client.route.js` | Route wiring + permission middleware |
| `frontend/src/pages/ContactsBoard.jsx` | Clients list board |
| `frontend/src/pages/DealsBoard.jsx` | Kanban pipeline |
