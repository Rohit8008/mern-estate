# Real Vista

> Repository, pm2 process, database and token-issuer identifiers still use the original `mern-estate` name on purpose: renaming them would sign every user out and (for the encryption salt) make stored messages unreadable. Treat them as stable IDs.

A multi-tenant CRM for real estate agencies: leads, property owners, listings, deals and paperwork in one workspace, with share links an agency controls. One deployment serves many agencies; each gets an isolated workspace.

**Documentation:** open [`docs/site/index.html`](docs/site/index.html) (or serve the folder: `npx serve docs/site`). Start with *Getting started*, *Architecture* and *Multi-tenancy*. Rebuild it with `npm run docs:site`; the API reference regenerates from the code with `cd backend && npm run docs:openapi`.

For the rules that came out of real bugs (tenant scoping, identity pinning while acting-as, catalogues, validation, script bootstrapping), read [`CLAUDE.md`](CLAUDE.md).

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind, Redux Toolkit, react-router 6, i18next, Leaflet |
| Backend | Node 20, Express, Mongoose |
| Database | MongoDB (one database, `tenantId` on every document) |
| Auth | JWT in httpOnly cookies (15 min access, 30 day refresh), CSRF token on writes |
| Realtime | Socket.IO |
| Media | Cloudinary, uploaded from the browser |
| Mobile | Flutter app in `mobile/` |

## Quick start

```bash
# Backend (Node 20)
cd backend && npm install
cp .env.example .env        # MONGO_URI, JWT_SECRET, REFRESH_SECRET, FRONTEND_URL
npm run dev                 # http://localhost:3000

# Frontend
cd frontend && npm install
npm run dev                 # http://localhost:5173 (proxies /api and /uploads)

# First admin and sample data
cd backend && npm run make-admin && npm run db:seed-demo
```

Full setup, environment tables and troubleshooting are in the docs site.

## Common commands

| Task | Command |
|---|---|
| Backend tests | `cd backend && npm test` |
| Frontend tests | `cd frontend && npm test` |
| Lint | `npm run lint` in either package |
| Regenerate OpenAPI | `cd backend && npm run docs:openapi` |
| Build the docs site | `npm run docs:site` |
| End-to-end | `npm run e2e` |
| Back up / restore | `cd backend && npm run db:backup` / `npm run db:restore -- --list` |

## Repository layout

```
backend/    Express API, Mongoose models, tenancy, jobs, scripts, tests
frontend/   React app, design system, i18n, SEO build (frontend/seo)
mobile/     Flutter app
docs/       openapi.json, site-src (docs source), site (built docs)
e2e/        Playwright specs
```

## License

ISC, as declared in `package.json`.
