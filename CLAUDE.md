# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Frontend (from /frontend)
npm run dev        # Vite dev server (proxies /api and /uploads to localhost:3000)
npm run build      # Production build
npm run preview    # Preview production build

# Backend (from /backend)
npm run dev        # nodemon
npm run start      # production
```

### Testing
```bash
# From /backend
npm run test
npm run test:watch
npm run test:coverage
npm run test:ci

# From /frontend
npm run test
npm run test:ui        # Vitest UI
npm run test:coverage
```

### Linting
```bash
# From /backend or /frontend
npm run lint
npm run lint:fix
npm run format         # Prettier (backend only)
```

### Database & Admin
```bash
# From /backend
npm run make-admin       # Create first admin user
npm run db:seed
npm run db:seed-categories
npm run db:migrate
```

## Architecture

### Monorepo Layout
```
/
├── backend/           # Node/Express API (port 3000)
│   ├── app.js         # Express setup, middleware, routes, error handling
│   ├── index.js       # Entry point (DB connect + server start)
│   ├── config/        # environment.js — centralized config with validation
│   ├── controllers/   # Route handlers (~20 controllers)
│   ├── middleware/     # auth.js, security.js, validation.js, permissions.js
│   ├── models/        # Mongoose models (~16 models)
│   ├── routes/        # Express routers (~20 route files)
│   └── scripts/       # makeAdmin.js, seed scripts
└── frontend/          # React + Vite (port 5173 in dev)
    └── src/
        ├── app/       # AppRoutes.jsx, AppShell.jsx, CrmShell.jsx
        ├── components/
        ├── contexts/
        ├── pages/
        ├── redux/     # Redux Toolkit store + user slice + persist
        └── utils/     # http.js (apiClient, normalizeImageUrl)
```

### Routing Architecture
Two distinct layouts:
- **`AppShell`** — public/seller routes (MinimalHeader)
- **`CrmShell`** — all CRM routes (`/dashboard`, `/portfolio`, `/properties`, `/contacts`, `/tasks`, `/deals`, `/clients`, `/calendar`, `/transactions`, `/client-reports`, `/buyer-requirements`); requires `role === 'admin' || role === 'employee'`

Route guards: `AdminRoute`, `SellerRoute`, plus `CrmShell.canAccess` check.

### Authentication
- JWT in httpOnly cookies; access token (15m) + refresh token (30d)
- `verifyToken`, `requireRole`, `requireAdmin` middleware in `backend/middleware/auth.js`
- Frontend auto-refreshes on 401 via `fetchWithRefresh()` in `utils/http.js`

### API Client Pattern
Always use `apiClient` from `@/utils/http`, never raw `fetch`:
```javascript
import { apiClient, normalizeImageUrl } from '@/utils/http';

await apiClient.get('/endpoint');
await apiClient.post('/endpoint', data);
await apiClient.patch('/endpoint', data);
await apiClient.delete('/endpoint');
await apiClient.upload('/endpoint', formData);   // multipart
```
Use `normalizeImageUrl()` for all image URLs (converts absolute localhost URLs to relative paths for production compatibility).

### Key Models
- **Listing** — real estate listings with dynamic fields per property type; soft delete
- **Document** — polymorphic (`kind: 'client' | 'listing'`, `refId`); no text index on tags
- **User** — roles: `admin`, `employee`, `seller`
- **PropertyType** — defines dynamic field schema per property category
- **ReportTemplate** — client report templates with variable substitution

### Image Uploads
Images uploaded client-side to Firebase Storage. Requires 6 `VITE_FIREBASE_*` env vars. File uploads (documents) go through the backend `/api/documents` endpoint.

### Environment Variables
Backend `.env` requires: `MONGO_URI`, `JWT_SECRET`, `REFRESH_SECRET`, `FRONTEND_URL`.
Frontend `.env` requires: `VITE_FIREBASE_*` (6 vars) for image uploads; `VITE_API_URL` is empty in dev (proxy handles it).

## Design System (CRM)

Icons: **react-icons/hi** (HeroIcons outline) — not Font Awesome, not lucide.
Maps: **Leaflet** (react-leaflet) — z-index 400–800; avoid modal overlays on map pages.

| Element | Classes |
|---|---|
| Page background | `bg-slate-50` |
| Cards | `bg-white border border-slate-200 rounded-xl p-5 shadow-sm` |
| KPI cards | add `border-t-2 border-t-{color}-500 hover:shadow-md transition-shadow` |
| Icon container | `w-9 h-9 rounded-xl bg-{color}-50 ring-1 ring-{color}-100` |
| Dashboard header | `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl px-6 py-5` |
| Primary button | `bg-slate-900 hover:bg-slate-800 text-white rounded-lg` |
| Secondary button | `border border-slate-200 bg-white hover:bg-slate-50 rounded-lg` |
| Button on dark bg | `border border-white/10 bg-white/10 hover:bg-white/20 text-white` |
| CTA on dark bg | `bg-indigo-600 hover:bg-indigo-500 text-white` |

### Confirmation Pattern
- **Pages with Leaflet maps** → inline row confirmation (rose-50 strip with Cancel + Delete). See `PropertyDocuments.jsx`.
- **Other pages** → `ConfirmDialog.jsx` modal.
