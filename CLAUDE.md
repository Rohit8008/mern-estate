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
npm run make-admin           # Create first admin user
npm run db:seed-fresh        # Wipe + reseed (destructive — no confirm gate)
npm run db:seed-demo
npm run db:seed-categories
npm run db:seed-roles
npm run db:migrate-tenancy   # ONE-TIME: single-tenant -> multi-tenant. Supports --dry-run.
npm run db:migrate-fields    # ONE-TIME: propertyTypeFields -> attributes/native columns
npm run db:backup
npm run db:restore -- --list          # what backups exist
npm run db:restore -- --from <name> --confirm   # DESTRUCTIVE; also prompts for the db name
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

### Multi-tenancy
Shared database, one `tenantId` on every document, enforced by a global Mongoose plugin
(`backend/tenancy/`). Queries are scoped automatically — **never build a `tenantId` filter by
hand**, and never re-add a bare `unique: true` (uniqueness is `{tenantId, field}`). A query with
no tenant context throws by design; scripts, cron jobs and socket handlers must enter one via
`runWithTenant` / `withTenantBySlug` / `forEachTenant`. Deliberate cross-tenant work uses
`runWithoutTenantScope('why')`.

### Platform vs workspace admin
`role: 'admin'` is an admin of ONE agency. `isPlatformAdmin` (on User, `select: false`) is the
vendor's operator who administers every workspace — it guards `/api/platform/*` and must never be
settable through a tenant-facing API. New workspaces are created by `tenancy/provisionTenant.js`,
used by both the platform API and `scripts/provisionTenant.js` (whose `--platform-admin` flag is
the bootstrap for the first operator).

**Response caches need their own tenant boundary** — a cache sits in front of the database, so
query scoping cannot protect it. Use `getTenantScopedCache()` from `utils/cache.js` for anything
derived from one workspace's data; plain `getCache()` only for genuinely global data (geocoding).

### Tenant switching — identity is pinned, data is not
A platform operator can view a customer's workspace (`POST /api/platform/act-as/:id`, leave with
`/stop-acting`). The access token carries two separate tenant claims: **`tid` is where the
operator's ACCOUNT lives**, **`act` is the workspace they are VIEWING** — honoured only alongside a
signed `pa: true`, which `startActingAs` sets after re-reading `isPlatformAdmin` from the database.
Never collapse the two: rewriting `tid` puts the operator's identity in a workspace their account
is not in, and the session stops resolving.

`resolveTenant` scopes the request to `act`, so **every query about the CALLER must be pinned back
to their home workspace** with `inHomeTenant(req, fn)` (`tenancy/tenantContext.js`) — it is a no-op
when nobody is acting. That means any `User.findById(req.user.id | payload.id)`,
`User.findByIdAndUpdate(req.user.id, …)`, or SecurityLog write about a session. An unpinned lookup
runs in the customer's workspace, finds nothing, and **nothing reads as "signed out" — or as
"nothing to do"**. Two real bugs from exactly this: `tryVerifyToken` failed silently (it is
optional auth), so `signOut` skipped its `if (req.user)` block and answered "signed out" while
leaving the refresh token valid for 30 days; and auth security logs wrote the vendor operator's
email into the customer's `securitylogs`.

**The acting session is read-only** — `tenancy/readOnlyWhileActing.js` blocks every non-GET at the
edge, so a controller added later inherits it. Only session-level writes are exempt (stop-acting,
act-as, refresh, signout); if you exempt anything else, check it does not write into the customer's
workspace. Support needs to see what the customer sees, not edit their records — an agency's audit
trail should name a person at that agency. `tests/actingAs.test.js` covers all of this.

### Catalogues are single sources, never second copies
Four things in this codebase are a fixed vocabulary that config selects from, and each one
lives in exactly ONE file because the duplicate-list pattern has already broken twice here:
`utils/permissionCatalogue.js` (35 permissions — `role.model.js` generates its schema from it,
and `requirePermission()` **throws at module load** on an unknown key), `utils/notificationTypes.js`,
`models/webhook.model.js` (`WEBHOOK_EVENTS`), and `plugins/registry.js` (`HOOKS`).
The bugs this fixed: the Roles UI served 31 of 35 permissions, so `createClient`/`updateClient`/
`deleteClient`/`viewClients` were enforced but unassignable; and `propertyType.route.js` asked for
`manage_settings`, which was never a permission, so every non-admin was denied forever.
`tests/permissionCatalogue.test.js` walks the real route files and fails the build on either.

### Scheduled jobs
`jobs/scheduler.js` is dependency-free and takes a **lease in Mongo** (`models/jobLock.model.js`),
so N instances still fire each job once. Register in `jobs/index.js`; a job body runs inside
`forEachTenant()` (`tenancy/tenantContext.js`) because a query with no tenant context throws.
`tick(now)` takes the time as an argument — never read the clock inside a job's cadence logic,
which is how daily jobs stopped becoming due. `JOBS_ENABLED=false` runs an instance that serves
traffic but takes no leases.

