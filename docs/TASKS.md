# Tasks

## Overview

| Concern | Mechanism |
|---|---|
| Storage | MongoDB `Task` model |
| Related entities | Polymorphic — can link to a `Client` or `Listing` |
| Reminders | Array of scheduled reminder timestamps with `sent` tracking |
| Notifications | Email notifications on task creation |
| Activity log | Task actions recorded to the activity log |

---

## Data Model

**File:** `backend/models/task.model.js`

| Field | Type | Notes |
|---|---|---|
| `title` | String | Required; text-indexed |
| `description` | String | Text-indexed |
| `status` | String | `todo` \| `in_progress` \| `review` \| `done` \| `blocked` |
| `priority` | String | `low` \| `medium` \| `high` \| `urgent` |
| `dueAt` | Date | Indexed for sorting/reminders |
| `assignedTo` | ObjectId ref User | Who owns the task |
| `createdBy` | ObjectId ref User | |
| `relatedEntity.kind` | String | `client` \| `listing` |
| `relatedEntity.refId` | ObjectId | Reference to the related document |
| `reminders` | Array | `[{ remindAt: Date, sent: Boolean }]` |
| `isDeleted` | Boolean | Soft delete |
| `deletedAt` | Date | |

**Indexes:** `dueAt`, text index on `title + description`, `assignedTo + status`, `relatedEntity.kind + relatedEntity.refId`

---

## API Endpoints

**Base path:** `/api/tasks`  
**File:** `backend/routes/task.route.js`

All endpoints require authentication (`verifyToken`).

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/` | `viewTasks` | List tasks |
| `POST` | `/` | `createTask` | Create a task |
| `GET` | `/:id` | `viewTasks` | Get task details |
| `PATCH` | `/:id` | `updateTask` | Update task |
| `DELETE` | `/:id` | `deleteTask` | Delete task |

### GET `/` Query Parameters

| Param | Description |
|---|---|
| `status` | Filter by status |
| `priority` | Filter by priority |
| `assignedTo` | Filter by user ID |
| `relatedKind` | `client` \| `listing` |
| `relatedId` | ObjectId of related entity |
| `search` | Full-text search |
| `limit` | Default 50 |
| `skip` | Pagination offset |

---

## Task Board (Frontend)

**File:** `frontend/src/pages/TasksBoard.jsx`  
**Route:** `/tasks`

Tasks are displayed in status-grouped columns:

```
Todo → In Progress → Review → Done → Blocked
```

Each column shows cards with:
- Title and description excerpt
- Priority badge (color-coded)
- Due date
- Assignee avatar
- Related entity link (client or listing)

---

## Reminders

Tasks support an array of reminder timestamps (`task.reminders[]`). Each reminder has:
- `remindAt` — when to trigger the reminder
- `sent` — boolean flag updated after delivery

A background process checks `remindAt` values and sends email/notification reminders, then sets `sent: true`.

---

## Activity Logging

Task create, update, and delete actions are logged to the `ActivityLog` collection via `backend/utils/activity.js`.

---

## Key Files

| File | Role |
|---|---|
| `backend/models/task.model.js` | Schema — polymorphic related entity, reminders |
| `backend/controllers/task.controller.js` | CRUD, activity logging, email notifications |
| `backend/routes/task.route.js` | Route wiring + permission middleware |
| `frontend/src/pages/TasksBoard.jsx` | Task board UI |
