# Commands & Developer Guide

Quick reference for every command in this monorepo — development, testing, demo recording, and deployment.

---

## Table of Contents

1. [Initial Setup](#1-initial-setup)
2. [Development Servers](#2-development-servers)
3. [Backend Commands](#3-backend-commands)
4. [Frontend Commands](#4-frontend-commands)
5. [Database & Seed Commands](#5-database--seed-commands)
6. [Running Tests](#6-running-tests)
7. [Running the Client Demo Video](#7-running-the-client-demo-video)
8. [Production & PM2](#8-production--pm2)
9. [Environment Variables](#9-environment-variables)

---

## 1. Initial Setup

```bash
# Clone and install all dependencies
git clone <repo-url>

cd mern-estate/backend  && npm install
cd ../frontend          && npm install
cd ..                   && npm install   # root (Playwright)
```

**Install Playwright browsers** (first time only):

```bash
npx playwright install chromium
```

**Copy environment files:**

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — set MONGO_URI, JWT_SECRET, REFRESH_SECRET, FRONTEND_URL

# Frontend
cp frontend/.env.example frontend/.env.local
# Edit frontend/.env.local — set VITE_FIREBASE_* keys if using image uploads

# E2E tests
cp .env.e2e.example .env.e2e
# Edit .env.e2e — set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD
```

**Create the first admin user:**

```bash
cd backend
npm run make-admin -- --email admin@yourcompany.com --username admin --password Admin@123
```

---

## 2. Development Servers

Always run backend and frontend in separate terminals.

| Terminal | Directory | Command | Port |
|---|---|---|---|
| 1 | `backend/` | `npm run dev` | 3000 |
| 2 | `frontend/` | `npm run dev` | 5173 |

```bash
# Terminal 1 — API server (hot reload via nodemon)
cd backend && npm run dev

# Terminal 2 — Vite dev server (HMR)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 3. Backend Commands

All commands run from the `backend/` directory.

### Development

```bash
npm run dev        # nodemon — restarts on file changes
npm run start      # production start (no watch)
```

### Linting & Formatting

```bash
npm run lint       # ESLint check
npm run lint:fix   # ESLint auto-fix
npm run format     # Prettier — formats all files
```

### Logs

```bash
npm run logs:clean   # Delete all log files in logs/
npm run logs:rotate  # Rotate and archive logs
```

### Health Check

```bash
npm run health:check   # curl /api/health/health — confirms server is up
```

---

## 4. Frontend Commands

All commands run from the `frontend/` directory.

```bash
npm run dev             # Vite dev server (proxies /api to :3000)
npm run build           # Production build → dist/
npm run preview         # Serve the production build locally
npm run build:analyze   # Build with bundle size analyzer
npm run type-check      # TypeScript type check (no emit)
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
```

---

## 5. Database & Seed Commands

### From `backend/`

```bash
npm run db:seed-categories   # Seed 9 property categories with dynamic fields
npm run db:seed-roles        # Seed default roles (Admin, Sales Manager, etc.)
npm run db:seed-demo         # Seed full demo data for client presentations
npm run db:backup            # Create a timestamped MongoDB backup (needs mongodump)
npm run db:migrate           # Run pending migrations
npm run db:migrate-phone     # One-time migration — fixes phone unique index
```

### From the repo root

```bash
npm run seed:demo   # Same as cd backend && npm run db:seed-demo
```

### What `seed:demo` creates

| Collection | Records | Details |
|---|---|---|
| Owners | 8 | Mumbai/Pune property owners with contact info |
| Listings | 20 | 8 residential sale, 5 rental, 4 commercial, 3 land/plots — with Mumbai map coordinates |
| Clients | 12 | All 7 CRM stages: lead → contacted → qualified → proposal → negotiation → won/lost |
| Tasks | 12 | Mixed priorities and statuses, linked to clients and listings |
| Buyer Requirements | 8 | Active searches, various budgets and property types |
| Employee user | 1 | `rahul.verma@demo.salescode.ai` / `Agent@Demo123` |

> **Idempotent** — safe to run multiple times. It uses upsert logic so no duplicates are created.

---

## 6. Running Tests

### Backend — Unit Tests (Jest)

```bash
cd backend

npm run test             # Run all tests once
npm run test:watch       # Watch mode — re-runs on file changes
npm run test:coverage    # Run with coverage report
npm run test:ci          # CI mode — coverage + no interactive prompts
```

Test files live in `backend/tests/`. Coverage report opens in `backend/coverage/`.

### Frontend — Component Tests (Vitest)

```bash
cd frontend

npm run test             # Run all tests once
npm run test:ui          # Vitest browser UI (interactive)
npm run test:coverage    # Run with coverage report
```

### E2E Tests — Full CRM Suite (Playwright)

These tests require **both servers running** (`backend :3000` and `frontend :5173`).

**Setup** (first time):

```bash
# 1. Copy and fill in .env.e2e
cp .env.e2e.example .env.e2e
# Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to a real admin account

# 2. Install browsers
npx playwright install chromium
```

**Run from the repo root:**

```bash
npm run e2e            # Run all CRM tests headlessly
npm run e2e:ui         # Open Playwright UI — browse and run tests interactively
npm run e2e:debug      # Debug mode — Playwright Inspector opens
npm run e2e:report     # Open the last HTML report in browser
npm run e2e:codegen    # Record a new test by clicking in the browser
```

**Test structure:**

```
e2e/
├── auth.setup.js          # Logs in once, saves session cookie
└── tests/
    ├── admin.spec.js       # Admin panel — employee creation
    ├── auth.spec.js        # Login / logout / refresh
    ├── buyers.spec.js      # Buyer requirements CRUD
    ├── calendar.spec.js    # Calendar view
    ├── contacts.spec.js    # Clients board CRUD
    ├── create-listing.spec.js
    ├── dashboard.spec.js
    ├── messages.spec.js
    ├── profile.spec.js
    ├── properties.spec.js  # All 4 views: table, pipeline, cards, map
    ├── settings.spec.js
    └── tasks.spec.js       # Tasks board CRUD
```

> Tests run sequentially (workers: 1) to avoid race conditions on the shared database.

---

## 7. Running the Client Demo Video

Records a full platform walkthrough as a `.webm` video you can share with clients.

### Prerequisites

```bash
# All 3 must be done first:
# 1. Backend running
cd backend && npm run dev

# 2. Frontend running (separate terminal)
cd frontend && npm run dev

# 3. Demo data seeded (separate terminal)
npm run seed:demo
```

### Record the video

```bash
# From repo root:
npm run demo:video
```

This opens a real Chrome window at 1440×900 with `slowMo: 550ms` and records the entire tour.

**What the tour covers** (~6–8 minutes):

| Scene | Page | What's shown |
|---|---|---|
| 1 | Sign In | Login flow |
| 2 | Dashboard | KPI cards, charts, recent activity |
| 3 | Properties | Table → Pipeline kanban → Cards grid → Map view + marker click |
| 4 | Clients | Status filter, contact detail panel, deal stages |
| 5 | Owners | Property owners list |
| 6 | Tasks | Priority filter, task detail panel |
| 7 | Pipeline | Deals kanban |
| 8 | Buyers | Buyer requirements list |
| 9 | Analytics | Charts and performance metrics |
| 10 | Calendar | Calendar with navigation |
| 11 | Dashboard | Final wide shot hold |

### Find the video

```
e2e/demo/demo-output/
└── demo/
    └── CRM-Platform-Full-Demo-Tour/
        └── video.webm
```

### Convert to MP4 (optional)

If the client needs an MP4 instead of WebM:

```bash
ffmpeg -i "e2e/demo/demo-output/demo/CRM-Platform-Full-Demo-Tour/video.webm" \
       -c:v libx264 -crf 23 -preset fast \
       demo.mp4
```

### View the demo HTML report

```bash
npm run demo:video:report
```

---

## 8. Production & PM2

```bash
cd backend

npm run pm2:start     # Start API server via PM2 (uses ecosystem.config.js)
npm run pm2:stop      # Stop the PM2 process
npm run pm2:restart   # Restart (after code updates)
npm run pm2:logs      # Stream live logs
npm run pm2:monit     # Interactive CPU/memory monitor
```

For the frontend, run `npm run build` inside `frontend/` and serve the `dist/` folder with Nginx or a static CDN.

---

## 9. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Access token signing key (32+ chars) |
| `REFRESH_SECRET` | ✅ | Refresh token signing key (32+ chars) |
| `FRONTEND_URL` | ✅ | CORS allowed origin (e.g. `http://localhost:5173`) |
| `MESSAGE_ENCRYPTION_KEY` | ✅ | 32-byte hex string for Socket.IO encryption |
| `NODE_ENV` | ✅ | `development` / `production` / `test` |
| `PORT` | — | Default `3000` |
| `SMTP_*` | — | Email (password reset, notifications) |
| `TWILIO_*` | — | SMS notifications |

Generate secure secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | ✅ | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | ✅ | Firebase app ID |
| `VITE_API_URL` | — | Leave empty in dev (Vite proxy handles it) |

### E2E Tests (`.env.e2e`)

| Variable | Description |
|---|---|
| `E2E_ADMIN_EMAIL` | Email of an active admin account |
| `E2E_ADMIN_PASSWORD` | Password for that admin account |
| `PLAYWRIGHT_BASE_URL` | Default: `http://localhost:5173` |
| `PLAYWRIGHT_API_URL` | Default: `http://localhost:3000` |

---

*Last updated: June 2026*