### Notifications
`utils/notify.js` is the ONE entry point for telling someone something. It resolves the
recipient's saved preferences, writes a `Notification` row, pushes over the socket and sends mail
through the workspace's template if it has one. Never call `sendMail` from a controller for an
event a person should see — that is how task mail ended up going to a single global `NOTIFY_TO`.

### Workspace rules (the plugin surface)
`tenant.workflow.rules` selects **named implementations** registered in `plugins/builtin.js`;
config never carries code, so an admin cannot introduce behaviour the deployment did not ship.
A rule that calls `veto('…')` refuses the operation and reaches the user as a 400; any other
error is logged and the rule is skipped. Those two must stay distinct — catching both made
every veto rule silently do nothing.

### Locale and translation
`frontend/src/utils/currency.js` holds the formatters; `TenantProvider` pushes the workspace
locale in via `setLocaleConfig()`. Never construct `Intl.NumberFormat` at a call site and never
hardcode `₹`, `en-IN` or `sq ft` — all six `areaUnit` values must work, not the two a ternary
covers. Translations live in `frontend/src/i18n/locales/*.json`, auto-discovered by glob, so a
new language is one dropped-in file. A **workspace's own rename of a screen beats a translation**
(`useScreens.js` compares `label` against `defaultLabel`). `i18n/__tests__/locales.test.js`
fails the build on a missing key or a dropped `{{placeholder}}`.

### Multi-instance state
The response cache and the rate limiter are per-process, which is correct on one instance and
wrong on the PM2 cluster / multi-dyno setup this ships with. Set `REDIS_URL` and both become
shared: limits use a Redis store, and cache invalidation publishes to every instance — call
`invalidateEverywhere({ prefix })` from `utils/cache.js`, not `cache.clearByPrefix()`.

### Lead scoring and temperature
`client.calculateScore()` is the only place the number is computed, and it now runs on create,
on update, on a deal stage change, and nightly (`jobs/leadScoring.js`) — because the score has a
recency factor and therefore decays. `temperature` follows the score UNLESS someone set it by
hand, which sets `temperatureManual` and pins it; the nightly job must keep honouring that.
Won and lost leads are never rescored — rewriting them would change what past reports say.

### Sequences never chase a closed lead
`jobs/sequences.js` fires due steps per workspace. A step fires exactly once (the enrollment
advances in the same pass), and an enrollment stops the moment its lead is won, lost or deleted —
`stopSequencesForClient()` is called synchronously from `updateDealStage` so the gap between
"marked won" and "sent another chase email" does not exist. A failing step advances anyway with
the failure recorded, so one bad address cannot freeze an enrollment.

### Plans own limits
`tenancy/plans.js` is the single source for what a plan includes; `provisionTenant.js` re-exports
from it and `applyPlan()` moves a workspace's limits when its plan changes, preserving any cap an
operator set by hand. **Changing a figure in `PLANS` re-caps every live workspace on that plan** —
that is a commercial decision, not a refactor. Billing is a ledger (`models/invoice.model.js`),
not a gateway: invoices are raised and settled by hand and recorded here. The overdue sweep only
flags `billing.state`; it never suspends, because locking an agency out of their own property
register over a billing question is a decision for a person.

### Printing
`.print-area`, `.no-print`, `.print-only` and `.print-stack` in `index.css` are the convention;
use `<PrintButton />` rather than per-page print CSS. Browsers already "Save as PDF" from their
own dialogue, which is why there is no headless-Chrome dependency here.

### Navigation
The sidebar is built from a screen catalogue, not hardcoded: `backend/tenancy/screenCatalogue.js`
(id, label, section, permission) + `frontend/src/app/screenRegistry.js` (icon, route), intersected
with the tenant's feature flags and the user's permissions in `hooks/useScreens.js`.
**Screen ids are a contract with stored tenant settings — never rename one.** Adding a screen
means an entry in both files plus a route.

### Listing form
`pages/ListingForm.jsx` with `mode="create"|"edit"` is the ONLY listing form; CreateListing and
UpdateListing are 8-line wrappers. A new property field is one edit in `EMPTY` (hooks/useListingForm.js)
plus one input. If it aliases a native column, update `NATIVE_FIELD_ALIASES` in BOTH
`frontend/src/utils/nativeFieldAliases.js` and `backend/utils/importMapping.js`.
`propertyTypeFields` is retired — dynamic values go to `attributes`, or to their native column.

