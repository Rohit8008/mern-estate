# MERN Estate

A production-ready **Real Estate Management & Listing Platform** built on the MERN stack.

This project is designed for teams (admins + employees/agents) who need a modern internal system to manage listings, owners, clients, buyer requirements, assignments, and reporting—backed by secure authentication, role-based access control, and scalable infrastructure.

---

## Tech Stack

- **Frontend**: React + Vite, TailwindCSS, modern UI components
- **Backend**: Node.js, Express
- **Database**: MongoDB (local or Atlas)
- **Auth**: JWT access tokens + refresh token flow (httpOnly cookies)
- **Real-time**: Socket.IO (live updates/messaging)
- **Storage**: Firebase Storage for images (client-side upload)
- **Observability**: structured logging + health endpoints (+ optional Sentry)

---

## Product Highlights

### Listings (Core)

- Create / update / delete listings
- Advanced filtering + sorting + pagination
- Professional search endpoints:
  - `/api/listing/search`
  - `/api/listing/suggestions`
  - `/api/listing/popular-searches`
- Soft delete + restore (admin-only)
- Bulk import (admin-only)

### Categories with Dynamic Fields

- Categories are configurable
- Each category can define dynamic fields (`required`, `select`, `number`, validations)
- Listing creation/update validates category fields server-side

### Owners, Clients, Messages

- Owner management
- Client pipeline pages & dashboards
- Messaging system (real-time ready)

### Buyer Requirements

- Track buyer requirements with follow-ups
- Filtering by city/locality/interest/status/assigned agent

### Dashboards & Metrics

- Admin dashboard + team dashboard
- Metrics endpoints for “my work” and pipeline snapshots

### Security & Production Readiness

- Rate limiting for auth/refresh endpoints
- Secure cookies, CORS configuration, common hardening middleware
- Health check endpoints for liveness/readiness/startup

---

## Roles & Permissions (RBAC)

This codebase supports **configurable roles** with granular permissions.

- **Admin**
  - Full access
  - Can manage users and roles
  - Can assign/unassign agents
  - Can soft-delete/restore listings, bulk import

- **Employee (Agent)**
  - Access is scoped by:
    - **Role permissions** (RBAC)
    - **Assigned categories** (category-level access)
  - **Default behavior**: employees can create listings *by default* in categories assigned to them.

Important behavior:

- Missing permissions should return **403 Forbidden** (user stays logged in)
- Invalid/expired sessions return **401 Unauthorized** (client may refresh token)

---

## Repository Structure

```
mern-estate/
  backend/      # Express API + Mongo models + controllers
  frontend/     # React client
  render.yaml   # Render blueprint
  SETUP_GUIDE.md
  DEPLOYMENT.md
  PRODUCTION_FEATURES.md
```

---

## Getting Started (Local Dev)

### Prerequisites

- Node.js **18+**
- MongoDB **5+** (local or Atlas)
- Firebase project (for image storage)

### Install

```bash
# Backend
a) cd backend
b) npm install

# Frontend
a) cd ../frontend
b) npm install
```

### Environment Variables

#### Backend

Create `backend/.env` (start from `backend/.env.example`).

Minimum required:

- `MONGO_URI`
- `JWT_SECRET`
- `REFRESH_SECRET`
- `FRONTEND_URL`

#### Frontend

Create `frontend/.env.local` (start from `frontend/.env.example`).

Common:

- `VITE_API_URL` (leave empty in dev when using proxy)
- `VITE_FIREBASE_*` (Firebase Storage)

---

## Run

### Option A: run from repo root

```bash
npm run dev
```

This runs the backend dev script via the root `package.json`.

### Option B: run both apps separately

```bash
# Terminal 1
npm run dev --prefix backend

# Terminal 2
npm run dev --prefix frontend
```

Frontend:

- http://localhost:5173

Backend:

- http://localhost:3000/api

---

## Scripts

From repo root:

- `npm run dev` — starts backend dev server
- `npm run start` — starts backend in production mode
- `npm run build` — installs dependencies + builds frontend
- `npm run test` — backend tests
- `npm run test:client` — frontend tests

---

## Initial Admin Setup

**Signup is disabled** (by design). Create the first admin user via MongoDB.

See:

- `SETUP_GUIDE.md` → “Initial Admin Setup”

---

## Deployment

Render is supported out-of-the-box via `render.yaml`.

- Full deployment guide: `DEPLOYMENT.md`
- Feature documentation: `PRODUCTION_FEATURES.md`

High-level:

- Backend: Node web service
- Frontend: static site (Vite build)
- MongoDB: Atlas recommended

---

## Troubleshooting

### Frontend can’t reach backend

- Check backend is running on port `3000`
- Confirm CORS config (`FRONTEND_URL`) for the frontend origin
- If you’re using a hosted frontend, set `VITE_API_URL`

### Auth / permission issues

- `401` means: session/token invalid/expired
- `403` means: logged in, but not allowed (RBAC / category restrictions)

### Mongo connection fails

- Verify `MONGO_URI`
- Ensure MongoDB is running

---

## License

ISC (see `package.json`).
