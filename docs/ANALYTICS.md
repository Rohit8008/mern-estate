# Analytics & Dashboard

## Overview

| Concern | Mechanism |
|---|---|
| Realtime dashboard | `dashboard.controller.js` — live MongoDB aggregations |
| Snapshot analytics | `analytics.controller.js` — date-range queries |
| Stored snapshots | `Analytics` model — periodic daily/weekly/monthly records |
| Role-aware | Employees see their own metrics; admins see full team |

---

## Dashboard

**Route:** `/dashboard`  
**File:** `frontend/src/pages/AgencyDashboard.jsx`  
**API:** `GET /api/dashboard/*`

The agency dashboard is a customizable widget grid supporting 6 widget types:

| Widget Type | Description |
|---|---|
| `number` | Single KPI metric |
| `chart` | Line/bar/area chart (ApexCharts) |
| `battery` | Fill gauge for capacity metrics |
| `timeline` | Recent activity feed |
| `table` | Data table |
| `workload` | Agent workload bar chart |

Widget presets are available for quick dashboard setup.

### Dashboard API Endpoints

**Base path:** `/api/dashboard`  
**File:** `backend/routes/dashboard.route.js`

| Endpoint | Description |
|---|---|
| `GET /overview` | KPI totals (listings, clients, deals, tasks) |
| `GET /properties` | Property stats by status, category, price range, city, monthly trend |
| `GET /buyers` | Buyer stats by status, priority, type, city, upcoming follow-ups |
| `GET /performance` | Employee performance metrics (admin only) |
| `GET /activity` | Recent listings and buyer additions |

Role behavior:
- `admin` → all data across all employees
- `employee` → only their own assigned clients and listings

---

## Analytics

**Route:** `/analytics`  
**File:** `frontend/src/pages/Analytics.jsx`  
**API:** `GET /api/analytics/*`

Tab-based analytics with date-range filtering.

### Analytics API Endpoints

**Base path:** `/api/analytics`  
**File:** `backend/routes/analytics.route.js`

All endpoints require `viewAnalytics` permission.

| Endpoint | Tab | Description |
|---|---|---|
| `GET /dashboard` | Overview | Aggregated KPI summary |
| `GET /properties` | Properties | Listing counts, category breakdown, price stats, market trends |
| `GET /sales` | Sales | Deal pipeline by stage, deal value over time, closed deals |
| `GET /leads/conversion` | Leads | Conversion funnel by status, source, conversion rate, avg conversion time |
| `GET /revenue` | Revenue | Total deal value, commissions, revenue by time period, by agent |
| `GET /agents` | Agents | Per-agent stats (admin only) — client counts, conversion rates, deal stages |

### Date Range Parameters (all analytics endpoints)

| Param | Type | Default | Description |
|---|---|---|---|
| `startDate` | ISO date | 30 days ago | Range start |
| `endDate` | ISO date | Now | Range end |
| `period` | String | `monthly` | `daily` \| `weekly` \| `monthly` |

---

## Analytics Snapshot Model

**File:** `backend/models/analytics.model.js`

Periodic snapshots store pre-aggregated metrics for fast historical queries.

| Field | Type | Notes |
|---|---|---|
| `type` | String | `daily` \| `weekly` \| `monthly` |
| `date` | Date | Snapshot period start |
| `metrics.listings` | Object | total, new, active, avgPrice, avgDaysOnMarket, byCategory, byType |
| `metrics.clients` | Object | total, new, converted, lost, conversionRate, byStatus, bySource |
| `metrics.deals` | Object | total, new, closed, closedValue, avgDealSize, byStage |
| `metrics.revenue` | Object | totalDealValue, totalCommission, byStatus |
| `metrics.team` | Object | activeAgents, topPerformers, avgDealsPerAgent |
| `metrics.activity` | Object | followUps, communications, siteVisits |
| `generatedAt` | Date | When this snapshot was created |
| `generationDuration` | Number | Ms taken to generate |

---

## Property Statistics Detail

`GET /api/analytics/properties` returns:

- **Status breakdown** — available / sold / under_negotiation counts
- **Category breakdown** — residential / commercial / land counts
- **Price statistics** — min, max, average, median
- **City distribution** — listing count per city
- **Monthly trend** — new listings added per month over period

## Agent Performance Detail

`GET /api/analytics/agents` (admin only) returns per agent:

- Total clients assigned
- Clients by status
- Conversion rate (won / total clients)
- Average deal value
- Deal stage distribution
- Last activity date

---

## Key Files

| File | Role |
|---|---|
| `backend/models/analytics.model.js` | Snapshot schema |
| `backend/controllers/analytics.controller.js` | Live aggregation queries |
| `backend/controllers/dashboard.controller.js` | Dashboard KPI endpoints |
| `backend/routes/analytics.route.js` | Analytics routes |
| `backend/routes/dashboard.route.js` | Dashboard routes |
| `frontend/src/pages/Analytics.jsx` | Analytics page (tabbed) |
| `frontend/src/pages/AgencyDashboard.jsx` | Widget dashboard |