### Categories
A category's `fields` govern how every listing in it is stored — treat them as validated structure,
not free-form config. `backend/utils/categoryFields.js` is authoritative (reserved keys, duplicates,
ReDoS-prone patterns); `frontend/src/utils/categoryFieldRules.js` mirrors the cheap rules for inline
hints. Destructive actions answer **409 with a count** rather than proceeding — deleting a category
in use, or removing a field that holds values — and the UI turns that into a choice with `?force=true`.
Public category reads go through `publicView()`: no `defaultLocation`, no soft-delete metadata, no `tenantId`.
Category paperwork/photos are typed (`backend/utils/documentTypes.js`) — RERA, layout, approval,
brochure, photograph. **`isPublic` defaults to false and is never set implicitly**; only an admin
can publish, and `suggestPublic` merely pre-ticks the form.

### CLI scripts
Never `import` a model directly in a script — a global Mongoose plugin only applies to schemas
compiled after it registers, and hoisted imports produce records with no `tenantId` that the app
can never see. Use `const { models, inWorkspace, close } = await bootstrapScript()` from
`scripts/_bootstrap.js`; it takes `--workspace <slug>` and refuses to guess when several exist.

### The property book is not public
Anonymous browsing was removed. Nothing about a listing, category or property type is reachable
without a session. Sharing outside the agency goes through `/api/share` → `/s/:token`: expiring,
revocable, optionally passcoded, view-counted. Two rules: `forRecipient()` is an **allowlist**
(a new Listing column must never become public by being added), and `createShare` re-reads
listings through `listingScope` so **you cannot share what you cannot see**.

### Route access
Every mounted route must be guarded or listed in `backend/security/publicRoutes.js` with a reason;
`tests/routeAccess.test.js` walks the live router and fails otherwise. If it fails on a new route,
add the missing guard — don't add the route to the allowlist.

### Listing search
`backend/search/listingSearch.js` is the ONLY listing search — the board, the public search and
the ⌘K palette all delegate to it. Matching is tiered (identifier → `$text` → anchored prefix →
fuzzy), ranked and paged in the database via `$facet`. Never add a fourth search path.
`GET /api/listing/facets` gives counts over the whole filtered set (use it for any header count;
never count a page). Note `$text` must sit in the first `$match` of a pipeline — the tenant plugin
merges into a leading `$match` rather than unshifting, to keep that true.

### Per-workspace customisation
Four axes, all under Settings for a workspace admin: branding tokens (Tailwind `bg-workspace`
etc., driven by CSS vars on `:root`), the screen catalogue, Category dynamic fields, and the
sales pipeline (`backend/tenancy/stageCatalogue.js`). The pattern throughout is **vocabulary in
code, selection in config** — never free-form structures. Plan limits live in
`backend/tenancy/limits.js`: they gate creation only, never reads, and answer 402.

