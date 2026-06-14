# Client Reports

## Overview

| Concern | Mechanism |
|---|---|
| Templates | `ReportTemplate` model — named templates with typed sections |
| Generated reports | `GeneratedReport` model — rendered HTML snapshots |
| Variable substitution | Template variables replaced at generation time |
| Email delivery | Rendered HTML sent via SMTP (nodemailer) |
| Usage tracking | `usageCount` and `lastUsed` updated on each use |

---

## Report Templates

**File:** `backend/models/reportTemplate.model.js`

A template defines the structure of a report that can be reused across clients.

| Field | Type | Notes |
|---|---|---|
| `name` | String | Template display name |
| `type` | String | `property_summary` \| `market_analysis` \| `investment_report` \| `client_report` \| `custom` |
| `description` | String | What this template is for |
| `sections` | Array | Ordered list of content sections |
| `createdBy` | ObjectId ref User | |
| `usageCount` | Number | Incremented each time the template is used |
| `lastUsed` | Date | Timestamp of last generation |

### Section Schema

Each section in `template.sections[]`:

| Field | Notes |
|---|---|
| `title` | Section heading |
| `type` | `text` \| `table` \| `chart` \| `property_list` |
| `content` | Template string — supports `{{variable}}` substitution |
| `order` | Display order |

---

## Template API Endpoints

**Base path:** `/api/report-templates`  
**File:** `backend/routes/reportTemplate.route.js`

All endpoints require authentication + CRM access.

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List all templates |
| `POST` | `/` | Create template |
| `GET` | `/:id` | Get template |
| `PUT` | `/:id` | Update template |
| `DELETE` | `/:id` | Delete template |
| `POST` | `/:id/generate` | Generate a report from this template |
| `POST` | `/:id/email` | Generate and email report to client |

---

## Generated Reports

**File:** `backend/models/generatedReport.model.js`

A generated report is a rendered snapshot tied to a specific client.

| Field | Type | Notes |
|---|---|---|
| `template` | ObjectId ref ReportTemplate | Source template |
| `client` | ObjectId ref Client | Who the report is for |
| `generatedBy` | ObjectId ref User | |
| `htmlContent` | String | Fully rendered HTML |
| `sentAt` | Date | When it was emailed (if applicable) |
| `sentTo` | String | Email address it was sent to |

### Generated Report API

**Base path:** `/api/generated-reports`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List generated reports (filter by `clientId`) |
| `GET` | `/:id` | Get specific report |
| `DELETE` | `/:id` | Delete report |

---

## Variable Substitution

When generating a report, template `{{variable}}` placeholders are replaced with:

| Variable | Value |
|---|---|
| `{{client.name}}` | Client's full name |
| `{{client.email}}` | Client's email |
| `{{client.phone}}` | Client's phone |
| `{{date}}` | Current date |
| `{{agent.name}}` | Assigned agent's name |
| `{{listing.name}}` | Listing title (if provided) |
| `{{listing.price}}` | Listing price |
| `{{listing.address}}` | Listing address |

---

## Email Delivery

`POST /:id/email` renders the template, replaces variables, wraps in a styled HTML email, and sends via nodemailer using the `SMTP_*` environment variables. The `sentAt` and `sentTo` fields are updated on the `GeneratedReport` document after successful send.

---

## Frontend

**File:** `frontend/src/pages/ClientReportTemplate.jsx`  
**Route:** `/reports`

Features:
- Template list with usage stats
- Template builder (section editor)
- Generate report for a selected client
- Email report directly from UI
- View/download generated report HTML

---

## Key Files

| File | Role |
|---|---|
| `backend/models/reportTemplate.model.js` | Template schema with usage tracking |
| `backend/models/generatedReport.model.js` | Rendered report snapshot |
| `backend/controllers/reportTemplate.controller.js` | CRUD + generate + email |
| `backend/controllers/generatedReport.controller.js` | Generated report management |
| `backend/routes/reportTemplate.route.js` | Template routes |
| `backend/routes/generatedReport.route.js` | Generated report routes |
| `frontend/src/pages/ClientReportTemplate.jsx` | Report builder UI |
