# Authentication & Authorization

## Overview

| Concern | Mechanism |
|---|---|
| Identity | JWT access token (15 min) + refresh token (30 days) |
| Transport | httpOnly cookies — never exposed to JavaScript |
| Storage (server) | Refresh tokens stored in `User.refreshTokens[]`, capped at 10 |
| Roles | `admin`, `employee`, `seller`, `user`, `buyer` |

---

## Token Lifecycle

```
┌──────────────────────────────────────────────────────┐
│ Sign-in / Google OAuth                               │
│                                                      │
│  Server issues:                                      │
│    access_token  → httpOnly cookie, 15 min JWT       │
│    refresh_token → httpOnly cookie, 30 day JWT       │
│    refresh_token saved to DB (max 10 per user)       │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│ Every authenticated API request                      │
│                                                      │
│  Browser sends access_token cookie automatically     │
│  verifyToken checks:                                 │
│    1. JWT signature valid                            │
│    2. Not expired (15 min window)                    │
│    3. issuer = "mern-estate-api"                     │
│    4. audience = "mern-estate-client"                │
│    5. User exists in DB                              │
│    6. User status is "active"                        │
│    7. Token was issued after last password change    │
└──────────────────────┬───────────────────────────────┘
                       │  401 if any check fails
                       ▼
┌──────────────────────────────────────────────────────┐
│ Silent token refresh  (frontend apiClient auto-retry)│
│                                                      │
│  POST /api/auth/refresh                              │
│    1. Verify refresh_token cookie (30 day JWT)       │
│    2. Look up exact token in DB                      │
│    3. If NOT found → reuse attack detected           │
│         → wipe ALL sessions for user                 │
│         → 401 (force re-login)                       │
│    4. If found → rotate:                             │
│         → delete old token from DB                   │
│         → issue new access_token + refresh_token     │
│         → save new refresh_token to DB               │
│         → set new cookies                            │
└──────────────────────────────────────────────────────┘
```

---

## Sign-in Flows

### Password

```
POST /api/auth/signin  { email, password }

1. Validate email format + required fields
2. Find user by email (excluding soft-deleted)
3. Reject if status ≠ "active"
4. Compare bcrypt hash (cost 12)
5. Issue token pair → set cookies
6. Push refresh_token to DB ($slice: -10 cap)
7. Update lastLogin, increment loginCount
8. Log security event
```

### Google OAuth

```
Frontend:
  signInWithPopup(GoogleAuthProvider)
  → result.user.getIdToken()            ← Firebase ID token
  → POST /api/auth/google  { name, email, photo, idToken }

Backend:
  1. Call Firebase REST API to verify idToken
       https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=FIREBASE_API_KEY
  2. Extract email from Firebase's verified response
       (the email in req.body is IGNORED for security)
  3. Check account status if user exists
  4. Existing user → issue tokens, update DB
  5. New user → prompt for username, create account, issue tokens
```

---

## Sign-out

| Endpoint | Effect |
|---|---|
| `POST /api/auth/signout` | Removes the current device's refresh token from DB, clears cookies |
| `POST /api/auth/signout-all` | Wipes **all** refresh tokens for the user, clears cookies (kills all sessions) |

---

## Session Security Rules

### Status checks (enforced on every request)
- `inactive` → 401, immediately
- `suspended` → 401, immediately
- Token does not wait to expire; the check runs on every authenticated call

### Password change invalidates all sessions
When a user's password is saved:
1. `passwordChangedAt` is set to `now − 1s`
2. Every subsequent request compares `token.iat` vs `passwordChangedAt`
3. Tokens issued before the change → 401 (`Session expired. Please log in again.`)
4. User must re-authenticate on all devices

### Refresh token reuse detection
If a refresh token is presented but not found in the DB (already rotated or deleted):
- **All** refresh tokens for that user are wiped
- The user is signed out everywhere
- This signals a potential token theft — if an attacker stole a token and already used it to rotate, the legitimate user's next refresh kills the attacker's session too

### Session cap
`User.refreshTokens` is capped at 10 entries via MongoDB `$push + $slice: -10`. The oldest session is evicted when the 11th login occurs.

---

## Authorization

### Route guards (backend middleware)

```
verifyToken          → any authenticated user
requireAdmin         → role === "admin" only
requireRole([...])   → any of the specified roles
requireEmployeeOrAdminForCategory(fn)
                     → admin always passes;
                       employee passes only if their
                       assignedCategories includes the
                       requested category slug
```

### CRM access (frontend)

`CrmShell.canAccess` — requires `role === "admin" || role === "employee"`.  
All CRM routes (`/dashboard`, `/portfolio`, `/properties`, `/contacts`, `/tasks`, `/deals`, `/clients`, `/calendar`, `/transactions`, `/client-reports`, `/buyer-requirements`) are behind this guard.

### Roles

| Role | Access |
|---|---|
| `admin` | Everything — CRM, all listings, user management |
| `employee` | CRM routes + listings in their assigned categories |
| `seller` | Own listings only (AppShell routes) |
| `user` / `buyer` | Public browsing only |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs access tokens. Must be ≥ 32 random bytes in production. |
| `REFRESH_SECRET` | Signs refresh tokens. Must differ from `JWT_SECRET`. |
| `ACCESS_TOKEN_EXPIRY` | JWT lifetime, default `15m` |
| `REFRESH_TOKEN_EXPIRY` | Refresh JWT lifetime, default `30d` |
| `JWT_ISSUER` | `iss` claim, default `mern-estate-api` |
| `JWT_AUDIENCE` | `aud` claim, default `mern-estate-client` |
| `FIREBASE_API_KEY` | Verifies Google sign-in ID tokens server-side |

---

## Key Files

| File | Role |
|---|---|
| `backend/utils/verifyUser.js` | `verifyToken`, `tryVerifyToken`, `requireAdmin` middleware |
| `backend/controllers/auth.controller.js` | signin, google, refreshToken, signOut, signOutAll |
| `backend/routes/auth.route.js` | Auth endpoints + rate limiting wiring |
| `backend/models/user.model.js` | User schema — `refreshTokens[]`, `passwordChangedAt`, `status` |
| `backend/middleware/security.js` | `authRateLimit`, `refreshRateLimit`, `apiRateLimit`, Helmet, XSS, mongo-sanitize |
| `frontend/src/utils/http.js` | `fetchWithRefresh` — auto-retries on 401 via `/api/auth/refresh` |
| `frontend/src/pages/SignIn.jsx` | Password + Google sign-in UI, sends `idToken` for Google |