### Routing Architecture
Two distinct layouts:
- **`AppShell`** — public/seller routes (MinimalHeader)
- **`CrmShell`** — all CRM routes; requires `role === 'admin' || role === 'employee'`.
  `frontend/src/app/AppRoutes.jsx` is the authoritative list — read it rather than trusting this
  line. Current set: `/dashboard`, `/analytics`, `/portfolio`, `/properties`, `/owners`, `/clients`,
  `/pipeline`, `/buyers`, `/tasks`, `/calendar`, `/transactions`, `/reports`, `/categories`,
  `/settings`, `/platform`, `/admin/*`.
  **Renamed** — `/contacts` → `/owners`, `/deals` → `/pipeline`, `/buyer-requirements` → `/buyers`,
  `/client-reports` → `/reports` (the old paths remain as aliases).

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
Images and voice notes are uploaded client-side to **Cloudinary** via `frontend/src/utils/cloudinary.js`
(unsigned upload preset; audio/video use Cloudinary's `video` resource type). Requires
`VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`. Firebase was removed — there is no
`firebase` dependency in either package.json. File uploads (documents) go through the backend
`/api/documents` endpoint.

### Environment Variables
Backend `.env` requires: `MONGO_URI`, `JWT_SECRET`, `REFRESH_SECRET`, `FRONTEND_URL`.
Frontend `.env` requires: `VITE_CLOUDINARY_CLOUD_NAME` + `VITE_CLOUDINARY_UPLOAD_PRESET` for uploads,
`VITE_API_RESPONSE_SECRET` for response decryption, and `VITE_SOCKET_URL` for the socket connection.
`VITE_API_URL` is empty in dev (proxy handles it).

## Design System (CRM)

Icons: **react-icons/hi** (HeroIcons outline) — not Font Awesome, not lucide.
Maps: **Leaflet** (react-leaflet) — z-index 400–800; avoid modal overlays on map pages.

| Element | Classes |
|---|---|
| Page background | `bg-slate-50` |
| Cards | `bg-white border border-slate-200 rounded-xl p-5 shadow-sm` |
| KPI cards | add `border-t-2 border-t-{color}-500 hover:shadow-md transition-shadow` |
| Icon container | `w-9 h-9 rounded-xl bg-{color}-50 ring-1 ring-{color}-100` (literal classes only — see below) |
| Dashboard header | `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl px-6 py-5` |
| Primary button | `bg-slate-900 hover:bg-slate-800 text-white rounded-lg` |
| Secondary button | `border border-slate-200 bg-white hover:bg-slate-50 rounded-lg` |
| Button on dark bg | `border border-white/10 bg-white/10 hover:bg-white/20 text-white` |
| CTA on dark bg | `bg-brand-600 hover:bg-brand-700 text-white` |

### Accent colour
The accent is a deep petrol blue on a perceptually even OKLCH ramp, defined in
`frontend/tailwind.config.js` as **`brand`**. That config also **overrides Tailwind's stock
`indigo` with the same ramp** — the product was built on ~520 `indigo-*` classes, and repointing
the ramp repaints all of them coherently while leaving the dark-mode override sheet in
`index.css` (which targets `.dark .text-indigo-600` and friends *by name*) working untouched.

Use `brand-*` in new code. `indigo-*` still resolves to the identical colour, so existing screens
need no migration — but do not introduce new `indigo-*`, and never re-add stock indigo `#4f46e5`:
a high-chroma violet-blue is the most recognisable generated-UI tell there is.

Interpolated class names (`` `text-${color}-400` ``) **never work** — Tailwind scans source as
plain text, so the class is never emitted and the element renders with no colour. Every colour
choice must appear as a complete literal string, usually via a lookup table keyed by a variant
name. The landing page shipped 16 of these before they were caught.

`text-balance` / `text-pretty` are hand-defined in `index.css` — this project is on Tailwind
3.3.3, which predates the built-in text-wrap utilities.

### Marketing-surface claims policy
The public pages (`Home`, `Footer`, `MinimalHeader`, `Legal`) carry **no performance
statistics, no customer counts, and no attributed testimonials**. They previously carried all
three and every figure was invented: "38% faster deal closure", "2.7x more qualified leads",
"Trusted by 54 agencies across India", plus three named directors at named agencies with quoted
speech and metric badges.

That is not a taste problem. Unsubstantiated performance claims and fabricated endorsements are
misleading advertisements under the Consumer Protection Act 2019 and the ASCI code, and the
exposure sits with the business, not the page. Replacing a round number with a more organic-looking
one makes it worse, not better.

**The rule:** every claim on a public page must be traceable to something in this repository, or
to a measurement someone can produce on request. What replaced the invented figures is sourced —
workspace isolation enforced in the data layer (`backend/tenancy/`), share links that expire,
take a passcode and can be revoked (`models/propertyShare.model.js`), typed RERA paperwork
(`utils/documentTypes.js`), configurable stages and screens. A capability a buyer verifies in a
demo persuades better than a percentage they have no reason to believe.

Real measured figures and consenting named customers are welcome when they exist. Add them with a
source. Until then the objection-handling section on the landing page ("Straight answers") does
the job social proof would, and says plainly that the product is early.

### Confirmation Pattern
- **Pages with Leaflet maps** → inline row confirmation (rose-50 strip with Cancel + Delete). See `PropertyDocuments.jsx`.
- **Other pages** → `ConfirmDialog.jsx` modal.

## gstack

[gstack](https://github.com/garrytan/gstack) is installed at `~/.claude/skills/gstack` and provides
the skills below as slash commands. Run `/gstack-upgrade` to stay current.

**Browsing:** use the `/browse` skill for ALL web browsing — opening pages, clicking through flows,
screenshots, console errors. **Never use `mcp__claude-in-chrome__*` tools.**

| Group | Skills |
|---|---|
| Plan | `/office-hours` `/spec` `/autoplan` `/plan-ceo-review` `/plan-eng-review` `/plan-design-review` `/plan-devex-review` |
| Design | `/design-consultation` `/design-shotgun` `/design-html` `/design-review` |
| Review & ship | `/review` `/ship` `/land-and-deploy` `/canary` `/benchmark` `/document-release` `/document-generate` `/retro` |
| QA & debug | `/qa` `/qa-only` `/investigate` `/cso` `/devex-review` |
| Browser | `/browse` `/connect-chrome` `/scrape` `/setup-browser-cookies` `/skillify` |
| Safety | `/careful` `/freeze` `/guard` `/unfreeze` |
| Setup & misc | `/setup-deploy` `/setup-gbrain` `/sync-gbrain` `/learn` `/codex` `/gstack-upgrade` |

Two local install notes:
- gstack needs **Bun** (installed at `~/.bun/bin`).
- `~/.npmrc` points at a private CodeArtifact registry that currently returns 401. If a gstack
  (or any) `bun install` / `npm install` fails on package fetches, override with
  `npm_config_registry=https://registry.npmjs.org`.
